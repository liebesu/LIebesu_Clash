use super::CmdResult;
use crate::{
    config::{Config, PrfItem},
    feat,
    logging,
    utils::logging::Type,
    wrap_err,
};
use reqwest::{Client, Response};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::timeout;

/// 订阅健康检查结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionHealthResult {
    pub uid: String,
    pub name: String,
    pub url: Option<String>,
    pub status: HealthStatus,
    pub response_time: Option<u64>, // 毫秒
    pub node_count: Option<usize>,
    pub last_update: Option<i64>,
    pub error_message: Option<String>,
    pub last_checked: i64,
}

/// 健康状态枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HealthStatus {
    Healthy,      // 健康
    Warning,      // 警告（可访问但有问题）
    Unhealthy,    // 不健康（无法访问）
    Checking,     // 正在检查
    Unknown,      // 未知状态
}

/// 批量健康检查结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchHealthResult {
    pub total: usize,
    pub healthy: usize,
    pub warning: usize,
    pub unhealthy: usize,
    pub results: Vec<SubscriptionHealthResult>,
    pub check_duration: u64, // 毫秒
}

/// 检查单个订阅的健康状态
#[tauri::command]
pub async fn check_subscription_health(uid: String) -> CmdResult<SubscriptionHealthResult> {
    logging!(info, Type::Cmd, true, "[健康检查] 开始检查订阅: {}", uid);
    
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    
    let profile = profiles_ref.items
        .iter()
        .find(|item| item.uid == Some(uid.clone()))
        .ok_or_else(|| "Profile not found".to_string())?;
    
    let result = check_single_subscription(profile).await;
    logging!(info, Type::Cmd, true, "[健康检查] 完成检查订阅 {}: {:?}", uid, result.status);
    
    Ok(result)
}

/// 批量检查所有订阅的健康状态
#[tauri::command]
pub async fn check_all_subscriptions_health() -> CmdResult<BatchHealthResult> {
    let start_time = Instant::now();
    logging!(info, Type::Cmd, true, "[批量健康检查] 开始检查所有订阅");
    
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    
    // 过滤出远程订阅
    let remote_profiles: Vec<&PrfItem> = profiles_ref.items
        .iter()
        .filter(|item| item.option.as_ref().map(|opt| opt.url.is_some()).unwrap_or(false))
        .collect();
    
    let total = remote_profiles.len();
    let mut results = Vec::new();
    
    // 并发检查（限制并发数避免过载）
    let semaphore = Arc::new(tokio::sync::Semaphore::new(5)); // 最多5个并发
    let mut tasks = Vec::new();
    
    for profile in remote_profiles {
        let profile_clone = profile.clone();
        let permit = semaphore.clone();
        
        let task = tokio::spawn(async move {
            let _permit = permit.acquire().await.unwrap();
            check_single_subscription(&profile_clone).await
        });
        
        tasks.push(task);
    }
    
    // 等待所有检查完成
    for task in tasks {
        if let Ok(result) = task.await {
            results.push(result);
        }
    }
    
    // 统计结果
    let healthy = results.iter().filter(|r| matches!(r.status, HealthStatus::Healthy)).count();
    let warning = results.iter().filter(|r| matches!(r.status, HealthStatus::Warning)).count();
    let unhealthy = results.iter().filter(|r| matches!(r.status, HealthStatus::Unhealthy)).count();
    
    let check_duration = start_time.elapsed().as_millis() as u64;
    
    let batch_result = BatchHealthResult {
        total,
        healthy,
        warning,
        unhealthy,
        results,
        check_duration,
    };
    
    logging!(info, Type::Cmd, true, 
        "[批量健康检查] 完成 - 总数: {}, 健康: {}, 警告: {}, 不健康: {}, 耗时: {}ms", 
        total, healthy, warning, unhealthy, check_duration
    );
    
    Ok(batch_result)
}

/// 获取订阅详细信息（节点数量等）
#[tauri::command]
pub async fn get_subscription_details(uid: String) -> CmdResult<SubscriptionHealthResult> {
    logging!(info, Type::Cmd, true, "[订阅详情] 获取订阅详细信息: {}", uid);
    
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    
    let profile = profiles_ref.items
        .iter()
        .find(|item| item.uid == Some(uid.clone()))
        .ok_or_else(|| "Profile not found".to_string())?;
    
    let mut result = check_single_subscription(profile).await;
    
    // 如果订阅可访问，尝试解析节点数量
    if matches!(result.status, HealthStatus::Healthy | HealthStatus::Warning) {
        if let Some(file_path) = &profile.file {
            if let Ok(content) = tokio::fs::read_to_string(file_path).await {
                result.node_count = Some(count_nodes_in_config(&content));
            }
        }
    }
    
    Ok(result)
}

/// 检查单个订阅的实现
async fn check_single_subscription(profile: &PrfItem) -> SubscriptionHealthResult {
    let uid = profile.uid.clone().unwrap_or_default();
    let name = profile.name.clone().unwrap_or("未知订阅".to_string());
    let url = profile.option.as_ref().and_then(|opt| opt.url.clone());
    let last_update = profile.updated;
    let now = chrono::Utc::now().timestamp();
    
    let mut result = SubscriptionHealthResult {
        uid: uid.clone(),
        name,
        url: url.clone(),
        status: HealthStatus::Unknown,
        response_time: None,
        node_count: None,
        last_update,
        error_message: None,
        last_checked: now,
    };
    
    // 如果是本地文件，检查文件是否存在
    if url.is_none() {
        if let Some(file_path) = &profile.file {
            if tokio::fs::metadata(file_path).await.is_ok() {
                result.status = HealthStatus::Healthy;
                if let Ok(content) = tokio::fs::read_to_string(file_path).await {
                    result.node_count = Some(count_nodes_in_config(&content));
                }
            } else {
                result.status = HealthStatus::Unhealthy;
                result.error_message = Some("本地文件不存在".to_string());
            }
        }
        return result;
    }
    
    // 检查远程订阅
    if let Some(subscription_url) = url {
        let start_time = Instant::now();
        
        match check_remote_subscription(&subscription_url).await {
            Ok(response_info) => {
                result.response_time = Some(start_time.elapsed().as_millis() as u64);
                result.status = HealthStatus::Healthy;
                
                // 检查响应时间是否过长
                if result.response_time.unwrap_or(0) > 10000 {
                    result.status = HealthStatus::Warning;
                    result.error_message = Some("响应时间过长".to_string());
                }
                
                // 尝试解析节点数量
                if let Some(content) = response_info.content {
                    let node_count = count_nodes_in_config(&content);
                    result.node_count = Some(node_count);
                    
                    if node_count == 0 {
                        result.status = HealthStatus::Warning;
                        result.error_message = Some("订阅中没有可用节点".to_string());
                    }
                }
            }
            Err(error_msg) => {
                result.status = HealthStatus::Unhealthy;
                result.error_message = Some(error_msg);
                result.response_time = Some(start_time.elapsed().as_millis() as u64);
            }
        }
    }
    
    result
}

/// 检查远程订阅的响应信息
#[derive(Debug)]
struct SubscriptionResponse {
    status_code: u16,
    content: Option<String>,
    headers: HashMap<String, String>,
}

/// 检查远程订阅
async fn check_remote_subscription(url: &str) -> Result<SubscriptionResponse, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("clash-verge-rev/health-checker")
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;
    
    let response = timeout(Duration::from_secs(30), client.get(url).send())
        .await
        .map_err(|_| "请求超时".to_string())?
        .map_err(|e| format!("请求失败: {}", e))?;
    
    let status_code = response.status().as_u16();
    
    if !response.status().is_success() {
        return Err(format!("HTTP错误: {}", status_code));
    }
    
    // 收集响应头
    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value_str) = value.to_str() {
            headers.insert(key.to_string(), value_str.to_string());
        }
    }
    
    // 读取响应内容（限制大小避免内存问题）
    let content = match response.text().await {
        Ok(text) => {
            if text.len() > 1024 * 1024 * 2 { // 限制2MB
                None
            } else {
                Some(text)
            }
        }
        Err(_) => None,
    };
    
    Ok(SubscriptionResponse {
        status_code,
        content,
        headers,
    })
}

/// 统计配置文件中的节点数量
fn count_nodes_in_config(content: &str) -> usize {
    // 尝试解析YAML格式
    if let Ok(yaml_value) = serde_yaml::from_str::<serde_yaml::Value>(content) {
        if let Some(proxies) = yaml_value.get("proxies") {
            if let Some(proxies_array) = proxies.as_sequence() {
                return proxies_array.len();
            }
        }
    }
    
    // 如果YAML解析失败，尝试简单的文本统计
    // 统计包含常见代理字段的行数
    let proxy_indicators = ["server:", "port:", "type:", "cipher:", "password:"];
    let lines_with_proxy_fields: usize = content
        .lines()
        .filter(|line| {
            let line_trimmed = line.trim();
            proxy_indicators.iter().any(|indicator| line_trimmed.contains(indicator))
        })
        .count();
    
    // 粗略估算：每个代理大约有3-5个字段
    lines_with_proxy_fields / 4
}

/// 清理过期的健康检查缓存
#[tauri::command]
pub async fn cleanup_health_check_cache() -> CmdResult<()> {
    logging!(info, Type::Cmd, true, "[健康检查] 清理缓存");
    // 这里可以实现缓存清理逻辑
    // 目前暂时返回成功
    Ok(())
}
