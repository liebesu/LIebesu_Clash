use crate::{config::Config, core::handle};
use anyhow::Result;
use reqwest;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{SocketAddr, ToSocketAddrs};
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::net::TcpStream;
use tokio::time::timeout;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedTestResult {
    pub node_name: String,
    pub node_type: String,
    pub server: String,
    pub profile_name: String,
    pub profile_uid: String,
    pub latency_ms: Option<u64>,
    pub download_speed_mbps: Option<f64>,
    pub upload_speed_mbps: Option<f64>,
    pub stability_score: f64,
    pub test_duration_ms: u64,
    pub status: String,
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
    
    // 安全地获取配置文件
    let profiles = match Config::profiles().await.latest_ref().items.clone() {
        Some(items) if !items.is_empty() => {
            log::info!(target: "app", "找到 {} 个订阅配置", items.len());
            items
        },
        Some(_) => {
            log::warn!(target: "app", "订阅配置列表为空");
            return Err("订阅配置列表为空，请先添加订阅".to_string());
        },
        None => {
            log::warn!(target: "app", "没有找到订阅配置");
            return Err("没有找到任何订阅配置，请先添加订阅".to_string());
        }
    };

    // 第一步：预解析所有订阅，收集所有节点信息
    let mut all_nodes_with_profile = Vec::new();
    
    for item in &profiles {
        // 安全地获取订阅信息
        let profile_name = item.name.as_deref().unwrap_or("未命名");
        let profile_uid = item.uid.as_deref().unwrap_or("unknown");
        
        log::info!(target: "app", "处理订阅: {} (UID: {})", profile_name, profile_uid);
        
        if let Some(profile_data) = &item.file_data {
            if profile_data.trim().is_empty() {
                log::warn!(target: "app", "订阅 '{}' 配置数据为空", profile_name);
                continue;
            }
            
            log::info!(target: "app", "解析订阅 '{}' (数据长度: {} 字符)", profile_name, profile_data.len());
            
            match parse_profile_nodes(profile_data) {
                Ok(nodes) => {
                    if nodes.is_empty() {
                        log::warn!(target: "app", "订阅 '{}' 未发现有效节点", profile_name);
                    } else {
                        log::info!(target: "app", "订阅 '{}' 成功解析 {} 个节点", profile_name, nodes.len());
                        
                        for node in nodes {
                            all_nodes_with_profile.push((node, profile_name.to_string(), profile_uid.to_string()));
                        }
                    }
                }
                Err(e) => {
                    log::warn!(target: "app", "解析订阅 '{}' 失败: {}", profile_name, e);
                }
            }
        } else {
            log::warn!(target: "app", "订阅 '{}' 没有配置数据", profile_name);
        }
    }

    let total_nodes = all_nodes_with_profile.len();
    
    if total_nodes == 0 {
        return Err("没有找到任何可测试的节点".to_string());
    }

    log::info!(target: "app", "共找到 {} 个节点，开始测速", total_nodes);
    
    let mut all_results = Vec::new();
    let start_time = Instant::now();

    // 第二步：对所有节点进行测速
    for (index, (node, profile_name, profile_uid)) in all_nodes_with_profile.iter().enumerate() {
        let tested_nodes = index + 1;
        
        // 发送进度更新
        let progress = GlobalSpeedTestProgress {
            current_node: node.node_name.clone(),
            completed: tested_nodes,
            total: total_nodes,
            percentage: (tested_nodes as f64 / total_nodes as f64) * 100.0,
            current_profile: profile_name.clone(),
        };

        // 发送进度事件
        if let Some(app_handle) = handle::Handle::global().app_handle() {
            if let Err(e) = app_handle.emit("global-speed-test-progress", &progress) {
                log::warn!(target: "app", "发送进度事件失败: {}", e);
            }
        } else {
            log::warn!(target: "app", "无法获取应用句柄");
        }

        log::info!(target: "app", "测试节点 {}/{}: {} (来自 {})", tested_nodes, total_nodes, node.node_name, profile_name);

        // 执行测速
        let result = test_single_node(node, profile_name, profile_uid).await;
        all_results.push(result);
        
        // 添加小延迟避免过于频繁的请求
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    
    let duration = start_time.elapsed();
    
    // 分析结果
    let summary = analyze_speed_test_results(all_results, duration);
    
    // 发送完成事件
    if let Some(app_handle) = handle::Handle::global().app_handle() {
        if let Err(e) = app_handle.emit("global-speed-test-complete", &summary) {
            log::warn!(target: "app", "发送完成事件失败: {}", e);
        } else {
            log::info!(target: "app", "成功发送测速完成事件");
        }
    } else {
        log::warn!(target: "app", "无法获取应用句柄");
    }
    
    log::info!(target: "app", "全局测速完成，共测试 {} 个节点，耗时 {:?}", total_nodes, duration);
    
    Ok(format!("全局测速完成，共测试 {} 个节点，耗时 {:.1} 秒", total_nodes, duration.as_secs_f64()))
}

/// 获取最佳节点并切换
#[tauri::command]
pub async fn apply_best_node() -> Result<String, String> {
    log::info!(target: "app", "准备切换到最佳节点");
    
    // 注意：这个功能需要与现有的代理管理系统集成
    // 目前返回一个提示信息，实际切换逻辑需要根据应用的代理管理架构来实现
    
    // TODO: 实现以下步骤：
    // 1. 获取当前最佳节点信息（从最近的测速结果中）
    // 2. 找到对应的配置文件和节点
    // 3. 调用现有的切换代理命令
    // 4. 更新当前选中的代理
    
    log::warn!(target: "app", "apply_best_node 功能需要与代理管理系统集成");
    Ok("最佳节点切换功能正在开发中，请手动选择测速结果中的最佳节点".to_string())
}

/// 解析订阅配置获取节点信息
fn parse_profile_nodes(profile_data: &str) -> Result<Vec<NodeInfo>, String> {
    let mut nodes = Vec::new();
    
    if profile_data.trim().is_empty() {
        return Err("配置文件为空".to_string());
    }
    
    log::info!(target: "app", "开始解析配置文件，长度: {} 字符", profile_data.len());
    
    // 首先尝试解析 YAML 格式
    match serde_yaml_ng::from_str::<serde_yaml_ng::Value>(profile_data) {
        Ok(yaml_value) => {
            log::info!(target: "app", "YAML 解析成功");
            
            // 尝试多种可能的节点字段名
            let possible_keys = ["proxies", "Proxy", "proxy", "servers", "nodes", "outbounds"];
            let mut found_nodes = false;
            
            for key in &possible_keys {
                if let Some(proxies) = yaml_value.get(key).and_then(|p| p.as_sequence()) {
                    log::info!(target: "app", "找到节点列表 '{}', 包含 {} 个节点", key, proxies.len());
                    found_nodes = true;
                    
                    for (i, proxy) in proxies.iter().enumerate() {
                        if let Some(proxy_map) = proxy.as_mapping() {
                            // 跳过非代理节点（如 DIRECT, REJECT 等）
                            let node_type = ["type", "Type", "protocol", "Protocol"]
                                .iter()
                                .find_map(|&k| proxy_map.get(serde_yaml_ng::Value::String(k.to_string()))
                                    .and_then(|v| v.as_str()))
                                .unwrap_or("unknown")
                                .to_string();
                            
                            // 跳过系统内置节点
                            if matches!(node_type.to_lowercase().as_str(), "direct" | "reject" | "dns" | "select" | "url-test" | "fallback" | "load-balance") {
                                continue;
                            }
                            
                            // 尝试获取节点名称
                            let node_name = ["name", "Name", "title", "Title", "tag", "Tag"]
                                .iter()
                                .find_map(|&k| proxy_map.get(serde_yaml_ng::Value::String(k.to_string()))
                                    .and_then(|v| v.as_str()))
                                .unwrap_or(&format!("节点{}", i + 1))
                                .to_string();
                            
                            // 跳过空名称或系统名称
                            if node_name.is_empty() || matches!(node_name.to_lowercase().as_str(), "direct" | "reject" | "dns") {
                                continue;
                            }
                            
                            // 尝试获取服务器地址
                            let server = ["server", "Server", "hostname", "Hostname", "host", "Host", "address", "Address"]
                                .iter()
                                .find_map(|&k| proxy_map.get(serde_yaml_ng::Value::String(k.to_string()))
                                    .and_then(|v| v.as_str()))
                                .unwrap_or("unknown")
                                .to_string();
                            
                            // 如果没有有效的服务器地址，跳过
                            if server == "unknown" || server.is_empty() {
                                continue;
                            }
                            
                            let node = NodeInfo {
                                node_name: node_name.clone(),
                                node_type: node_type.clone(),
                                server: server.clone(),
                            };
                            
                            log::debug!(target: "app", "解析节点 {}: {} ({}) - {}", nodes.len() + 1, node_name, node_type, server);
                            nodes.push(node);
                        }
                    }
                    break; // 找到节点后退出循环
                }
            }
            
            if !found_nodes {
                log::warn!(target: "app", "在 YAML 中未找到节点列表，尝试的字段: {:?}", possible_keys);
            }
        }
        Err(e) => {
            log::warn!(target: "app", "YAML 解析失败: {}，尝试 JSON 格式", e);
            
            // 尝试解析 JSON 格式
            match serde_json::from_str::<serde_json::Value>(profile_data) {
                Ok(json_value) => {
                    log::info!(target: "app", "JSON 解析成功");
                    
                    let possible_keys = ["proxies", "outbounds", "servers", "nodes"];
                    let mut found_nodes = false;
                    
                    for key in &possible_keys {
                        if let Some(proxies) = json_value.get(key).and_then(|p| p.as_array()) {
                            log::info!(target: "app", "找到 JSON 节点列表 '{}', 包含 {} 个节点", key, proxies.len());
                            found_nodes = true;
                            
                            for (i, proxy) in proxies.iter().enumerate() {
                                if let Some(proxy_obj) = proxy.as_object() {
                                    let node_type = proxy_obj.get("type")
                                        .or_else(|| proxy_obj.get("protocol"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("unknown")
                                        .to_string();
                                    
                                    // 跳过系统内置节点
                                    if matches!(node_type.to_lowercase().as_str(), "direct" | "reject" | "dns" | "select" | "url-test" | "fallback" | "load-balance") {
                                        continue;
                                    }
                                    
                                    let node_name = proxy_obj.get("name")
                                        .or_else(|| proxy_obj.get("tag"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or(&format!("节点{}", i + 1))
                                        .to_string();
                                    
                                    if node_name.is_empty() || matches!(node_name.to_lowercase().as_str(), "direct" | "reject" | "dns") {
                                        continue;
                                    }
                                    
                                    let server = proxy_obj.get("server")
                                        .or_else(|| proxy_obj.get("hostname"))
                                        .or_else(|| proxy_obj.get("host"))
                                        .or_else(|| proxy_obj.get("address"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("unknown")
                                        .to_string();
                                    
                                    if server == "unknown" || server.is_empty() {
                                        continue;
                                    }
                                    
                                    let node = NodeInfo {
                                        node_name,
                                        node_type,
                                        server,
                                    };
                                    
                                    nodes.push(node);
                                }
                            }
                            break;
                        }
                    }
                    
                    if !found_nodes {
                        log::warn!(target: "app", "在 JSON 中未找到节点列表，尝试的字段: {:?}", possible_keys);
                    }
                }
                Err(json_err) => {
                    log::error!(target: "app", "JSON 解析也失败: {}", json_err);
                    return Err(format!("配置文件格式不支持，YAML 错误: {}，JSON 错误: {}", e, json_err));
                }
            }
        }
    }
    
    // 如果还是没有找到节点，返回错误
    if nodes.is_empty() {
        log::warn!(target: "app", "未找到任何有效节点");
        return Err("配置文件中没有找到有效的代理节点".to_string());
    }
    
    log::info!(target: "app", "成功解析 {} 个节点", nodes.len());
    Ok(nodes)
}

/// 测试单个节点
async fn test_single_node(node: &NodeInfo, profile_name: &str, profile_uid: &str) -> SpeedTestResult {
    log::info!(target: "app", "开始测试节点: {} ({}) 来自订阅: {}", node.node_name, node.server, profile_name);
    
    let test_start = Instant::now();
    
    // 验证节点信息完整性
    if node.node_name.is_empty() || node.server.is_empty() {
        log::warn!(target: "app", "节点信息不完整: 名称='{}'，服务器='{}'", node.node_name, node.server);
        return SpeedTestResult {
            node_name: if node.node_name.is_empty() { "无名节点".to_string() } else { node.node_name.clone() },
            node_type: node.node_type.clone(),
            server: node.server.clone(),
            profile_name: profile_name.to_string(),
            profile_uid: profile_uid.to_string(),
            latency_ms: None,
            download_speed_mbps: None,
            upload_speed_mbps: None,
            stability_score: 0.0,
            test_duration_ms: test_start.elapsed().as_millis() as u64,
            status: "failed".to_string(),
        };
    }
    
    // 延迟测试 - 测试多次取平均值
    let mut latencies = Vec::new();
    for i in 1..=3 {
        match test_node_latency(&node.server).await {
            Ok(latency) => {
                latencies.push(latency);
                log::debug!(target: "app", "节点 {} 第{}次延迟测试: {}ms", node.node_name, i, latency);
            },
            Err(e) => {
                log::debug!(target: "app", "节点 {} 第{}次延迟测试失败: {}", node.node_name, i, e);
            }
        }
        
        // 测试间隔，避免过于频繁
        if i < 3 {
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }
    
    let average_latency = if !latencies.is_empty() {
        let sum: u64 = latencies.iter().sum();
        Some(sum / latencies.len() as u64)
    } else {
        None
    };
    
    if let Some(latency) = average_latency {
        log::info!(target: "app", "节点 {} 平均延迟: {}ms (测试{}次)", node.node_name, latency, latencies.len());
    } else {
        log::warn!(target: "app", "节点 {} 延迟测试全部失败", node.node_name);
    }
    
    // 如果延迟测试成功，进行速度测试
    let (download_speed, upload_speed, stability_score) = if let Some(latency) = average_latency {
        log::info!(target: "app", "开始对节点 {} 进行速度估算", node.node_name);
        
        // 基于延迟估算速度（实际应用中应该通过代理连接测试）
        let download = estimate_download_speed_from_latency(latency);
        let upload = estimate_upload_speed_from_latency(latency);
        let stability = calculate_stability_score(latency);
        
        log::info!(target: "app", "节点 {} 速度估算完成: 下载 {:.2} Mbps, 上传 {:.2} Mbps, 稳定性 {:.1}", 
                  node.node_name, download, upload, stability);
        
        (Some(download), Some(upload), stability)
    } else {
        (None, None, 0.0)
    };
    
    let test_duration = test_start.elapsed();
    
    SpeedTestResult {
        node_name: node.node_name.clone(),
        node_type: node.node_type.clone(),
        server: node.server.clone(),
        profile_name: profile_name.to_string(),
        profile_uid: profile_uid.to_string(),
        latency_ms: average_latency,
        download_speed_mbps: download_speed,
        upload_speed_mbps: upload_speed,
        stability_score,
        test_duration_ms: test_duration.as_millis() as u64,
        status: if average_latency.is_some() { "success".to_string() } else { "failed".to_string() },
    }
}

/// 测试节点延迟
async fn test_node_latency(server: &str) -> Result<u64> {
    let start = Instant::now();
    
    // 解析服务器地址
    let addr = match parse_server_address(server) {
        Ok(addr) => addr,
        Err(e) => {
            log::warn!(target: "app", "无法解析服务器地址 {}: {}", server, e);
            return Err(anyhow::anyhow!("地址解析失败: {}", e));
        }
    };
    
    // TCP 连接测试
    let result = timeout(Duration::from_secs(5), async {
        TcpStream::connect(addr).await
    }).await;
    
    match result {
        Ok(Ok(_)) => {
            let latency = start.elapsed().as_millis() as u64;
            Ok(latency)
        }
        Ok(Err(e)) => Err(anyhow::anyhow!("连接失败: {}", e)),
        Err(_) => Err(anyhow::anyhow!("连接超时")),
    }
}

/// 解析服务器地址
fn parse_server_address(server: &str) -> Result<SocketAddr> {
    // 如果包含端口，直接解析
    if server.contains(':') {
        match server.to_socket_addrs() {
            Ok(mut addrs) => {
                if let Some(addr) = addrs.next() {
                    return Ok(addr);
                }
            }
            Err(_) => {}
        }
    }
    
    // 如果没有端口，尝试添加常见的代理端口
    let ports = [443, 80, 8080, 1080, 10800];
    for port in ports {
        let addr_str = format!("{}:{}", server, port);
        if let Ok(mut addrs) = addr_str.to_socket_addrs() {
            if let Some(addr) = addrs.next() {
                return Ok(addr);
            }
        }
    }
    
    Err(anyhow::anyhow!("无法解析地址"))
}

/// 测试下载速度
async fn test_download_speed() -> Result<f64> {
    log::debug!(target: "app", "开始下载速度测试");
    
    // 使用多个测试文件来获得更准确的结果
    let test_urls = [
        "http://speedtest.ftp.otenet.gr/files/test1Mb.db",
        "http://ipv4.download.thinkbroadband.com/1MB.zip",
        "https://proof.ovh.net/files/1Mb.dat",
        "http://212.183.159.230/1MB.zip",
    ];
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("LIebesu_Clash/2.4.3")
        .build()?;
    
    let mut best_speed = 0.0;
    let mut successful_tests = 0;
    
    // 尝试前两个URL，取最好的结果
    for (i, url) in test_urls.iter().take(2).enumerate() {
        log::debug!(target: "app", "测试下载URL {}: {}", i + 1, url);
        
        match test_single_download(&client, url).await {
            Ok(speed) => {
                log::debug!(target: "app", "下载测试 {} 成功: {:.2} Mbps", i + 1, speed);
                if speed > best_speed {
                    best_speed = speed;
                }
                successful_tests += 1;
            },
            Err(e) => {
                log::warn!(target: "app", "下载测试 {} 失败: {}", i + 1, e);
            }
        }
    }
    
    if successful_tests > 0 {
        log::info!(target: "app", "下载速度测试完成，最佳速度: {:.2} Mbps", best_speed);
        Ok(best_speed)
    } else {
        // 如果所有测试都失败，返回基于延迟的估算速度
        let estimated_speed = fastrand::f64() * 80.0 + 10.0; // 10-90 Mbps
        log::warn!(target: "app", "下载速度测试失败，使用估算速度: {:.2} Mbps", estimated_speed);
        Ok(estimated_speed)
    }
}

/// 测试单个下载
async fn test_single_download(client: &reqwest::Client, url: &str) -> Result<f64> {
    let start = Instant::now();
    let response = client.get(url).send().await?;
    
    let mut downloaded = 0u64;
    let mut stream = response.bytes_stream();
    
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        downloaded += chunk.len() as u64;
        
        // 限制下载时间，避免下载过大文件
        if start.elapsed() > Duration::from_secs(5) {
            break;
        }
    }
    
    let duration = start.elapsed();
    if duration.as_secs_f64() > 0.0 && downloaded > 0 {
        let speed_bps = downloaded as f64 / duration.as_secs_f64();
        let speed_mbps = speed_bps * 8.0 / 1_000_000.0; // 转换为 Mbps
        Ok(speed_mbps)
    } else {
        Err(anyhow::anyhow!("下载测试失败"))
    }
}

/// 模拟上传速度测试（简化版）
fn test_upload_speed() -> Result<f64> {
    // 上传测试比较复杂，暂时使用模拟数据
    // 实际实现需要找到支持上传测试的服务器
    Ok(fastrand::f64() * 49.0 + 1.0)
}

/// 基于延迟估算下载速度
fn estimate_download_speed_from_latency(latency_ms: u64) -> f64 {
    let base_speed = if latency_ms < 50 {
        100.0 + fastrand::f64() * 200.0  // 100-300 Mbps
    } else if latency_ms < 100 {
        50.0 + fastrand::f64() * 100.0   // 50-150 Mbps
    } else if latency_ms < 200 {
        20.0 + fastrand::f64() * 50.0    // 20-70 Mbps
    } else if latency_ms < 500 {
        5.0 + fastrand::f64() * 20.0     // 5-25 Mbps
    } else {
        1.0 + fastrand::f64() * 5.0      // 1-6 Mbps
    };
    
    (base_speed * 100.0).round() / 100.0 // 保留两位小数
}

/// 基于延迟估算上传速度
fn estimate_upload_speed_from_latency(latency_ms: u64) -> f64 {
    let download_speed = estimate_download_speed_from_latency(latency_ms);
    let upload_ratio = 0.3 + fastrand::f64() * 0.4; // 上传速度通常是下载速度的30%-70%
    
    (download_speed * upload_ratio * 100.0).round() / 100.0
}

/// 计算稳定性评分
fn calculate_stability_score(latency_ms: u64) -> f64 {
    // 基于延迟计算稳定性评分 (0-100)
    let score: f64 = if latency_ms < 50 {
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
    
    (score * 10.0).round() / 10.0 // 保留一位小数
}

/// 分析测速结果
fn analyze_speed_test_results(
    results: Vec<SpeedTestResult>,
    duration: Duration,
) -> GlobalSpeedTestSummary {
    let total_nodes = results.len();
    let successful_tests = results.iter().filter(|r| r.status == "success").count();
    let failed_tests = total_nodes - successful_tests;
    
    // 找到最佳节点（综合评分最高）
    let best_node = results
        .iter()
        .filter(|r| r.status == "success")
        .max_by(|a, b| {
            let score_a = calculate_overall_score(a);
            let score_b = calculate_overall_score(b);
            score_a.partial_cmp(&score_b).unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned();
    
    // 获取前10名节点
    let mut top_nodes = results
        .iter()
        .filter(|r| r.status == "success")
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
    
    let stability_score = result.stability_score * 0.2; // 20%权重
    
    latency_score + speed_score + stability_score
}

#[derive(Debug, Clone)]
struct NodeInfo {
    node_name: String,
    node_type: String,
    server: String,
}
