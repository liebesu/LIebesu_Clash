use std::time::{Duration, Instant};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use kode_bridge::{
    ClientConfig, IpcHttpClient, LegacyResponse,
    errors::{AnyError, AnyResult},
};
use percent_encoding::{AsciiSet, CONTROLS, utf8_percent_encode};
use tokio::sync::RwLock;

use crate::{
    logging, singleton_with_logging,
    utils::{dirs::ipc_path, logging::Type},
};
use crate::core::CoreManager;
use tokio::time::sleep;

// 定义用于URL路径的编码集合，只编码真正必要的字符
const URL_PATH_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ') // 空格
    .add(b'/') // 斜杠
    .add(b'?') // 问号
    .add(b'#') // 井号
    .add(b'&') // 和号
    .add(b'%'); // 百分号

// Helper function to create AnyError from string
fn create_error(msg: impl Into<String>) -> AnyError {
    Box::new(std::io::Error::other(msg.into()))
}

// 连接健康状况统计
#[derive(Debug, Default)]
struct ConnectionStats {
    total_requests: AtomicU64,
    failed_requests: AtomicU64,
    last_success_time: RwLock<Option<Instant>>,
    last_failure_time: RwLock<Option<Instant>>,
    consecutive_failures: AtomicU64,
}

impl ConnectionStats {
    async fn record_success(&self) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.consecutive_failures.store(0, Ordering::Relaxed);
        *self.last_success_time.write().await = Some(Instant::now());
    }

    async fn record_failure(&self) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.failed_requests.fetch_add(1, Ordering::Relaxed);
        self.consecutive_failures.fetch_add(1, Ordering::Relaxed);
        *self.last_failure_time.write().await = Some(Instant::now());
    }

    fn get_failure_rate(&self) -> f64 {
        let total = self.total_requests.load(Ordering::Relaxed) as f64;
        let failed = self.failed_requests.load(Ordering::Relaxed) as f64;
        if total > 0.0 { failed / total } else { 0.0 }
    }

    fn get_consecutive_failures(&self) -> u64 {
        self.consecutive_failures.load(Ordering::Relaxed)
    }

    async fn is_healthy(&self) -> bool {
        // 健康判断条件：
        // 1. 连续失败次数 < 5
        // 2. 失败率 < 50%
        // 3. 如果有成功记录，最近3分钟内有成功
        let consecutive = self.get_consecutive_failures();
        let failure_rate = self.get_failure_rate();
        
        if consecutive >= 5 || failure_rate > 0.5 {
            return false;
        }

        if let Some(last_success) = *self.last_success_time.read().await {
            last_success.elapsed() < Duration::from_secs(180)
        } else {
            // 如果从未成功过，但失败次数少，还是认为可能健康
            consecutive < 3
        }
    }
}

pub struct IpcManager {
    client: IpcHttpClient,
    stats: Arc<ConnectionStats>,
}

impl IpcManager {
    fn new() -> Self {
        let ipc_path_buf = ipc_path().unwrap_or_else(|e| {
            logging!(error, Type::Ipc, true, "Failed to get IPC path: {}", e);
            std::path::PathBuf::from("/tmp/clash-verge-ipc") // fallback path
        });
        let ipc_path = ipc_path_buf.to_str().unwrap_or_default();
        // 优化的稳定性配置，提高响应速度和错误恢复能力
        let config = ClientConfig {
            default_timeout: Duration::from_secs(10),  // 减少超时时间，提高响应性
            enable_pooling: true,
            max_retries: 2,  // 增加重试次数
            retry_delay: Duration::from_millis(200),  // 减少重试延迟
            max_concurrent_requests: 12,  // 减少并发数，避免资源竞争
            max_requests_per_second: Some(24.0),  // 降低请求频率，减轻核心压力
            ..Default::default()
        };
        #[allow(clippy::unwrap_used)]
        let client = IpcHttpClient::with_config(ipc_path, config).unwrap();
        Self { 
            client,
            stats: Arc::new(ConnectionStats::default()),
        }
    }
}

// Use singleton macro with logging
singleton_with_logging!(IpcManager, INSTANCE, "IpcManager");

// ===== 核心通信熔断与看门狗 =====
static CORE_DOWN: AtomicBool = AtomicBool::new(false);
static RESTART_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

fn is_core_comm_error(err: &AnyError) -> bool {
    let msg = err.to_string().to_lowercase();
    msg.contains("connection refused")
        || msg.contains("broken pipe") 
        || msg.contains("pool exhausted")
        || msg.contains("failed to get fresh connection")
        || msg.contains("connection reset")
        || msg.contains("timeout")
        || msg.contains("no route to host")
        || msg.contains("network unreachable")
}

fn is_critical_error(err: &AnyError) -> bool {
    let msg = err.to_string().to_lowercase();
    msg.contains("connection refused")
        || msg.contains("no route to host") 
        || msg.contains("network unreachable")
}

fn is_temporary_error(err: &AnyError) -> bool {
    let msg = err.to_string().to_lowercase();
    msg.contains("timeout")
        || msg.contains("broken pipe")
        || msg.contains("connection reset")
        || msg.contains("pool exhausted")
}

fn mark_core_down_and_spawn_watchdog() {
    let was_down = CORE_DOWN.swap(true, Ordering::SeqCst);
    if !was_down {
        logging!(warn, Type::Ipc, "核心通信异常，进入熔断模式并启动看门狗");
    }
    if RESTART_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        tokio::spawn(async move {
            let backoff = [1u64, 3, 10, 20];
            for delay in backoff {
                logging!(warn, Type::Ipc, "尝试重启核心 (延迟 {delay}s 后)");
                sleep(Duration::from_secs(delay)).await;
                if let Err(e) = CoreManager::global().restart_core().await {
                    logging!(error, Type::Ipc, "重启核心失败: {e}");
                }

                // 探活 /version，给 2 秒超时
                match tokio::time::timeout(
                    Duration::from_secs(2),
                    IpcManager::global().get_version(),
                )
                .await
                {
                    Ok(Ok(_)) => {
                        CORE_DOWN.store(false, Ordering::SeqCst);
                        RESTART_IN_PROGRESS.store(false, Ordering::SeqCst);
                        logging!(info, Type::Ipc, "核心通信恢复，解除熔断");
                        return;
                    }
                    _ => {
                        logging!(warn, Type::Ipc, "核心尚未就绪，继续退避");
                    }
                }
            }
            RESTART_IN_PROGRESS.store(false, Ordering::SeqCst);
            logging!(error, Type::Ipc, "多次重启后仍未恢复，将维持熔断");
        });
    }
}

impl IpcManager {
    pub async fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> AnyResult<LegacyResponse> {
        // 保持底层 request 仅做透传，返回 LegacyResponse
        self.client.request(method, path, body).await
    }
}

impl IpcManager {
    pub async fn send_request(
        &self,
        method: &str,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> AnyResult<serde_json::Value> {
        // 智能熔断逻辑：考虑连接健康状况和错误类型
        if CORE_DOWN.load(Ordering::SeqCst) {
            if method != "GET" {
                return Err(create_error("core-down: ipc temporarily unavailable"));
            }
            // 对于 GET 请求，检查连接健康状况
            if !self.stats.is_healthy().await {
                return Err(create_error("core-down: connection unhealthy"));
            }
        }

        let start_time = Instant::now();
        let response = match IpcManager::global().request(method, path, body).await {
            Ok(resp) => {
                // 记录成功
                self.stats.record_success().await;
                
                // 如果核心之前是down状态，现在成功了，恢复正常
                if CORE_DOWN.load(Ordering::SeqCst) {
                    CORE_DOWN.store(false, Ordering::SeqCst);
                    logging!(info, Type::Ipc, "核心通信恢复正常，解除熔断状态");
                }
                
                resp
            },
            Err(e) => {
                // 记录失败
                self.stats.record_failure().await;
                
                let elapsed = start_time.elapsed();
                logging!(warn, Type::Ipc, "IPC请求失败 [{}] {} (耗时: {:?}): {}", 
                         method, path, elapsed, e);

                // 根据错误类型决定处理策略
                if is_core_comm_error(&e) {
                    if is_critical_error(&e) {
                        // 严重错误立即触发熔断
                        mark_core_down_and_spawn_watchdog();
                    } else if is_temporary_error(&e) && self.stats.get_consecutive_failures() >= 3 {
                        // 临时错误连续出现多次也触发熔断
                        mark_core_down_and_spawn_watchdog();
                    }
                }
                return Err(e);
            }
        };
        
        match method {
            "GET" => Ok(response.json()?),
            "PATCH" => {
                if response.status == 204 {
                    Ok(serde_json::json!({"code": 204}))
                } else {
                    Ok(response.json()?)
                }
            }
            "PUT" | "DELETE" => {
                if response.status == 204 {
                    Ok(serde_json::json!({"code": 204}))
                } else {
                    match response.json() {
                        Ok(json) => Ok(json),
                        Err(_) => Ok(serde_json::json!({
                            "code": response.status,
                            "message": response.body,
                            "error": "failed to parse response as JSON"
                        })),
                    }
                }
            }
            _ => match response.json() {
                Ok(json) => Ok(json),
                Err(_) => Ok(serde_json::json!({
                    "code": response.status,
                    "message": response.body,
                    "error": "failed to parse response as JSON"
                })),
            },
        }
    }

    // 基础代理信息获取
    pub async fn get_proxies(&self) -> AnyResult<serde_json::Value> {
        let url = "/proxies";
        self.send_request("GET", url, None).await
    }

    // 代理提供者信息获取
    pub async fn get_providers_proxies(&self) -> AnyResult<serde_json::Value> {
        let url = "/providers/proxies";
        self.send_request("GET", url, None).await
    }

    // 连接管理
    pub async fn get_connections(&self) -> AnyResult<serde_json::Value> {
        let url = "/connections";
        self.send_request("GET", url, None).await
    }

    pub async fn delete_connection(&self, id: &str) -> AnyResult<()> {
        let encoded_id = utf8_percent_encode(id, URL_PATH_ENCODE_SET).to_string();
        let url = format!("/connections/{encoded_id}");
        let response = self.send_request("DELETE", &url, None).await?;
        if response["code"] == 204 {
            Ok(())
        } else {
            Err(create_error(
                response["message"].as_str().unwrap_or("unknown error"),
            ))
        }
    }

    pub async fn close_all_connections(&self) -> AnyResult<()> {
        let url = "/connections";
        let response = self.send_request("DELETE", url, None).await?;
        if response["code"] == 204 {
            Ok(())
        } else {
            Err(create_error(
                response["message"]
                    .as_str()
                    .unwrap_or("unknown error")
                    .to_owned(),
            ))
        }
    }
}

impl IpcManager {
    #[allow(dead_code)]
    pub async fn is_mihomo_running(&self) -> AnyResult<()> {
        let url = "/version";
        let _response = self.send_request("GET", url, None).await?;
        Ok(())
    }

    pub async fn put_configs_force(&self, clash_config_path: &str) -> AnyResult<()> {
        let url = "/configs?force=true";
        let payload = serde_json::json!({
            "path": clash_config_path,
        });
        let _response = self.send_request("PUT", url, Some(&payload)).await?;
        Ok(())
    }

    // 连接健康检查和统计信息
    pub async fn get_connection_stats(&self) -> (f64, u64, bool) {
        let failure_rate = self.stats.get_failure_rate();
        let consecutive_failures = self.stats.get_consecutive_failures();
        let is_healthy = self.stats.is_healthy().await;
        (failure_rate, consecutive_failures, is_healthy)
    }

    // 强制重置连接统计（用于手动恢复）
    pub async fn reset_connection_stats(&self) {
        self.stats.consecutive_failures.store(0, Ordering::Relaxed);
        *self.stats.last_success_time.write().await = Some(Instant::now());
        CORE_DOWN.store(false, Ordering::SeqCst);
        logging!(info, Type::Ipc, "连接统计已重置，强制解除熔断状态");
    }

    // 定期清理过期的统计数据（防止内存泄漏）
    pub async fn cleanup_stats(&self) {
        let total = self.stats.total_requests.load(Ordering::Relaxed);
        // 如果请求总数过多，重置计数器但保留比率
        if total > 100000 {
            let failure_rate = self.stats.get_failure_rate();
            let new_total = 1000u64;
            let new_failed = (new_total as f64 * failure_rate) as u64;
            
            self.stats.total_requests.store(new_total, Ordering::Relaxed);
            self.stats.failed_requests.store(new_failed, Ordering::Relaxed);
            
            logging!(info, Type::Ipc, "IPC统计数据已清理，保持失败率: {:.2}%", failure_rate * 100.0);
        }
    }

    // 主动健康检查
    pub async fn health_check(&self) -> AnyResult<bool> {
        match self.send_request("GET", "/version", None).await {
            Ok(_) => {
                logging!(debug, Type::Ipc, "健康检查通过");
                Ok(true)
            },
            Err(e) => {
                logging!(warn, Type::Ipc, "健康检查失败: {}", e);
                Ok(false)
            }
        }
    }

    pub async fn patch_configs(&self, config: serde_json::Value) -> AnyResult<()> {
        let url = "/configs";
        let response = self.send_request("PATCH", url, Some(&config)).await?;
        if response["code"] == 204 {
            Ok(())
        } else {
            Err(create_error(
                response["message"]
                    .as_str()
                    .unwrap_or("unknown error")
                    .to_owned(),
            ))
        }
    }

    pub async fn test_proxy_delay(
        &self,
        name: &str,
        test_url: Option<String>,
        timeout: i32,
    ) -> AnyResult<serde_json::Value> {
        let test_url =
            test_url.unwrap_or_else(|| "https://cp.cloudflare.com/generate_204".to_string());

        let encoded_name = utf8_percent_encode(name, URL_PATH_ENCODE_SET).to_string();
        // 测速URL不再编码，直接传递
        let url = format!("/proxies/{encoded_name}/delay?url={test_url}&timeout={timeout}");

        self.send_request("GET", &url, None).await
    }

    // 版本和配置相关
    pub async fn get_version(&self) -> AnyResult<serde_json::Value> {
        let url = "/version";
        self.send_request("GET", url, None).await
    }

    pub async fn get_config(&self) -> AnyResult<serde_json::Value> {
        let url = "/configs";
        self.send_request("GET", url, None).await
    }

    pub async fn update_geo_data(&self) -> AnyResult<()> {
        let url = "/configs/geo";
        let response = self.send_request("POST", url, None).await?;
        if response["code"] == 204 {
            Ok(())
        } else {
            Err(create_error(
                response["message"]
                    .as_str()
                    .unwrap_or("unknown error")
                    .to_string(),
            ))
        }
    }

    pub async fn upgrade_core(&self) -> AnyResult<()> {
        let url = "/upgrade";
        let response = self.send_request("POST", url, None).await?;
        if response["code"] == 204 {
            Ok(())
        } else {
            Err(create_error(
                response["message"]
                    .as_str()
                    .unwrap_or("unknown error")
                    .to_string(),
            ))
        }
    }

    // 规则相关
    pub async fn get_rules(&self) -> AnyResult<serde_json::Value> {
        let url = "/rules";
        self.send_request("GET", url, None).await
    }

    pub async fn get_rule_providers(&self) -> AnyResult<serde_json::Value> {
        let url = "/providers/rules";
        self.send_request("GET", url, None).await
    }

    pub async fn update_rule_provider(&self, name: &str) -> AnyResult<()> {
        let encoded_name = utf8_percent_encode(name, URL_PATH_ENCODE_SET).to_string();
        let url = format!("/providers/rules/{encoded_name}");
        let response = self.send_request("PUT", &url, None).await?;
        if response["code"] == 204 {
            Ok(())
        } else {
            Err(create_error(
                response["message"]
                    .as_str()
                    .unwrap_or("unknown error")
                    .to_string(),
            ))
        }
    }

    // 代理相关
    pub async fn update_proxy(&self, group: &str, proxy: &str) -> AnyResult<()> {
        // 使用 percent-encoding 进行正确的 URL 编码
        let encoded_group = utf8_percent_encode(group, URL_PATH_ENCODE_SET).to_string();
        let url = format!("/proxies/{encoded_group}");
        let payload = serde_json::json!({
            "name": proxy
        });
        match self.send_request("PUT", &url, Some(&payload)).await {
            Ok(_) => Ok(()),
            Err(e) => {
                logging!(
                    error,
                    crate::utils::logging::Type::Ipc,
                    true,
                    "IPC: updateProxy encountered error: {} (ignored, always returning true)",
                    e
                );
                Ok(())
            }
        }
    }

    pub async fn proxy_provider_health_check(&self, name: &str) -> AnyResult<()> {
        let encoded_name = utf8_percent_encode(name, URL_PATH_ENCODE_SET).to_string();
        let url = format!("/providers/proxies/{encoded_name}/healthcheck");
        let response = self.send_request("GET", &url, None).await?;
        if response["code"] == 204 {
            Ok(())
        } else {
            Err(create_error(
                response["message"]
                    .as_str()
                    .unwrap_or("unknown error")
                    .to_string(),
            ))
        }
    }

    pub async fn update_proxy_provider(&self, name: &str) -> AnyResult<()> {
        let encoded_name = utf8_percent_encode(name, URL_PATH_ENCODE_SET).to_string();
        let url = format!("/providers/proxies/{encoded_name}");
        let response = self.send_request("PUT", &url, None).await?;
        if response["code"] == 204 {
            Ok(())
        } else {
            Err(create_error(
                response["message"]
                    .as_str()
                    .unwrap_or("unknown error")
                    .to_string(),
            ))
        }
    }

    // 延迟测试相关
    pub async fn get_group_proxy_delays(
        &self,
        group_name: &str,
        url: Option<String>,
        timeout: i32,
    ) -> AnyResult<serde_json::Value> {
        let test_url = url.unwrap_or_else(|| "https://cp.cloudflare.com/generate_204".to_string());

        let encoded_group_name = utf8_percent_encode(group_name, URL_PATH_ENCODE_SET).to_string();
        // 测速URL不再编码，直接传递
        let url = format!("/group/{encoded_group_name}/delay?url={test_url}&timeout={timeout}");

        self.send_request("GET", &url, None).await
    }

    // 调试相关
    pub async fn is_debug_enabled(&self) -> AnyResult<bool> {
        let url = "/debug/pprof";
        match self.send_request("GET", url, None).await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    pub async fn gc(&self) -> AnyResult<()> {
        let url = "/debug/gc";
        let response = self.send_request("PUT", url, None).await?;
        if response["code"] == 204 {
            Ok(())
        } else {
            Err(create_error(
                response["message"]
                    .as_str()
                    .unwrap_or("unknown error")
                    .to_string(),
            ))
        }
    }

    // 日志相关功能已迁移到 logs.rs 模块，使用流式处理

    /// 检查熔断器是否开启
    pub fn is_circuit_open(&self) -> bool {
        CORE_DOWN.load(Ordering::SeqCst)
    }

    /// 检查是否正在重启
    pub fn is_restart_in_progress(&self) -> bool {
        RESTART_IN_PROGRESS.load(Ordering::SeqCst)
    }

    /// 强制解除熔断状态
    pub fn force_unbreak_circuit(&self) {
        CORE_DOWN.store(false, Ordering::SeqCst);
        RESTART_IN_PROGRESS.store(false, Ordering::SeqCst);
        logging!(warn, Type::Ipc, "强制解除熔断状态 (手动操作)");
    }
}
