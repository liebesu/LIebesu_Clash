use super::CmdResult;
use crate::{
    config::Config,
    core::{CoreManager, handle},
};
use crate::{
    config::*,
    feat,
    ipc::{self, IpcManager},
    logging,
    state::proxy::ProxyRequestCache,
    utils::logging::Type,
    wrap_err,
};
use serde_yaml_ng::Mapping;
use std::time::Duration;

const CONFIG_REFRESH_INTERVAL: Duration = Duration::from_secs(60);

/// 复制Clash环境变量
#[tauri::command]
pub async fn copy_clash_env() -> CmdResult {
    feat::copy_clash_env().await;
    Ok(())
}

/// 获取Clash信息
#[tauri::command]
pub async fn get_clash_info() -> CmdResult<ClashInfo> {
    Ok(Config::clash().await.latest_ref().get_client_info())
}

/// 修改Clash配置
#[tauri::command]
pub async fn patch_clash_config(payload: Mapping) -> CmdResult {
    wrap_err!(feat::patch_clash(payload).await)
}

/// 修改Clash模式
#[tauri::command]
pub async fn patch_clash_mode(payload: String) -> CmdResult {
    feat::change_clash_mode(payload).await;
    Ok(())
}

/// 切换Clash核心
#[tauri::command]
pub async fn change_clash_core(clash_core: String) -> CmdResult<Option<String>> {
    logging!(info, Type::Config, "changing core to {clash_core}");

    match CoreManager::global()
        .change_core(Some(clash_core.clone()))
        .await
    {
        Ok(_) => {
            // 切换内核后重启内核
            match CoreManager::global().restart_core().await {
                Ok(_) => {
                    logging!(
                        info,
                        Type::Core,
                        "core changed and restarted to {clash_core}"
                    );
                    handle::Handle::notice_message("config_core::change_success", &clash_core);
                    handle::Handle::refresh_clash();
                    Ok(None)
                }
                Err(err) => {
                    let error_msg = format!("Core changed but failed to restart: {err}");
                    logging!(error, Type::Core, "{error_msg}");
                    handle::Handle::notice_message("config_core::change_error", &error_msg);
                    Ok(Some(error_msg))
                }
            }
        }
        Err(err) => {
            let error_msg = err.to_string();
            logging!(error, Type::Core, "failed to change core: {error_msg}");
            handle::Handle::notice_message("config_core::change_error", &error_msg);
            Ok(Some(error_msg))
        }
    }
}

/// 启动核心
#[tauri::command]
pub async fn start_core() -> CmdResult {
    log::info!(target: "app", "🚀 [前端请求] 启动Clash核心服务");
    let result = wrap_err!(CoreManager::global().start_core().await);
    match &result {
        Ok(_) => {
            log::info!(target: "app", "✅ [启动服务] Clash核心服务启动成功");
            handle::Handle::refresh_clash();
            log::info!(target: "app", "🔄 [启动服务] 已刷新前端状态");
        }
        Err(e) => {
            log::error!(target: "app", "❌ [启动服务] Clash核心服务启动失败: {}", e);
        }
    }
    result
}

/// 关闭核心
#[tauri::command]
pub async fn stop_core() -> CmdResult {
    log::info!(target: "app", "🛑 [前端请求] 停止Clash核心服务");
    let result = wrap_err!(CoreManager::global().stop_core().await);
    match &result {
        Ok(_) => {
            log::info!(target: "app", "✅ [停止服务] Clash核心服务停止成功");
            // 🔧 修复：停止服务后立即刷新状态，确保前端状态同步
            handle::Handle::refresh_clash();
            log::info!(target: "app", "🔄 [停止服务] 已刷新前端状态");
            logging!(info, Type::Core, true, "服务已停止，状态已刷新");
        }
        Err(e) => {
            log::error!(target: "app", "❌ [停止服务] Clash核心服务停止失败: {}", e);
        }
    }
    result
}

/// 重启核心
#[tauri::command]
pub async fn restart_core() -> CmdResult {
    log::info!(target: "app", "🔄 [前端请求] 重启Clash核心服务");
    let result = wrap_err!(CoreManager::global().restart_core().await);
    match &result {
        Ok(_) => {
            log::info!(target: "app", "✅ [重启服务] Clash核心服务重启成功");
            handle::Handle::refresh_clash();
            log::info!(target: "app", "🔄 [重启服务] 已刷新前端状态");
        }
        Err(e) => {
            log::error!(target: "app", "❌ [重启服务] Clash核心服务重启失败: {}", e);
        }
    }
    result
}

/// 获取代理延迟
#[tauri::command]
pub async fn clash_api_get_proxy_delay(
    name: String,
    url: Option<String>,
    timeout: i32,
) -> CmdResult<serde_json::Value> {
    wrap_err!(
        IpcManager::global()
            .test_proxy_delay(&name, url, timeout)
            .await
    )
}

/// 测试URL延迟
#[tauri::command]
pub async fn test_delay(url: String) -> CmdResult<u32> {
    let result = match feat::test_delay(url).await {
        Ok(delay) => delay,
        Err(e) => {
            log::error!(target: "app", "{}", e);
            10000u32
        }
    };
    Ok(result)
}

/// 保存DNS配置到单独文件
#[tauri::command]
pub async fn save_dns_config(dns_config: Mapping) -> CmdResult {
    use crate::utils::dirs;
    use serde_yaml_ng;
    use tokio::fs;

    // 获取DNS配置文件路径
    let dns_path = dirs::app_home_dir()
        .map_err(|e| e.to_string())?
        .join("dns_config.yaml");

    // 保存DNS配置到文件
    let yaml_str = serde_yaml_ng::to_string(&dns_config).map_err(|e| e.to_string())?;
    fs::write(&dns_path, yaml_str)
        .await
        .map_err(|e| e.to_string())?;
    logging!(info, Type::Config, "DNS config saved to {dns_path:?}");

    Ok(())
}

/// 应用或撤销DNS配置
#[tauri::command]
pub async fn apply_dns_config(apply: bool) -> CmdResult {
    use crate::{
        config::Config,
        core::{CoreManager, handle},
        utils::dirs,
    };

    if apply {
        // 读取DNS配置文件
        let dns_path = dirs::app_home_dir()
            .map_err(|e| e.to_string())?
            .join("dns_config.yaml");

        if !dns_path.exists() {
            logging!(warn, Type::Config, "DNS config file not found");
            return Err("DNS config file not found".into());
        }

        let dns_yaml = tokio::fs::read_to_string(&dns_path).await.map_err(|e| {
            logging!(error, Type::Config, "Failed to read DNS config: {e}");
            e.to_string()
        })?;

        // 解析DNS配置
        let patch_config =
            serde_yaml_ng::from_str::<serde_yaml_ng::Mapping>(&dns_yaml).map_err(|e| {
                logging!(error, Type::Config, "Failed to parse DNS config: {e}");
                e.to_string()
            })?;

        logging!(info, Type::Config, "Applying DNS config from file");

        // 创建包含DNS配置的patch
        let mut patch = serde_yaml_ng::Mapping::new();
        patch.insert("dns".into(), patch_config.into());

        // 应用DNS配置到运行时配置
        Config::runtime().await.draft_mut().patch_config(patch);

        // 重新生成配置
        Config::generate().await.map_err(|err| {
            logging!(
                error,
                Type::Config,
                "Failed to regenerate config with DNS: {err}"
            );
            "Failed to regenerate config with DNS".to_string()
        })?;

        // 应用新配置
        CoreManager::global().update_config().await.map_err(|err| {
            logging!(
                error,
                Type::Config,
                "Failed to apply config with DNS: {err}"
            );
            "Failed to apply config with DNS".to_string()
        })?;

        logging!(info, Type::Config, "DNS config successfully applied");
        handle::Handle::refresh_clash();
    } else {
        // 当关闭DNS设置时，重新生成配置（不加载DNS配置文件）
        logging!(
            info,
            Type::Config,
            "DNS settings disabled, regenerating config"
        );

        Config::generate().await.map_err(|err| {
            logging!(error, Type::Config, "Failed to regenerate config: {err}");
            "Failed to regenerate config".to_string()
        })?;

        CoreManager::global().update_config().await.map_err(|err| {
            logging!(
                error,
                Type::Config,
                "Failed to apply regenerated config: {err}"
            );
            "Failed to apply regenerated config".to_string()
        })?;

        logging!(info, Type::Config, "Config regenerated successfully");
        handle::Handle::refresh_clash();
    }

    Ok(())
}

/// 检查DNS配置文件是否存在
#[tauri::command]
pub fn check_dns_config_exists() -> CmdResult<bool> {
    use crate::utils::dirs;

    let dns_path = dirs::app_home_dir()
        .map_err(|e| e.to_string())?
        .join("dns_config.yaml");

    Ok(dns_path.exists())
}

/// 获取DNS配置文件内容
#[tauri::command]
pub async fn get_dns_config_content() -> CmdResult<String> {
    use crate::utils::dirs;
    use tokio::fs;

    let dns_path = dirs::app_home_dir()
        .map_err(|e| e.to_string())?
        .join("dns_config.yaml");

    if !fs::try_exists(&dns_path).await.map_err(|e| e.to_string())? {
        return Err("DNS config file not found".into());
    }

    let content = fs::read_to_string(&dns_path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(content)
}

/// 验证DNS配置文件
#[tauri::command]
pub async fn validate_dns_config() -> CmdResult<(bool, String)> {
    use crate::{core::CoreManager, utils::dirs};

    let app_dir = dirs::app_home_dir().map_err(|e| e.to_string())?;
    let dns_path = app_dir.join("dns_config.yaml");
    let dns_path_str = dns_path.to_str().unwrap_or_default();

    if !dns_path.exists() {
        return Ok((false, "DNS config file not found".to_string()));
    }

    match CoreManager::global()
        .validate_config_file(dns_path_str, None)
        .await
    {
        Ok(result) => Ok(result),
        Err(e) => Err(e.to_string()),
    }
}

/// 获取Clash版本信息
#[tauri::command]
pub async fn get_clash_version() -> CmdResult<serde_json::Value> {
    // 先检查核心是否运行
    let core_manager = crate::core::CoreManager::global();
    let running_mode = core_manager.get_running_mode();
    
    if running_mode == crate::core::RunningMode::NotRunning {
        log::warn!(target: "app", "Clash核心未运行，无法获取版本信息");
        return Ok(serde_json::json!({
            "version": "unknown",
            "premium": false,
            "meta": false,
            "error": "Core not running"
        }));
    }
    
    // 尝试获取版本信息，带重试机制
    let mut retries = 3;
    let mut last_error = None;
    
    while retries > 0 {
        match IpcManager::global().get_version().await {
            Ok(version) => {
                log::info!(target: "app", "成功获取Clash版本信息");
                return Ok(version);
            }
            Err(e) => {
                last_error = Some(e);
                retries -= 1;
                log::warn!(target: "app", "获取版本信息失败，剩余重试次数: {}, 错误: {}", retries, last_error.as_ref().unwrap());
                
                if retries > 0 {
                    // 等待一段时间后重试
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                }
            }
        }
    }
    
    // 所有重试都失败了
    let error_msg = last_error.map(|e| e.to_string()).unwrap_or_else(|| "Unknown error".to_string());
    log::error!(target: "app", "获取Clash版本信息最终失败: {}", error_msg);
    
    // 返回错误信息而不是抛出异常，避免前端崩溃
    Ok(serde_json::json!({
        "version": "unknown",
        "premium": false,
        "meta": false,
        "error": error_msg
    }))
}

/// 获取IP信息（通过后端代理，避免CORS问题）
#[tauri::command]
pub async fn get_ip_info() -> CmdResult<serde_json::Value> {
    use reqwest::Client;
    use std::time::Duration;
    
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("LIebesu_Clash/2.4.3")
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;
    
    // 尝试多个IP查询服务
    let services = vec![
        "https://ipapi.co/json/",
        "https://ipwho.is/",
        "https://ipinfo.io/json",
    ];
    
    for service_url in services {
        match client.get(service_url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<serde_json::Value>().await {
                        Ok(data) => {
                            log::info!(target: "app", "成功从 {} 获取IP信息", service_url);
                            return Ok(normalize_ip_info_response(data, service_url));
                        }
                        Err(e) => {
                            log::warn!(target: "app", "解析 {} 响应失败: {}", service_url, e);
                            continue;
                        }
                    }
                } else {
                    log::warn!(target: "app", "服务 {} 返回错误状态: {}", service_url, response.status());
                    continue;
                }
            }
            Err(e) => {
                log::warn!(target: "app", "请求 {} 失败: {}", service_url, e);
                continue;
            }
        }
    }
    
    // 所有服务都失败了，返回默认值
    log::error!(target: "app", "所有IP查询服务都失败了");
    Ok(serde_json::json!({
        "ip": "unknown",
        "country": "unknown",
        "region": "unknown",
        "city": "unknown",
        "error": "All IP services failed"
    }))
}

fn normalize_ip_info_response(data: serde_json::Value, source: &str) -> serde_json::Value {
    use serde_json::{json, Map, Value};

    fn get_string(map: &Map<String, Value>, key: &str) -> Option<String> {
        map.get(key).and_then(|value| match value {
            Value::String(s) => Some(s.clone()),
            Value::Number(n) => Some(n.to_string()),
            Value::Bool(b) => Some(b.to_string()),
            _ => None,
        })
    }

    fn get_nested_string(map: &Map<String, Value>, parent: &str, key: &str) -> Option<String> {
        map.get(parent)
            .and_then(|value| value.as_object())
            .and_then(|obj| get_string(obj, key))
    }

    fn get_number(map: &Map<String, Value>, key: &str) -> Option<f64> {
        map.get(key).and_then(|value| match value {
            Value::Number(n) => n.as_f64(),
            Value::String(s) => s.parse::<f64>().ok(),
            _ => None,
        })
    }

    fn get_nested_number(map: &Map<String, Value>, parent: &str, key: &str) -> Option<f64> {
        map.get(parent)
            .and_then(|value| value.as_object())
            .and_then(|obj| get_number(obj, key))
    }

    match data {
        Value::Object(mut map) => {
            if map.contains_key("ip") && map.contains_key("country") {
                map.insert(
                    "source".to_string(),
                    Value::String(source.to_string()),
                );
                return Value::Object(map);
            }

            let ip = get_string(&map, "ip")
                .or_else(|| get_string(&map, "query"))
                .unwrap_or_else(|| "unknown".into());

            let country = get_string(&map, "country")
                .or_else(|| get_string(&map, "country_name"))
                .or_else(|| get_string(&map, "countryRegion"))
                .or_else(|| get_nested_string(&map, "location", "country"))
                .or_else(|| {
                    map.get("country")
                        .and_then(|v| v.as_object())
                        .and_then(|obj| get_string(obj, "name"))
                })
                .unwrap_or_else(|| "".into());

            let country_code = get_string(&map, "country_code")
                .or_else(|| get_string(&map, "countryCode"))
                .or_else(|| get_string(&map, "country_code2"))
                .or_else(|| get_string(&map, "country_code_iso3"))
                .or_else(|| get_nested_string(&map, "location", "country_code"))
                .or_else(|| {
                    map.get("country")
                        .and_then(|v| v.as_object())
                        .and_then(|obj| get_string(obj, "code"))
                })
                .unwrap_or_else(|| "".into());

            let region = get_string(&map, "region")
                .or_else(|| get_string(&map, "regionName"))
                .or_else(|| get_string(&map, "state_prov"))
                .or_else(|| get_nested_string(&map, "location", "region"))
                .or_else(|| get_nested_string(&map, "location", "state"))
                .unwrap_or_else(|| "".into());

            let city = get_string(&map, "city")
                .or_else(|| get_string(&map, "district"))
                .or_else(|| get_string(&map, "city_name"))
                .or_else(|| get_nested_string(&map, "location", "city"))
                .unwrap_or_else(|| "".into());

            let timezone = get_string(&map, "timezone")
                .or_else(|| get_string(&map, "time_zone"))
                .or_else(|| {
                    get_nested_string(&map, "timezone", "id")
                        .or_else(|| get_nested_string(&map, "location", "time_zone"))
                })
                .unwrap_or_else(|| "".into());

            let longitude = get_number(&map, "longitude")
                .or_else(|| get_number(&map, "lon"))
                .or_else(|| get_nested_number(&map, "location", "longitude"))
                .unwrap_or(0.0);

            let latitude = get_number(&map, "latitude")
                .or_else(|| get_number(&map, "lat"))
                .or_else(|| get_nested_number(&map, "location", "latitude"))
                .unwrap_or(0.0);

            let organization = get_string(&map, "organization")
                .or_else(|| get_string(&map, "org"))
                .or_else(|| get_string(&map, "asn_organization"))
                .or_else(|| get_string(&map, "asn_org"))
                .or_else(|| get_nested_string(&map, "connection", "org"))
                .or_else(|| get_nested_string(&map, "connection", "isp"))
                .unwrap_or_else(|| "".into());

            let isp = get_string(&map, "isp")
                .or_else(|| get_nested_string(&map, "connection", "isp"))
                .or_else(|| get_nested_string(&map, "connection", "org"))
                .unwrap_or_else(|| organization.clone());

            let asn = get_number(&map, "asn")
                .or_else(|| get_number(&map, "as_number"))
                .or_else(|| get_nested_number(&map, "connection", "asn"))
                .unwrap_or(0.0);

            json!({
                "source": source,
                "ip": ip,
                "country": country,
                "country_code": country_code,
                "region": region,
                "city": city,
                "timezone": timezone,
                "longitude": longitude,
                "latitude": latitude,
                "organization": organization,
                "isp": isp,
                "asn": asn,
                "asn_organization": organization
            })
        }
        _ => serde_json::json!({
            "source": source,
            "ip": "unknown",
            "country": "unknown",
            "region": "unknown",
            "city": "unknown",
            "error": "Invalid response format"
        }),
    }
}

/// 获取Clash配置
#[tauri::command]
pub async fn get_clash_config() -> CmdResult<serde_json::Value> {
    let manager = IpcManager::global();
    let cache = ProxyRequestCache::global();
    let key = ProxyRequestCache::make_key("clash_config", "default");
    let value = cache
        .get_or_fetch(key, CONFIG_REFRESH_INTERVAL, || async {
            manager.get_config().await.unwrap_or_else(|e| {
                logging!(error, Type::Cmd, "Failed to fetch clash config: {e}");
                serde_json::Value::Object(serde_json::Map::new())
            })
        })
        .await;
    Ok((*value).clone())
}

/// 强制刷新Clash配置缓存
#[tauri::command]
pub async fn force_refresh_clash_config() -> CmdResult<serde_json::Value> {
    let cache = ProxyRequestCache::global();
    let key = ProxyRequestCache::make_key("clash_config", "default");
    cache.map.remove(&key);
    get_clash_config().await
}

/// 更新地理数据
#[tauri::command]
pub async fn update_geo_data() -> CmdResult {
    wrap_err!(IpcManager::global().update_geo_data().await)
}

/// 升级Clash核心
#[tauri::command]
pub async fn upgrade_clash_core() -> CmdResult {
    wrap_err!(IpcManager::global().upgrade_core().await)
}

/// 获取规则
#[tauri::command]
pub async fn get_clash_rules() -> CmdResult<serde_json::Value> {
    wrap_err!(IpcManager::global().get_rules().await)
}

/// 更新代理选择
#[tauri::command]
pub async fn update_proxy_choice(group: String, proxy: String) -> CmdResult {
    wrap_err!(IpcManager::global().update_proxy(&group, &proxy).await)
}

/// 获取代理提供者
#[tauri::command]
pub async fn get_proxy_providers() -> CmdResult<serde_json::Value> {
    wrap_err!(IpcManager::global().get_providers_proxies().await)
}

/// 获取规则提供者
#[tauri::command]
pub async fn get_rule_providers() -> CmdResult<serde_json::Value> {
    wrap_err!(IpcManager::global().get_rule_providers().await)
}

/// 代理提供者健康检查
#[tauri::command]
pub async fn proxy_provider_health_check(name: String) -> CmdResult {
    wrap_err!(
        IpcManager::global()
            .proxy_provider_health_check(&name)
            .await
    )
}

/// 更新代理提供者
#[tauri::command]
pub async fn update_proxy_provider(name: String) -> CmdResult {
    wrap_err!(IpcManager::global().update_proxy_provider(&name).await)
}

/// 更新规则提供者
#[tauri::command]
pub async fn update_rule_provider(name: String) -> CmdResult {
    wrap_err!(IpcManager::global().update_rule_provider(&name).await)
}

/// 获取连接
#[tauri::command]
pub async fn get_clash_connections() -> CmdResult<serde_json::Value> {
    wrap_err!(IpcManager::global().get_connections().await)
}

/// 删除连接
#[tauri::command]
pub async fn delete_clash_connection(id: String) -> CmdResult {
    wrap_err!(IpcManager::global().delete_connection(&id).await)
}

/// 关闭所有连接
#[tauri::command]
pub async fn close_all_clash_connections() -> CmdResult {
    wrap_err!(IpcManager::global().close_all_connections().await)
}

/// 获取流量数据 (使用新的IPC流式监控)
#[tauri::command]
pub async fn get_traffic_data() -> CmdResult<serde_json::Value> {
    let traffic = crate::ipc::get_current_traffic().await;
    let result = serde_json::json!({
        "up": traffic.total_up,
        "down": traffic.total_down,
        "up_rate": traffic.up_rate,
        "down_rate": traffic.down_rate,
        "last_updated": traffic.last_updated.elapsed().as_secs()
    });
    Ok(result)
}

/// 获取内存数据 (使用新的IPC流式监控)
#[tauri::command]
pub async fn get_memory_data() -> CmdResult<serde_json::Value> {
    let memory = crate::ipc::get_current_memory().await;
    let usage_percent = if memory.oslimit > 0 {
        (memory.inuse as f64 / memory.oslimit as f64) * 100.0
    } else {
        0.0
    };
    let result = serde_json::json!({
        "inuse": memory.inuse,
        "oslimit": memory.oslimit,
        "usage_percent": usage_percent,
        "last_updated": memory.last_updated.elapsed().as_secs()
    });
    Ok(result)
}

/// 启动流量监控服务 (IPC流式监控自动启动，此函数为兼容性保留)
#[tauri::command]
pub async fn start_traffic_service() -> CmdResult {
    logging!(trace, Type::Ipc, "启动流量监控服务 (IPC流式监控)");
    // 新的IPC监控在首次访问时自动启动
    // 触发一次访问以确保监控器已初始化
    let _ = crate::ipc::get_current_traffic().await;
    let _ = crate::ipc::get_current_memory().await;
    logging!(info, Type::Ipc, "IPC流式监控已激活");
    Ok(())
}

/// 停止流量监控服务 (IPC流式监控无需显式停止，此函数为兼容性保留)
#[tauri::command]
pub async fn stop_traffic_service() -> CmdResult {
    logging!(trace, Type::Ipc, "停止流量监控服务请求 (IPC流式监控)");
    // 新的IPC监控是持久的，无需显式停止
    logging!(info, Type::Ipc, "IPC流式监控继续运行");
    Ok(())
}

/// 获取格式化的流量数据 (包含单位，便于前端显示)
#[tauri::command]
pub async fn get_formatted_traffic_data() -> CmdResult<serde_json::Value> {
    logging!(trace, Type::Ipc, "获取格式化流量数据");
    let (up_rate, down_rate, total_up, total_down, is_fresh) =
        crate::ipc::get_formatted_traffic().await;
    let result = serde_json::json!({
        "up_rate_formatted": up_rate,
        "down_rate_formatted": down_rate,
        "total_up_formatted": total_up,
        "total_down_formatted": total_down,
        "is_fresh": is_fresh
    });
    logging!(
        debug,
        Type::Ipc,
        "格式化流量数据: ↑{up_rate}/s ↓{down_rate}/s (总计: ↑{total_up} ↓{total_down})"
    );
    Ok(result)
}

/// 获取格式化的内存数据 (包含单位，便于前端显示)
#[tauri::command]
pub async fn get_formatted_memory_data() -> CmdResult<serde_json::Value> {
    logging!(info, Type::Ipc, "获取格式化内存数据");
    let (inuse, oslimit, usage_percent, is_fresh) = crate::ipc::get_formatted_memory().await;
    let result = serde_json::json!({
        "inuse_formatted": inuse,
        "oslimit_formatted": oslimit,
        "usage_percent": usage_percent,
        "is_fresh": is_fresh
    });
    logging!(
        debug,
        Type::Ipc,
        "格式化内存数据: {inuse} / {oslimit} ({usage_percent:.1}%)"
    );
    Ok(result)
}

/// 获取系统监控概览 (流量+内存，便于前端一次性获取所有状态)
#[tauri::command]
pub async fn get_system_monitor_overview() -> CmdResult<serde_json::Value> {
    logging!(debug, Type::Ipc, "获取系统监控概览");

    // 并发获取流量和内存数据
    let (traffic, memory) = tokio::join!(
        crate::ipc::get_current_traffic(),
        crate::ipc::get_current_memory()
    );

    let (traffic_formatted, memory_formatted) = tokio::join!(
        crate::ipc::get_formatted_traffic(),
        crate::ipc::get_formatted_memory()
    );

    let traffic_is_fresh = traffic.last_updated.elapsed().as_secs() < 5;
    let memory_is_fresh = memory.last_updated.elapsed().as_secs() < 10;

    let result = serde_json::json!({
        "traffic": {
            "raw": {
                "up": traffic.total_up,
                "down": traffic.total_down,
                "up_rate": traffic.up_rate,
                "down_rate": traffic.down_rate
            },
            "formatted": {
                "up_rate": traffic_formatted.0,
                "down_rate": traffic_formatted.1,
                "total_up": traffic_formatted.2,
                "total_down": traffic_formatted.3
            },
            "is_fresh": traffic_is_fresh
        },
        "memory": {
            "raw": {
                "inuse": memory.inuse,
                "oslimit": memory.oslimit,
                "usage_percent": if memory.oslimit > 0 {
                    (memory.inuse as f64 / memory.oslimit as f64) * 100.0
                } else {
                    0.0
                }
            },
            "formatted": {
                "inuse": memory_formatted.0,
                "oslimit": memory_formatted.1,
                "usage_percent": memory_formatted.2
            },
            "is_fresh": memory_is_fresh
        },
        "overall_status": if traffic_is_fresh && memory_is_fresh { "healthy" } else { "stale" }
    });

    Ok(result)
}

/// 获取代理组延迟
#[tauri::command]
pub async fn get_group_proxy_delays(
    group_name: String,
    url: Option<String>,
    timeout: Option<i32>,
) -> CmdResult<serde_json::Value> {
    wrap_err!(
        IpcManager::global()
            .get_group_proxy_delays(&group_name, url, timeout.unwrap_or(10000))
            .await
    )
}

/// 检查调试是否启用
#[tauri::command]
pub async fn is_clash_debug_enabled() -> CmdResult<bool> {
    match IpcManager::global().is_debug_enabled().await {
        Ok(enabled) => Ok(enabled),
        Err(_) => Ok(false),
    }
}

/// 垃圾回收
#[tauri::command]
pub async fn clash_gc() -> CmdResult {
    wrap_err!(IpcManager::global().gc().await)
}

/// 获取日志 (使用新的流式实现)
#[tauri::command]
pub async fn get_clash_logs() -> CmdResult<serde_json::Value> {
    Ok(ipc::get_logs_json().await)
}

/// 启动日志监控
#[tauri::command]
pub async fn start_logs_monitoring(level: Option<String>) -> CmdResult {
    ipc::start_logs_monitoring(level).await;
    Ok(())
}

/// 停止日志监控
#[tauri::command]
pub async fn stop_logs_monitoring() -> CmdResult {
    ipc::stop_logs_monitoring().await;
    Ok(())
}

/// 清除日志
#[tauri::command]
pub async fn clear_logs() -> CmdResult {
    ipc::clear_logs().await;
    Ok(())
}
