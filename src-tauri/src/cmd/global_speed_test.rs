use crate::{
    config::Config,
    ipc::IpcManager,
    utils::dirs,
    cmd::speed_test_monitor::{update_speed_test_state, clear_speed_test_state, monitor_speed_test_health},
};
use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
use tauri::Emitter;

/// 取消标志，用于停止全局测速
pub static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

/// Clash 可用性标志：在一次测速过程中检测后缓存，用于避免反复调用失败的 Clash API 导致阻塞
pub static CLASH_AVAILABLE: AtomicBool = AtomicBool::new(true);

/// 最新测速结果，用于应用最佳节点
static LATEST_RESULTS: Mutex<Option<GlobalSpeedTestSummary>> = Mutex::new(None);

/// 当前测速状态跟踪，用于诊断假死问题
pub static CURRENT_SPEED_TEST_STATE: Mutex<Option<SpeedTestState>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedTestState {
    pub current_node: String,
    pub current_profile: String,
    pub start_time: u64,
    pub last_activity_time: u64,
    pub total_nodes: usize,
    pub completed_nodes: usize,
    pub active_connections: usize,
    pub memory_usage_mb: f64,
    pub stage: String, // "parsing", "testing", "switching", "cleanup"
}

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
pub struct GlobalSpeedTestProgress {
    pub current_node: String,
    pub completed: usize,
    pub total: usize,
    pub percentage: f64,
    pub current_profile: String,
    pub tested_nodes: usize,
    pub successful_tests: usize,
    pub failed_tests: usize,
    pub current_batch: usize,
    pub total_batches: usize,
    pub estimated_remaining_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTestUpdate {
    pub node_name: String,
    pub profile_name: String,
    pub status: String, // "testing", "success", "failed", "timeout"
    pub latency_ms: Option<u64>,
    pub error_message: Option<String>,
    pub completed: usize,
    pub total: usize,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedTestConfig {
    pub batch_size: usize,
    pub node_timeout_seconds: u64,
    pub batch_timeout_seconds: u64,
    pub overall_timeout_seconds: u64,
    pub max_concurrent: usize,
}

/// 全局节点测速 - 增强版（防假死）
#[tauri::command]
pub async fn start_global_speed_test(app_handle: tauri::AppHandle, config: Option<SpeedTestConfig>) -> Result<String, String> {
    log::info!(target: "speed_test", "🚀 [前端请求] 开始增强版全局节点测速");
    log::info!(target: "speed_test", "📋 [测速配置] {:?}", config);
    
    // 重置取消标志
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    log::info!(target: "speed_test", "✅ [状态重置] 已重置取消标志");
    
    // 初始化测速状态跟踪
    let start_timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    let initial_state = SpeedTestState {
        current_node: "初始化中".to_string(),
        current_profile: "准备阶段".to_string(),
        start_time: start_timestamp,
        last_activity_time: start_timestamp,
        total_nodes: 0,
        completed_nodes: 0,
        active_connections: 0,
        memory_usage_mb: 0.0,
        stage: "initialization".to_string(),
    };
    
    *CURRENT_SPEED_TEST_STATE.lock() = Some(initial_state.clone());
    log::info!(target: "speed_test", "📊 [状态跟踪] 已初始化测速状态监控");
    
    // 启动状态监控任务（防假死检测）
    let monitor_handle = app_handle.clone();
    let _monitor_task = tokio::spawn(async move {
        monitor_speed_test_health(monitor_handle).await;
    });
    
    // 🔧 防假死配置：保守设置，优先稳定性
    let config = config.unwrap_or_else(|| SpeedTestConfig {
        batch_size: 1,                    // 🔧 严格单节点处理，彻底避免并发竞争
        node_timeout_seconds: 2,          // 🔧 大幅减少超时，快速失败策略
        batch_timeout_seconds: 5,         // 🔧 批次超时进一步减少，防止长时间等待
        overall_timeout_seconds: 900,     // 🔧 总超时减少到15分钟，避免无限等待
        max_concurrent: 1,                // 🔧 严格禁用并发，避免资源竞争
    });
    
    log::info!(target: "app", "⚙️ 测速配置: 批次大小={}, 节点超时={}s, 批次超时={}s, 总体超时={}s, 最大并发={}", 
              config.batch_size, config.node_timeout_seconds, config.batch_timeout_seconds, 
              config.overall_timeout_seconds, config.max_concurrent);
    
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
            
        // 跳过增强模板类占位配置，避免无有效节点浪费时间
        if profile_data.starts_with("# Profile Enhancement ") {
            log::info!(target: "app", "⏭️ 跳过增强模板占位配置: {}", profile_name);
            continue;
        }

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
    let _start_time = Instant::now();

    // 第二步：检查Clash服务可用性
    log::info!(target: "app", "🔍 检查Clash服务可用性...");
    if let Err(e) = check_clash_availability().await {
        log::warn!(target: "app", "⚠️ Clash服务不可用，将使用TCP连接测试: {}", e);
        CLASH_AVAILABLE.store(false, Ordering::SeqCst);
    } else {
        CLASH_AVAILABLE.store(true, Ordering::SeqCst);
    }
    
    // 第三步：批量测试所有节点
    let batch_size = config.batch_size;
    let total_batches = (total_nodes + batch_size - 1) / batch_size;
    let mut successful_tests = 0;
    let mut failed_tests = 0;
    // 早退保护：当 Clash 不可用且连续失败过多，或长时间无进度时提前结束
    let mut consecutive_failures_overall: usize = 0;
    let consecutive_failures_limit_when_clash_down: usize = 30;
    let mut last_progress_instant = Instant::now();
    let idle_threshold = Duration::from_secs(25);
    
    // 添加超时保护，防止整个测速过程卡死
    let overall_timeout = std::time::Duration::from_secs(config.overall_timeout_seconds);
    let start_time = Instant::now();
    // 兼容模式上限：当 Clash 不可用时，限制最大扫描节点数量，避免长时间 TCP 扫描导致卡顿
    // 将上限提升到 500，以兼顾完整需求与稳定性；若仍不足，可进一步提升或转前端配置
    let max_nodes_when_clash_down: usize = 500;
    let mut processed_nodes_overall: usize = 0;

    for (batch_index, chunk) in all_nodes_with_profile.chunks(batch_size).enumerate() {
        // 检查取消标志
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            log::info!(target: "app", "🛑 测速已被取消");
            return Err("测速已被用户取消".to_string());
        }
        
        // 检查总体超时
        if start_time.elapsed() > overall_timeout {
            log::warn!(target: "app", "⏰ 测速超时，已运行 {} 秒", start_time.elapsed().as_secs());
            return Err("测速超时，请检查网络连接或减少节点数量".to_string());
        }
        
        log::info!(target: "app", "📦 处理批次 {}/{} (包含 {} 个节点)", 
                  batch_index + 1, total_batches, chunk.len());
        
        // 发送批次开始事件
        let progress = GlobalSpeedTestProgress {
            current_node: format!("批次 {}/{}", batch_index + 1, total_batches),
            completed: all_results.len(),
            total: total_nodes,
            percentage: (all_results.len() as f64 / total_nodes as f64) * 100.0,
            current_profile: "批量测试中".to_string(),
            tested_nodes: all_results.len(),
            successful_tests,
            failed_tests,
            current_batch: batch_index + 1,
            total_batches,
            estimated_remaining_seconds: ((total_batches - batch_index) * 15).max(1) as u64,
        };
        let _ = app_handle.emit("global-speed-test-progress", progress);
        
        // 🔧 修复：顺序测试批次节点，避免并发竞争导致假死
        log::info!(target: "app", "🔄 [批次处理] 开始顺序测试批次 {}/{} 的 {} 个节点", 
                  batch_index + 1, total_batches, chunk.len());
        
        // 🔧 修复：添加批次级别的错误处理
        let batch_start_time = Instant::now();
        let mut batch_results: Vec<Result<SpeedTestResult, anyhow::Error>> = Vec::new();
        // 节流“testing”事件，避免高频事件导致前端渲染卡顿
        let mut last_testing_emit = Instant::now() - Duration::from_millis(500);
        
        // 检查批次超时
        if batch_start_time.elapsed() > Duration::from_secs(config.batch_timeout_seconds) {
            log::warn!(target: "app", "⏰ [批次超时] 批次 {} 超时，跳过剩余节点", batch_index + 1);
            continue;
        }
        
        for (node_index, node) in chunk.iter().enumerate() {
            // 检查取消标志
            if CANCEL_FLAG.load(Ordering::SeqCst) {
                log::info!(target: "app", "⏹️ [取消检查] 用户取消测速，停止当前批次");
                break;
            }

            // 空转保护：若超过阈值未产生新结果，提前结束
            if last_progress_instant.elapsed() > idle_threshold {
                log::warn!(target: "app", "⏰ [空转保护] 超过 {:?} 未产生新结果，提前结束测速", idle_threshold);
                // 通过设置一个信号值让外层循环也结束
                consecutive_failures_overall = usize::MAX;
                break;
            }
            
            log::info!(target: "speed_test", "🎯 [节点测试] 开始测试节点 {}/{}: {} (来自: {})", 
                      node_index + 1, chunk.len(), node.node_name, node.profile_name);
            
            // 更新状态跟踪：正在测试节点
            let completed_count = all_results.len();
            update_speed_test_state(
                &node.node_name, 
                &node.profile_name, 
                "testing", 
                completed_count, 
                total_nodes
            );
            
            // 发送节点测试开始事件（节流，最多每150ms发一次）
            if last_testing_emit.elapsed() > Duration::from_millis(150) {
                last_testing_emit = Instant::now();
                let update = NodeTestUpdate {
                    node_name: node.node_name.clone(),
                    profile_name: node.profile_name.clone(),
                    status: "testing".to_string(),
                    latency_ms: None,
                    error_message: None,
                    completed: completed_count,
                    total: total_nodes,
                };
                let _ = app_handle.emit("node-test-update", update);
            }
            
            // 🔧 修复：带状态跟踪的单节点测试
            let node_start_time = Instant::now();
            let test_result = test_single_node_with_monitoring(node, config.node_timeout_seconds).await;
            let node_duration = node_start_time.elapsed();
            
            // 更新状态：节点测试完成
            update_speed_test_state(
                &node.node_name, 
                &node.profile_name, 
                "completed", 
                all_results.len() + 1, 
                total_nodes
            );
            
            log::info!(target: "speed_test", "✅ [节点测试] 节点 {} 测试完成，耗时: {:?}, 结果: {}", 
                      node.node_name, node_duration, 
                      if test_result.is_available { 
                          format!("成功 ({}ms)", test_result.latency.unwrap_or(0)) 
                      } else { 
                          "失败".to_string() 
                      });
            
            // 结果到达即刷新进度时间戳
            last_progress_instant = Instant::now();
            if !test_result.is_available { consecutive_failures_overall += 1; } else { consecutive_failures_overall = 0; }
            if !CLASH_AVAILABLE.load(Ordering::SeqCst) && consecutive_failures_overall >= consecutive_failures_limit_when_clash_down {
                log::warn!(target: "app", "⛔ [提前结束] Clash 不可用且连续失败达到 {}，提前结束测速", consecutive_failures_overall);
                batch_results.push(Ok(test_result));
                consecutive_failures_overall = usize::MAX;
                break;
            }

            batch_results.push(Ok(test_result));

            // Clash 不可用时，达到上限则触发整体早退信号
            processed_nodes_overall += 1;
            if !CLASH_AVAILABLE.load(Ordering::SeqCst) && processed_nodes_overall >= max_nodes_when_clash_down {
                log::warn!(target: "app", "🛑 [兼容模式上限] Clash 不可用，已扫描 {} 个节点，提前结束以保持流畅性", processed_nodes_overall);
                consecutive_failures_overall = usize::MAX;
                break;
            }
            
            // 🔧 优化：减少节点间隔，提高1000+节点测速效率
            if node_index < chunk.len() - 1 {
                log::debug!(target: "app", "⏳ [节点间隔] 等待100ms，避免资源竞争...");
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        }
        
        let batch_duration = batch_start_time.elapsed();
        log::info!(target: "app", "✅ [批次处理] 批次 {}/{} 测试完成，耗时: {:?}, 共处理 {} 个节点", 
                  batch_index + 1, total_batches, batch_duration, batch_results.len());
        
        // 🔧 修复：直接处理顺序测试结果
        {
            // 处理所有测试结果
            let results_len = batch_results.len(); // 🔧 先保存长度
            let mut batch_successful = 0;
            let mut batch_failed = 0;
            
            for result in batch_results {
                    // 检查取消标志
                    if CANCEL_FLAG.load(Ordering::SeqCst) {
                        log::info!(target: "app", "🛑 批次 {} 处理被取消", batch_index + 1);
                        break;
                    }
                    
                    match result {
                        Ok(test_result) => {
                            if test_result.is_available {
                                successful_tests += 1;
                                batch_successful += 1;
                            } else {
                                failed_tests += 1;
                                batch_failed += 1;
                            }
                            
                            // 发送节点完成事件（非阻塞）
                            let update = NodeTestUpdate {
                                node_name: test_result.node_name.clone(),
                                profile_name: test_result.profile_name.clone(),
                                status: if test_result.is_available { "success".to_string() } else { "failed".to_string() },
                                latency_ms: test_result.latency,
                                error_message: test_result.error_message.clone(),
                                completed: all_results.len() + 1,
            total: total_nodes,
                            };
                            let _ = app_handle.emit("node-test-update", update);
                            
                            all_results.push(test_result);
                        }
                        Err(e) => {
                            log::error!(target: "app", "❌ 节点测试任务失败: {}", e);
                            failed_tests += 1;
                            batch_failed += 1;
                        }
                    }
                }
                
                // 🔧 修复：详细的批次统计日志
                log::info!(target: "app", "📊 [批次统计] 批次 {} 完成: 成功 {} 个, 失败 {} 个, 总耗时: {:?}", 
                          batch_index + 1, batch_successful, batch_failed, batch_duration);
                
                // 🔧 修复：如果批次失败率过高，记录警告
                if batch_failed > batch_successful && batch_failed > 0 {
                    log::warn!(target: "app", "⚠️ [批次警告] 批次 {} 失败率过高: {}/{} 节点失败", 
                              batch_index + 1, batch_failed, results_len);
                }
        }
        
        let completed = all_results.len();
        let percentage = (completed as f64 / total_nodes as f64) * 100.0;
        log::info!(target: "app", "📊 进度: {}/{} ({:.1}%) - 成功: {}, 失败: {}", 
                  completed, total_nodes, percentage, successful_tests, failed_tests);
        
        // 若已触发提前结束信号，结束所有批次
        if consecutive_failures_overall == usize::MAX {
            log::warn!(target: "app", "🛑 [整体结束] 触发早退条件，停止后续批次");
            break;
        }

        // 🚀 添加批次间延迟和连接清理，避免资源耗尽和连接堆积
        if batch_index + 1 < total_batches {
            log::debug!(target: "app", "⏸️ 批次间休息和清理，避免资源耗尽");
            
            // 批次间清理连接
            if let Err(e) = cleanup_stale_connections().await {
                log::warn!(target: "app", "批次间连接清理失败: {}", e);
            }
            
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    }
    
    let duration = start_time.elapsed();
    log::info!(target: "speed_test", "🏁 全局测速完成，耗时 {:.2} 秒", duration.as_secs_f64());
    
    // 更新状态：正在分析结果
    update_speed_test_state("分析结果中", "汇总阶段", "analyzing", all_results.len(), total_nodes);
    
    // 第三步：分析结果
    let summary = analyze_results(all_results, duration);
    
    // 保存结果供后续使用
    *LATEST_RESULTS.lock() = Some(summary.clone());
    
    // 清理状态跟踪
    clear_speed_test_state();
    
    // 发送完成事件
    let _ = app_handle.emit("global-speed-test-complete", summary.clone());
    
    log::info!(target: "speed_test", "📈 测速统计: 总计 {} 个节点，成功 {} 个，失败 {} 个", 
              summary.total_nodes, summary.successful_tests, summary.failed_tests);
    
    if let Some(best) = &summary.best_node {
        log::info!(target: "speed_test", "🏆 最佳节点: {} (延迟: {}ms, 评分: {:.2})", 
                  best.node_name, 
                  best.latency.unwrap_or(0), 
                  best.score);
    }
    
    Ok("全局节点测速完成".to_string())
}

/// 增强版取消全局节点测速（防假死）
#[tauri::command]
pub async fn cancel_global_speed_test(app_handle: tauri::AppHandle) -> Result<(), String> {
    log::info!(target: "speed_test", "🛑 [前端请求] 用户取消全局测速");
    
    // 设置取消标志
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    log::info!(target: "speed_test", "✅ [取消状态] 已设置取消标志为true");
    
    // 立即清理状态跟踪
    clear_speed_test_state();
    
    // 发送取消事件到前端
    let _ = app_handle.emit("global-speed-test-cancelled", ());
    
    // 强制清理连接，防止僵死连接影响后续测速
    log::info!(target: "speed_test", "🧹 [取消清理] 强制清理连接...");
    if let Err(e) = cleanup_stale_connections().await {
        log::warn!(target: "speed_test", "⚠️ [取消清理] 连接清理失败: {}", e);
    }
    
    // 等待更长时间确保所有操作完成
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    
    log::info!(target: "speed_test", "✅ 增强版全局测速取消完成");
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

/// 切换到指定节点
#[tauri::command]
pub async fn switch_to_node(profile_uid: String, node_name: String) -> Result<String, String> {
    log::info!(target: "app", "🔄 切换到指定节点: {} (订阅: {})", node_name, profile_uid);
    
    // 使用 IpcManager 来切换节点
    let ipc_manager = IpcManager::global();
    match ipc_manager.update_proxy(&profile_uid, &node_name).await {
        Ok(_) => {
            let success_msg = format!("已切换到节点: {}", node_name);
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
    
            log::info!(target: "speed_test", "🔍 开始解析配置文件 '{}'，长度: {} 字符", profile_name, profile_data.len());
            
            // 更新状态：正在解析配置
            update_speed_test_state(&format!("解析订阅: {}", profile_name), profile_name, "parsing", 0, 1);
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

/// 测试单个节点 - 带状态监控的版本（防假死）
async fn test_single_node_with_monitoring(node: &NodeInfo, timeout_seconds: u64) -> SpeedTestResult {
    log::debug!(target: "speed_test", "🎯 [防假死测试] 开始测试节点: {} ({}:{})", 
              node.node_name, node.server, node.port);
    
    // 添加超时保护，防止单个节点测试卡死
    let test_timeout = Duration::from_secs(timeout_seconds + 5); // 给额外的5秒缓冲
    
    let test_future = async {
        // 更新状态：开始连接
        update_speed_test_state(&node.node_name, &node.profile_name, "connecting", 0, 1);
        
        // 定期检查取消标志
        let cancel_check = async {
            loop {
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    log::info!(target: "speed_test", "🛑 [取消检查] 节点 {} 测试被取消", node.node_name);
                    return Err(anyhow::anyhow!("测试被用户取消")) as anyhow::Result<()>;
                }
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        };
        
        // 执行实际的节点测试
        let actual_test = test_single_node_internal(node, timeout_seconds);
        
        // 竞争执行：测试 vs 取消检查
        tokio::select! {
            result = actual_test => result,
            _ = cancel_check => SpeedTestResult {
                node_name: node.node_name.clone(),
                node_type: node.node_type.clone(),
                server: node.server.clone(),
                port: node.port,
                profile_name: node.profile_name.clone(),
                profile_uid: node.profile_uid.clone(),
                subscription_url: node.subscription_url.clone(),
                latency: None,
                is_available: false,
                error_message: Some("测试被用户取消".to_string()),
                score: 0.0,
                region: identify_region(&node.server),
                traffic_info: node.traffic_info.clone(),
            }
        }
    };
    
    // 添加总体超时保护
    match tokio::time::timeout(test_timeout, test_future).await {
        Ok(result) => {
            log::debug!(target: "speed_test", "✅ [防假死测试] 节点 {} 测试完成", node.node_name);
            result
        }
        Err(_) => {
            log::warn!(target: "speed_test", "⏰ [防假死测试] 节点 {} 测试超时", node.node_name);
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
                error_message: Some(format!("节点测试超时 ({}秒)", timeout_seconds + 5)),
                score: 0.0,
                region: identify_region(&node.server),
                traffic_info: node.traffic_info.clone(),
            }
        }
    }
}

/// 测试单个节点 - 内部实现
async fn test_single_node_internal(node: &NodeInfo, timeout_seconds: u64) -> SpeedTestResult {
    log::info!(target: "app", "🔍 开始真实代理测试节点: {} ({}:{}) 来自订阅: {}", 
              node.node_name, node.server, node.port, node.profile_name);
    
    let _start_time = Instant::now();
    
    // 确保配置文件已激活（可选，取决于实现）
    if let Err(e) = ensure_profile_activated(&node.profile_uid).await {
        log::warn!(target: "app", "⚠️ 无法激活配置文件 {}: {}", node.profile_uid, e);
    }
    
    // 首先尝试使用Clash API进行真实的代理延迟测试
    match test_proxy_via_clash(&node.node_name, timeout_seconds).await {
        Ok(latency) => {
            let score = calculate_score(Some(latency), true);
            
            log::info!(target: "app", "✅ 节点 {} 代理测试成功，延迟: {}ms, 评分: {:.2}", 
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
        Err(e) => {
            log::warn!(target: "app", "❌ 节点 {} 代理测试失败: {}", node.node_name, e);
            
            // 如果Clash API测试失败或不可用，降级到TCP连接测试作为备用
            log::info!(target: "app", "🔄 节点 {} 降级到TCP连接测试", node.node_name);
            
            match test_tcp_connection(&node.server, node.port, timeout_seconds).await {
                Ok(latency) => {
                    let score = calculate_score(Some(latency), true) * 0.5; // 降级测试评分减半
                    
                    log::info!(target: "app", "⚠️ 节点 {} TCP连接成功(降级)，延迟: {}ms, 评分: {:.2}", 
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
                        error_message: Some(format!("代理测试失败，降级到TCP测试: {}", e)),
                        score,
                        region: identify_region(&node.server),
                        traffic_info: node.traffic_info.clone(),
                    }
                }
                Err(tcp_error) => {
                    let error_msg = format!("代理测试失败: {}; TCP测试也失败: {}", e, tcp_error);
                    
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
    }
}

/// 确保配置文件已激活（如果需要的话）
async fn ensure_profile_activated(profile_uid: &str) -> Result<()> {
    log::debug!(target: "app", "🔧 确保配置文件已激活: {}", profile_uid);
    
    // 这里可以添加激活配置文件的逻辑
    // 例如：Config::activate_profile(profile_uid).await?;
    
    // 目前先简单返回成功，实际使用时可能需要检查当前活动的配置文件
    Ok(())
}

/// 检查Clash服务是否可用
async fn check_clash_availability() -> Result<()> {
    let ipc = IpcManager::global();
    
    // 快速检查Clash API是否响应
    let check_timeout = std::time::Duration::from_secs(2); // 只给2秒检查时间
    let version_call = ipc.get_version();
    
    match tokio::time::timeout(check_timeout, version_call).await {
        Ok(Ok(_)) => {
            log::debug!(target: "app", "✅ Clash服务可用");
            Ok(())
        }
        Ok(Err(e)) => {
            let error_msg = format!("Clash服务不可用: {}", e);
            log::error!(target: "app", "{}", error_msg);
            Err(anyhow::anyhow!(error_msg))
        }
        Err(_) => {
            let error_msg = "Clash服务检查超时";
            log::error!(target: "app", "{}", error_msg);
            Err(anyhow::anyhow!(error_msg))
        }
    }
}

/// 通过临时切换节点进行真实代理延迟测试（修复测速逻辑）
async fn test_proxy_via_clash(node_name: &str, timeout_seconds: u64) -> Result<u64> {
    // 若检测到 Clash 不可用，直接返回错误让上层走 TCP 降级，避免反复占用连接池
    if !CLASH_AVAILABLE.load(Ordering::SeqCst) {
        return Err(anyhow::anyhow!("Clash 不可用，跳过代理测速"));
    }
    
    // 获取IPC管理器实例
    let ipc = IpcManager::global();
    
    log::debug!(target: "app", "🎯 开始真实代理测速：临时切换到节点 '{}'", node_name);
    
    // 检查节点名称
    if node_name.is_empty() {
        return Err(anyhow::anyhow!("节点名称为空"));
    }
    
    // Step 1: 获取当前代理配置（用于恢复）
    let original_proxies = match ipc.get_proxies().await {
        Ok(proxies) => {
            log::debug!(target: "app", "✅ 已获取当前代理配置");
            proxies
        }
        Err(e) => {
            log::error!(target: "app", "❌ 获取当前代理配置失败: {}", e);
            return Err(anyhow::anyhow!("获取当前代理配置失败: {}", e));
        }
    };
    
    
    // Step 2: 找到包含目标节点的代理组
    let target_group = find_proxy_group_for_node(&original_proxies, node_name)?;
    log::debug!(target: "app", "🔍 找到目标节点所在组: '{}'", target_group);
    
    // Step 3: 获取当前选中的节点（用于恢复）
    let original_selected = get_selected_proxy_for_group(&original_proxies, &target_group)?;
    log::debug!(target: "app", "📝 当前选中节点: '{}'", original_selected);
    
    // Step 4: 临时切换到目标节点
    if let Err(e) = ipc.update_proxy(&target_group, node_name).await {
        log::error!(target: "app", "❌ 切换到目标节点失败: {}", e);
        return Err(anyhow::anyhow!("切换到目标节点失败: {}", e));
    }
    log::debug!(target: "app", "🔄 已临时切换到节点: '{}'", node_name);
    
    // 🚀 优化：减少等待时间，避免累积延迟
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    
    // Step 5: 进行真实的延迟测试（现在通过目标节点）
    let test_url = Some("https://cp.cloudflare.com/generate_204".to_string());
    let timeout_ms = (timeout_seconds * 1000) as i32;
    let start_time = std::time::Instant::now();
    
    let test_result = {
        let api_call = ipc.test_proxy_delay("GLOBAL", test_url, timeout_ms); // 测试当前生效的代理
        let overall_timeout = std::time::Duration::from_secs(timeout_seconds + 3);
        
        // 取消检查
        let cancel_check = async {
            loop {
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    return Err(anyhow::anyhow!("测速已被用户取消")) as anyhow::Result<serde_json::Value>;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        };
        
        // 竞争执行
        match tokio::select! {
            result = api_call => Ok(result),
            _ = tokio::time::sleep(overall_timeout) => Err(anyhow::anyhow!("测试超时")),
            cancel_result = cancel_check => Err(cancel_result.unwrap_err()),
        } {
            Ok(result) => match result {
                Ok(response) => {
                    if let Some(delay_obj) = response.as_object() {
                        if let Some(delay) = delay_obj.get("delay").and_then(|v| v.as_u64()) {
                            let elapsed = start_time.elapsed();
                            log::debug!(target: "app", "✅ 真实代理延迟: {}ms (耗时: {:?})", delay, elapsed);
                            Ok(delay)
                        } else {
                            Err(anyhow::anyhow!("API响应格式无效"))
                        }
                    } else {
                        Err(anyhow::anyhow!("API响应不是有效JSON"))
                    }
                }
                Err(e) => Err(anyhow::anyhow!("API调用失败: {}", e))
            },
            Err(e) => Err(e),
        }
    };
    
    // Step 6: 恢复原始代理配置（无论测试成功与否）
    let restore_result = tokio::time::timeout(
        std::time::Duration::from_secs(5), // 🚀 恢复操作也要有超时
        ipc.update_proxy(&target_group, &original_selected)
    ).await;
    
    match restore_result {
        Ok(Ok(_)) => {
            log::debug!(target: "app", "🔄 已恢复到原始节点: '{}'", original_selected);
        }
        Ok(Err(e)) => {
            log::error!(target: "app", "⚠️ 恢复原始代理配置失败: {}", e);
        }
        Err(_) => {
            log::error!(target: "app", "⚠️ 恢复原始代理配置超时");
        }
    }
    
    // 🚀 添加小延迟确保恢复操作完成，避免连续切换冲突
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    
    // 🔧 强制清理可能的僵死连接
    if let Err(e) = cleanup_stale_connections().await {
        log::warn!(target: "app", "⚠️ 清理僵死连接失败: {}", e);
    }
    
    // 返回测试结果
    test_result
}

/// TCP连接测试（作为备用方案）
async fn test_tcp_connection(server: &str, port: u16, timeout_seconds: u64) -> Result<u64> {
    let start_time = Instant::now();
    
    match tokio::time::timeout(
        std::time::Duration::from_secs(timeout_seconds),
        tokio::net::TcpStream::connect(format!("{}:{}", server, port))
    ).await {
        Ok(Ok(_stream)) => {
            let latency = start_time.elapsed().as_millis() as u64;
            Ok(latency)
        }
        Ok(Err(e)) => {
            Err(anyhow::anyhow!("TCP连接失败: {}", e))
        }
        Err(_) => {
            Err(anyhow::anyhow!("TCP连接超时 ({}秒)", timeout_seconds))
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

/// 查找包含指定节点的代理组
fn find_proxy_group_for_node(proxies: &serde_json::Value, node_name: &str) -> Result<String> {
    if let Some(proxies_obj) = proxies.as_object() {
        for (group_name, group_info) in proxies_obj {
            if let Some(all_nodes) = group_info.get("all").and_then(|v| v.as_array()) {
                for node in all_nodes {
                    if let Some(name) = node.as_str() {
                        if name == node_name {
                            log::debug!(target: "app", "🔍 节点 '{}' 属于组 '{}'", node_name, group_name);
                            return Ok(group_name.clone());
                        }
                    }
                }
            }
        }
    }
    
    // 如果没找到，尝试GLOBAL组
    log::warn!(target: "app", "⚠️ 未找到节点 '{}' 所属组，尝试使用GLOBAL组", node_name);
    Ok("GLOBAL".to_string())
}

/// 获取指定组当前选中的代理
fn get_selected_proxy_for_group(proxies: &serde_json::Value, group_name: &str) -> Result<String> {
    if let Some(group_info) = proxies.as_object().and_then(|obj| obj.get(group_name)) {
        if let Some(now) = group_info.get("now").and_then(|v| v.as_str()) {
            log::debug!(target: "app", "📝 组 '{}' 当前选中: '{}'", group_name, now);
            return Ok(now.to_string());
        }
    }
    
    log::warn!(target: "app", "⚠️ 无法获取组 '{}' 的当前选中节点，使用DIRECT作为备用", group_name);
    Ok("DIRECT".to_string())
}

/// 增强版连接清理，防止连接累积导致假死
async fn cleanup_stale_connections() -> Result<()> {
    // Clash 不可用时，跳过连接清理，避免反复打 API 导致连接池耗尽
    if !CLASH_AVAILABLE.load(Ordering::SeqCst) {
        log::debug!(target: "speed_test", "⏭️ [增强清理] Clash 不可用，跳过连接清理");
        return Ok(());
    }
    log::debug!(target: "speed_test", "🧹 [增强清理] 开始清理僵死连接");
    let ipc = IpcManager::global();
    
    // 添加清理超时，防止清理操作本身卡死
    let cleanup_timeout = Duration::from_secs(10);
    
    let cleanup_task = async {
        // 获取当前所有连接
        log::debug!(target: "speed_test", "📡 [增强清理] 正在获取当前连接列表...");
        match ipc.get_connections().await {
            Ok(connections) => {
                if let Some(connections_array) = connections.as_array() {
                    log::info!(target: "speed_test", "🔍 [增强清理] 发现 {} 个总连接", connections_array.len());
                    
                    // 更激进的清理策略：清理所有测试相关的连接
                    let stale_connections: Vec<&serde_json::Value> = connections_array
                        .iter()
                        .filter(|conn| {
                            // 检查连接是否需要清理
                            if let Some(metadata) = conn.get("metadata") {
                                if let Some(host) = metadata.get("host").and_then(|h| h.as_str()) {
                                    // 清理测试相关的所有连接
                                    return host.contains("cloudflare.com") || 
                                           host.contains("cp.cloudflare.com") ||
                                           host.contains("generate_204") ||
                                           host.contains("connectivity-check") ||
                                           metadata.get("process").and_then(|p| p.as_str())
                                               .map_or(false, |p| p.contains("liebesu-clash") || p.contains("verge"));
                                }
                                
                                // 检查连接状态
                                if let Some(rule) = metadata.get("rule").and_then(|r| r.as_str()) {
                                    return rule.contains("GLOBAL") || rule.contains("DIRECT");
                                }
                            }
                            
                            // 清理长时间存在的连接
                            if let Some(start) = conn.get("start").and_then(|s| s.as_str()) {
                                // 简单的时间检查（如果连接存在超过5分钟）
                                return start.len() > 0; // 简化实现
                            }
                            
                            false
                        })
                        .collect();
                    
                    if !stale_connections.is_empty() {
                        let total_connections = stale_connections.len();
                        log::info!(target: "speed_test", "🧹 [增强清理] 发现 {} 个需要清理的连接", total_connections);
                        
                        // 批量并发清理连接，提高效率
                        let mut cleanup_tasks = Vec::new();
                        
                        for conn in stale_connections {
                            if let Some(id) = conn.get("id").and_then(|i| i.as_str()) {
                                let id = id.to_string();
                                let ipc_clone = ipc.clone();
                                
                                let cleanup_task = tokio::spawn(async move {
                                    log::debug!(target: "speed_test", "🗑️ [增强清理] 清理连接: {}", id);
                                    match ipc_clone.delete_connection(&id).await {
                                        Ok(_) => {
                                            log::debug!(target: "speed_test", "✅ [增强清理] 连接 {} 清理成功", id);
                                            true
                                        }
                                        Err(e) => {
                                            log::debug!(target: "speed_test", "❌ [增强清理] 连接 {} 清理失败: {}", id, e);
                                            false
                                        }
                                    }
                                });
                                
                                cleanup_tasks.push(cleanup_task);
                            }
                        }
                        
                        // 等待所有清理任务完成
                        let results = futures_util::future::join_all(cleanup_tasks).await;
                        let cleaned_count = results.into_iter()
                            .filter_map(|r| r.ok())
                            .filter(|&success| success)
                            .count();
                        
                        log::info!(target: "speed_test", "✅ [增强清理] 清理完成，成功清理 {}/{} 个连接", cleaned_count, total_connections);
                    } else {
                        log::debug!(target: "speed_test", "✨ [增强清理] 未发现需要清理的连接");
                    }
                }
            }
            Err(e) => {
                log::warn!(target: "speed_test", "❌ [增强清理] 获取连接列表失败: {}", e);
            }
        }
        
        // 额外的系统级清理
        log::debug!(target: "speed_test", "🔧 [增强清理] 执行系统级资源清理");
        
        // 尝试强制垃圾回收（Rust中的等效操作）
        // 这里可以添加更多的系统清理逻辑
        
        Ok(())
    };
    
    // 添加超时保护
    match tokio::time::timeout(cleanup_timeout, cleanup_task).await {
        Ok(result) => result,
        Err(_) => {
            log::error!(target: "speed_test", "⏰ [增强清理] 连接清理超时");
            Err(anyhow::anyhow!("连接清理操作超时"))
        }
    }
}
