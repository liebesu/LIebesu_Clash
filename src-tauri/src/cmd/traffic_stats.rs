use super::CmdResult;
use crate::{
    config::Config,
    utils::logging::Type,
    logging,
};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use once_cell::sync::Lazy;

/// 流量统计数据存储
static TRAFFIC_STATS: Lazy<Arc<RwLock<TrafficStatsStorage>>> = 
    Lazy::new(|| Arc::new(RwLock::new(TrafficStatsStorage::new())));

/// 流量单位枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TrafficUnit {
    Bytes,
    KB,
    MB,
    GB,
    TB,
}

/// 流量使用记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficRecord {
    pub subscription_uid: String,
    pub subscription_name: String,
    pub upload_bytes: u64,
    pub download_bytes: u64,
    pub total_bytes: u64,
    pub session_duration_seconds: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub avg_speed_mbps: f64,
    pub peak_speed_mbps: f64,
}

/// 订阅流量统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionTrafficStats {
    pub subscription_uid: String,
    pub subscription_name: String,
    pub total_upload_bytes: u64,
    pub total_download_bytes: u64,
    pub total_bytes: u64,
    pub session_count: u64,
    pub total_duration_seconds: u64,
    pub avg_speed_mbps: f64,
    pub peak_speed_mbps: f64,
    pub first_used: Option<i64>,
    pub last_used: Option<i64>,
    pub daily_usage: Vec<DailyUsage>,
    pub monthly_usage: Vec<MonthlyUsage>,
    pub quota_info: Option<QuotaInfo>,
}

/// 每日使用量
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyUsage {
    pub date: String, // YYYY-MM-DD
    pub upload_bytes: u64,
    pub download_bytes: u64,
    pub total_bytes: u64,
    pub session_count: u32,
    pub duration_seconds: u64,
}

/// 每月使用量
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlyUsage {
    pub month: String, // YYYY-MM
    pub upload_bytes: u64,
    pub download_bytes: u64,
    pub total_bytes: u64,
    pub session_count: u32,
    pub duration_seconds: u64,
}

/// 配额信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaInfo {
    pub total_quota_bytes: Option<u64>,
    pub used_quota_bytes: u64,
    pub remaining_quota_bytes: Option<u64>,
    pub quota_reset_date: Option<i64>,
    pub expire_date: Option<i64>,
    pub warning_threshold: f64, // 0.0-1.0
    pub is_unlimited: bool,
}

/// 流量警告
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficAlert {
    pub alert_id: String,
    pub subscription_uid: String,
    pub subscription_name: String,
    pub alert_type: AlertType,
    pub message: String,
    pub threshold_value: f64,
    pub current_value: f64,
    pub created_at: i64,
    pub is_read: bool,
    pub severity: AlertSeverity,
}

/// 警告类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertType {
    QuotaUsage,      // 配额使用警告
    ExpirationDate,  // 到期日期警告
    HighUsage,       // 高流量使用警告
    SpeedDrop,       // 速度下降警告
    ConnectionIssue, // 连接问题警告
}

/// 警告严重程度
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertSeverity {
    Info,
    Warning,
    Critical,
    Emergency,
}

/// 流量概览
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficOverview {
    pub total_subscriptions: usize,
    pub active_subscriptions: usize,
    pub total_upload_bytes: u64,
    pub total_download_bytes: u64,
    pub total_bytes: u64,
    pub avg_speed_mbps: f64,
    pub peak_speed_mbps: f64,
    pub total_sessions: u64,
    pub total_duration_seconds: u64,
    pub today_usage: u64,
    pub this_month_usage: u64,
    pub alerts_count: usize,
    pub critical_alerts_count: usize,
}

/// 流量预测
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficPrediction {
    pub subscription_uid: String,
    pub predicted_monthly_usage: u64,
    pub predicted_exhaust_date: Option<i64>,
    pub recommended_plan: Option<String>,
    pub confidence_level: f64, // 0.0-1.0
    pub trend_direction: TrendDirection,
}

/// 趋势方向
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TrendDirection {
    Increasing,
    Stable,
    Decreasing,
}

/// 流量统计存储
struct TrafficStatsStorage {
    records: HashMap<String, Vec<TrafficRecord>>,
    stats: HashMap<String, SubscriptionTrafficStats>,
    alerts: Vec<TrafficAlert>,
    total_upload: AtomicU64,
    total_download: AtomicU64,
}

impl TrafficStatsStorage {
    fn new() -> Self {
        Self {
            records: HashMap::new(),
            stats: HashMap::new(),
            alerts: Vec::new(),
            total_upload: AtomicU64::new(0),
            total_download: AtomicU64::new(0),
        }
    }
}

/// 记录流量使用
#[tauri::command]
pub async fn record_traffic_usage(
    subscription_uid: String,
    upload_bytes: u64,
    download_bytes: u64,
    duration_seconds: u64,
) -> CmdResult<()> {
    logging!(info, Type::Cmd, true, "[流量统计] 记录流量使用: {}, 上传: {}B, 下载: {}B", 
        subscription_uid, upload_bytes, download_bytes);

    let mut storage = TRAFFIC_STATS.write().await;
    
    // 获取订阅名称
    let subscription_name = get_subscription_name(&subscription_uid).await
        .unwrap_or_else(|| "Unknown".to_string());

    let record = TrafficRecord {
        subscription_uid: subscription_uid.clone(),
        subscription_name: subscription_name.clone(),
        upload_bytes,
        download_bytes,
        total_bytes: upload_bytes + download_bytes,
        session_duration_seconds: duration_seconds,
        start_time: chrono::Utc::now().timestamp() - duration_seconds as i64,
        end_time: chrono::Utc::now().timestamp(),
        avg_speed_mbps: calculate_avg_speed(upload_bytes + download_bytes, duration_seconds),
        peak_speed_mbps: 0.0, // TODO: 实现峰值速度计算
    };

    // 添加记录
    storage.records.entry(subscription_uid.clone())
        .or_insert_with(Vec::new)
        .push(record);

    // 更新统计
    update_subscription_stats(&mut storage, &subscription_uid, &subscription_name).await
        .map_err(|e| format!("Failed to update subscription stats: {}", e))?;

    // 更新全局计数器
    storage.total_upload.fetch_add(upload_bytes, Ordering::Relaxed);
    storage.total_download.fetch_add(download_bytes, Ordering::Relaxed);

    // 检查并生成警告
    check_and_generate_alerts(&mut storage, &subscription_uid).await
        .map_err(|e| format!("Failed to check and generate alerts: {}", e))?;

    Ok(())
}

/// 获取订阅流量统计
#[tauri::command]
pub async fn get_subscription_traffic_stats(subscription_uid: String) -> CmdResult<SubscriptionTrafficStats> {
    logging!(info, Type::Cmd, true, "[流量统计] 获取订阅统计: {}", subscription_uid);

    let storage = TRAFFIC_STATS.read().await;
    
    match storage.stats.get(&subscription_uid) {
        Some(stats) => Ok(stats.clone()),
        None => {
            // 如果没有统计数据，返回默认值
            let subscription_name = get_subscription_name(&subscription_uid).await
                .unwrap_or_else(|| "Unknown".to_string());
            
            Ok(SubscriptionTrafficStats {
                subscription_uid,
                subscription_name,
                total_upload_bytes: 0,
                total_download_bytes: 0,
                total_bytes: 0,
                session_count: 0,
                total_duration_seconds: 0,
                avg_speed_mbps: 0.0,
                peak_speed_mbps: 0.0,
                first_used: None,
                last_used: None,
                daily_usage: Vec::new(),
                monthly_usage: Vec::new(),
                quota_info: None,
            })
        }
    }
}

/// 获取所有订阅流量统计
#[tauri::command]
pub async fn get_all_traffic_stats() -> CmdResult<Vec<SubscriptionTrafficStats>> {
    logging!(info, Type::Cmd, true, "[流量统计] 获取所有统计");

    let storage = TRAFFIC_STATS.read().await;
    let stats: Vec<SubscriptionTrafficStats> = storage.stats.values().cloned().collect();
    
    Ok(stats)
}

/// 获取流量概览
#[tauri::command]
pub async fn get_traffic_overview() -> CmdResult<TrafficOverview> {
    logging!(info, Type::Cmd, true, "[流量统计] 获取流量概览");

    let storage = TRAFFIC_STATS.read().await;
    
    let total_upload = storage.total_upload.load(Ordering::Relaxed);
    let total_download = storage.total_download.load(Ordering::Relaxed);
    let total_bytes = total_upload + total_download;
    
    let total_subscriptions = storage.stats.len();
    let active_subscriptions = storage.stats.values()
        .filter(|s| s.last_used.is_some() && 
            chrono::Utc::now().timestamp() - s.last_used.unwrap() < 24 * 3600)
        .count();

    let total_sessions: u64 = storage.stats.values()
        .map(|s| s.session_count)
        .sum();

    let total_duration: u64 = storage.stats.values()
        .map(|s| s.total_duration_seconds)
        .sum();

    let avg_speed_mbps = if total_duration > 0 {
        calculate_avg_speed(total_bytes, total_duration)
    } else {
        0.0
    };

    let peak_speed_mbps = storage.stats.values()
        .map(|s| s.peak_speed_mbps)
        .fold(0.0, f64::max);

    // 计算今日和本月使用量
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let this_month = chrono::Utc::now().format("%Y-%m").to_string();
    
    let today_usage: u64 = storage.stats.values()
        .flat_map(|s| &s.daily_usage)
        .filter(|d| d.date == today)
        .map(|d| d.total_bytes)
        .sum();

    let this_month_usage: u64 = storage.stats.values()
        .flat_map(|s| &s.monthly_usage)
        .filter(|m| m.month == this_month)
        .map(|m| m.total_bytes)
        .sum();

    let alerts_count = storage.alerts.len();
    let critical_alerts_count = storage.alerts.iter()
        .filter(|a| matches!(a.severity, AlertSeverity::Critical | AlertSeverity::Emergency))
        .count();

    Ok(TrafficOverview {
        total_subscriptions,
        active_subscriptions,
        total_upload_bytes: total_upload,
        total_download_bytes: total_download,
        total_bytes,
        avg_speed_mbps,
        peak_speed_mbps,
        total_sessions,
        total_duration_seconds: total_duration,
        today_usage,
        this_month_usage,
        alerts_count,
        critical_alerts_count,
    })
}

/// 获取流量警告
#[tauri::command]
pub async fn get_traffic_alerts(include_read: Option<bool>) -> CmdResult<Vec<TrafficAlert>> {
    logging!(info, Type::Cmd, true, "[流量统计] 获取流量警告");

    let storage = TRAFFIC_STATS.read().await;
    let include_read = include_read.unwrap_or(false);
    
    let alerts: Vec<TrafficAlert> = storage.alerts.iter()
        .filter(|a| include_read || !a.is_read)
        .cloned()
        .collect();

    Ok(alerts)
}

/// 标记警告为已读
#[tauri::command]
pub async fn mark_alert_as_read(alert_id: String) -> CmdResult<()> {
    logging!(info, Type::Cmd, true, "[流量统计] 标记警告已读: {}", alert_id);

    let mut storage = TRAFFIC_STATS.write().await;
    
    if let Some(alert) = storage.alerts.iter_mut().find(|a| a.alert_id == alert_id) {
        alert.is_read = true;
    }

    Ok(())
}

/// 清理历史数据
#[tauri::command]
pub async fn cleanup_traffic_history(days_to_keep: u32) -> CmdResult<u64> {
    logging!(info, Type::Cmd, true, "[流量统计] 清理历史数据，保留{}天", days_to_keep);

    let mut storage = TRAFFIC_STATS.write().await;
    let cutoff_time = chrono::Utc::now().timestamp() - (days_to_keep as i64 * 24 * 3600);
    let mut cleaned_count = 0u64;

    // 清理记录
    for records in storage.records.values_mut() {
        let original_len = records.len();
        records.retain(|r| r.end_time >= cutoff_time);
        cleaned_count += (original_len - records.len()) as u64;
    }

    // 清理警告
    let original_alerts_len = storage.alerts.len();
    storage.alerts.retain(|a| a.created_at >= cutoff_time);
    cleaned_count += (original_alerts_len - storage.alerts.len()) as u64;

    // 重新计算统计数据
    for (uid, records) in &storage.records {
        if !records.is_empty() {
            let subscription_name = get_subscription_name(uid).await
                .unwrap_or_else(|| "Unknown".to_string());
            update_subscription_stats(&mut storage, uid, &subscription_name).await
                .map_err(|e| format!("Failed to update subscription stats: {}", e))?;
        }
    }

    logging!(info, Type::Cmd, true, "[流量统计] 清理完成，删除{}条记录", cleaned_count);
    Ok(cleaned_count)
}

/// 导出流量数据
#[tauri::command]
pub async fn export_traffic_data(
    subscription_uid: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> CmdResult<String> {
    logging!(info, Type::Cmd, true, "[流量统计] 导出流量数据");

    let storage = TRAFFIC_STATS.read().await;
    
    // 准备数据导出
    let mut export_data = Vec::new();
    
    let records_to_export: Vec<&TrafficRecord> = if let Some(uid) = &subscription_uid {
        storage.records.get(uid).map(|r| r.iter().collect()).unwrap_or_default()
    } else {
        storage.records.values().flat_map(|r| r.iter()).collect()
    };

    // 应用日期过滤
    let start_timestamp = start_date.as_ref()
        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .map(|d| d.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp())
        .unwrap_or(0);

    let end_timestamp = end_date.as_ref()
        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .map(|d| d.and_hms_opt(23, 59, 59).unwrap().and_utc().timestamp())
        .unwrap_or(i64::MAX);

    for record in records_to_export {
        if record.start_time >= start_timestamp && record.end_time <= end_timestamp {
            export_data.push(record);
        }
    }

    // 转换为JSON格式
    let json_data = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("导出数据序列化失败: {}", e))?;

    Ok(json_data)
}

/// 设置订阅配额信息
#[tauri::command]
pub async fn set_subscription_quota(
    subscription_uid: String,
    quota_info: QuotaInfo,
) -> CmdResult<()> {
    logging!(info, Type::Cmd, true, "[流量统计] 设置订阅配额: {}", subscription_uid);

    let mut storage = TRAFFIC_STATS.write().await;
    
    if let Some(stats) = storage.stats.get_mut(&subscription_uid) {
        stats.quota_info = Some(quota_info);
    } else {
        // 如果统计不存在，创建新的
        let subscription_name = get_subscription_name(&subscription_uid).await
            .unwrap_or_else(|| "Unknown".to_string());
        
        let stats = SubscriptionTrafficStats {
            subscription_uid: subscription_uid.clone(),
            subscription_name,
            total_upload_bytes: 0,
            total_download_bytes: 0,
            total_bytes: 0,
            session_count: 0,
            total_duration_seconds: 0,
            avg_speed_mbps: 0.0,
            peak_speed_mbps: 0.0,
            first_used: None,
            last_used: None,
            daily_usage: Vec::new(),
            monthly_usage: Vec::new(),
            quota_info: Some(quota_info),
        };
        
        storage.stats.insert(subscription_uid, stats);
    }

    Ok(())
}

/// 获取流量预测
#[tauri::command]
pub async fn get_traffic_prediction(subscription_uid: String) -> CmdResult<TrafficPrediction> {
    logging!(info, Type::Cmd, true, "[流量统计] 获取流量预测: {}", subscription_uid);

    let storage = TRAFFIC_STATS.read().await;
    
    if let Some(stats) = storage.stats.get(&subscription_uid) {
        let prediction = calculate_traffic_prediction(stats).await;
        Ok(prediction)
    } else {
        Err("订阅统计数据不存在".to_string())
    }
}

// ===== 内部辅助函数 =====

/// 获取订阅名称
async fn get_subscription_name(subscription_uid: &str) -> Option<String> {
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    
    profiles_ref.items
        .as_ref()
        .unwrap_or(&Vec::new())
        .iter()
        .find(|item| item.uid.as_deref() == Some(subscription_uid))
        .and_then(|item| item.name.clone())
}

/// 计算平均速度（Mbps）
fn calculate_avg_speed(bytes: u64, duration_seconds: u64) -> f64 {
    if duration_seconds == 0 {
        return 0.0;
    }
    
    let bits = bytes as f64 * 8.0;
    let mbits = bits / (1024.0 * 1024.0);
    mbits / duration_seconds as f64
}

/// 更新订阅统计
async fn update_subscription_stats(
    storage: &mut TrafficStatsStorage,
    subscription_uid: &str,
    subscription_name: &str,
) -> Result<()> {
    let empty_vec = Vec::new();
    let records = storage.records.get(subscription_uid).unwrap_or(&empty_vec);
    
    if records.is_empty() {
        return Ok(());
    }

    let total_upload: u64 = records.iter().map(|r| r.upload_bytes).sum();
    let total_download: u64 = records.iter().map(|r| r.download_bytes).sum();
    let total_bytes = total_upload + total_download;
    let session_count = records.len() as u64;
    let total_duration: u64 = records.iter().map(|r| r.session_duration_seconds).sum();
    
    let avg_speed_mbps = if total_duration > 0 {
        calculate_avg_speed(total_bytes, total_duration)
    } else {
        0.0
    };
    
    let peak_speed_mbps = records.iter()
        .map(|r| r.peak_speed_mbps)
        .fold(0.0, f64::max);

    let first_used = records.iter().map(|r| r.start_time).min();
    let last_used = records.iter().map(|r| r.end_time).max();

    // 计算每日和每月使用量
    let daily_usage = calculate_daily_usage(records);
    let monthly_usage = calculate_monthly_usage(records);

    let stats = SubscriptionTrafficStats {
        subscription_uid: subscription_uid.to_string(),
        subscription_name: subscription_name.to_string(),
        total_upload_bytes: total_upload,
        total_download_bytes: total_download,
        total_bytes,
        session_count,
        total_duration_seconds: total_duration,
        avg_speed_mbps,
        peak_speed_mbps,
        first_used,
        last_used,
        daily_usage,
        monthly_usage,
        quota_info: storage.stats.get(subscription_uid)
            .and_then(|s| s.quota_info.clone()),
    };

    storage.stats.insert(subscription_uid.to_string(), stats);
    Ok(())
}

/// 计算每日使用量
fn calculate_daily_usage(records: &[TrafficRecord]) -> Vec<DailyUsage> {
    let mut daily_map: HashMap<String, DailyUsage> = HashMap::new();
    
    for record in records {
        let date = chrono::DateTime::from_timestamp(record.start_time, 0)
            .unwrap_or_default()
            .format("%Y-%m-%d")
            .to_string();
        
        let entry = daily_map.entry(date.clone()).or_insert(DailyUsage {
            date,
            upload_bytes: 0,
            download_bytes: 0,
            total_bytes: 0,
            session_count: 0,
            duration_seconds: 0,
        });
        
        entry.upload_bytes += record.upload_bytes;
        entry.download_bytes += record.download_bytes;
        entry.total_bytes += record.total_bytes;
        entry.session_count += 1;
        entry.duration_seconds += record.session_duration_seconds;
    }
    
    let mut daily_usage: Vec<DailyUsage> = daily_map.into_values().collect();
    daily_usage.sort_by(|a, b| a.date.cmp(&b.date));
    daily_usage
}

/// 计算每月使用量
fn calculate_monthly_usage(records: &[TrafficRecord]) -> Vec<MonthlyUsage> {
    let mut monthly_map: HashMap<String, MonthlyUsage> = HashMap::new();
    
    for record in records {
        let month = chrono::DateTime::from_timestamp(record.start_time, 0)
            .unwrap_or_default()
            .format("%Y-%m")
            .to_string();
        
        let entry = monthly_map.entry(month.clone()).or_insert(MonthlyUsage {
            month,
            upload_bytes: 0,
            download_bytes: 0,
            total_bytes: 0,
            session_count: 0,
            duration_seconds: 0,
        });
        
        entry.upload_bytes += record.upload_bytes;
        entry.download_bytes += record.download_bytes;
        entry.total_bytes += record.total_bytes;
        entry.session_count += 1;
        entry.duration_seconds += record.session_duration_seconds;
    }
    
    let mut monthly_usage: Vec<MonthlyUsage> = monthly_map.into_values().collect();
    monthly_usage.sort_by(|a, b| a.month.cmp(&b.month));
    monthly_usage
}

/// 检查并生成警告
async fn check_and_generate_alerts(
    storage: &mut TrafficStatsStorage,
    subscription_uid: &str,
) -> Result<()> {
    if let Some(stats) = storage.stats.get(subscription_uid) {
        if let Some(quota_info) = &stats.quota_info {
            // 检查配额使用警告
            if let Some(total_quota) = quota_info.total_quota_bytes {
                let usage_ratio = stats.total_bytes as f64 / total_quota as f64;
                
                if usage_ratio >= quota_info.warning_threshold && !quota_info.is_unlimited {
                    let alert = TrafficAlert {
                        alert_id: uuid::Uuid::new_v4().to_string(),
                        subscription_uid: subscription_uid.to_string(),
                        subscription_name: stats.subscription_name.clone(),
                        alert_type: AlertType::QuotaUsage,
                        message: format!("配额使用已达到 {:.1}%", usage_ratio * 100.0),
                        threshold_value: quota_info.warning_threshold,
                        current_value: usage_ratio,
                        created_at: chrono::Utc::now().timestamp(),
                        is_read: false,
                        severity: if usage_ratio >= 0.9 {
                            AlertSeverity::Critical
                        } else if usage_ratio >= 0.8 {
                            AlertSeverity::Warning
                        } else {
                            AlertSeverity::Info
                        },
                    };
                    
                    // 避免重复警告
                    if !storage.alerts.iter().any(|a| 
                        a.subscription_uid == subscription_uid && 
                        matches!(a.alert_type, AlertType::QuotaUsage) &&
                        !a.is_read
                    ) {
                        storage.alerts.push(alert);
                    }
                }
            }

            // 检查到期警告
            if let Some(expire_date) = quota_info.expire_date {
                let days_until_expire = (expire_date - chrono::Utc::now().timestamp()) / (24 * 3600);
                
                if days_until_expire <= 7 && days_until_expire > 0 {
                    let alert = TrafficAlert {
                        alert_id: uuid::Uuid::new_v4().to_string(),
                        subscription_uid: subscription_uid.to_string(),
                        subscription_name: stats.subscription_name.clone(),
                        alert_type: AlertType::ExpirationDate,
                        message: format!("订阅将在 {} 天后到期", days_until_expire),
                        threshold_value: 7.0,
                        current_value: days_until_expire as f64,
                        created_at: chrono::Utc::now().timestamp(),
                        is_read: false,
                        severity: if days_until_expire <= 3 {
                            AlertSeverity::Critical
                        } else {
                            AlertSeverity::Warning
                        },
                    };
                    
                    // 避免重复警告
                    if !storage.alerts.iter().any(|a| 
                        a.subscription_uid == subscription_uid && 
                        matches!(a.alert_type, AlertType::ExpirationDate) &&
                        !a.is_read
                    ) {
                        storage.alerts.push(alert);
                    }
                }
            }
        }
    }
    
    Ok(())
}

/// 计算流量预测
async fn calculate_traffic_prediction(stats: &SubscriptionTrafficStats) -> TrafficPrediction {
    // 简单的线性预测算法
    let recent_usage = stats.monthly_usage.iter()
        .rev()
        .take(3)
        .map(|m| m.total_bytes)
        .collect::<Vec<_>>();
    
    let predicted_monthly_usage = if recent_usage.len() >= 2 {
        let avg_usage = recent_usage.iter().sum::<u64>() / recent_usage.len() as u64;
        avg_usage
    } else {
        stats.total_bytes / std::cmp::max(1, stats.monthly_usage.len() as u64)
    };
    
    // 预测耗尽日期
    let predicted_exhaust_date = if let Some(quota_info) = &stats.quota_info {
        if let Some(total_quota) = quota_info.total_quota_bytes {
            if predicted_monthly_usage > 0 {
                let remaining = total_quota.saturating_sub(stats.total_bytes);
                let months_left = remaining / predicted_monthly_usage;
                Some(chrono::Utc::now().timestamp() + (months_left as i64 * 30 * 24 * 3600))
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };
    
    // 计算趋势
    let trend_direction = if recent_usage.len() >= 2 {
        let first_half_avg = recent_usage.iter().take(recent_usage.len() / 2).sum::<u64>() as f64 / (recent_usage.len() / 2) as f64;
        let second_half_avg = recent_usage.iter().skip(recent_usage.len() / 2).sum::<u64>() as f64 / (recent_usage.len() - recent_usage.len() / 2) as f64;
        
        if second_half_avg > first_half_avg * 1.1 {
            TrendDirection::Increasing
        } else if second_half_avg < first_half_avg * 0.9 {
            TrendDirection::Decreasing
        } else {
            TrendDirection::Stable
        }
    } else {
        TrendDirection::Stable
    };
    
    TrafficPrediction {
        subscription_uid: stats.subscription_uid.clone(),
        predicted_monthly_usage,
        predicted_exhaust_date,
        recommended_plan: None, // TODO: 实现套餐推荐逻辑
        confidence_level: if recent_usage.len() >= 3 { 0.8 } else { 0.5 },
        trend_direction,
    }
}
