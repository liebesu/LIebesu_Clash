// use crate::utils::{config, help};
use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use nanoid::nanoid;

/// 备份数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupData {
    pub backup_id: String,
    pub backup_name: String,
    pub description: String,
    pub version: String,
    pub app_version: String,
    pub created_at: i64,
    pub file_size: u64,
    pub checksum: String,
    pub is_encrypted: bool,
    pub backup_type: BackupType,
    pub profiles: Vec<ProfileBackup>,
    pub settings: SettingsBackup,
    pub groups: Option<GroupsBackup>,
    pub traffic_stats: Option<TrafficStatsBackup>,
    pub tasks: Option<TasksBackup>,
}

/// 备份类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BackupType {
    Full,       // 完整备份
    Profiles,   // 仅订阅
    Settings,   // 仅设置
    Custom,     // 自定义选择
}

/// 订阅备份数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileBackup {
    pub uid: String,
    pub name: String,
    pub desc: Option<String>,
    pub file: Option<String>,
    pub url: Option<String>,
    pub selected: Vec<String>,
    pub chain: Vec<String>,
    pub valid: bool,
    pub updated: Option<u64>,
    pub option: Option<String>,
    pub home: Option<String>,
    pub extra: Option<String>,
}

/// 设置备份数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsBackup {
    pub clash_config: String,
    pub verge_config: String,
    pub profiles_config: String,
}

/// 分组备份数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupsBackup {
    pub groups: String,
}

/// 流量统计备份数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficStatsBackup {
    pub traffic_data: String,
}

/// 任务备份数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TasksBackup {
    pub tasks_data: String,
}

/// 备份选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupOptions {
    pub backup_type: BackupType,
    pub include_profiles: bool,
    pub include_settings: bool,
    pub include_groups: bool,
    pub include_traffic_stats: bool,
    pub include_tasks: bool,
    pub encrypt: bool,
    pub password: Option<String>,
    pub compression_level: u32, // 0-9
    pub backup_name: String,
    pub description: String,
}

/// 恢复选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreOptions {
    pub backup_id: String,
    pub restore_profiles: bool,
    pub restore_settings: bool,
    pub restore_groups: bool,
    pub restore_traffic_stats: bool,
    pub restore_tasks: bool,
    pub merge_mode: bool, // true=合并, false=覆盖
    pub password: Option<String>,
    pub create_backup_before_restore: bool,
}

/// 备份信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub backup_id: String,
    pub backup_name: String,
    pub description: String,
    pub file_path: String,
    pub file_size: u64,
    pub created_at: i64,
    pub version: String,
    pub app_version: String,
    pub backup_type: BackupType,
    pub is_encrypted: bool,
    pub checksum: String,
    pub is_valid: bool,
}

/// 恢复结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    pub success: bool,
    pub restored_items: u32,
    pub failed_items: u32,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub operation_duration_ms: u64,
    pub backup_created: Option<String>, // 恢复前创建的备份ID
}

/// WebDAV同步配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDAVConfig {
    pub enabled: bool,
    pub server_url: String,
    pub username: String,
    pub password: String,
    pub remote_path: String,
    pub auto_sync: bool,
    pub sync_interval_hours: u32,
    pub encrypt_before_upload: bool,
    pub compression_enabled: bool,
}

/// 同步状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub last_sync: Option<i64>,
    pub last_upload: Option<i64>,
    pub last_download: Option<i64>,
    pub pending_uploads: u32,
    pub pending_downloads: u32,
    pub sync_errors: Vec<String>,
    pub is_syncing: bool,
}

/// 版本管理信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct BackupVersion {
    pub version_id: String,
    pub backup_id: String,
    pub version_number: u32,
    pub created_at: i64,
    pub changes_summary: String,
    pub file_path: String,
    pub file_size: u64,
}

/// 获取备份目录
fn get_backup_dir() -> Result<PathBuf> {
    let app_dir = crate::utils::dirs::app_home_dir()
        .map_err(|e| anyhow::anyhow!("Failed to get app data directory: {}", e))?;
    
    log::info!(target: "app", "App data directory: {:?}", app_dir);
    
    let backup_dir = app_dir.join("backups");
    
    if !backup_dir.exists() {
        log::info!(target: "app", "Creating backup directory: {:?}", backup_dir);
        fs::create_dir_all(&backup_dir)
            .with_context(|| format!("Failed to create backup directory: {:?}", backup_dir))?;
    }
    
    // 验证目录是否可写
    if !backup_dir.is_dir() {
        return Err(anyhow::anyhow!("Backup path exists but is not a directory: {:?}", backup_dir));
    }
    
    // 测试写入权限
    let test_file = backup_dir.join(".write_test");
    fs::write(&test_file, "test")
        .with_context(|| format!("Backup directory is not writable: {:?}", backup_dir))?;
    let _ = fs::remove_file(&test_file); // 忽略删除错误
    
    log::info!(target: "app", "Backup directory ready: {:?}", backup_dir);
    Ok(backup_dir)
}

/// 生成校验和
fn calculate_checksum(file_path: &Path) -> Result<String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut file = File::open(file_path)?;
    let mut contents = Vec::new();
    file.read_to_end(&mut contents)?;
    
    let mut hasher = DefaultHasher::new();
    contents.hash(&mut hasher);
    Ok(format!("{:x}", hasher.finish()))
}

/// 压缩数据 (模拟实现)
fn compress_data(data: &[u8], _level: u32) -> Result<Vec<u8>> {
    // TODO: 实现真正的压缩，这里仅返回原数据
    Ok(data.to_vec())
}

/// 解压数据 (模拟实现)
fn decompress_data(data: &[u8]) -> Result<Vec<u8>> {
    // TODO: 实现真正的解压，这里仅返回原数据
    Ok(data.to_vec())
}

/// 加密数据
fn encrypt_data(data: &[u8], password: &str) -> Result<Vec<u8>> {
    // 简单的XOR加密 - 实际应用应使用AES等强加密
    let key = password.as_bytes();
    let mut encrypted = Vec::new();
    
    for (i, &byte) in data.iter().enumerate() {
        encrypted.push(byte ^ key[i % key.len()]);
    }
    
    Ok(encrypted)
}

/// 解密数据
fn decrypt_data(data: &[u8], password: &str) -> Result<Vec<u8>> {
    // XOR解密（与加密相同）
    encrypt_data(data, password)
}

/// 创建备份
#[tauri::command]
pub async fn create_backup(options: BackupOptions) -> Result<String, String> {
    let backup_id = nanoid!();
    let timestamp = Utc::now().timestamp();
    
    // 收集备份数据
    let mut backup_data = BackupData {
        backup_id: backup_id.clone(),
        backup_name: options.backup_name,
        description: options.description,
        version: "1.0".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: timestamp,
        file_size: 0,
        checksum: String::new(),
        is_encrypted: options.encrypt,
        backup_type: options.backup_type,
        profiles: Vec::new(),
        settings: SettingsBackup {
            clash_config: String::new(),
            verge_config: String::new(),
            profiles_config: String::new(),
        },
        groups: None,
        traffic_stats: None,
        tasks: None,
    };

    // 备份订阅数据
    if options.include_profiles {
        // TODO: 从实际的配置文件读取订阅数据
        // 这里使用模拟数据
        backup_data.profiles = vec![
            ProfileBackup {
                uid: "profile1".to_string(),
                name: "示例订阅1".to_string(),
                desc: Some("示例描述".to_string()),
                file: None,
                url: Some("https://example.com/sub1".to_string()),
                selected: vec!["proxy1".to_string()],
                chain: vec![],
                valid: true,
                updated: Some(timestamp as u64),
                option: None,
                home: None,
                extra: None,
            }
        ];
    }

    // 备份设置数据
    if options.include_settings {
        // TODO: 从实际的配置文件读取设置
        backup_data.settings = SettingsBackup {
            clash_config: "clash_config_data".to_string(),
            verge_config: "verge_config_data".to_string(),
            profiles_config: "profiles_config_data".to_string(),
        };
    }

    // 备份分组数据
    if options.include_groups {
        backup_data.groups = Some(GroupsBackup {
            groups: "groups_data".to_string(),
        });
    }

    // 备份流量统计
    if options.include_traffic_stats {
        backup_data.traffic_stats = Some(TrafficStatsBackup {
            traffic_data: "traffic_stats_data".to_string(),
        });
    }

    // 备份任务数据
    if options.include_tasks {
        backup_data.tasks = Some(TasksBackup {
            tasks_data: "tasks_data".to_string(),
        });
    }

    // 序列化备份数据
    let json_data = serde_json::to_string_pretty(&backup_data)
        .map_err(|e| format!("Failed to serialize backup data: {}", e))?;

    let mut data = json_data.as_bytes().to_vec();

    // 压缩数据
    if options.compression_level > 0 {
        data = compress_data(&data, options.compression_level)
            .map_err(|e| format!("Failed to compress backup: {}", e))?;
    }

    // 加密数据
    if options.encrypt {
        if let Some(password) = &options.password {
            data = encrypt_data(&data, password)
                .map_err(|e| format!("Failed to encrypt backup: {}", e))?;
        } else {
            return Err("Password required for encryption".to_string());
        }
    }

    // 保存到文件
    let backup_dir = get_backup_dir()
        .map_err(|e| format!("Failed to get backup directory: {}", e))?;
    
    let file_name = format!("backup_{}_{}.bak", 
        backup_data.backup_name.replace(" ", "_"), 
        timestamp
    );
    let file_path = backup_dir.join(&file_name);

    fs::write(&file_path, &data)
        .map_err(|e| format!("Failed to write backup file: {}", e))?;

    // 计算校验和和文件大小
    let file_size = data.len() as u64;
    let checksum = calculate_checksum(&file_path)
        .map_err(|e| format!("Failed to calculate checksum: {}", e))?;

    // 更新备份信息并保存到索引
    let backup_info = BackupInfo {
        backup_id: backup_id.clone(),
        backup_name: backup_data.backup_name,
        description: backup_data.description,
        file_path: file_path.to_string_lossy().to_string(),
        file_size,
        created_at: timestamp,
        version: backup_data.version,
        app_version: backup_data.app_version,
        backup_type: backup_data.backup_type,
        is_encrypted: backup_data.is_encrypted,
        checksum,
        is_valid: true,
    };

    // 保存备份索引
    save_backup_index(&backup_info)
        .map_err(|e| format!("Failed to save backup index: {}", e))?;

    Ok(backup_id)
}

/// 获取所有备份
#[tauri::command]
pub async fn get_all_backups() -> Result<Vec<BackupInfo>, String> {
    load_backup_index()
        .map_err(|e| format!("Failed to load backup index: {}", e))
}

/// 获取备份详情
#[tauri::command]
pub async fn get_backup_details(backup_id: String) -> Result<BackupData, String> {
    let backups = load_backup_index()
        .map_err(|e| format!("Failed to load backup index: {}", e))?;
    
    let backup_info = backups.iter()
        .find(|b| b.backup_id == backup_id)
        .ok_or("Backup not found")?;

    // 读取备份文件
    let file_data = fs::read(&backup_info.file_path)
        .map_err(|e| format!("Failed to read backup file: {}", e))?;

    let mut data = file_data;

    // 解密数据
    if backup_info.is_encrypted {
        return Err("Encrypted backup requires password".to_string());
    }

    // 解压数据
    // 假设所有备份都是压缩的，实际应记录压缩状态
    data = decompress_data(&data)
        .unwrap_or(data); // 如果解压失败，可能未压缩

    // 反序列化备份数据
    let backup_data: BackupData = serde_json::from_slice(&data)
        .map_err(|e| format!("Failed to parse backup data: {}", e))?;

    Ok(backup_data)
}

/// 恢复备份
#[tauri::command]
pub async fn restore_backup(options: RestoreOptions) -> Result<RestoreResult, String> {
    let start_time = std::time::Instant::now();
    let mut result = RestoreResult {
        success: false,
        restored_items: 0,
        failed_items: 0,
        errors: Vec::new(),
        warnings: Vec::new(),
        operation_duration_ms: 0,
        backup_created: None,
    };

    // 恢复前创建备份
    if options.create_backup_before_restore {
        let backup_options = BackupOptions {
            backup_type: BackupType::Full,
            include_profiles: true,
            include_settings: true,
            include_groups: true,
            include_traffic_stats: true,
            include_tasks: true,
            encrypt: false,
            password: None,
            compression_level: 6,
            backup_name: "Pre-restore backup".to_string(),
            description: "Automatic backup before restore".to_string(),
        };

        match create_backup(backup_options).await {
            Ok(backup_id) => result.backup_created = Some(backup_id),
            Err(e) => result.warnings.push(format!("Failed to create pre-restore backup: {}", e)),
        }
    }

    // 获取备份详情
    let backup_data = match get_backup_details(options.backup_id).await {
        Ok(data) => data,
        Err(e) => {
            result.errors.push(format!("Failed to get backup details: {}", e));
            result.operation_duration_ms = start_time.elapsed().as_millis() as u64;
            return Ok(result);
        }
    };

    // 恢复订阅
    if options.restore_profiles && !backup_data.profiles.is_empty() {
        // TODO: 实现实际的订阅恢复逻辑
        result.restored_items += backup_data.profiles.len() as u32;
    }

    // 恢复设置
    if options.restore_settings {
        // TODO: 实现实际的设置恢复逻辑
        result.restored_items += 1;
    }

    // 恢复分组
    if options.restore_groups && backup_data.groups.is_some() {
        // TODO: 实现实际的分组恢复逻辑
        result.restored_items += 1;
    }

    // 恢复流量统计
    if options.restore_traffic_stats && backup_data.traffic_stats.is_some() {
        // TODO: 实现实际的流量统计恢复逻辑
        result.restored_items += 1;
    }

    // 恢复任务
    if options.restore_tasks && backup_data.tasks.is_some() {
        // TODO: 实现实际的任务恢复逻辑
        result.restored_items += 1;
    }

    result.success = result.errors.is_empty();
    result.operation_duration_ms = start_time.elapsed().as_millis() as u64;

    Ok(result)
}

/// 删除备份
#[tauri::command]
pub async fn delete_backup(backup_id: String) -> Result<(), String> {
    let mut backups = load_backup_index()
        .map_err(|e| format!("Failed to load backup index: {}", e))?;
    
    if let Some(pos) = backups.iter().position(|b| b.backup_id == backup_id) {
        let backup_info = backups.remove(pos);
        
        // 删除备份文件
        if Path::new(&backup_info.file_path).exists() {
            fs::remove_file(&backup_info.file_path)
                .map_err(|e| format!("Failed to delete backup file: {}", e))?;
        }
        
        // 更新索引
        save_backup_index_list(&backups)
            .map_err(|e| format!("Failed to update backup index: {}", e))?;
            
        Ok(())
    } else {
        Err("Backup not found".to_string())
    }
}

/// 验证备份
#[tauri::command]
pub async fn validate_backup(backup_id: String) -> Result<bool, String> {
    let backups = load_backup_index()
        .map_err(|e| format!("Failed to load backup index: {}", e))?;
    
    let backup_info = backups.iter()
        .find(|b| b.backup_id == backup_id)
        .ok_or("Backup not found")?;

    // 检查文件是否存在
    if !Path::new(&backup_info.file_path).exists() {
        return Ok(false);
    }

    // 验证校验和
    let current_checksum = calculate_checksum(Path::new(&backup_info.file_path))
        .map_err(|e| format!("Failed to calculate checksum: {}", e))?;

    Ok(current_checksum == backup_info.checksum)
}

/// 导出备份
#[tauri::command]
pub async fn export_backup(backup_id: String, export_path: String) -> Result<(), String> {
    let backups = load_backup_index()
        .map_err(|e| format!("Failed to load backup index: {}", e))?;
    
    let backup_info = backups.iter()
        .find(|b| b.backup_id == backup_id)
        .ok_or("Backup not found")?;

    // 复制备份文件
    fs::copy(&backup_info.file_path, &export_path)
        .map_err(|e| format!("Failed to export backup: {}", e))?;

    Ok(())
}

/// 导入备份
#[tauri::command]
pub async fn import_backup(import_path: String, backup_name: String) -> Result<String, String> {
    let backup_id = nanoid!();
    
    // 读取导入文件
    let data = fs::read(&import_path)
        .map_err(|e| format!("Failed to read import file: {}", e))?;

    // 复制到备份目录
    let backup_dir = get_backup_dir()
        .map_err(|e| format!("Failed to get backup directory: {}", e))?;
    
    let file_name = format!("imported_{}_{}.bak", 
        backup_name.replace(" ", "_"), 
        Utc::now().timestamp()
    );
    let file_path = backup_dir.join(&file_name);

    fs::write(&file_path, &data)
        .map_err(|e| format!("Failed to write backup file: {}", e))?;

    // 计算校验和
    let checksum = calculate_checksum(&file_path)
        .map_err(|e| format!("Failed to calculate checksum: {}", e))?;

    // 创建备份信息
    let backup_info = BackupInfo {
        backup_id: backup_id.clone(),
        backup_name,
        description: "Imported backup".to_string(),
        file_path: file_path.to_string_lossy().to_string(),
        file_size: data.len() as u64,
        created_at: Utc::now().timestamp(),
        version: "1.0".to_string(),
        app_version: "imported".to_string(),
        backup_type: BackupType::Full,
        is_encrypted: false, // 假设导入的备份未加密
        checksum,
        is_valid: true,
    };

    // 保存到索引
    save_backup_index(&backup_info)
        .map_err(|e| format!("Failed to save backup index: {}", e))?;

    Ok(backup_id)
}

/// WebDAV 同步配置
#[tauri::command]
pub async fn set_webdav_config(_config: WebDAVConfig) -> Result<(), String> {
    // TODO: 实现WebDAV配置保存
    Ok(())
}

/// 获取WebDAV配置
#[tauri::command]
pub async fn get_webdav_config() -> Result<WebDAVConfig, String> {
    // TODO: 实现WebDAV配置读取
    Ok(WebDAVConfig {
        enabled: false,
        server_url: String::new(),
        username: String::new(),
        password: String::new(),
        remote_path: "/clash-verge-backups".to_string(),
        auto_sync: false,
        sync_interval_hours: 24,
        encrypt_before_upload: true,
        compression_enabled: true,
    })
}

/// 同步到WebDAV
#[tauri::command]
pub async fn sync_to_webdav() -> Result<SyncStatus, String> {
    // TODO: 实现WebDAV上传同步
    Ok(SyncStatus {
        last_sync: Some(Utc::now().timestamp()),
        last_upload: Some(Utc::now().timestamp()),
        last_download: None,
        pending_uploads: 0,
        pending_downloads: 0,
        sync_errors: Vec::new(),
        is_syncing: false,
    })
}

/// 从WebDAV同步
#[tauri::command]
pub async fn sync_from_webdav() -> Result<SyncStatus, String> {
    // TODO: 实现WebDAV下载同步
    Ok(SyncStatus {
        last_sync: Some(Utc::now().timestamp()),
        last_upload: None,
        last_download: Some(Utc::now().timestamp()),
        pending_uploads: 0,
        pending_downloads: 0,
        sync_errors: Vec::new(),
        is_syncing: false,
    })
}

/// 获取同步状态
#[tauri::command]
pub async fn get_sync_status() -> Result<SyncStatus, String> {
    // TODO: 实现同步状态获取
    Ok(SyncStatus {
        last_sync: None,
        last_upload: None,
        last_download: None,
        pending_uploads: 0,
        pending_downloads: 0,
        sync_errors: Vec::new(),
        is_syncing: false,
    })
}

/// 清理旧备份
#[tauri::command]
pub async fn cleanup_old_backups(keep_days: u32, keep_count: u32) -> Result<u32, String> {
    let backups = load_backup_index()
        .map_err(|e| format!("Failed to load backup index: {}", e))?;

    let cutoff_time = Utc::now().timestamp() - (keep_days as i64 * 24 * 3600);
    let mut sorted_backups = backups.clone();
    sorted_backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    let mut deleted_count = 0;
    let mut remaining_backups = Vec::new();

    for (index, backup) in sorted_backups.iter().enumerate() {
        if index < keep_count as usize || backup.created_at > cutoff_time {
            remaining_backups.push(backup.clone());
        } else {
            // 删除文件
            if Path::new(&backup.file_path).exists() {
                fs::remove_file(&backup.file_path).ok();
            }
            deleted_count += 1;
        }
    }

    // 更新索引
    save_backup_index_list(&remaining_backups)
        .map_err(|e| format!("Failed to update backup index: {}", e))?;

    Ok(deleted_count)
}

/// 保存备份索引
fn save_backup_index(backup_info: &BackupInfo) -> Result<()> {
    let mut backups = load_backup_index().unwrap_or_default();
    backups.push(backup_info.clone());
    save_backup_index_list(&backups)
}

/// 保存备份索引列表
fn save_backup_index_list(backups: &[BackupInfo]) -> Result<()> {
    let backup_dir = get_backup_dir()?;
    let index_file = backup_dir.join("backup_index.json");
    
    let json_data = serde_json::to_string_pretty(backups)?;
    fs::write(index_file, json_data)?;
    
    Ok(())
}

/// 加载备份索引
fn load_backup_index() -> Result<Vec<BackupInfo>> {
    let backup_dir = get_backup_dir()?;
    let index_file = backup_dir.join("backup_index.json");
    
    if !index_file.exists() {
        return Ok(Vec::new());
    }
    
    let json_data = fs::read_to_string(index_file)?;
    let backups: Vec<BackupInfo> = serde_json::from_str(&json_data)?;
    
    Ok(backups)
}
