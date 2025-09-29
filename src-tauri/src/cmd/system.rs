use super::CmdResult;
use crate::{
    core::{CoreManager, handle},
    logging,
    module::sysinfo::PlatformSpecification,
    utils::logging::Type,
};
use once_cell::sync::Lazy;
use std::{
    sync::atomic::{AtomicI64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri_plugin_clipboard_manager::ClipboardExt;

// 存储应用启动时间的全局变量
static APP_START_TIME: Lazy<AtomicI64> = Lazy::new(|| {
    // 获取当前系统时间，转换为毫秒级时间戳
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    AtomicI64::new(now)
});

#[tauri::command]
pub async fn export_diagnostic_info() -> CmdResult<()> {
    let sysinfo = PlatformSpecification::new_sync();
    let info = format!("{sysinfo:?}");

    let app_handle = handle::Handle::global()
        .app_handle()
        .ok_or("Failed to get app handle")?;
    let cliboard = app_handle.clipboard();
    if cliboard.write_text(info).is_err() {
        logging!(error, Type::System, "Failed to write to clipboard");
    }
    Ok(())
}

#[tauri::command]
pub async fn get_system_info() -> CmdResult<String> {
    let sysinfo = PlatformSpecification::new_sync();
    let info = format!("{sysinfo:?}");
    Ok(info)
}

/// 获取当前内核运行模式
#[tauri::command]
pub async fn get_running_mode() -> Result<String, String> {
    Ok(CoreManager::global().get_running_mode().to_string())
}

/// 获取应用的运行时间（毫秒）
#[tauri::command]
pub fn get_app_uptime() -> CmdResult<i64> {
    let start_time = APP_START_TIME.load(Ordering::Relaxed);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    Ok(now - start_time)
}

/// 检查应用是否以管理员身份运行
#[tauri::command]
#[cfg(target_os = "windows")]
pub fn is_admin() -> CmdResult<bool> {
    use deelevate::{PrivilegeLevel, Token};

    let result = Token::with_current_process()
        .and_then(|token| token.privilege_level())
        .map(|level| level != PrivilegeLevel::NotPrivileged)
        .unwrap_or(false);

    Ok(result)
}

/// 非Windows平台检测是否以管理员身份运行
#[tauri::command]
#[cfg(not(target_os = "windows"))]
pub fn is_admin() -> CmdResult<bool> {
    #[cfg(target_os = "macos")]
    {
        Ok(unsafe { libc::geteuid() } == 0)
    }

    #[cfg(target_os = "linux")]
    {
        Ok(unsafe { libc::geteuid() } == 0)
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        Ok(false)
    }
}

// ===== 跨平台兼容性相关命令 =====

use crate::utils::platform_compat::{
    PlatformInfo, PlatformDetails, PlatformFeatures, SystemLimits,
    MemoryManager, MemoryLimits, MemoryUsage,
    set_process_priority, optimize_network_settings,
    FileSystemCompat, EnvironmentManager,
};

/// 获取平台详细信息
#[tauri::command]
pub async fn get_platform_details() -> CmdResult<PlatformDetails> {
    log::debug!(target: "app", "获取平台详细信息");
    Ok(PlatformInfo::get_platform_details())
}

/// 检查平台功能支持
#[tauri::command]
pub async fn check_platform_features() -> CmdResult<PlatformFeatures> {
    log::debug!(target: "app", "检查平台功能支持");
    Ok(PlatformInfo::check_platform_features())
}

/// 获取系统资源限制
#[tauri::command]
pub async fn get_system_limits() -> CmdResult<SystemLimits> {
    log::debug!(target: "app", "获取系统资源限制");
    Ok(PlatformInfo::get_system_limits())
}

/// 获取内存限制配置
#[tauri::command]
pub fn get_memory_limits() -> CmdResult<MemoryLimits> {
    log::debug!(target: "app", "获取内存限制配置");
    Ok(MemoryManager::get_memory_limits())
}

/// 检查当前内存使用情况
#[tauri::command]
pub fn check_memory_usage() -> CmdResult<MemoryUsage> {
    log::debug!(target: "app", "检查当前内存使用情况");
    
    match MemoryManager::check_memory_usage() {
        Ok(usage) => {
            log::debug!(target: "app", "内存使用情况: RSS={}MB, Virtual={}MB, CPU={:.1}%", 
                      usage.rss / 1024 / 1024, usage.virtual_mem / 1024 / 1024, usage.cpu_usage);
            Ok(usage)
        }
        Err(e) => {
            log::warn!(target: "app", "获取内存使用情况失败: {}", e);
            Err(format!("获取内存使用情况失败: {}", e))
        }
    }
}

/// 执行平台特定的内存清理
#[tauri::command]
pub async fn cleanup_platform_memory() -> CmdResult<()> {
    log::debug!(target: "app", "执行平台特定的内存清理");
    MemoryManager::cleanup_platform_specific().await;
    Ok(())
}

/// 设置进程优先级
#[tauri::command]
pub async fn set_platform_process_priority() -> CmdResult<()> {
    log::debug!(target: "app", "设置进程优先级");
    
    match set_process_priority() {
        Ok(()) => {
            log::info!(target: "app", "进程优先级设置成功");
            Ok(())
        }
        Err(e) => {
            log::warn!(target: "app", "设置进程优先级失败: {}", e);
            Err(format!("设置进程优先级失败: {}", e))
        }
    }
}

/// 优化网络设置
#[tauri::command]
pub async fn optimize_platform_network() -> CmdResult<()> {
    log::debug!(target: "app", "优化平台网络设置");
    optimize_network_settings();
    Ok(())
}

/// 确保应用目录存在
#[tauri::command]
pub async fn ensure_platform_app_dirs() -> CmdResult<()> {
    log::debug!(target: "app", "确保平台应用目录存在");
    
    match FileSystemCompat::ensure_app_dirs() {
        Ok(()) => {
            log::info!(target: "app", "应用目录检查完成");
            Ok(())
        }
        Err(e) => {
            log::error!(target: "app", "创建应用目录失败: {}", e);
            Err(format!("创建应用目录失败: {}", e))
        }
    }
}

/// 设置平台环境变量
#[tauri::command]
pub async fn setup_platform_environment() -> CmdResult<()> {
    log::debug!(target: "app", "设置平台环境变量");
    EnvironmentManager::setup_platform_env();
    Ok(())
}

/// 执行完整的平台初始化
#[tauri::command]
pub async fn initialize_platform_compatibility() -> CmdResult<()> {
    log::info!(target: "app", "开始平台兼容性初始化");
    
    // 设置环境变量
    EnvironmentManager::setup_platform_env();
    
    // 确保应用目录
    if let Err(e) = FileSystemCompat::ensure_app_dirs() {
        log::warn!(target: "app", "创建应用目录失败: {}", e);
    }
    
    // 优化网络设置
    optimize_network_settings();
    
    // 尝试设置进程优先级（非关键）
    if let Err(e) = set_process_priority() {
        log::warn!(target: "app", "设置进程优先级失败: {}", e);
    }
    
    // 执行内存清理
    MemoryManager::cleanup_platform_specific().await;
    
    log::info!(target: "app", "平台兼容性初始化完成");
    Ok(())
}

// ===== 内存泄漏防护相关命令 =====

use crate::utils::memory_guard::{MemoryGuard, MemoryHealthStatus};

/// 启用内存监控
#[tauri::command]
pub async fn enable_memory_monitoring() -> CmdResult<()> {
    log::info!(target: "app", "启用内存监控");
    MemoryGuard::global().enable_monitoring();
    
    // 启动自动清理任务
    MemoryGuard::global().start_auto_cleanup();
    
    Ok(())
}

/// 禁用内存监控
#[tauri::command]
pub async fn disable_memory_monitoring() -> CmdResult<()> {
    log::info!(target: "app", "禁用内存监控");
    MemoryGuard::global().disable_monitoring();
    Ok(())
}

/// 设置内存阈值
#[tauri::command]
pub async fn set_memory_threshold(threshold_mb: u64) -> CmdResult<()> {
    log::info!(target: "app", "设置内存阈值: {}MB", threshold_mb);
    MemoryGuard::global().set_memory_threshold(threshold_mb);
    Ok(())
}

/// 获取内存健康状况
#[tauri::command]
pub async fn get_memory_health_status() -> CmdResult<MemoryHealthStatus> {
    log::debug!(target: "app", "获取内存健康状况");
    let status = MemoryGuard::global().check_memory_health().await;
    
    log::debug!(target: "app", "内存健康状况: 评分={}, 当前={}MB, 峰值={}MB, 健康={}", 
              status.health_score, status.current_memory_mb, status.peak_memory_mb, status.is_healthy);
    
    Ok(status)
}

/// 检查当前内存使用情况
#[tauri::command]
pub async fn check_current_memory() -> CmdResult<String> {
    log::debug!(target: "app", "检查当前内存使用情况");
    
    match MemoryGuard::instance().check_memory_usage().await {
        Some(usage) => {
            let usage_info = format!("RSS: {}MB, Virtual: {}MB, CPU: {:.1}%", 
                                   usage.rss / 1024 / 1024, usage.virtual_mem / 1024 / 1024, usage.cpu_usage);
            log::debug!(target: "app", "当前内存使用: {}", usage_info);
            Ok(usage_info)
        }
        None => {
            log::warn!(target: "app", "无法获取内存使用情况");
            Err("无法获取内存使用情况".to_string())
        }
    }
}

/// 清理泄漏的资源
#[tauri::command]
pub async fn cleanup_leaked_resources() -> CmdResult<()> {
    log::info!(target: "app", "手动清理泄漏的资源");
    MemoryGuard::global().cleanup_leaked_resources().await;
    Ok(())
}

/// 强制垃圾收集
#[tauri::command]
pub async fn force_garbage_collection() -> CmdResult<()> {
    log::info!(target: "app", "强制执行垃圾收集");
    MemoryGuard::global().force_garbage_collection().await;
    Ok(())
}

/// 获取资源追踪信息
#[tauri::command]
pub async fn get_tracked_resources_info() -> CmdResult<Vec<(String, String, u64, u64)>> {
    log::debug!(target: "app", "获取资源追踪信息");
    
    let resources = MemoryGuard::global().get_tracked_resources_info();
    let result: Vec<(String, String, u64, u64)> = resources
        .into_iter()
        .map(|(id, resource_type, duration, size)| {
            (id, resource_type, duration.as_secs(), size)
        })
        .collect();
    
    log::debug!(target: "app", "当前追踪 {} 个资源", result.len());
    Ok(result)
}

/// 初始化内存防护系统
#[tauri::command]
pub async fn initialize_memory_protection() -> CmdResult<()> {
    log::info!(target: "app", "初始化内存防护系统");
    
    // 启用内存监控
    MemoryGuard::global().enable_monitoring();
    
    // 设置默认内存阈值 (200MB)
    MemoryGuard::global().set_memory_threshold(200);
    
    // 启动自动清理任务
    MemoryGuard::global().start_auto_cleanup();
    
    // 执行初始内存检查
    let _ = MemoryGuard::global().check_memory_usage().await;
    
    log::info!(target: "app", "内存防护系统初始化完成");
    Ok(())
}
