use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

use super::global_speed_test::{CANCEL_FLAG, CURRENT_SPEED_TEST_STATE, SpeedTestState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckReport {
    pub is_healthy: bool,
    pub issues: Vec<String>,
    pub recommendations: Vec<String>,
    pub current_state: Option<SpeedTestState>,
    pub system_resources: SystemResources,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemResources {
    pub memory_usage_mb: f64,
    pub active_connections: usize,
    pub cpu_usage_percent: f64,
    pub uptime_seconds: u64,
}

/// 监控测速健康状态，防止假死
pub async fn monitor_speed_test_health(app_handle: tauri::AppHandle) {
    log::info!(target: "speed_test", "🔍 [健康监控] 启动测速健康监控器");
    
    let mut last_check_time = Instant::now();
    let mut stall_count = 0;
    let mut last_completed_nodes = 0;
    
    loop {
        // 检查取消标志
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            log::info!(target: "speed_test", "🛑 [健康监控] 检测到取消信号，退出监控");
            break;
        }
        
        // 每10秒检查一次健康状态
        tokio::time::sleep(Duration::from_secs(10)).await;
        
        let current_time = Instant::now();
        let check_interval = current_time.duration_since(last_check_time);
        
        // 获取当前状态
        let current_state = {
            let state_guard = CURRENT_SPEED_TEST_STATE.lock();
            state_guard.clone()
        };
        
        if let Some(state) = current_state {
            log::debug!(target: "speed_test", "🔍 [健康检查] 当前状态: 阶段={}, 节点={}, 完成={}/{}", 
                      state.stage, state.current_node, state.completed_nodes, state.total_nodes);
            
            let mut issues = Vec::new();
            let mut recommendations = Vec::new();
            
            // 检查1: 进度停滞检测
            if state.completed_nodes == last_completed_nodes && check_interval > Duration::from_secs(30) {
                stall_count += 1;
                issues.push(format!("进度停滞 {} 次，可能出现假死", stall_count));
                
                if stall_count >= 3 {
                    issues.push("检测到严重假死状态，建议立即取消测速".to_string());
                    recommendations.push("点击取消按钮终止测速".to_string());
                    recommendations.push("检查网络连接状态".to_string());
                    recommendations.push("减少批次大小重新开始".to_string());
                    
                    // 发送假死警告
                    let _ = app_handle.emit("speed-test-freeze-detected", HealthCheckReport {
                        is_healthy: false,
                        issues: issues.clone(),
                        recommendations: recommendations.clone(),
                        current_state: Some(state.clone()),
                        system_resources: get_system_resources().await,
                    });
                    
                    log::error!(target: "speed_test", "❌ [假死检测] 检测到测速假死，已发送警告");
                }
            } else {
                stall_count = 0;
            }
            
            // 检查2: 活动时间检测
            let activity_age = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() - state.last_activity_time;
                
            if activity_age > 60 {
                issues.push(format!("超过 {} 秒无活动", activity_age));
                recommendations.push("检查当前节点是否响应".to_string());
            }
            
            // 检查3: 内存使用检测
            if state.memory_usage_mb > 1024.0 {
                issues.push(format!("内存使用过高: {:.1} MB", state.memory_usage_mb));
                recommendations.push("考虑重启应用释放内存".to_string());
            }
            
            // 检查4: 连接数检测
            if state.active_connections > 100 {
                issues.push(format!("活动连接过多: {}", state.active_connections));
                recommendations.push("等待连接清理完成".to_string());
            }
            
            // 发送健康报告
            if !issues.is_empty() {
                let health_report = HealthCheckReport {
                    is_healthy: stall_count < 3,
                    issues,
                    recommendations,
                    current_state: Some(state.clone()),
                    system_resources: get_system_resources().await,
                };
                
                let _ = app_handle.emit("speed-test-health-report", health_report);
            }
            
            last_completed_nodes = state.completed_nodes;
        } else {
            // 没有活动测速，退出监控
            log::debug!(target: "speed_test", "🔍 [健康监控] 无活动测速，退出监控");
            break;
        }
        
        last_check_time = current_time;
    }
    
    log::info!(target: "speed_test", "✅ [健康监控] 测速健康监控器已退出");
}

/// 更新测速状态
pub fn update_speed_test_state(
    node_name: &str,
    profile_name: &str,
    stage: &str,
    completed: usize,
    total: usize,
) {
    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    let updated_state = SpeedTestState {
        current_node: node_name.to_string(),
        current_profile: profile_name.to_string(),
        start_time: CURRENT_SPEED_TEST_STATE.lock()
            .as_ref()
            .map(|s| s.start_time)
            .unwrap_or(current_time),
        last_activity_time: current_time,
        total_nodes: total,
        completed_nodes: completed,
        active_connections: 0, // 需要实际实现连接计数
        memory_usage_mb: 0.0,  // 需要实际实现内存监控
        stage: stage.to_string(),
    };
    
    *CURRENT_SPEED_TEST_STATE.lock() = Some(updated_state);
    
    log::debug!(target: "speed_test", "📊 [状态更新] 节点: {}, 阶段: {}, 进度: {}/{}", 
              node_name, stage, completed, total);
}

/// 清理测速状态
pub fn clear_speed_test_state() {
    *CURRENT_SPEED_TEST_STATE.lock() = None;
    log::info!(target: "speed_test", "🧹 [状态清理] 已清理测速状态跟踪");
}

/// 获取系统资源使用情况
async fn get_system_resources() -> SystemResources {
    // 简化版实现，实际可以添加更详细的系统监控
    SystemResources {
        memory_usage_mb: 0.0,
        active_connections: 0,
        cpu_usage_percent: 0.0,
        uptime_seconds: 0,
    }
}

/// 强制取消假死的测速
#[tauri::command]
pub async fn force_cancel_frozen_speed_test(app_handle: tauri::AppHandle) -> Result<String, String> {
    log::warn!(target: "speed_test", "🚨 [强制取消] 用户请求强制取消假死的测速");
    
    // 设置取消标志
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    
    // 清理状态
    clear_speed_test_state();
    
    // 发送强制取消事件
    let _ = app_handle.emit("global-speed-test-force-cancelled", ());
    
    // 等待一段时间确保所有任务收到取消信号
    tokio::time::sleep(Duration::from_millis(500)).await;
    
    log::info!(target: "speed_test", "✅ [强制取消] 假死测速已强制取消");
    Ok("假死测速已强制取消".to_string())
}

/// 获取当前测速健康报告
#[tauri::command]
pub async fn get_speed_test_health_report() -> Result<HealthCheckReport, String> {
    let current_state = {
        let state_guard = CURRENT_SPEED_TEST_STATE.lock();
        state_guard.clone()
    };
    
    let mut issues = Vec::new();
    let mut recommendations = Vec::new();
    let is_healthy = match &current_state {
        Some(state) => {
            let current_time = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            
            let activity_age = current_time - state.last_activity_time;
            
            if activity_age > 30 {
                issues.push(format!("测速可能停滞，已 {} 秒无响应", activity_age));
                recommendations.push("考虑取消当前测速".to_string());
                false
            } else {
                true
            }
        }
        None => {
            issues.push("当前没有进行中的测速".to_string());
            true
        }
    };
    
    Ok(HealthCheckReport {
        is_healthy,
        issues,
        recommendations,
        current_state,
        system_resources: get_system_resources().await,
    })
}
