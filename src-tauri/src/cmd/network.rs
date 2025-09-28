use super::CmdResult;
use crate::core::{EventDrivenProxyManager, async_proxy_query::AsyncProxyQuery};
use crate::process::AsyncHandler;
use crate::wrap_err;
use network_interface::NetworkInterface;
use serde_yaml_ng::Mapping;
use serde::{Deserialize, Serialize};
use reqwest;
use std::time::Duration;

/// get the system proxy
#[tauri::command]
pub async fn get_sys_proxy() -> CmdResult<Mapping> {
    log::debug!(target: "app", "异步获取系统代理配置");

    let current = AsyncProxyQuery::get_system_proxy().await;

    let mut map = Mapping::new();
    map.insert("enable".into(), current.enable.into());
    map.insert(
        "server".into(),
        format!("{}:{}", current.host, current.port).into(),
    );
    map.insert("bypass".into(), current.bypass.into());

    log::debug!(target: "app", "返回系统代理配置: enable={}, {}:{}", current.enable, current.host, current.port);
    Ok(map)
}

/// 获取自动代理配置
#[tauri::command]
pub async fn get_auto_proxy() -> CmdResult<Mapping> {
    log::debug!(target: "app", "开始获取自动代理配置（事件驱动）");

    let proxy_manager = EventDrivenProxyManager::global();

    let current = proxy_manager.get_auto_proxy_cached().await;
    // 异步请求更新，立即返回缓存数据
    AsyncHandler::spawn(move || async move {
        let _ = proxy_manager.get_auto_proxy_async().await;
    });

    let mut map = Mapping::new();
    map.insert("enable".into(), current.enable.into());
    map.insert("url".into(), current.url.clone().into());

    log::debug!(target: "app", "返回自动代理配置（缓存）: enable={}, url={}", current.enable, current.url);
    Ok(map)
}

/// 获取系统主机名
#[tauri::command]
pub fn get_system_hostname() -> CmdResult<String> {
    use gethostname::gethostname;

    // 获取系统主机名，处理可能的非UTF-8字符
    let hostname = match gethostname().into_string() {
        Ok(name) => name,
        Err(os_string) => {
            // 对于包含非UTF-8的主机名，使用调试格式化
            let fallback = format!("{os_string:?}");
            // 去掉可能存在的引号
            fallback.trim_matches('"').to_string()
        }
    };

    Ok(hostname)
}

/// 获取网络接口列表
#[tauri::command]
pub fn get_network_interfaces() -> Vec<String> {
    use sysinfo::Networks;
    let mut result = Vec::new();
    let networks = Networks::new_with_refreshed_list();
    for (interface_name, _) in &networks {
        result.push(interface_name.clone());
    }
    result
}

/// 获取网络接口详细信息
#[tauri::command]
pub fn get_network_interfaces_info() -> CmdResult<Vec<NetworkInterface>> {
    use network_interface::{NetworkInterface, NetworkInterfaceConfig};

    let names = get_network_interfaces();
    let interfaces = wrap_err!(NetworkInterface::show())?;

    let mut result = Vec::new();

    for interface in interfaces {
        if names.contains(&interface.name) {
            result.push(interface);
        }
    }

    Ok(result)
}

/// IP信息结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpInfo {
    pub ip: String,
    pub country_code: String,
    pub country: String,
    pub region: String,
    pub city: String,
    pub organization: String,
    pub asn: u32,
    pub asn_organization: String,
    pub longitude: f64,
    pub latitude: f64,
    pub timezone: String,
}

/// IP检测服务配置
struct ServiceConfig {
    url: &'static str,
    parser: fn(&serde_json::Value) -> Option<IpInfo>,
}

/// 解析 ipwho.is 响应
fn parse_ipwho(data: &serde_json::Value) -> Option<IpInfo> {
    Some(IpInfo {
        ip: data.get("ip")?.as_str()?.to_string(),
        country_code: data.get("country_code")?.as_str().unwrap_or("").to_string(),
        country: data.get("country")?.as_str().unwrap_or("").to_string(),
        region: data.get("region")?.as_str().unwrap_or("").to_string(),
        city: data.get("city")?.as_str().unwrap_or("").to_string(),
        organization: data.get("connection")
            .and_then(|c| c.get("org"))
            .or_else(|| data.get("connection").and_then(|c| c.get("isp")))
            .and_then(|o| o.as_str())
            .unwrap_or("").to_string(),
        asn: data.get("connection")
            .and_then(|c| c.get("asn"))
            .and_then(|a| a.as_u64())
            .unwrap_or(0) as u32,
        asn_organization: data.get("connection")
            .and_then(|c| c.get("isp"))
            .and_then(|i| i.as_str())
            .unwrap_or("").to_string(),
        longitude: data.get("longitude").and_then(|l| l.as_f64()).unwrap_or(0.0),
        latitude: data.get("latitude").and_then(|l| l.as_f64()).unwrap_or(0.0),
        timezone: data.get("timezone")
            .and_then(|t| t.get("id"))
            .and_then(|id| id.as_str())
            .unwrap_or("").to_string(),
    })
}

/// 解析 ip.sb 响应
fn parse_ip_sb(data: &serde_json::Value) -> Option<IpInfo> {
    Some(IpInfo {
        ip: data.get("ip")?.as_str()?.to_string(),
        country_code: data.get("country_code")?.as_str().unwrap_or("").to_string(),
        country: data.get("country")?.as_str().unwrap_or("").to_string(),
        region: data.get("region")?.as_str().unwrap_or("").to_string(),
        city: data.get("city")?.as_str().unwrap_or("").to_string(),
        organization: data.get("organization")
            .or_else(|| data.get("isp"))
            .and_then(|o| o.as_str())
            .unwrap_or("").to_string(),
        asn: data.get("asn").and_then(|a| a.as_u64()).unwrap_or(0) as u32,
        asn_organization: data.get("asn_organization").and_then(|a| a.as_str()).unwrap_or("").to_string(),
        longitude: data.get("longitude").and_then(|l| l.as_f64()).unwrap_or(0.0),
        latitude: data.get("latitude").and_then(|l| l.as_f64()).unwrap_or(0.0),
        timezone: data.get("timezone").and_then(|t| t.as_str()).unwrap_or("").to_string(),
    })
}

/// 解析 ipapi.co 响应
fn parse_ipapi_co(data: &serde_json::Value) -> Option<IpInfo> {
    Some(IpInfo {
        ip: data.get("ip")?.as_str()?.to_string(),
        country_code: data.get("country_code")?.as_str().unwrap_or("").to_string(),
        country: data.get("country_name")?.as_str().unwrap_or("").to_string(),
        region: data.get("region")?.as_str().unwrap_or("").to_string(),
        city: data.get("city")?.as_str().unwrap_or("").to_string(),
        organization: data.get("org").and_then(|o| o.as_str()).unwrap_or("").to_string(),
        asn: data.get("asn")
            .and_then(|a| a.as_str())
            .and_then(|s| s.replace("AS", "").parse().ok())
            .unwrap_or(0),
        asn_organization: data.get("org").and_then(|o| o.as_str()).unwrap_or("").to_string(),
        longitude: data.get("longitude").and_then(|l| l.as_f64()).unwrap_or(0.0),
        latitude: data.get("latitude").and_then(|l| l.as_f64()).unwrap_or(0.0),
        timezone: data.get("timezone").and_then(|t| t.as_str()).unwrap_or("").to_string(),
    })
}

/// 解析 ipapi.is 响应
fn parse_ipapi_is(data: &serde_json::Value) -> Option<IpInfo> {
    Some(IpInfo {
        ip: data.get("ip")?.as_str()?.to_string(),
        country_code: data.get("location")
            .and_then(|l| l.get("country_code"))
            .and_then(|c| c.as_str())
            .unwrap_or("").to_string(),
        country: data.get("location")
            .and_then(|l| l.get("country"))
            .and_then(|c| c.as_str())
            .unwrap_or("").to_string(),
        region: data.get("location")
            .and_then(|l| l.get("state"))
            .and_then(|s| s.as_str())
            .unwrap_or("").to_string(),
        city: data.get("location")
            .and_then(|l| l.get("city"))
            .and_then(|c| c.as_str())
            .unwrap_or("").to_string(),
        organization: data.get("asn")
            .and_then(|a| a.get("org"))
            .or_else(|| data.get("company").and_then(|c| c.get("name")))
            .and_then(|o| o.as_str())
            .unwrap_or("").to_string(),
        asn: data.get("asn")
            .and_then(|a| a.get("asn"))
            .and_then(|a| a.as_u64())
            .unwrap_or(0) as u32,
        asn_organization: data.get("asn")
            .and_then(|a| a.get("org"))
            .and_then(|o| o.as_str())
            .unwrap_or("").to_string(),
        longitude: data.get("location")
            .and_then(|l| l.get("longitude"))
            .and_then(|lng| lng.as_f64())
            .unwrap_or(0.0),
        latitude: data.get("location")
            .and_then(|l| l.get("latitude"))
            .and_then(|lat| lat.as_f64())
            .unwrap_or(0.0),
        timezone: data.get("location")
            .and_then(|l| l.get("timezone"))
            .and_then(|t| t.as_str())
            .unwrap_or("").to_string(),
    })
}

/// IP检测服务列表
const IP_CHECK_SERVICES: &[ServiceConfig] = &[
    ServiceConfig {
        url: "https://api.ip.sb/geoip",
        parser: parse_ip_sb,
    },
    ServiceConfig {
        url: "https://ipapi.co/json",
        parser: parse_ipapi_co,
    },
    ServiceConfig {
        url: "https://api.ipapi.is/",
        parser: parse_ipapi_is,
    },
    ServiceConfig {
        url: "https://ipwho.is/",
        parser: parse_ipwho,
    },
];

/// 获取IP信息的Tauri命令
#[tauri::command]
pub async fn get_ip_info() -> CmdResult<IpInfo> {
    log::debug!(target: "app", "开始获取IP地理位置信息");
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    let mut last_error = String::new();

    // 尝试每个服务
    for service in IP_CHECK_SERVICES {
        log::debug!(target: "app", "尝试IP检测服务: {}", service.url);
        
        // 每个服务重试3次
        for attempt in 1..=3 {
            match client.get(service.url).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        match response.json::<serde_json::Value>().await {
                            Ok(data) => {
                                if let Some(ip_info) = (service.parser)(&data) {
                                    if !ip_info.ip.is_empty() {
                                        log::info!(target: "app", "IP检测成功，使用服务: {}", service.url);
                                        return Ok(ip_info);
                                    }
                                }
                                last_error = format!("服务 {} 返回无效数据", service.url);
                            }
                            Err(e) => {
                                last_error = format!("解析 {} 响应失败: {}", service.url, e);
                            }
                        }
                    } else {
                        last_error = format!("服务 {} 返回错误状态: {}", service.url, response.status());
                    }
                }
                Err(e) => {
                    last_error = format!("请求 {} 失败 (尝试 {}/3): {}", service.url, attempt, e);
                    if attempt < 3 {
                        log::debug!(target: "app", "{}", last_error);
                        tokio::time::sleep(Duration::from_millis(1000)).await;
                        continue;
                    }
                }
            }
        }
        
        log::debug!(target: "app", "服务 {} 失败: {}", service.url, last_error);
    }

    log::error!(target: "app", "所有IP检测服务都失败了: {}", last_error);
    Err(format!("获取IP信息失败: {}", last_error))
}
