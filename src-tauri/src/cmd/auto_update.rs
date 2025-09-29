use super::CmdResult;
use anyhow::Result as AnyResult;
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;
use crate::{logging, utils::logging::Type};

/// 更新信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
    pub published_at: Option<String>,
    pub size_bytes: Option<u64>,
    pub signature: Option<String>,
    pub auto_update_enabled: bool,
    pub last_check_time: Option<u64>,
}

/// 更新配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateConfig {
    pub auto_check_enabled: bool,
    pub auto_install_enabled: bool,
    pub check_interval_hours: u64,
    pub notification_enabled: bool,
    pub beta_channel_enabled: bool,
    pub last_check_timestamp: Option<u64>,
    pub skip_version: Option<String>,
}

impl Default for UpdateConfig {
    fn default() -> Self {
        Self {
            auto_check_enabled: true,
            auto_install_enabled: false, // 默认手动安装，保证用户控制
            check_interval_hours: 24,    // 每天检查一次
            notification_enabled: true,
            beta_channel_enabled: false,
            last_check_timestamp: None,
            skip_version: None,
        }
    }
}

/// 检查更新
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> CmdResult<UpdateInfo> {
    logging!(info, Type::System, "开始检查应用更新");

    let current_version = app.package_info().version.to_string();
    
    // 创建默认的更新信息
    let mut update_info = UpdateInfo {
        available: false,
        current_version: current_version.clone(),
        latest_version: None,
        release_notes: None,
        download_url: None,
        published_at: None,
        size_bytes: None,
        signature: None,
        auto_update_enabled: is_auto_update_enabled(&app).await,
        last_check_time: Some(current_timestamp()),
    };

    // 检查更新
    match app.updater_builder().build() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    logging!(info, Type::System, "发现新版本: {}", update.version);
                    
                    update_info.available = true;
                    update_info.latest_version = Some(update.version.clone());
                    update_info.release_notes = update.body.clone();
                    update_info.published_at = update.date.map(|d| d.to_string());
                    
                    // 保存检查时间戳
                    save_last_check_timestamp(&app).await;
                    
                    // 触发更新通知事件
                    let _ = app.emit("update-available", &update_info);
                    
                    logging!(info, Type::System, "更新检查完成，发现新版本");
                }
                Ok(None) => {
                    logging!(info, Type::System, "当前已是最新版本");
                    save_last_check_timestamp(&app).await;
                }
                Err(e) => {
                    logging!(warn, Type::System, "检查更新失败: {}", e);
                    return Err(format!("检查更新失败: {}", e));
                }
            }
        }
        Err(e) => {
            logging!(error, Type::System, "创建更新器失败: {}", e);
            return Err(format!("创建更新器失败: {}", e));
        }
    }

    Ok(update_info)
}

/// 下载并安装更新
#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> CmdResult<()> {
    logging!(info, Type::System, "开始下载并安装更新");

    match app.updater_builder().build() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    logging!(info, Type::System, "准备下载更新: {}", update.version);
                    
                    // 触发下载开始事件
                    let _ = app.emit("update-download-started", update.version.clone());
                    
                    // 下载并安装
                    match update.download_and_install(
                        |chunk_length, content_length| {
                            // 发送下载进度事件
                            if let Some(total) = content_length {
                                let progress = (chunk_length as f64 / total as f64 * 100.0) as u32;
                                let _ = app.emit("update-download-progress", progress);
                            }
                        },
                        || {
                            // 下载完成回调
                            println!("Update download completed");
                        }
                    ).await {
                        Ok(()) => {
                            logging!(info, Type::System, "更新下载并安装成功");
                            let _ = app.emit("update-install-success", ());
                            
                            // 重启应用以应用更新
                            app.restart();
                        }
                        Err(e) => {
                            logging!(error, Type::System, "更新安装失败: {}", e);
                            let _ = app.emit("update-install-failed", e.to_string());
                            return Err(format!("更新安装失败: {}", e));
                        }
                    }
                }
                Ok(None) => {
                    return Err("没有可用的更新".to_string());
                }
                Err(e) => {
                    logging!(error, Type::System, "检查更新失败: {}", e);
                    return Err(format!("检查更新失败: {}", e));
                }
            }
        }
        Err(e) => {
            logging!(error, Type::System, "创建更新器失败: {}", e);
            return Err(format!("创建更新器失败: {}", e));
        }
    }
}

/// 获取更新配置
#[tauri::command]
pub async fn get_update_config(app: AppHandle) -> CmdResult<UpdateConfig> {
    logging!(debug, Type::System, "获取更新配置");
    
    let config = load_update_config(&app).await;
    Ok(config)
}

/// 设置更新配置
#[tauri::command]
pub async fn set_update_config(app: AppHandle, config: UpdateConfig) -> CmdResult<()> {
    logging!(info, Type::System, "保存更新配置");
    
    save_update_config(&app, &config).await
        .map_err(|e| format!("保存更新配置失败: {}", e))?;
    
    // 如果启用了自动检查，立即开始检查
    if config.auto_check_enabled {
        let app_clone = app.clone();
        tokio::spawn(async move {
            if let Err(e) = check_for_updates(app_clone).await {
                logging!(warn, Type::System, "自动检查更新失败: {}", e);
            }
        });
    }
    
    Ok(())
}

/// 跳过指定版本的更新
#[tauri::command]
pub async fn skip_update_version(app: AppHandle, version: String) -> CmdResult<()> {
    logging!(info, Type::System, "跳过更新版本: {}", version);
    
    let mut config = load_update_config(&app).await;
    config.skip_version = Some(version.clone());
    
    save_update_config(&app, &config).await
        .map_err(|e| format!("保存跳过版本配置失败: {}", e))?;
    
    Ok(())
}

/// 获取更新历史
#[tauri::command]
pub async fn get_update_history(app: AppHandle) -> CmdResult<Vec<UpdateHistoryItem>> {
    logging!(debug, Type::System, "获取更新历史");
    
    let history = load_update_history(&app).await;
    Ok(history)
}

/// 更新历史项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateHistoryItem {
    pub version: String,
    pub timestamp: u64,
    pub status: UpdateStatus,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UpdateStatus {
    Available,
    Downloaded,
    Installed,
    Failed,
    Skipped,
}

/// 启动自动更新检查器
pub async fn start_auto_update_checker(app: AppHandle) {
    logging!(info, Type::System, "启动自动更新检查器");
    
    let app_clone = app.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3600)); // 每小时检查一次
        
        loop {
            interval.tick().await;
            
            let config = load_update_config(&app_clone).await;
            
            // 检查是否需要进行更新检查
            if should_check_for_updates(&config).await {
                logging!(debug, Type::System, "自动检查更新中...");
                
                match check_for_updates(app_clone.clone()).await {
                    Ok(update_info) => {
                        if update_info.available {
                            // 如果启用了自动安装，则自动下载并安装
                            if config.auto_install_enabled {
                                logging!(info, Type::System, "自动安装更新中...");
                                
                                if let Err(e) = download_and_install_update(app_clone.clone()).await {
                                    logging!(error, Type::System, "自动安装更新失败: {}", e);
                                }
                            } else {
                                // 只通知用户有更新可用
                                let _ = app_clone.emit("update-notification", update_info);
                            }
                        }
                    }
                    Err(e) => {
                        logging!(warn, Type::System, "自动检查更新失败: {}", e);
                    }
                }
            }
        }
    });
}

// === 辅助函数 ===

async fn is_auto_update_enabled(_app: &AppHandle) -> bool {
    // 检查Tauri配置中是否启用了自动更新
    // 这里需要根据实际的Tauri配置来实现
    true // 默认启用
}

async fn should_check_for_updates(config: &UpdateConfig) -> bool {
    if !config.auto_check_enabled {
        return false;
    }
    
    if let Some(last_check) = config.last_check_timestamp {
        let current_time = current_timestamp();
        let elapsed_hours = (current_time - last_check) / 3600;
        elapsed_hours >= config.check_interval_hours
    } else {
        true // 从未检查过，应该检查
    }
}

async fn load_update_config(_app: &AppHandle) -> UpdateConfig {
    // 从配置文件加载更新配置
    // 这里可以集成到现有的Config系统中
    UpdateConfig::default()
}

async fn save_update_config(_app: &AppHandle, _config: &UpdateConfig) -> AnyResult<()> {
    // 保存更新配置到文件
    // 这里可以集成到现有的Config系统中
    Ok(())
}

async fn save_last_check_timestamp(app: &AppHandle) {
    let mut config = load_update_config(app).await;
    config.last_check_timestamp = Some(current_timestamp());
    let _ = save_update_config(app, &config).await;
}

async fn load_update_history(_app: &AppHandle) -> Vec<UpdateHistoryItem> {
    // 从文件加载更新历史
    // 这里可以实现持久化存储
    vec![]
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// 初始化自动更新系统
pub async fn initialize_auto_updater(app: AppHandle) {
    logging!(info, Type::System, "初始化自动更新系统");
    
    // 启动自动更新检查器
    start_auto_update_checker(app.clone()).await;
    
    // 在应用启动时检查一次更新（延迟10秒避免影响启动性能）
    let app_clone = app.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(10)).await;
        
        let config = load_update_config(&app_clone).await;
        if config.auto_check_enabled {
            if let Err(e) = check_for_updates(app_clone).await {
                logging!(warn, Type::System, "启动时检查更新失败: {}", e);
            }
        }
    });
    
    logging!(info, Type::System, "自动更新系统初始化完成");
}