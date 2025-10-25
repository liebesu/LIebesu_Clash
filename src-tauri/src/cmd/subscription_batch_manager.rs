#![allow(dead_code, unused)]
#![allow(
    clippy::unwrap_used,
    clippy::too_many_arguments,
    clippy::unused_async,
    clippy::enum_variant_names,
    clippy::too_many_lines,
    clippy::needless_pass_by_value
)]
// TODO: 后续处理订阅批量管理模块 lint，当前先豁免。
use crate::config::Config;
use anyhow::{Result, anyhow};
use chrono::{DateTime, Duration, Local};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionCleanupOptions {
    pub days_threshold: i32,
    pub preview_only: bool,
    pub exclude_favorites: bool,
    pub exclude_groups: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionInfo {
    pub uid: String,
    pub name: String,
    pub url: Option<String>,
    pub last_updated: Option<String>,
    pub days_since_update: i32,
    pub size: Option<usize>,
    pub node_count: Option<usize>,
    pub is_favorite: bool,
    pub groups: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupPreview {
    pub total_subscriptions: usize,
    pub expired_subscriptions: Vec<SubscriptionInfo>,
    pub will_be_deleted: usize,
    pub will_be_kept: usize,
    pub cleanup_options: SubscriptionCleanupOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchUpdateResult {
    pub total_subscriptions: usize,
    pub successful_updates: usize,
    pub failed_updates: usize,
    pub updated_subscriptions: Vec<String>,
    pub failed_subscriptions: Vec<String>,
    pub error_messages: HashMap<String, String>,
    pub concurrency_used: usize,  // 实际使用的并发数
    pub estimated_time_remaining: Option<u64>,  // 预估剩余时间（秒）
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupResult {
    pub deleted_count: usize,
    pub deleted_subscriptions: Vec<String>,
    pub cleanup_options: SubscriptionCleanupOptions,
    pub cleanup_time: String,
}

// 获取订阅清理预览
#[tauri::command]
pub async fn get_subscription_cleanup_preview(
    options: SubscriptionCleanupOptions,
) -> Result<CleanupPreview, String> {
    let profiles_config = Config::profiles().await;
    let profiles = profiles_config.latest_ref();

    let mut all_subscriptions = Vec::new();
    let mut expired_subscriptions = Vec::new();

    let _threshold_date = Local::now() - Duration::days(options.days_threshold as i64);

    let empty_vec = Vec::new();
    let items = profiles.items.as_ref().unwrap_or(&empty_vec);
    for profile in items {
        if let Some(uid) = &profile.uid {
            let default_name = "未知订阅".to_string();
            let name = profile.name.as_ref().unwrap_or(&default_name).clone();
            let url = profile.url.clone();

            // 获取最后更新时间
            let last_updated = profile.updated;
            let last_update_time = if let Some(timestamp_str) = last_updated {
                let timestamp = timestamp_str as i64;
                DateTime::from_timestamp(timestamp, 0).map(|dt| dt.with_timezone(&Local))
            } else {
                None
            };

            let days_since_update = if let Some(update_time) = last_update_time {
                (Local::now() - update_time).num_days() as i32
            } else {
                999 // 如果没有更新时间，设为一个很大的值
            };

            // 检查是否为收藏
            let is_favorite =
                profile.selected.is_some() && !profile.selected.as_ref().unwrap().is_empty();

            // 获取分组信息（这里简化处理）
            let groups = vec![]; // TODO: 实际从分组管理中获取

            let subscription_info = SubscriptionInfo {
                uid: uid.clone(),
                name,
                url,
                last_updated: last_updated.map(|ts| {
                    DateTime::from_timestamp(ts as i64, 0)
                        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                        .unwrap_or_else(|| "Invalid timestamp".to_string())
                }),
                days_since_update,
                size: None,       // TODO: 计算文件大小
                node_count: None, // TODO: 计算节点数量
                is_favorite,
                groups: groups.clone(),
            };

            all_subscriptions.push(subscription_info.clone());

            // 检查是否过期
            let should_delete = days_since_update >= options.days_threshold
                && !(options.exclude_favorites && is_favorite)
                && !options
                    .exclude_groups
                    .iter()
                    .any(|group| groups.contains(group));

            if should_delete {
                expired_subscriptions.push(subscription_info);
            }
        }
    }

    let preview = CleanupPreview {
        total_subscriptions: all_subscriptions.len(),
        will_be_deleted: expired_subscriptions.len(),
        will_be_kept: all_subscriptions.len() - expired_subscriptions.len(),
        expired_subscriptions,
        cleanup_options: options,
    };

    Ok(preview)
}

// 批量更新所有订阅
#[tauri::command]
pub async fn update_all_subscriptions() -> Result<BatchUpdateResult, String> {
    use crate::feat::sync::schedule_subscription_sync;
    use crate::state::subscription_sync::{SUBSCRIPTION_SYNC_STORE, SyncPhase};
    use std::time::Duration;
    use tokio::time::sleep;

    let profiles_config = Config::profiles().await;
    let remote_profiles: Vec<(String, String)> = {
        let profiles = profiles_config.latest_ref();
        let empty_vec = Vec::new();
        let items = profiles.items.as_ref().unwrap_or(&empty_vec);
        items
            .iter()
            .filter(|profile| profile.url.is_some())
            .filter_map(|profile| {
                profile.uid.as_ref().map(|uid| {
                    let name = profile
                        .name
                        .as_ref()
                        .unwrap_or(&"未知订阅".to_string())
                        .clone();
                    (uid.clone(), name)
                })
            })
            .collect()
    };

    let total_count = remote_profiles.len();
    let mut updated_subscriptions = Vec::new();
    let mut failed_subscriptions = Vec::new();
    let mut error_messages = HashMap::new();

    // 使用动态并发控制进行批量更新
    let concurrency_limit = {
        let store = SUBSCRIPTION_SYNC_STORE.inner.read();
        let base_concurrency = store.preferences().max_concurrency.max(1);
        // 根据订阅数量动态调整并发数
        match total_count {
            0..=10 => base_concurrency.min(5),      // 少量订阅：最多5个并发
            11..=50 => base_concurrency.min(10),   // 中等订阅：最多10个并发
            51..=100 => base_concurrency.min(15),   // 大量订阅：最多15个并发
            _ => base_concurrency.min(20),          // 超大量订阅：最多20个并发
        }
    };

    let semaphore = Arc::new(tokio::sync::Semaphore::new(concurrency_limit));
    let mut handles = Vec::new();

    for (uid, name) in remote_profiles {
        let semaphore = semaphore.clone();
        let name_clone = name.clone();

        let handle = tokio::spawn(async move {
            let _permit = match semaphore.acquire().await {
                Ok(permit) => permit,
                Err(e) => return Err((name_clone, format!("获取信号量失败: {}", e))),
            };

            match schedule_subscription_sync(uid, SyncPhase::Background).await {
                Ok(_) => Ok(name_clone),
                Err(e) => Err((name_clone, e.to_string())),
            }
        });

        handles.push(handle);
    }

    // 等待所有任务完成
    for handle in handles {
        match handle.await {
            Ok(Ok(name)) => {
                updated_subscriptions.push(name);
            }
            Ok(Err((name, error))) => {
                failed_subscriptions.push(name.clone());
                error_messages.insert(name, error);
            }
            Err(e) => {
                let error_msg = format!("任务执行失败: {}", e);
                failed_subscriptions.push("未知订阅".to_string());
                error_messages.insert("未知订阅".to_string(), error_msg);
            }
        }
    }

    let result = BatchUpdateResult {
        total_subscriptions: total_count,
        successful_updates: updated_subscriptions.len(),
        failed_updates: failed_subscriptions.len(),
        updated_subscriptions,
        failed_subscriptions,
        error_messages,
        concurrency_used: concurrency_limit,
        estimated_time_remaining: None,  // 完成后不需要预估时间
    };

    Ok(result)
}

// 清理过期订阅
#[tauri::command]
pub async fn cleanup_expired_subscriptions(
    options: SubscriptionCleanupOptions,
) -> Result<CleanupResult, String> {
    if options.preview_only {
        return Err("预览模式，不执行实际删除操作".to_string());
    }

    let preview = get_subscription_cleanup_preview(options.clone()).await?;
    let mut deleted_subscriptions = Vec::new();

    // 执行删除操作
    for subscription in &preview.expired_subscriptions {
        match delete_subscription(&subscription.uid).await {
            Ok(_) => {
                deleted_subscriptions.push(subscription.name.clone());
            }
            Err(e) => {
                return Err(format!("删除订阅 {} 失败: {}", subscription.name, e));
            }
        }
    }

    if !deleted_subscriptions.is_empty() {
        if let Err(e) = crate::config::profiles::profiles_save_file_safe().await {
            log::error!("批量清理后保存profiles失败: {}", e);
        } else {
            log::info!("批量清理后已保存profiles文件");
        }
    }

    let result = CleanupResult {
        deleted_count: deleted_subscriptions.len(),
        deleted_subscriptions,
        cleanup_options: options,
        cleanup_time: Local::now().to_rfc3339(),
    };

    Ok(result)
}

// 清理超额订阅
#[tauri::command]
pub async fn cleanup_over_quota_subscriptions(
    options: SubscriptionCleanupOptions,
) -> Result<CleanupResult, String> {
    if options.preview_only {
        return Err("预览模式，不执行实际删除操作".to_string());
    }

    let preview = get_over_quota_cleanup_preview(options.clone()).await?;
    let mut deleted_subscriptions = Vec::new();

    // 执行删除操作
    for subscription in &preview.expired_subscriptions {
        match delete_subscription(&subscription.uid).await {
            Ok(_) => {
                deleted_subscriptions.push(subscription.name.clone());
            }
            Err(e) => {
                return Err(format!("删除订阅 {} 失败: {}", subscription.name, e));
            }
        }
    }

    let result = CleanupResult {
        deleted_count: deleted_subscriptions.len(),
        deleted_subscriptions,
        cleanup_options: options,
        cleanup_time: Local::now().to_rfc3339(),
    };

    Ok(result)
}

// 获取超额订阅清理预览
#[tauri::command]
pub async fn get_over_quota_cleanup_preview(
    options: SubscriptionCleanupOptions,
) -> Result<CleanupPreview, String> {
    let profiles_config = Config::profiles().await;

    // 提取数据以避免跨await使用不可Send的类型
    let items = {
        let profiles = profiles_config.latest_ref();
        profiles.items.clone().unwrap_or_default()
    };

    let mut all_subscriptions = Vec::new();
    let mut over_quota_subscriptions = Vec::new();

    for profile in &items {
        if let Some(uid) = &profile.uid {
            let default_name = "未知订阅".to_string();
            let name = profile.name.as_ref().unwrap_or(&default_name).clone();
            let url = profile.url.clone();

            // 获取最后更新时间
            let last_updated = profile.updated;
            let last_update_time = if let Some(timestamp_str) = last_updated {
                let timestamp = timestamp_str as i64;
                DateTime::from_timestamp(timestamp, 0).map(|dt| dt.with_timezone(&Local))
            } else {
                None
            };

            let days_since_update = if let Some(update_time) = last_update_time {
                (Local::now() - update_time).num_days() as i32
            } else {
                999 // 如果没有更新时间，设为一个很大的值
            };

            // 检查是否为收藏
            let is_favorite =
                profile.selected.is_some() && !profile.selected.as_ref().unwrap().is_empty();

            // 获取分组信息（这里简化处理）
            let groups = vec![]; // TODO: 实际从分组管理中获取

            // 检查是否超额（这里简化处理，实际应该检查流量使用情况）
            let is_over_quota = check_subscription_over_quota(profile);

            let subscription_info = SubscriptionInfo {
                uid: uid.clone(),
                name,
                url,
                last_updated: last_updated.map(|ts| {
                    DateTime::from_timestamp(ts as i64, 0)
                        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                        .unwrap_or_else(|| "Invalid timestamp".to_string())
                }),
                days_since_update,
                size: None,       // TODO: 计算文件大小
                node_count: None, // TODO: 计算节点数量
                is_favorite,
                groups: groups.clone(),
            };

            all_subscriptions.push(subscription_info.clone());

            // 检查是否超额且符合删除条件
            let should_delete = is_over_quota
                && !(options.exclude_favorites && is_favorite)
                && !options
                    .exclude_groups
                    .iter()
                    .any(|group| groups.contains(group));

            if should_delete {
                over_quota_subscriptions.push(subscription_info);
            }
        }
    }

    let preview = CleanupPreview {
        total_subscriptions: all_subscriptions.len(),
        will_be_deleted: over_quota_subscriptions.len(),
        will_be_kept: all_subscriptions.len() - over_quota_subscriptions.len(),
        expired_subscriptions: over_quota_subscriptions,
        cleanup_options: options,
    };

    Ok(preview)
}

// 检查订阅是否超额
fn check_subscription_over_quota(profile: &crate::config::PrfItem) -> bool {
    // TODO: 实际实现超额检查逻辑
    // 这里应该检查订阅的流量使用情况，判断是否超出额度

    // 简化实现：随机返回一些订阅为超额状态（用于测试）
    use rand::Rng;
    rand::thread_rng().r#gen::<f32>() < 0.1 // 10% 的概率为超额
}

// 获取订阅管理统计信息
#[tauri::command]
pub async fn get_subscription_management_stats() -> Result<serde_json::Value, String> {
    let profiles_config = Config::profiles().await;
    let profiles = profiles_config.latest_ref();

    let mut total_count = 0;
    let mut remote_count = 0;
    let mut local_count = 0;
    let mut never_updated_count = 0;
    let mut outdated_1d_count = 0;
    let mut outdated_3d_count = 0;
    let mut outdated_7d_count = 0;

    let now = Local::now();

    let empty_vec = Vec::new();
    let items = profiles.items.as_ref().unwrap_or(&empty_vec);
    for profile in items {
        total_count += 1;

        if profile.url.is_some() {
            remote_count += 1;
        } else {
            local_count += 1;
        }

        let last_update_time = if let Some(timestamp) = profile.updated {
            DateTime::from_timestamp(timestamp as i64, 0).map(|dt| dt.with_timezone(&Local))
        } else {
            None
        };

        if let Some(update_time) = last_update_time {
            let days_since_update = (now - update_time).num_days();

            if days_since_update >= 1 {
                outdated_1d_count += 1;
            }
            if days_since_update >= 3 {
                outdated_3d_count += 1;
            }
            if days_since_update >= 7 {
                outdated_7d_count += 1;
            }
        } else {
            never_updated_count += 1;
        }
    }

    let stats = serde_json::json!({
        "total_subscriptions": total_count,
        "remote_subscriptions": remote_count,
        "local_subscriptions": local_count,
        "never_updated": never_updated_count,
        "outdated_1d": outdated_1d_count,
        "outdated_3d": outdated_3d_count,
        "outdated_7d": outdated_7d_count,
        "up_to_date": total_count - never_updated_count - outdated_1d_count,
        "last_check": now.to_rfc3339(),
    });

    Ok(stats)
}

// 设置自动清理规则
#[tauri::command]
pub async fn set_auto_cleanup_rules(
    enabled: bool,
    cleanup_options: SubscriptionCleanupOptions,
) -> Result<(), String> {
    // TODO: 保存自动清理规则到配置文件
    // 这里应该与任务管理系统集成，创建定时清理任务

    if enabled {
        // 创建定时清理任务
        log::info!("已启用自动清理规则: {:?}", cleanup_options);
    } else {
        // 禁用定时清理任务
        log::info!("已禁用自动清理规则");
    }

    Ok(())
}

// 获取自动清理规则
#[tauri::command]
pub async fn get_auto_cleanup_rules() -> Result<serde_json::Value, String> {
    // TODO: 从配置文件读取自动清理规则
    let rules = serde_json::json!({
        "enabled": false,
        "cleanup_options": {
            "days_threshold": 7,
            "preview_only": false,
            "exclude_favorites": true,
            "exclude_groups": []
        },
        "last_cleanup": null,
        "next_cleanup": null
    });

    Ok(rules)
}

// 辅助函数：更新单个订阅
async fn update_single_subscription(_uid: &str) -> Result<()> {
    // TODO: 实际实现订阅更新逻辑
    // 这里应该调用现有的订阅更新API

    // 模拟更新过程
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // 50% 的成功率（用于测试）
    use rand::Rng;
    if rand::thread_rng().r#gen::<f32>() > 0.5 {
        Ok(())
    } else {
        Err(anyhow!("网络连接失败"))
    }
}

// 辅助函数：删除订阅
async fn delete_subscription(uid: &str) -> Result<()> {
    use crate::config::profiles::profiles_delete_item_safe;
    use crate::handle::Handle;

    log::info!("删除订阅: {}", uid);

    // 调用现有的删除订阅API
    let should_update = profiles_delete_item_safe(uid.to_string()).await?;

    if should_update {
        // 更新配置并刷新Clash
        match crate::core::CoreManager::global().update_config().await {
            Ok((true, _)) => {
                // 配置验证通过并更新成功
                Handle::refresh_clash();
                // 通知前端配置已更改
                Handle::notify_profile_changed("deleted".to_string());
                log::info!("订阅 {} 删除成功，配置已更新", uid);
            }
            Ok((false, error_msg)) => {
                // 配置验证失败
                log::error!("配置验证失败: {}", error_msg);
                // 仍然通知前端刷新，但显示警告
                Handle::notify_profile_changed("deleted".to_string());
                return Err(anyhow::anyhow!("配置验证失败: {}", error_msg));
            }
            Err(e) => {
                log::error!("更新配置失败: {}", e);
                // 尝试刷新以恢复状态
                Handle::refresh_clash();
                Handle::notify_profile_changed("deleted".to_string());
                return Err(anyhow::anyhow!("更新配置失败: {}", e));
            }
        }
    } else {
        // 即使不需要更新核心配置，也要通知前端刷新列表
        Handle::notify_profile_changed("deleted".to_string());
        log::info!("订阅 {} 删除成功", uid);
    }

    Ok(())
}
