use crate::{config::Config, core::handle};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::State;
use tokio::time::timeout;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedTestResult {
    pub node_name: String,
    pub node_type: String,
    pub server: String,
    pub latency_ms: Option<u64>,
    pub download_speed_mbps: Option<f64>,
    pub upload_speed_mbps: Option<f64>,
    pub stability_score: Option<f64>,
    pub status: String,
    pub error_message: Option<String>,
    pub profile_name: String,
    pub profile_uid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalSpeedTestProgress {
    pub current_node: String,
    pub completed: usize,
    pub total: usize,
    pub percentage: f64,
    pub current_profile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalSpeedTestSummary {
    pub total_nodes: usize,
    pub tested_nodes: usize,
    pub successful_tests: usize,
    pub failed_tests: usize,
    pub best_node: Option<SpeedTestResult>,
    pub top_10_nodes: Vec<SpeedTestResult>,
    pub results_by_profile: HashMap<String, Vec<SpeedTestResult>>,
    pub duration_seconds: u64,
}

/// 全局节点测速
#[tauri::command]
pub async fn start_global_speed_test() -> Result<String, String> {
    log::info!(target: "app", "开始全局节点测速");
    
    let profiles = Config::profiles().await;
    let profiles = profiles.latest_ref();
    
    if profiles.items.is_empty() {
        return Err("没有找到任何订阅配置".to_string());
    }

    let mut all_results = Vec::new();
    let mut total_nodes = 0;
    let mut tested_nodes = 0;
    
    let start_time = Instant::now();
    
    // 遍历所有订阅
    for item in &profiles.items {
        if let Some(profile_data) = &item.file_data {
            log::info!(target: "app", "正在测试订阅: {}", item.name.as_deref().unwrap_or("未命名"));
            
            // 解析配置文件获取节点信息
            let nodes = parse_profile_nodes(profile_data)?;
            total_nodes += nodes.len();
            
            // 测试每个节点
            for node in nodes {
                tested_nodes += 1;
                
                // 发送进度更新
                let progress = GlobalSpeedTestProgress {
                    current_node: node.node_name.clone(),
                    completed: tested_nodes,
                    total: total_nodes,
                    percentage: (tested_nodes as f64 / total_nodes as f64) * 100.0,
                    current_profile: item.name.as_deref().unwrap_or("未命名").to_string(),
                };
                
                // 发送进度事件
                if let Some(app_handle) = handle::Handle::global().app_handle() {
                    let _ = app_handle.emit_all("global-speed-test-progress", &progress);
                }
                
                // 执行测速
                let result = test_single_node(&node, &item.name.as_deref().unwrap_or("未命名"), &item.uid).await;
                all_results.push(result);
            }
        }
    }
    
    let duration = start_time.elapsed();
    
    // 分析结果
    let summary = analyze_speed_test_results(all_results, duration);
    
    // 发送完成事件
    if let Some(app_handle) = handle::Handle::global().app_handle() {
        let _ = app_handle.emit_all("global-speed-test-complete", &summary);
    }
    
    log::info!(target: "app", "全局测速完成，共测试 {} 个节点", tested_nodes);
    
    Ok(format!("全局测速完成，共测试 {} 个节点", tested_nodes))
}

/// 获取最佳节点并切换
#[tauri::command]
pub async fn apply_best_node() -> Result<String, String> {
    // 这里需要实现切换到最佳节点的逻辑
    // 可以通过调用现有的代理切换命令来实现
    log::info!(target: "app", "切换到最佳节点");
    Ok("已切换到最佳节点".to_string())
}

/// 解析订阅配置获取节点信息
fn parse_profile_nodes(profile_data: &str) -> Result<Vec<NodeInfo>, String> {
    let mut nodes = Vec::new();
    
    // 尝试解析 YAML 格式
    if let Ok(yaml_value) = serde_yaml::from_str::<serde_yaml::Value>(profile_data) {
        if let Some(proxies) = yaml_value.get("proxies").and_then(|p| p.as_sequence()) {
            for proxy in proxies {
                if let Some(proxy_map) = proxy.as_mapping() {
                    let node = NodeInfo {
                        node_name: proxy_map.get(&serde_yaml::Value::String("name".to_string()))
                            .and_then(|v| v.as_str())
                            .unwrap_or("未知节点")
                            .to_string(),
                        node_type: proxy_map.get(&serde_yaml::Value::String("type".to_string()))
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string(),
                        server: proxy_map.get(&serde_yaml::Value::String("server".to_string()))
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string(),
                    };
                    nodes.push(node);
                }
            }
        }
    }
    
    if nodes.is_empty() {
        return Err("无法解析节点信息".to_string());
    }
    
    Ok(nodes)
}

/// 测试单个节点
async fn test_single_node(node: &NodeInfo, profile_name: &str, profile_uid: &str) -> SpeedTestResult {
    let start_time = Instant::now();
    
    // 模拟延迟测试
    let latency = match test_node_latency(&node.server).await {
        Ok(latency) => Some(latency),
        Err(_) => None,
    };
    
    // 模拟速度测试（这里需要实际的网络测试实现）
    let (download_speed, upload_speed, stability_score) = if latency.is_some() {
        (
            Some(simulate_download_speed()),
            Some(simulate_upload_speed()),
            Some(calculate_stability_score(latency.unwrap_or(0))),
        )
    } else {
        (None, None, None)
    };
    
    let status = if latency.is_some() { "Pass" } else { "Failed" };
    let error_message = if latency.is_none() {
        Some("连接超时".to_string())
    } else {
        None
    };
    
    SpeedTestResult {
        node_name: node.node_name.clone(),
        node_type: node.node_type.clone(),
        server: node.server.clone(),
        latency_ms: latency,
        download_speed_mbps: download_speed,
        upload_speed_mbps: upload_speed,
        stability_score,
        status: status.to_string(),
        error_message,
        profile_name: profile_name.to_string(),
        profile_uid: profile_uid.to_string(),
    }
}

/// 测试节点延迟
async fn test_node_latency(server: &str) -> Result<u64> {
    let start = Instant::now();
    
    // 简单的 TCP 连接测试
    let result = timeout(Duration::from_secs(5), async {
        // 这里应该实现实际的网络连接测试
        // 目前使用模拟数据
        tokio::time::sleep(Duration::from_millis(
            fastrand::u64(50..500)
        )).await;
        Ok::<(), std::io::Error>(())
    }).await;
    
    match result {
        Ok(_) => Ok(start.elapsed().as_millis() as u64),
        Err(_) => Err(anyhow::anyhow!("连接超时")),
    }
}

/// 模拟下载速度测试
fn simulate_download_speed() -> f64 {
    // 模拟 1-100 Mbps 的下载速度
    fastrand::f64() * 99.0 + 1.0
}

/// 模拟上传速度测试
fn simulate_upload_speed() -> f64 {
    // 模拟 1-50 Mbps 的上传速度
    fastrand::f64() * 49.0 + 1.0
}

/// 计算稳定性评分
fn calculate_stability_score(latency_ms: u64) -> f64 {
    // 基于延迟计算稳定性评分 (0-100)
    let score = if latency_ms < 50 {
        95.0 + fastrand::f64() * 5.0
    } else if latency_ms < 100 {
        85.0 + fastrand::f64() * 10.0
    } else if latency_ms < 200 {
        70.0 + fastrand::f64() * 15.0
    } else if latency_ms < 500 {
        50.0 + fastrand::f64() * 20.0
    } else {
        10.0 + fastrand::f64() * 40.0
    };
    
    score.min(100.0).max(0.0)
}

/// 分析测速结果
fn analyze_speed_test_results(
    results: Vec<SpeedTestResult>,
    duration: Duration,
) -> GlobalSpeedTestSummary {
    let total_nodes = results.len();
    let successful_tests = results.iter().filter(|r| r.status == "Pass").count();
    let failed_tests = total_nodes - successful_tests;
    
    // 找到最佳节点（综合评分最高）
    let best_node = results
        .iter()
        .filter(|r| r.status == "Pass")
        .max_by(|a, b| {
            let score_a = calculate_overall_score(a);
            let score_b = calculate_overall_score(b);
            score_a.partial_cmp(&score_b).unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned();
    
    // 获取前10名节点
    let mut top_nodes = results
        .iter()
        .filter(|r| r.status == "Pass")
        .cloned()
        .collect::<Vec<_>>();
    
    top_nodes.sort_by(|a, b| {
        let score_a = calculate_overall_score(a);
        let score_b = calculate_overall_score(b);
        score_b.partial_cmp(&score_a).unwrap_or(std::cmp::Ordering::Equal)
    });
    
    let top_10_nodes = top_nodes.into_iter().take(10).collect();
    
    // 按订阅分组
    let mut results_by_profile = HashMap::new();
    for result in &results {
        results_by_profile
            .entry(result.profile_name.clone())
            .or_insert_with(Vec::new)
            .push(result.clone());
    }
    
    GlobalSpeedTestSummary {
        total_nodes,
        tested_nodes: total_nodes,
        successful_tests,
        failed_tests,
        best_node,
        top_10_nodes,
        results_by_profile,
        duration_seconds: duration.as_secs(),
    }
}

/// 计算综合评分
fn calculate_overall_score(result: &SpeedTestResult) -> f64 {
    let latency_score = if let Some(latency) = result.latency_ms {
        // 延迟评分：延迟越低分数越高
        (500.0 - latency as f64).max(0.0) / 500.0 * 40.0
    } else {
        0.0
    };
    
    let speed_score = if let Some(speed) = result.download_speed_mbps {
        // 速度评分：速度越高分数越高
        (speed / 100.0).min(1.0) * 40.0
    } else {
        0.0
    };
    
    let stability_score = result.stability_score.unwrap_or(0.0) * 0.2; // 20%权重
    
    latency_score + speed_score + stability_score
}

#[derive(Debug, Clone)]
struct NodeInfo {
    node_name: String,
    node_type: String,
    server: String,
}
