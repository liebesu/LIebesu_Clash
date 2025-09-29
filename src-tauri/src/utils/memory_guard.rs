use std::sync::{Arc, Weak};
use std::time::{Duration, Instant};
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use tokio::sync::RwLock;
use dashmap::DashMap;
use once_cell::sync::Lazy;
use crate::{logging, utils::logging::Type};

/// 内存泄漏防护和监控系统
/// 
/// 该模块提供以下功能：
/// 1. 自动检测内存泄漏
/// 2. 定期清理无用资源
/// 3. 监控长期运行的任务
/// 4. 强制垃圾收集

/// 全局内存守护实例
static MEMORY_GUARD: Lazy<MemoryGuard> = Lazy::new(|| {
    MemoryGuard::new()
});

/// 内存使用统计
#[derive(Debug, Clone)]
pub struct MemoryStats {
    pub peak_memory: u64,
    pub current_memory: u64,
    pub gc_count: u64,
    pub cleanup_count: u64,
    pub leak_warnings: u64,
    pub last_check_time: Instant,
}

/// 资源追踪器
#[derive(Debug)]
struct ResourceTracker {
    id: String,
    resource_type: String,
    created_at: Instant,
    last_accessed: AtomicU64,
    size_bytes: u64,
    weak_ref: Option<Weak<dyn std::any::Any + Send + Sync>>,
}

/// 内存守护主结构
pub struct MemoryGuard {
    /// 内存使用统计
    stats: Arc<RwLock<MemoryStats>>,
    
    /// 资源追踪映射表
    tracked_resources: DashMap<String, ResourceTracker>,
    
    /// 是否启用内存监控
    monitoring_enabled: AtomicBool,
    
    /// 上次清理时间
    last_cleanup: Arc<RwLock<Instant>>,
    
    /// 内存阈值（字节）
    memory_threshold: AtomicU64,
    
    /// 清理间隔（秒）
    cleanup_interval: Duration,
}

impl MemoryGuard {
    /// 获取全局单例实例
    pub fn instance() -> &'static MemoryGuard {
        static INSTANCE: once_cell::sync::Lazy<MemoryGuard> = once_cell::sync::Lazy::new(|| {
            MemoryGuard::new()
        });
        &*INSTANCE
    }

    /// 创建新的内存守护实例
    fn new() -> Self {
        Self {
            stats: Arc::new(RwLock::new(MemoryStats {
                peak_memory: 0,
                current_memory: 0,
                gc_count: 0,
                cleanup_count: 0,
                leak_warnings: 0,
                last_check_time: Instant::now(),
            })),
            tracked_resources: DashMap::new(),
            monitoring_enabled: AtomicBool::new(true),
            last_cleanup: Arc::new(RwLock::new(Instant::now())),
            memory_threshold: AtomicU64::new(100 * 1024 * 1024), // 100MB
            cleanup_interval: Duration::from_secs(300), // 5分钟
        }
    }

    /// 获取全局实例
    pub fn global() -> &'static MemoryGuard {
        &MEMORY_GUARD
    }

    /// 启用内存监控
    pub fn enable_monitoring(&self) {
        self.monitoring_enabled.store(true, Ordering::Relaxed);
        logging!(info, Type::System, "内存监控已启用");
    }

    /// 禁用内存监控
    pub fn disable_monitoring(&self) {
        self.monitoring_enabled.store(false, Ordering::Relaxed);
        logging!(info, Type::System, "内存监控已禁用");
    }

    /// 设置内存阈值
    pub fn set_memory_threshold(&self, threshold_mb: u64) {
        let threshold_bytes = threshold_mb * 1024 * 1024;
        self.memory_threshold.store(threshold_bytes, Ordering::Relaxed);
        logging!(info, Type::System, "内存阈值已设置为 {}MB", threshold_mb);
    }

    /// 注册需要追踪的资源
    pub fn track_resource<T: Send + Sync + 'static>(
        &self,
        id: String,
        resource_type: String,
        resource: &Arc<T>,
        size_bytes: u64,
    ) {
        if !self.monitoring_enabled.load(Ordering::Relaxed) {
            return;
        }

        let tracker = ResourceTracker {
            id: id.clone(),
            resource_type: resource_type.clone(),
            created_at: Instant::now(),
            last_accessed: AtomicU64::new(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
            ),
            size_bytes,
            weak_ref: Some(Arc::downgrade(resource) as Weak<dyn std::any::Any + Send + Sync>),
        };

        self.tracked_resources.insert(id.clone(), tracker);
        logging!(debug, Type::System, "资源已注册追踪: {} (类型: {}, 大小: {}字节)", 
                 id, resource_type, size_bytes);
    }

    /// 取消资源追踪
    pub fn untrack_resource(&self, id: &str) {
        if let Some((_, tracker)) = self.tracked_resources.remove(id) {
            logging!(debug, Type::System, "资源已取消追踪: {} (类型: {})", 
                     id, tracker.resource_type);
        }
    }

    /// 更新资源访问时间
    pub fn touch_resource(&self, id: &str) {
        if let Some(tracker) = self.tracked_resources.get(id) {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            tracker.last_accessed.store(now, Ordering::Relaxed);
        }
    }

    /// 检查内存使用情况
    pub async fn check_memory_usage(&self) -> Option<crate::utils::platform_compat::MemoryUsage> {
        if !self.monitoring_enabled.load(Ordering::Relaxed) {
            return None;
        }

        match crate::utils::platform_compat::MemoryManager::check_memory_usage() {
            Ok(usage) => {
                // 更新统计信息
                let mut stats = self.stats.write().await;
                stats.current_memory = usage.rss;
                if usage.rss > stats.peak_memory {
                    stats.peak_memory = usage.rss;
                }
                stats.last_check_time = Instant::now();

                // 检查是否超过阈值
                let threshold = self.memory_threshold.load(Ordering::Relaxed);
                if usage.rss > threshold {
                    stats.leak_warnings += 1;
                    logging!(warn, Type::System, "内存使用超过阈值: {}MB > {}MB", 
                             usage.rss / 1024 / 1024, threshold / 1024 / 1024);
                    
                    // 触发清理
                    self.cleanup_leaked_resources().await;
                }

                Some(usage)
            }
            Err(e) => {
                logging!(error, Type::System, "获取内存使用情况失败: {}", e);
                None
            }
        }
    }

    /// 清理泄漏的资源
    pub async fn cleanup_leaked_resources(&self) {
        if !self.monitoring_enabled.load(Ordering::Relaxed) {
            return;
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut cleanup_count = 0;
        let mut to_remove = Vec::new();

        // 检查所有追踪的资源
        for entry in self.tracked_resources.iter() {
            let (id, tracker) = (entry.key(), entry.value());
            
            // 检查资源是否已被释放
            if let Some(ref weak_ref) = tracker.weak_ref {
                if weak_ref.strong_count() == 0 {
                    to_remove.push(id.clone());
                    cleanup_count += 1;
                    continue;
                }
            }

            // 检查资源是否长时间未访问（超过30分钟）
            let last_accessed = tracker.last_accessed.load(Ordering::Relaxed);
            if now.saturating_sub(last_accessed) > 1800 { // 30分钟
                logging!(warn, Type::System, "检测到长时间未访问的资源: {} (类型: {}, 创建时间: {:?})", 
                         id, tracker.resource_type, tracker.created_at.elapsed());
                to_remove.push(id.clone());
                cleanup_count += 1;
            }
        }

        // 移除清理的资源
        for id in to_remove {
            self.tracked_resources.remove(&id);
        }

        if cleanup_count > 0 {
            logging!(info, Type::System, "已清理 {} 个泄漏或过期的资源", cleanup_count);
            
            // 更新统计
            let mut stats = self.stats.write().await;
            stats.cleanup_count += cleanup_count;
        }

        // 更新最后清理时间
        *self.last_cleanup.write().await = Instant::now();
    }

    /// 强制垃圾收集
    pub async fn force_garbage_collection(&self) {
        logging!(info, Type::System, "开始强制垃圾收集");

        // 清理泄漏资源
        self.cleanup_leaked_resources().await;

        // 执行平台特定的内存清理
        crate::utils::platform_compat::MemoryManager::cleanup_platform_specific().await;

        // 更新统计
        let mut stats = self.stats.write().await;
        stats.gc_count += 1;

        logging!(info, Type::System, "强制垃圾收集完成");
    }

    /// 获取内存统计信息
    pub async fn get_memory_stats(&self) -> MemoryStats {
        self.stats.read().await.clone()
    }

    /// 获取资源追踪信息
    pub fn get_tracked_resources_info(&self) -> Vec<(String, String, Duration, u64)> {
        self.tracked_resources
            .iter()
            .map(|entry| {
                let (id, tracker) = (entry.key(), entry.value());
                (
                    id.clone(),
                    tracker.resource_type.clone(),
                    tracker.created_at.elapsed(),
                    tracker.size_bytes,
                )
            })
            .collect()
    }

    /// 启动自动清理任务
    pub fn start_auto_cleanup(&self) {
        if !self.monitoring_enabled.load(Ordering::Relaxed) {
            return;
        }

        // 使用单例模式避免生命周期问题
        tokio::spawn(async {
            let mut interval = tokio::time::interval(Duration::from_secs(300)); // 5分钟间隔
            
            loop {
                interval.tick().await;
                
                let guard = MemoryGuard::instance();
                
                if !guard.monitoring_enabled.load(Ordering::Relaxed) {
                    break;
                }
                
                // 检查内存使用
                if guard.check_memory_usage().await.is_none() {
                    logging!(warn, Type::System, "自动内存检查失败: 无法获取内存信息");
                }
                
                // 检查是否需要清理
                let last_cleanup = *guard.last_cleanup.read().await;
                if last_cleanup.elapsed() >= guard.cleanup_interval {
                    guard.cleanup_leaked_resources().await;
                }
            }
        });

        logging!(info, Type::System, "自动内存清理任务已启动");
    }

    /// 检查内存健康状况
    pub async fn check_memory_health(&self) -> MemoryHealthStatus {
        let stats = self.get_memory_stats().await;
        let threshold = self.memory_threshold.load(Ordering::Relaxed);
        
        let health_score = if stats.current_memory == 0 {
            100
        } else {
            let usage_ratio = stats.current_memory as f64 / threshold as f64;
            if usage_ratio < 0.5 {
                100
            } else if usage_ratio < 0.8 {
                80
            } else if usage_ratio < 0.9 {
                60
            } else {
                30
            }
        };

        MemoryHealthStatus {
            health_score,
            current_memory_mb: stats.current_memory / 1024 / 1024,
            peak_memory_mb: stats.peak_memory / 1024 / 1024,
            threshold_mb: threshold / 1024 / 1024,
            tracked_resources_count: self.tracked_resources.len(),
            gc_count: stats.gc_count,
            cleanup_count: stats.cleanup_count,
            leak_warnings: stats.leak_warnings,
            is_healthy: health_score > 70,
        }
    }
}

/// 内存健康状况
#[derive(Debug, Clone, serde::Serialize)]
pub struct MemoryHealthStatus {
    pub health_score: u32,           // 健康评分 0-100
    pub current_memory_mb: u64,      // 当前内存使用 MB
    pub peak_memory_mb: u64,         // 峰值内存使用 MB
    pub threshold_mb: u64,           // 内存阈值 MB
    pub tracked_resources_count: usize, // 追踪的资源数量
    pub gc_count: u64,               // 垃圾收集次数
    pub cleanup_count: u64,          // 清理次数
    pub leak_warnings: u64,          // 内存泄漏警告次数
    pub is_healthy: bool,            // 是否健康
}

/// 资源生命周期管理辅助宏
#[macro_export]
macro_rules! track_resource {
    ($resource:expr, $id:expr, $type:expr, $size:expr) => {
        crate::utils::memory_guard::MemoryGuard::global()
            .track_resource($id.to_string(), $type.to_string(), $resource, $size);
    };
}

#[macro_export]
macro_rules! untrack_resource {
    ($id:expr) => {
        crate::utils::memory_guard::MemoryGuard::global().untrack_resource($id);
    };
}

#[macro_export]
macro_rules! touch_resource {
    ($id:expr) => {
        crate::utils::memory_guard::MemoryGuard::global().touch_resource($id);
    };
}
