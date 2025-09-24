use crate::{
    config::Config,
    ipc::IpcManager,
    utils::dirs,
};
use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::atomic::{AtomicBool, Ordering},
    time::Instant,
};
use tauri::Emitter;

/// 取消标志，用于停止全局测速
static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

/// 最新测速结果，用于应用最佳节点
static LATEST_RESULTS: Mutex<Option<GlobalSpeedTestSummary>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedTestResult {
    pub node_name: String,
    pub node_type: String,
    pub server: String,
    pub port: u16,
    pub profile_name: String,
    pub profile_uid: String,
    pub subscription_url: Option<String>,
    pub latency: Option<u64>,
    pub is_available: bool,
    pub error_message: Option<String>,
    pub score: f64,
    pub region: Option<String>,
    pub traffic_info: Option<TrafficInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficInfo {
    pub total: Option<u64>,          // 总流量 (字节)
    pub used: Option<u64>,           // 已用流量 (字节)
    pub remaining: Option<u64>,      // 剩余流量 (字节)
    pub remaining_percentage: Option<f64>, // 剩余流量百分比
    pub expire_time: Option<i64>,    // 到期时间 (时间戳)
    pub expire_days: Option<i64>,    // 剩余天数
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)] // 保留用于未来功能扩展
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
    pub all_results: Vec<SpeedTestResult>,  // 所有节点结果（按评分排序）
    pub results_by_profile: HashMap<String, Vec<SpeedTestResult>>,
    pub duration_seconds: u64,
}

/// 全局节点测速
#[tauri::command]
pub async fn start_global_speed_test() -> Result<String, String> {
    log::info!(target: "app", "🚀 开始全局节点测速");
    
    // 重置取消标志
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    
    let _start_time = Instant::now();
    
    // 安全地获取配置文件，立即克隆避免生命周期问题  
    let profiles = {
        log::info!(target: "app", "📋 正在获取订阅配置...");
        let profiles_data = Config::profiles().await;
        let profiles_ref = profiles_data.latest_ref();
        match &profiles_ref.items {
            Some(items) if !items.is_empty() => {
                log::info!(target: "app", "✅ 找到 {} 个订阅配置", items.len());
                for (i, item) in items.iter().enumerate() {
                    let name = item.name.as_deref().unwrap_or("未命名");
                    let uid = item.uid.as_deref().unwrap_or("unknown");
                    let itype = item.itype.as_deref().unwrap_or("unknown");
                    log::debug!(target: "app", "  配置 {}: {} (UID: {}, 类型: {})", i + 1, name, uid, itype);
                }
                items.clone()
            },
            Some(_) => {
                let error_msg = "订阅配置列表为空，请先添加订阅";
                log::error!(target: "app", "❌ {}", error_msg);
                return Err(error_msg.to_string());
            },
            None => {
                let error_msg = "没有找到任何订阅配置，请先添加订阅";
                log::error!(target: "app", "❌ {}", error_msg);
                return Err(error_msg.to_string());
            }
        }
    };

    // 第一步：预解析所有订阅，收集所有节点信息
    let mut all_nodes_with_profile = Vec::new();
    
    log::info!(target: "app", "🔍 开始解析所有订阅节点...");
    
    for (index, item) in profiles.iter().enumerate() {
        let profile_name = item.name.as_deref().unwrap_or("未命名");
        let profile_uid = item.uid.as_deref().unwrap_or("unknown");
        let profile_type = item.itype.as_deref().unwrap_or("unknown");
        let subscription_url = item.url.clone();
        
        log::debug!(target: "app", "🔍 处理订阅 {}/{}: {} (类型: {})", 
                  index + 1, profiles.len(), profile_name, profile_type);
        
        // 跳过系统配置项（script、merge 等）
        if matches!(profile_type.to_lowercase().as_str(), "script" | "merge") {
            log::debug!(target: "app", "⏭️ 跳过系统配置项: {} (类型: {})", profile_name, profile_type);
            continue;
        }
        
        // 读取配置文件内容 - 优先使用 file_data，如果没有则从完整文件路径读取
        let profile_data = if let Some(file_data) = &item.file_data {
            log::info!(target: "app", "📄 使用内存中的配置数据 '{}' (长度: {} 字符)", profile_name, file_data.len());
            file_data.clone()
        } else if let Some(file_name) = &item.file {
            log::info!(target: "app", "📂 从文件读取配置 '{}': {}", profile_name, file_name);
            
            // 构建完整的文件路径
            let full_path = match dirs::app_profiles_dir() {
                Ok(profile_dir) => profile_dir.join(file_name),
                Err(e) => {
                    log::error!(target: "app", "❌ 获取配置目录失败: {}", e);
                    continue;
                }
            };
            
            match tokio::fs::read_to_string(&full_path).await {
                Ok(data) => {
                    log::info!(target: "app", "✅ 成功读取配置文件 '{}' (长度: {} 字符)", profile_name, data.len());
                    data
                }
                Err(e) => {
                    log::error!(target: "app", "❌ 读取订阅文件 '{}' 失败: {}", profile_name, e);
                    log::error!(target: "app", "   文件路径: {:?}", full_path);
                    continue;
                }
            }
        } else {
            log::warn!(target: "app", "⚠️ 订阅 '{}' 没有配置数据或文件路径", profile_name);
            continue;
        };
        
        if profile_data.trim().is_empty() {
            log::warn!(target: "app", "⚠️ 订阅 '{}' 配置文件为空", profile_name);
            continue;
        }
        
        log::info!(target: "app", "🔍 解析订阅 '{}' (数据长度: {} 字符)", profile_name, profile_data.len());
        
        match parse_profile_nodes(&profile_data, profile_name, profile_uid, profile_type, &subscription_url) {
            Ok(nodes) => {
                if nodes.is_empty() {
                    log::warn!(target: "app", "⚠️ 订阅 '{}' 未发现有效节点", profile_name);
                } else {
                    log::info!(target: "app", "✅ 订阅 '{}' 成功解析 {} 个节点", profile_name, nodes.len());
                    for node in nodes {
                        all_nodes_with_profile.push(node);
                    }
                }
            }
            Err(e) => {
                log::error!(target: "app", "❌ 解析订阅 '{}' 失败: {}", profile_name, e);
                log::error!(target: "app", "   订阅数据预览: {}", 
                          if profile_data.len() > 200 { 
                              format!("{}...", &profile_data[..200]) 
                          } else { 
                              profile_data.to_string() 
                          });
            }
        }
    }

    let total_nodes = all_nodes_with_profile.len();
    
    if total_nodes == 0 {
        let error_details = vec![
            "没有找到任何可测试的节点",
            "可能的原因:",
            "1. 订阅配置为空或格式错误",
            "2. 订阅中没有有效的代理节点", 
            "3. 所有节点都被过滤掉了(如DIRECT、REJECT等)",
            "4. 配置文件不存在或无法读取"
        ];
        
        for msg in &error_details {
            log::error!(target: "app", "❌ {}", msg);
        }
        
        return Err("没有找到任何可测试的节点，请检查订阅配置".to_string());
    }

    log::info!(target: "app", "🎯 共找到 {} 个节点，开始测速", total_nodes);
    
    let mut all_results = Vec::new();
    let start_time = Instant::now();
    
    // 第二步：批量测试所有节点
    let batch_size = 10;
    for (batch_index, chunk) in all_nodes_with_profile.chunks(batch_size).enumerate() {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            log::info!(target: "app", "🛑 测速已被取消");
            return Err("测速已被用户取消".to_string());
        }
        
        log::info!(target: "app", "📦 处理批次 {}/{} (包含 {} 个节点)", 
                  batch_index + 1, 
                  (total_nodes + batch_size - 1) / batch_size, 
                  chunk.len());
        
        // 并发测试当前批次的节点
        let mut batch_tasks = Vec::new();
        for node in chunk {
            let node_clone = node.clone();
            let task = tokio::spawn(async move {
                test_single_node(&node_clone).await
            });
            batch_tasks.push(task);
        }
        
        // 等待当前批次完成
        for task in batch_tasks {
            match task.await {
                Ok(result) => all_results.push(result),
                Err(e) => log::error!(target: "app", "节点测试任务失败: {}", e),
            }
        }
        
        let completed = all_results.len();
        let percentage = (completed as f64 / total_nodes as f64) * 100.0;
        log::info!(target: "app", "📊 进度: {}/{} ({:.1}%)", completed, total_nodes, percentage);
    }
    
    let duration = start_time.elapsed();
    log::info!(target: "app", "🏁 全局测速完成，耗时 {:.2} 秒", duration.as_secs_f64());
    
    // 第三步：分析结果
    let summary = analyze_results(all_results, duration);
    
    // 保存结果供后续使用
    *LATEST_RESULTS.lock() = Some(summary.clone());
    
    log::info!(target: "app", "📈 测速统计: 总计 {} 个节点，成功 {} 个，失败 {} 个", 
              summary.total_nodes, summary.successful_tests, summary.failed_tests);
    
    if let Some(best) = &summary.best_node {
        log::info!(target: "app", "🏆 最佳节点: {} (延迟: {}ms, 评分: {:.2})", 
                  best.node_name, 
                  best.latency.unwrap_or(0), 
                  best.score);
    }
    
    Ok("全局节点测速完成".to_string())
}

/// 取消全局节点测速
#[tauri::command]
pub async fn cancel_global_speed_test(app_handle: tauri::AppHandle) -> Result<(), String> {
    log::info!(target: "app", "🛑 收到取消全局测速请求");
    
    // 设置取消标志
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    
    // 发送取消事件到前端
    let _ = app_handle.emit("global-speed-test-cancelled", ());
    
    log::info!(target: "app", "✅ 全局测速取消信号已发送");
    Ok(())
}

/// 应用最佳节点
#[tauri::command]
pub async fn apply_best_node() -> Result<String, String> {
    log::info!(target: "app", "🎯 尝试应用最佳节点");
    
    let best_node = {
        let results = LATEST_RESULTS.lock();
        match &*results {
            Some(summary) => summary.best_node.clone(),
            None => {
                log::warn!(target: "app", "⚠️ 没有找到测速结果");
                return Err("没有可用的测速结果，请先进行全局测速".to_string());
            }
        }
    };
    
    match best_node {
        Some(best_node) => {
            log::info!(target: "app", "🔄 应用最佳节点: {} ({}:{})", 
                      best_node.node_name, best_node.server, best_node.port);
            
            // 使用 IpcManager 来切换节点
            let ipc_manager = IpcManager::global();
            match ipc_manager.update_proxy(&best_node.profile_uid, &best_node.node_name).await {
                Ok(_) => {
                    let success_msg = format!("已切换到最佳节点: {}", best_node.node_name);
                    log::info!(target: "app", "✅ {}", success_msg);
                    Ok(success_msg)
                }
                Err(e) => {
                    let error_msg = format!("切换节点失败: {}", e);
                    log::error!(target: "app", "❌ {}", error_msg);
                    Err(error_msg)
                }
            }
        }
        None => {
            log::warn!(target: "app", "⚠️ 没有找到可用的最佳节点");
            Err("没有找到可用的最佳节点".to_string())
        }
    }
}

/// 节点信息结构
#[derive(Debug, Clone)]
struct NodeInfo {
    node_name: String,
    node_type: String,
    server: String,
    port: u16,
    profile_name: String,
    profile_uid: String,
    #[allow(dead_code)] // 保留用于调试和日志记录
    profile_type: String,
    subscription_url: Option<String>,
    traffic_info: Option<TrafficInfo>,
}

/// 解析订阅配置获取节点信息
fn parse_profile_nodes(
    profile_data: &str, 
    profile_name: &str, 
    profile_uid: &str, 
    profile_type: &str,
    subscription_url: &Option<String>
) -> Result<Vec<NodeInfo>, String> {
    let mut nodes = Vec::new();
    
    if profile_data.trim().is_empty() {
        log::error!(target: "app", "❌ 配置文件为空: {}", profile_name);
        return Err("配置文件为空".to_string());
    }
    
    log::info!(target: "app", "🔍 开始解析配置文件 '{}'，长度: {} 字符", profile_name, profile_data.len());
    log::debug!(target: "app", "   配置数据预览: {}", 
              if profile_data.len() > 500 { 
                  format!("{}...", &profile_data[..500]) 
              } else { 
                  profile_data.to_string() 
              });
    
    // 首先尝试解析 YAML 格式
    match serde_yaml_ng::from_str::<serde_yaml_ng::Value>(profile_data) {
        Ok(yaml_value) => {
            log::info!(target: "app", "✅ YAML 解析成功: {}", profile_name);
            log::debug!(target: "app", "   YAML根级字段: {:?}", yaml_value.as_mapping().map(|m| m.keys().collect::<Vec<_>>()));
            
            // 尝试多种可能的节点字段名
            let possible_keys = ["proxies", "Proxy", "proxy", "servers", "nodes", "outbounds"];
            let mut found_nodes = false;
            
            for key in &possible_keys {
                if let Some(proxies) = yaml_value.get(key).and_then(|p| p.as_sequence()) {
                    log::info!(target: "app", "🎯 找到节点列表 '{}' (订阅: {}), 包含 {} 个节点", key, profile_name, proxies.len());
                    found_nodes = true;
                    
                    for (i, proxy) in proxies.iter().enumerate() {
                        if let Some(proxy_map) = proxy.as_mapping() {
                            // 跳过非代理节点（如 DIRECT, REJECT 等）
                            let node_type = ["type", "Type", "protocol", "Protocol"]
                                .iter()
                                .find_map(|&k| proxy_map.get(&serde_yaml_ng::Value::String(k.to_string()))
                                .and_then(|v| v.as_str()))
                                .unwrap_or("unknown");
                            
                            if matches!(node_type.to_lowercase().as_str(), "direct" | "reject" | "dns" | "block") {
                                log::debug!(target: "app", "⏭️ 跳过系统节点: {} (类型: {})", 
                                          proxy_map.get(&serde_yaml_ng::Value::String("name".to_string()))
                                          .and_then(|v| v.as_str()).unwrap_or("unknown"), node_type);
                                continue;
                            }
                            
                            let default_name = format!("Node-{}", i + 1);
                            let node_name = ["name", "Name", "tag", "Tag"]
                                .iter()
                                .find_map(|&k| proxy_map.get(&serde_yaml_ng::Value::String(k.to_string()))
                                .and_then(|v| v.as_str()))
                                .unwrap_or(&default_name);
                            
                            let server = ["server", "Server", "hostname", "Hostname", "host", "Host"]
                                .iter()
                                .find_map(|&k| proxy_map.get(&serde_yaml_ng::Value::String(k.to_string()))
                                .and_then(|v| v.as_str()))
                                .unwrap_or("unknown");
                            
                            let port = ["port", "Port"]
                                .iter()
                                .find_map(|&k| proxy_map.get(&serde_yaml_ng::Value::String(k.to_string()))
                                .and_then(|v| v.as_u64()))
                                .unwrap_or(0) as u16;
                            
                            if server != "unknown" && port > 0 {
                                log::debug!(target: "app", "📍 解析节点: {} ({}:{}, 类型: {})", 
                                          node_name, server, port, node_type);
                                
                                let node = NodeInfo {
                                    node_name: node_name.to_string(),
                                    node_type: node_type.to_string(),
                                    server: server.to_string(),
                                    port,
                                    profile_name: profile_name.to_string(),
                                    profile_uid: profile_uid.to_string(),
                                    profile_type: profile_type.to_string(),
                                    subscription_url: subscription_url.clone(),
                                    traffic_info: None, // 可以在这里解析流量信息
                                };
                                
                                nodes.push(node);
                            }
                        }
                    }
                    break;
                }
            }
            
            if !found_nodes {
                log::warn!(target: "app", "⚠️ 在 YAML 中未找到节点列表 '{}'，尝试的字段: {:?}", profile_name, possible_keys);
                log::debug!(target: "app", "   YAML 结构: {:?}", yaml_value);
            }
        }
        Err(e) => {
            log::warn!(target: "app", "⚠️ YAML 解析失败 '{}': {}, 尝试 JSON 解析", profile_name, e);
            
            // 如果 YAML 解析失败，尝试 JSON
            match serde_json::from_str::<serde_json::Value>(profile_data) {
                Ok(json_value) => {
                    log::info!(target: "app", "JSON 解析成功");
                    
                    let possible_keys = ["proxies", "Proxy", "proxy", "servers", "nodes", "outbounds"];
                    for key in &possible_keys {
                        if let Some(proxies) = json_value.get(key).and_then(|p| p.as_array()) {
                            log::info!(target: "app", "找到 JSON 节点列表 '{}', 包含 {} 个节点", key, proxies.len());
                            
                            for (i, proxy) in proxies.iter().enumerate() {
                                if let Some(proxy_obj) = proxy.as_object() {
                                    let node_type = ["type", "Type", "protocol", "Protocol"]
                                        .iter()
                                        .find_map(|&k| proxy_obj.get(k).and_then(|v| v.as_str()))
                                        .unwrap_or("unknown");
                                    
                                    if matches!(node_type.to_lowercase().as_str(), "direct" | "reject" | "dns" | "block") {
                                        continue;
                                    }
                                    
                                    let default_name = format!("Node-{}", i + 1);
                                    let node_name = ["name", "Name", "tag", "Tag"]
                                        .iter()
                                        .find_map(|&k| proxy_obj.get(k).and_then(|v| v.as_str()))
                                        .unwrap_or(&default_name);
                                    
                                    let server = ["server", "Server", "hostname", "Hostname", "host", "Host"]
                                        .iter()
                                        .find_map(|&k| proxy_obj.get(k).and_then(|v| v.as_str()))
                                        .unwrap_or("unknown");
                                    
                                    let port = ["port", "Port"]
                                        .iter()
                                        .find_map(|&k| proxy_obj.get(k).and_then(|v| v.as_u64()))
                                        .unwrap_or(0) as u16;
                                    
                                    if server != "unknown" && port > 0 {
                                        let node = NodeInfo {
                                            node_name: node_name.to_string(),
                                            node_type: node_type.to_string(),
                                            server: server.to_string(),
                                            port,
                                            profile_name: profile_name.to_string(),
                                            profile_uid: profile_uid.to_string(),
                                            profile_type: profile_type.to_string(),
                                            subscription_url: subscription_url.clone(),
                                            traffic_info: None,
                                        };
                                        
                                        nodes.push(node);
                                    }
                                }
                            }
                            break;
                        }
                    }
                    
                    // 不需要found_nodes检查，直接继续
                }
                Err(json_err) => {
                    log::error!(target: "app", "❌ JSON 解析也失败 '{}': {}", profile_name, json_err);
                    log::error!(target: "app", "   配置数据可能不是有效的 YAML 或 JSON 格式");
                    log::debug!(target: "app", "   YAML 错误: {:?}", e);
                    log::debug!(target: "app", "   JSON 错误: {:?}", json_err);
                    return Err(format!("配置文件 '{}' 解析失败，既不是有效的 YAML 也不是 JSON 格式。YAML 错误: {}，JSON 错误: {}", profile_name, e, json_err));
                }
            }
        }
    }
    
    // 如果还是没有找到节点，返回错误
    if nodes.is_empty() {
        log::warn!(target: "app", "⚠️ 订阅 '{}' 未找到任何有效节点", profile_name);
        log::warn!(target: "app", "   可能的原因:");
        log::warn!(target: "app", "   1. 配置文件中没有 proxies 字段");
        log::warn!(target: "app", "   2. 所有节点都是系统节点 (DIRECT, REJECT 等)");
        log::warn!(target: "app", "   3. 节点配置格式不正确");
        return Err(format!("订阅 '{}' 中没有找到有效的代理节点", profile_name));
    }
    
    log::info!(target: "app", "📊 解析完成 '{}': 找到 {} 个有效节点", profile_name, nodes.len());
    Ok(nodes)
}

/// 测试单个节点
async fn test_single_node(node: &NodeInfo) -> SpeedTestResult {
    log::info!(target: "app", "🔍 开始测试节点: {} ({}:{}) 来自订阅: {}", 
              node.node_name, node.server, node.port, node.profile_name);
    
    let start_time = Instant::now();
    
    // 使用 tokio 的 TcpStream 进行连接测试
    match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::net::TcpStream::connect(format!("{}:{}", node.server, node.port))
    ).await {
        Ok(Ok(_stream)) => {
            let latency = start_time.elapsed().as_millis() as u64;
            let score = calculate_score(Some(latency), true);
            
            log::info!(target: "app", "✅ 节点 {} 连接成功，延迟: {}ms, 评分: {:.2}", 
                      node.node_name, latency, score);
            
            SpeedTestResult {
                node_name: node.node_name.clone(),
                node_type: node.node_type.clone(),
                server: node.server.clone(),
                port: node.port,
                profile_name: node.profile_name.clone(),
                profile_uid: node.profile_uid.clone(),
                subscription_url: node.subscription_url.clone(),
                latency: Some(latency),
                is_available: true,
                error_message: None,
                score,
                region: identify_region(&node.server),
                traffic_info: node.traffic_info.clone(),
            }
        }
        Ok(Err(e)) => {
            let error_msg = format!("连接失败: {}", e);
            log::warn!(target: "app", "❌ 节点 {} 连接失败: {}", node.node_name, error_msg);
            
            SpeedTestResult {
                node_name: node.node_name.clone(),
                node_type: node.node_type.clone(),
                server: node.server.clone(),
                port: node.port,
                profile_name: node.profile_name.clone(),
                profile_uid: node.profile_uid.clone(),
                subscription_url: node.subscription_url.clone(),
                latency: None,
                is_available: false,
                error_message: Some(error_msg),
                score: 0.0,
                region: identify_region(&node.server),
                traffic_info: node.traffic_info.clone(),
            }
        }
        Err(_) => {
            let error_msg = "连接超时 (10秒)".to_string();
            log::warn!(target: "app", "⏰ 节点 {} 连接超时", node.node_name);
            
            SpeedTestResult {
                node_name: node.node_name.clone(),
                node_type: node.node_type.clone(),
                server: node.server.clone(),
                port: node.port,
                profile_name: node.profile_name.clone(),
                profile_uid: node.profile_uid.clone(),
                subscription_url: node.subscription_url.clone(),
                latency: None,
                is_available: false,
                error_message: Some(error_msg),
                score: 0.0,
                region: identify_region(&node.server),
                traffic_info: node.traffic_info.clone(),
            }
        }
    }
}

/// 计算节点评分
fn calculate_score(latency: Option<u64>, is_available: bool) -> f64 {
    if !is_available {
        return 0.0;
    }
    
    match latency {
        Some(lat) => {
            // 基于延迟的评分算法
            // 延迟越低，评分越高
            // 0-50ms: 95-100分
            // 51-100ms: 85-94分
            // 101-200ms: 70-84分
            // 201-500ms: 40-69分
            // 500ms+: 0-39分
            
            if lat <= 50 {
                100.0 - (lat as f64 * 0.1)
            } else if lat <= 100 {
                95.0 - ((lat - 50) as f64 * 0.2)
            } else if lat <= 200 {
                85.0 - ((lat - 100) as f64 * 0.15)
            } else if lat <= 500 {
                70.0 - ((lat - 200) as f64 * 0.1)
            } else {
                f64::max(0.0, 40.0 - ((lat - 500) as f64 * 0.08))
            }
        }
        None => 0.0,
    }
}

/// 识别节点所在地区
fn identify_region(server: &str) -> Option<String> {
    // 简单的地区识别逻辑，基于服务器地址
    let server_lower = server.to_lowercase();
    
    if server_lower.contains("hk") || server_lower.contains("hongkong") {
        Some("香港".to_string())
    } else if server_lower.contains("sg") || server_lower.contains("singapore") {
        Some("新加坡".to_string())
    } else if server_lower.contains("jp") || server_lower.contains("japan") || server_lower.contains("tokyo") {
        Some("日本".to_string())
    } else if server_lower.contains("us") || server_lower.contains("america") || server_lower.contains("usa") {
        Some("美国".to_string())
    } else if server_lower.contains("uk") || server_lower.contains("london") || server_lower.contains("britain") {
        Some("英国".to_string())
    } else if server_lower.contains("kr") || server_lower.contains("korea") || server_lower.contains("seoul") {
        Some("韩国".to_string())
    } else if server_lower.contains("tw") || server_lower.contains("taiwan") {
        Some("台湾".to_string())
    } else if server_lower.contains("de") || server_lower.contains("germany") || server_lower.contains("frankfurt") {
        Some("德国".to_string())
    } else if server_lower.contains("fr") || server_lower.contains("france") || server_lower.contains("paris") {
        Some("法国".to_string())
    } else if server_lower.contains("ca") || server_lower.contains("canada") {
        Some("加拿大".to_string())
    } else if server_lower.contains("au") || server_lower.contains("australia") {
        Some("澳大利亚".to_string())
    } else {
        Some("其他".to_string())
    }
}

/// 分析测速结果
fn analyze_results(mut results: Vec<SpeedTestResult>, duration: std::time::Duration) -> GlobalSpeedTestSummary {
    let total_nodes = results.len();
    let successful_tests = results.iter().filter(|r| r.is_available).count();
    let failed_tests = total_nodes - successful_tests;
    
    // 按评分排序（降序）
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    
    // 获取最佳节点
    let best_node = results.iter().find(|r| r.is_available).cloned();
    
    // 获取前10名可用节点
    let top_10_nodes: Vec<SpeedTestResult> = results
        .iter()
        .filter(|r| r.is_available)
        .take(10)
        .cloned()
        .collect();
    
    // 按订阅分组结果
    let mut results_by_profile: HashMap<String, Vec<SpeedTestResult>> = HashMap::new();
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
        all_results: results,
        results_by_profile,
        duration_seconds: duration.as_secs(),
    }
}