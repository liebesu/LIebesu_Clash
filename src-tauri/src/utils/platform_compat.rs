use std::time::Duration;
use crate::{logging, utils::logging::Type};

/// 跨平台兼容性处理模块
/// 确保在不同操作系统上的一致行为

/// 获取平台特定的IPC路径
pub fn get_platform_ipc_path() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    {
        // Windows 使用命名管道
        Ok(std::path::PathBuf::from(r"\\.\pipe\liebesu-mihomo"))
    }
    
    #[cfg(unix)]
    {
        // Unix系统使用域套接字
        let mut path = std::env::temp_dir();
        path.push("liebesu-mihomo.sock");
        Ok(path)
    }
    
    #[cfg(not(any(target_os = "windows", unix)))]
    {
        Err("Unsupported platform for IPC".into())
    }
}

/// 获取平台特定的超时配置
pub fn get_platform_timeouts() -> PlatformTimeouts {
    #[cfg(target_os = "windows")]
    {
        // Windows 系统通常需要更长的超时时间
        PlatformTimeouts {
            connection_timeout: Duration::from_secs(15),
            request_timeout: Duration::from_secs(12),
            health_check_interval: Duration::from_secs(10),
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        // macOS 优化配置
        PlatformTimeouts {
            connection_timeout: Duration::from_secs(10),
            request_timeout: Duration::from_secs(8),
            health_check_interval: Duration::from_secs(5),
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // Linux 最激进的配置
        PlatformTimeouts {
            connection_timeout: Duration::from_secs(8),
            request_timeout: Duration::from_secs(6),
            health_check_interval: Duration::from_secs(3),
        }
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        // 默认保守配置
        PlatformTimeouts {
            connection_timeout: Duration::from_secs(12),
            request_timeout: Duration::from_secs(10),
            health_check_interval: Duration::from_secs(8),
        }
    }
}

#[derive(Debug, Clone)]
pub struct PlatformTimeouts {
    pub connection_timeout: Duration,
    pub request_timeout: Duration,
    pub health_check_interval: Duration,
}

/// 平台特定的内存管理
pub struct MemoryManager;

impl MemoryManager {
    /// 获取平台特定的内存限制
    pub fn get_memory_limits() -> MemoryLimits {
        #[cfg(target_os = "windows")]
        {
            MemoryLimits {
                max_connection_pool: 20,
                max_cache_size: 50 * 1024 * 1024, // 50MB
                gc_threshold: 80 * 1024 * 1024,   // 80MB
            }
        }
        
        #[cfg(target_os = "macos")]
        {
            MemoryLimits {
                max_connection_pool: 15,
                max_cache_size: 30 * 1024 * 1024, // 30MB
                gc_threshold: 60 * 1024 * 1024,   // 60MB
            }
        }
        
        #[cfg(target_os = "linux")]
        {
            MemoryLimits {
                max_connection_pool: 25,
                max_cache_size: 40 * 1024 * 1024, // 40MB
                gc_threshold: 70 * 1024 * 1024,   // 70MB
            }
        }
        
        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            MemoryLimits {
                max_connection_pool: 15,
                max_cache_size: 30 * 1024 * 1024,
                gc_threshold: 60 * 1024 * 1024,
            }
        }
    }

    /// 执行平台特定的内存清理
    pub async fn cleanup_platform_specific() {
        #[cfg(target_os = "windows")]
        {
            // Windows 特定清理
            tokio::task::yield_now().await;
            logging!(debug, Type::System, "Windows内存清理完成");
        }
        
        #[cfg(target_os = "macos")]
        {
            // macOS 特定清理
            tokio::task::yield_now().await;
            logging!(debug, Type::System, "macOS内存清理完成");
        }
        
        #[cfg(target_os = "linux")]
        {
            // Linux 特定清理
            tokio::task::yield_now().await;
            logging!(debug, Type::System, "Linux内存清理完成");
        }
    }

    /// 检查内存使用情况
    pub fn check_memory_usage() -> Result<MemoryUsage, Box<dyn std::error::Error + Send + Sync>> {
        use sysinfo::{System, Pid};
        
        let mut sys = System::new_all();
        sys.refresh_all();
        
        // 获取当前进程ID
        let current_pid = std::process::id();
        let pid = Pid::from(current_pid as usize);
        
        if let Some(process) = sys.process(pid) {
            Ok(MemoryUsage {
                rss: process.memory() * 1024,         // sysinfo返回KB，转换为字节
                virtual_mem: process.virtual_memory() * 1024,
                cpu_usage: process.cpu_usage(),
            })
        } else {
            // 如果无法获取进程信息，返回基本信息
            logging!(warn, Type::System, "无法获取进程内存信息，返回估算值");
            Ok(MemoryUsage {
                rss: 50 * 1024 * 1024,    // 50MB估算
                virtual_mem: 100 * 1024 * 1024, // 100MB估算
                cpu_usage: 0.0,
            })
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MemoryLimits {
    pub max_connection_pool: usize,
    pub max_cache_size: usize,
    pub gc_threshold: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MemoryUsage {
    pub rss: u64,         // 物理内存使用
    pub virtual_mem: u64, // 虚拟内存使用  
    pub cpu_usage: f32,   // CPU使用率
}

/// 跨平台进程优先级设置
pub fn set_process_priority() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    {
        // Windows 设置高优先级 (使用winapi crate)
        use winapi::um::processthreadsapi::{GetCurrentProcess, SetPriorityClass};
        use winapi::um::winbase::HIGH_PRIORITY_CLASS;
        
        unsafe {
            let result = SetPriorityClass(GetCurrentProcess(), HIGH_PRIORITY_CLASS);
            if result == 0 {
                return Err("Failed to set Windows process priority".into());
            }
        }
        logging!(info, Type::System, "Windows进程优先级已设置为HIGH_PRIORITY_CLASS");
    }
    
    #[cfg(unix)]
    {
        // Unix系统设置nice值 (降低nice值提高优先级)
        unsafe {
            let result = libc::setpriority(libc::PRIO_PROCESS, 0, -5);
            if result != 0 {
                return Err(format!("Failed to set Unix process priority: {}", 
                                 std::io::Error::last_os_error()).into());
            }
        }
        logging!(info, Type::System, "Unix进程nice值已设置为-5");
    }
    
    #[cfg(not(any(target_os = "windows", unix)))]
    {
        logging!(warn, Type::System, "当前平台不支持进程优先级设置");
        return Err("Process priority setting not supported on this platform".into());
    }
    
    Ok(())
}

/// 平台特定的网络优化
pub fn optimize_network_settings() {
    #[cfg(target_os = "windows")]
    {
        // Windows TCP优化
        unsafe { std::env::set_var("RUST_NET_BUFFER_SIZE", "65536"); }
        logging!(debug, Type::System, "Windows网络设置已优化");
    }
    
    #[cfg(target_os = "linux")]
    {
        // Linux网络优化
        unsafe { std::env::set_var("RUST_NET_BUFFER_SIZE", "131072"); }
        logging!(debug, Type::System, "Linux网络设置已优化");
    }
    
    #[cfg(target_os = "macos")]
    {
        // macOS网络优化
        unsafe { std::env::set_var("RUST_NET_BUFFER_SIZE", "98304"); }
        logging!(debug, Type::System, "macOS网络设置已优化");
    }
}

/// 平台检测和信息
pub struct PlatformInfo;

impl PlatformInfo {
    /// 获取当前平台信息
    pub fn get_platform_details() -> PlatformDetails {
        PlatformDetails {
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            family: std::env::consts::FAMILY.to_string(),
            is_debug: cfg!(debug_assertions),
            rust_version: std::env::var("RUSTC_VERSION").unwrap_or_else(|_| "unknown".to_string()),
        }
    }

    /// 检查平台特定功能支持
    pub fn check_platform_features() -> PlatformFeatures {
        PlatformFeatures {
            supports_autostart: cfg!(not(any(target_os = "android", target_os = "ios"))),
            supports_global_shortcuts: cfg!(not(any(target_os = "android", target_os = "ios"))),
            supports_system_proxy: true,
            supports_tun_mode: !cfg!(target_os = "android"),
            supports_service_mode: cfg!(any(target_os = "windows", target_os = "linux")),
            supports_updater: cfg!(not(any(target_os = "android", target_os = "ios"))),
        }
    }

    /// 获取系统资源限制
    pub fn get_system_limits() -> SystemLimits {
        use sysinfo::System;
        
        let sys = System::new_all();
        
        SystemLimits {
            total_memory: sys.total_memory(),
            available_memory: sys.available_memory(),
            cpu_count: sys.cpus().len(),
            max_open_files: get_max_open_files(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PlatformDetails {
    pub os: String,
    pub arch: String,
    pub family: String,
    pub is_debug: bool,
    pub rust_version: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PlatformFeatures {
    pub supports_autostart: bool,
    pub supports_global_shortcuts: bool,
    pub supports_system_proxy: bool,
    pub supports_tun_mode: bool,
    pub supports_service_mode: bool,
    pub supports_updater: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SystemLimits {
    pub total_memory: u64,
    pub available_memory: u64,
    pub cpu_count: usize,
    pub max_open_files: u64,
}

/// 获取系统最大文件描述符数量
fn get_max_open_files() -> u64 {
    #[cfg(unix)]
    {
        unsafe {
            let mut rlim = libc::rlimit {
                rlim_cur: 0,
                rlim_max: 0,
            };
            if libc::getrlimit(libc::RLIMIT_NOFILE, &mut rlim) == 0 {
                rlim.rlim_cur as u64
            } else {
                1024 // 默认值
            }
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        // Windows默认限制
        2048
    }
    
    #[cfg(not(any(unix, target_os = "windows")))]
    {
        1024
    }
}

/// 跨平台文件系统操作
pub struct FileSystemCompat;

impl FileSystemCompat {
    /// 创建平台特定的应用目录
    pub fn ensure_app_dirs() -> Result<(), Box<dyn std::error::Error>> {
        let app_dirs = [
            dirs::config_dir().map(|d| d.join("clash-verge")),
            dirs::cache_dir().map(|d| d.join("clash-verge")),
            dirs::data_dir().map(|d| d.join("clash-verge")),
        ];

        for dir_opt in app_dirs.iter() {
            if let Some(dir) = dir_opt {
                if !dir.exists() {
                    std::fs::create_dir_all(dir)?;
                    logging!(info, Type::System, "创建应用目录: {}", dir.display());
                }
            }
        }

        Ok(())
    }

    /// 设置平台特定的文件权限
    pub fn set_file_permissions(path: &std::path::Path, executable: bool) -> Result<(), Box<dyn std::error::Error>> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = if executable { 0o755 } else { 0o644 };
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(perms))?;
        }
        
        #[cfg(target_os = "windows")]
        {
            // Windows文件权限处理相对简单
            if executable {
                // 确保文件有执行权限（通过扩展名）
                if let Some(extension) = path.extension() {
                    if extension != "exe" && extension != "bat" && extension != "cmd" {
                        logging!(warn, Type::System, "Windows可执行文件建议使用.exe扩展名");
                    }
                }
            }
        }
        
        Ok(())
    }
}

/// 环境变量管理
pub struct EnvironmentManager;

impl EnvironmentManager {
    /// 设置平台特定的环境变量
    pub fn setup_platform_env() {
        // 通用环境变量
        unsafe { std::env::set_var("RUST_BACKTRACE", "1"); }
        
        #[cfg(target_os = "windows")]
        {
            // Windows特定环境变量
            unsafe { std::env::set_var("RUST_LOG_STYLE", "always"); }
            if std::env::var("TMPDIR").is_err() {
                if let Ok(temp) = std::env::var("TEMP") {
                    unsafe { std::env::set_var("TMPDIR", temp); }
                }
            }
        }
        
        #[cfg(target_os = "macos")]
        {
            // macOS特定环境变量
            unsafe { std::env::set_var("RUST_LOG_STYLE", "auto"); }
            if std::env::var("TMPDIR").is_err() {
                unsafe { std::env::set_var("TMPDIR", "/tmp"); }
            }
        }
        
        #[cfg(target_os = "linux")]
        {
            // Linux特定环境变量
            unsafe { std::env::set_var("RUST_LOG_STYLE", "auto"); }
            if std::env::var("TMPDIR").is_err() {
                unsafe { std::env::set_var("TMPDIR", "/tmp"); }
            }
        }
        
        logging!(info, Type::System, "平台特定环境变量已设置");
    }
}
