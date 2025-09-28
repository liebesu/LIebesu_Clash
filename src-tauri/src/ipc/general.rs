use std::time::Duration;
use std::sync::atomic::{AtomicBool, Ordering};

use kode_bridge::{
    ClientConfig, IpcHttpClient, LegacyResponse,
    errors::{AnyError, AnyResult},
};
use percent_encoding::{AsciiSet, CONTROLS, utf8_percent_encode};

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

pub struct IpcManager {
    client: IpcHttpClient,
}

impl IpcManager {
    fn new() -> Self {
        let ipc_path_buf = ipc_path().unwrap_or_else(|e| {
            logging!(error, Type::Ipc, true, "Failed to get IPC path: {}", e);
            std::path::PathBuf::from("/tmp/clash-verge-ipc") // fallback path
        });
        let ipc_path = ipc_path_buf.to_str().unwrap_or_default();
        // 更保守的默认配置，避免核心离线时放大请求压力
        let config = ClientConfig {
            default_timeout: Duration::from_secs(20),
            enable_pooling: true,
            max_retries: 1,
            retry_delay: Duration::from_millis(300),
            max_concurrent_requests: 16,
            max_requests_per_second: Some(32.0),
            ..Default::default()
        };
        #[allow(clippy::unwrap_used)]
        let client = IpcHttpClient::with_config(ipc_path, config).unwrap();
        Self { client }
    }
}

// Use singleton macro with logging
singleton_with_logging!(IpcManager, INSTANCE, "IpcManager");

// ===== 核心通信熔断与看门狗 =====
static CORE_DOWN: AtomicBool = AtomicBool::new(false);
static RESTART_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

fn is_core_comm_error(err: &AnyError) -> bool {
    let msg = err.to_string();
    msg.contains("Connection refused")
        || msg.contains("Broken pipe")
        || msg.contains("pool exhausted")
        || msg.contains("Failed to get fresh connection")
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
        if CORE_DOWN.load(Ordering::SeqCst) && !(method == "GET" && path == "/version") {
            return Err(create_error("core-down: ipc temporarily unavailable"));
        }
        let response = match IpcManager::global().request(method, path, body).await {
            Ok(resp) => resp,
            Err(e) => {
                if is_core_comm_error(&e) { mark_core_down_and_spawn_watchdog(); }
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
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
        let url = "/proxies";
        self.send_request("GET", url, None).await
    }

    // 代理提供者信息获取
    pub async fn get_providers_proxies(&self) -> AnyResult<serde_json::Value> {
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
        let url = "/providers/proxies";
        self.send_request("GET", url, None).await
    }

    // 连接管理
    pub async fn get_connections(&self) -> AnyResult<serde_json::Value> {
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
        let url = "/connections";
        self.send_request("GET", url, None).await
    }

    pub async fn delete_connection(&self, id: &str) -> AnyResult<()> {
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
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
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
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
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
        let url = "/configs?force=true";
        let payload = serde_json::json!({
            "path": clash_config_path,
        });
        let _response = self.send_request("PUT", url, Some(&payload)).await?;
        Ok(())
    }

    pub async fn patch_configs(&self, config: serde_json::Value) -> AnyResult<()> {
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
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
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
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
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
        let url = "/configs";
        self.send_request("GET", url, None).await
    }

    pub async fn update_geo_data(&self) -> AnyResult<()> {
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
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
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
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
        if CORE_DOWN.load(Ordering::SeqCst) { return Err(create_error("core-down")); }
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
}
