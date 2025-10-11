use super::CmdResult;
use crate::{
    config::{Config, PrfItem, PrfOption},
    core::handle::Handle,
    logging,
    utils::logging::Type,
};
use nanoid::nanoid;
use percent_encoding::percent_decode_str;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use url::Url;
use tauri::{AppHandle, Emitter};

static IMPORT_TASK_SEQ: AtomicU64 = AtomicU64::new(1);

/// 批量导入结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchImportResult {
    pub total_input: usize,         // 输入的总数
    pub valid_urls: usize,          // 有效的URL数量
    pub imported: usize,            // 成功导入的数量
    pub duplicates: usize,          // 重复的数量
    pub failed: usize,              // 失败的数量
    pub results: Vec<ImportResult>, // 详细结果
    pub import_duration: u64,       // 导入耗时（毫秒）
}

/// 单个导入结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub url: String,
    pub name: Option<String>,
    pub status: ImportStatus,
    pub error_message: Option<String>,
    pub uid: Option<String>,
}

/// 导入状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImportStatus {
    Success,   // 成功导入
    Duplicate, // 重复（已存在）
    Failed,    // 导入失败
    Invalid,   // 无效的URL
}

/// 导入配置选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchImportOptions {
    pub skip_duplicates: bool,              // 跳过重复项
    pub auto_generate_names: bool,          // 自动生成名称
    pub name_prefix: Option<String>,        // 名称前缀
    pub default_user_agent: Option<String>, // 默认User-Agent
    pub update_interval: Option<i32>,       // 更新间隔（分钟）
}

impl Default for BatchImportOptions {
    fn default() -> Self {
        Self {
            skip_duplicates: true,
            auto_generate_names: true,
            name_prefix: None,
            default_user_agent: Some("liebseu-clash".to_string()),
            update_interval: Some(60 * 24), // 24小时
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProgressPayload {
    pub task_id: u64,
    pub stage: String,
    pub completed: usize,
    pub total: usize,
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
struct ProgressTracker {
    app_handle: AppHandle,
    task_id: u64,
    total: usize,
}

impl ProgressTracker {
    fn new(app_handle: AppHandle, task_id: u64, total: usize) -> Self {
        Self {
            app_handle,
            task_id,
            total,
        }
    }

    fn emit(
        &self,
        stage: &str,
        completed: usize,
        total_override: Option<usize>,
        message: Option<String>,
    ) {
        let total = total_override.unwrap_or(self.total);
        let payload = ImportProgressPayload {
            task_id: self.task_id,
            stage: stage.to_string(),
            completed: completed.min(total),
            total,
            message,
        };

        if let Err(err) = self.app_handle.emit("batch-import-progress", payload) {
            log::warn!(target: "app", "batch-import-progress emit failed: {err}");
        }
    }
}

/// 从文本批量导入订阅
#[tauri::command]
pub async fn batch_import_from_text(
    app_handle: AppHandle,
    text_content: String,
    options: Option<BatchImportOptions>,
) -> CmdResult<BatchImportResult> {
    let start_time = std::time::Instant::now();
    let options = options.unwrap_or_default();

    logging!(
        info,
        Type::Cmd,
        true,
        "[批量导入] 从文本导入订阅，内容长度: {}",
        text_content.len()
    );

    // 解析文本内容
    let urls = parse_subscription_urls(&text_content)?;
    let total_input = urls.len();

    logging!(
        info,
        Type::Cmd,
        true,
        "[批量导入] 解析出 {} 个URL",
        total_input
    );

    // 验证和过滤URL
    let (valid_urls, invalid_results) = validate_urls(urls);
    let valid_count = valid_urls.len();

    logging!(
        info,
        Type::Cmd,
        true,
        "[批量导入] 有效URL: {}, 无效URL: {}",
        valid_count,
        invalid_results.len()
    );

    // 检查重复
    let (new_urls, duplicate_results) = if options.skip_duplicates {
        check_duplicates(valid_urls).await?
    } else {
        (valid_urls, Vec::new())
    };

    let duplicate_count = duplicate_results.len();
    logging!(
        info,
        Type::Cmd,
        true,
        "[批量导入] 重复URL: {}",
        duplicate_count
    );

    let task_id = IMPORT_TASK_SEQ.fetch_add(1, Ordering::SeqCst);
    let tracker = ProgressTracker::new(app_handle.clone(), task_id, new_urls.len());

    tracker.emit(
        "preparing",
        0,
        Some(valid_count),
        Some(format!("解析完成，有效 {} 条", valid_count)),
    );
    if duplicate_count > 0 {
        tracker.emit(
            "preparing",
            0,
            Some(valid_count),
            Some(format!("检测到 {} 条重复，跳过", duplicate_count)),
        );
    }

    // 执行导入
    let (success_results, failed_results) =
        import_subscriptions(new_urls, &options, tracker.clone()).await;
    let imported_count = success_results.len();
    let failed_count = failed_results.len();

    // 汇总结果
    let mut all_results = Vec::new();
    all_results.extend(invalid_results);
    all_results.extend(duplicate_results);
    all_results.extend(success_results);
    all_results.extend(failed_results);

    let import_duration = start_time.elapsed().as_millis() as u64;

    let result = BatchImportResult {
        total_input,
        valid_urls: valid_count,
        imported: imported_count,
        duplicates: duplicate_count,
        failed: failed_count,
        results: all_results,
        import_duration,
    };

    tracker.emit(
        "completed",
        imported_count + failed_count,
        Some(valid_count),
        Some(format!(
            "导入完成，成功 {} 条，失败 {} 条",
            imported_count, failed_count
        )),
    );

    logging!(
        info,
        Type::Cmd,
        true,
        "[批量导入] 完成 - 总数: {}, 有效: {}, 导入: {}, 重复: {}, 失败: {}, 耗时: {}ms",
        total_input,
        valid_count,
        imported_count,
        duplicate_count,
        failed_count,
        import_duration
    );

    Ok(result)
}

/// 从文件批量导入订阅
#[tauri::command]
pub async fn batch_import_from_file(
    file_path: String,
    options: Option<BatchImportOptions>,
) -> CmdResult<BatchImportResult> {
    logging!(
        info,
        Type::Cmd,
        true,
        "[批量导入] 从文件导入: {}",
        file_path
    );

    // 读取文件内容
    let content = tokio::fs::read_to_string(&file_path)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))?;

    // 调用文本导入逻辑
    // 使用全局 Handle 提供的 AppHandle，再复用文本导入逻辑
    if let Some(handle) = crate::core::handle::Handle::global().app_handle() {
        batch_import_from_text(handle, content, options).await
    } else {
        Err("AppHandle not initialized".into())
    }
}

/// 从剪贴板批量导入订阅
#[tauri::command]
pub async fn batch_import_from_clipboard(
    _options: Option<BatchImportOptions>,
) -> CmdResult<BatchImportResult> {
    logging!(info, Type::Cmd, true, "[批量导入] 从剪贴板导入");

    // 这里需要前端传入剪贴板内容，因为后端无法直接访问剪贴板
    // 暂时返回错误，前端应该先获取剪贴板内容再调用 batch_import_from_text
    Err("请先获取剪贴板内容，然后使用 batch_import_from_text".to_string())
}

/// 获取导入预览（不实际导入）
#[tauri::command]
pub async fn preview_batch_import(
    text_content: String,
    options: Option<BatchImportOptions>,
) -> CmdResult<BatchImportResult> {
    let start_time = std::time::Instant::now();
    let options = options.unwrap_or_default();

    logging!(
        info,
        Type::Cmd,
        true,
        "[批量导入预览] 内容长度: {}",
        text_content.len()
    );

    // 解析文本内容
    let urls = parse_subscription_urls(&text_content)?;
    let total_input = urls.len();

    // 验证和过滤URL
    let (valid_urls, invalid_results) = validate_urls(urls);
    let valid_count = valid_urls.len();

    // 检查重复（但不导入）
    let (new_urls, duplicate_results) = if options.skip_duplicates {
        check_duplicates(valid_urls).await?
    } else {
        (valid_urls, Vec::new())
    };

    let duplicate_count = duplicate_results.len();
    let would_import = new_urls.len();

    // 生成预览结果（模拟成功）
    let preview_results: Vec<ImportResult> = new_urls
        .into_iter()
        .map(|url| ImportResult {
            name: generate_subscription_name(&url, &options),
            url,
            status: ImportStatus::Success,
            error_message: None,
            uid: Some(nanoid!()),
        })
        .collect();

    // 汇总结果
    let mut all_results = Vec::new();
    all_results.extend(invalid_results);
    all_results.extend(duplicate_results);
    all_results.extend(preview_results);

    let import_duration = start_time.elapsed().as_millis() as u64;

    let result = BatchImportResult {
        total_input,
        valid_urls: valid_count,
        imported: would_import,
        duplicates: duplicate_count,
        failed: 0,
        results: all_results,
        import_duration,
    };

    Ok(result)
}

/// 解析文本内容中的订阅URL
fn parse_subscription_urls(content: &str) -> CmdResult<Vec<String>> {
    let mut urls = Vec::new();

    // 尝试解析JSON格式（仅当解析出非空结果时返回）
    if let Ok(json_urls) = parse_json_urls(content) {
        if !json_urls.is_empty() {
            urls.extend(json_urls);
            return Ok(urls);
        }
    }

    // 尝试解析YAML格式（仅当解析出非空结果时返回）
    if let Ok(yaml_urls) = parse_yaml_urls(content) {
        if !yaml_urls.is_empty() {
            urls.extend(yaml_urls);
            return Ok(urls);
        }
    }

    // 按行解析纯文本
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
            continue;
        }

        // 提取URL（支持多种格式）
        if let Some(url) = extract_url_from_line(line) {
            urls.push(url);
        }
    }

    // 去重
    let unique_urls: Vec<String> = urls
        .into_iter()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    if !unique_urls.is_empty() {
        return Ok(unique_urls);
    }

    // Fallback: 全文正则提取 http(s) 子串（大小写不敏感）
    let re = Regex::new(r#"(?i)https?://[^\s\"']+"#).map_err(|e| format!("正则编译失败: {}", e))?;
    let mut found = HashSet::new();
    for mat in re.find_iter(content) {
        let mut u = mat.as_str().to_string();
        // 去掉结尾的标点
        while let Some(last) = u.chars().last() {
            if ",.;)\n\r]".contains(last) {
                u.pop();
            } else {
                break;
            }
        }
        found.insert(u);
    }
    Ok(found.into_iter().collect())
}

/// 从JSON格式解析URL
fn parse_json_urls(content: &str) -> Result<Vec<String>, serde_json::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum JsonFormat {
        StringArray(Vec<String>),
        ObjectArray(Vec<serde_json::Value>),
        Object(serde_json::Value),
    }

    let parsed: JsonFormat = serde_json::from_str(content)?;
    let mut urls = Vec::new();

    match parsed {
        JsonFormat::StringArray(arr) => {
            urls.extend(arr);
        }
        JsonFormat::ObjectArray(arr) => {
            for obj in arr {
                if let Some(url) = extract_url_from_json_object(&obj) {
                    urls.push(url);
                }
            }
        }
        JsonFormat::Object(obj) => {
            if let Some(url) = extract_url_from_json_object(&obj) {
                urls.push(url);
            }
        }
    }

    Ok(urls)
}

/// 从YAML格式解析URL
fn parse_yaml_urls(content: &str) -> Result<Vec<String>, serde_yaml_ng::Error> {
    let value: serde_yaml_ng::Value = serde_yaml_ng::from_str(content)?;
    let mut urls = Vec::new();

    if let Some(sequence) = value.as_sequence() {
        for item in sequence {
            if let Some(url_str) = item.as_str() {
                let decoded = percent_decode_str(url_str).decode_utf8_lossy().to_string();
                urls.push(decoded);
            } else if let Some(mapping) = item.as_mapping() {
                for (key, val) in mapping {
                    if let (Some(key_str), Some(val_str)) = (key.as_str(), val.as_str()) {
                        if key_str.to_lowercase().contains("url")
                            || key_str.to_lowercase().contains("link")
                        {
                            let decoded =
                                percent_decode_str(val_str).decode_utf8_lossy().to_string();
                            urls.push(decoded);
                        }
                    }
                }
            }
        }
    }

    Ok(urls)
}

/// 从JSON对象中提取URL
fn extract_url_from_json_object(obj: &serde_json::Value) -> Option<String> {
    if let Some(obj_map) = obj.as_object() {
        // 尝试常见的URL字段名
        let url_fields = ["url", "link", "subscription", "sub", "href"];
        for field in &url_fields {
            if let Some(url_value) = obj_map.get(*field) {
                if let Some(url_str) = url_value.as_str() {
                    let decoded = percent_decode_str(url_str).decode_utf8_lossy().to_string();
                    if decoded.starts_with("http://") || decoded.starts_with("https://") {
                        return Some(decoded);
                    }
                    return Some(url_str.to_string());
                }
            }
        }
    }
    None
}

/// 从单行文本中提取URL
fn extract_url_from_line(line: &str) -> Option<String> {
    // 直接是URL的情况（允许前缀有@这类标记）
    let trimmed_leading =
        line.trim_start_matches(|c: char| c == '@' || c == '-' || c == '*' || c == '•');
    if trimmed_leading.starts_with("http://") || trimmed_leading.starts_with("https://") {
        return Some(trimmed_leading.to_string());
    }

    // 兼容 clash://install-config?url=ENCODED 或包含 url= 的情况
    if let Some(pos) = line.to_lowercase().find("url=") {
        let val_start = pos + 4;
        let rest = &line[val_start..];
        // 截断到下一个分隔符（& 空格 引号）
        let mut val_end = rest.len();
        for (i, ch) in rest.char_indices() {
            if ch == '&' || ch.is_whitespace() || ch == '"' || ch == '\'' {
                val_end = i;
                break;
            }
        }
        let encoded = &rest[..val_end];
        let decoded = percent_decode_str(encoded).decode_utf8_lossy().to_string();
        if decoded.starts_with("http://") || decoded.starts_with("https://") {
            return Some(decoded);
        }
    }

    // 包含URL的情况（用空格或其他分隔符分隔）
    for part in trimmed_leading.split_whitespace() {
        if part.starts_with("http://") || part.starts_with("https://") {
            return Some(part.to_string());
        }
    }

    // 兼容百分号编码的 http(s) 片段（如 https%3A%2F%2F...）
    if let Some(start) = trimmed_leading
        .find("http%3A")
        .or_else(|| trimmed_leading.find("https%3A"))
    {
        let encoded_part = &trimmed_leading[start..];
        let decoded = percent_decode_str(encoded_part)
            .decode_utf8_lossy()
            .to_string();
        if decoded.starts_with("http://") || decoded.starts_with("https://") {
            if let Some(space) = decoded.find(' ') {
                return Some(decoded[..space].to_string());
            }
            return Some(decoded);
        }
    }

    None
}

/// 验证URL格式
fn validate_urls(urls: Vec<String>) -> (Vec<String>, Vec<ImportResult>) {
    let mut valid_urls = Vec::new();
    let mut invalid_results = Vec::new();

    for url in urls {
        match Url::parse(&url) {
            Ok(parsed_url) => {
                if parsed_url.scheme() == "http" || parsed_url.scheme() == "https" {
                    valid_urls.push(url);
                } else {
                    invalid_results.push(ImportResult {
                        url,
                        name: None,
                        status: ImportStatus::Invalid,
                        error_message: Some("不支持的协议".to_string()),
                        uid: None,
                    });
                }
            }
            Err(e) => {
                invalid_results.push(ImportResult {
                    url,
                    name: None,
                    status: ImportStatus::Invalid,
                    error_message: Some(format!("URL格式错误: {}", e)),
                    uid: None,
                });
            }
        }
    }

    (valid_urls, invalid_results)
}

/// 检查重复的订阅
async fn check_duplicates(urls: Vec<String>) -> CmdResult<(Vec<String>, Vec<ImportResult>)> {
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();

    // 获取现有的订阅URL
    let empty_vec = Vec::new();
    let existing_urls: HashSet<String> = profiles_ref
        .items
        .as_ref()
        .unwrap_or(&empty_vec)
        .iter()
        .filter_map(|item| item.url.as_ref().map(|url| url.clone()))
        .collect();

    let mut new_urls = Vec::new();
    let mut duplicate_results = Vec::new();

    for url in urls {
        if existing_urls.contains(&url) {
            duplicate_results.push(ImportResult {
                url,
                name: None,
                status: ImportStatus::Duplicate,
                error_message: Some("订阅已存在".to_string()),
                uid: None,
            });
        } else {
            new_urls.push(url);
        }
    }

    Ok((new_urls, duplicate_results))
}

/// 执行实际的订阅导入
async fn import_subscriptions(
    urls: Vec<String>,
    options: &BatchImportOptions,
    tracker: ProgressTracker,
) -> (Vec<ImportResult>, Vec<ImportResult>) {
    let mut success_results = Vec::new();
    let mut failed_results = Vec::new();

    for (index, url) in urls.into_iter().enumerate() {
        let name = generate_subscription_name(&url, options);

        // 创建订阅项
        let uid = nanoid!();
        let item = PrfItem {
            uid: Some(uid.clone()),
            itype: Some("remote".to_string()),
            name: name.clone(),
            file: None,
            desc: None,
            url: Some(url.clone()),
            selected: None,
            extra: None,
            updated: None,
            option: Some(PrfOption {
                user_agent: options.default_user_agent.clone(),
                update_interval: options.update_interval.map(|i| i as u64),
                ..Default::default()
            }),
            home: None,
            file_data: None,
        };

        let processed = index + 1;
        tracker.emit(
            "importing",
            processed,
            None,
            Some(format!(
                "正在导入: {}",
                name.clone().unwrap_or_else(|| "订阅".into())
            )),
        );

        // 尝试导入
        match super::import_profile(url.clone(), item.option.clone()).await {
            Ok(_) => {
                success_results.push(ImportResult {
                    url,
                    name,
                    status: ImportStatus::Success,
                    error_message: None,
                    uid: Some(uid),
                });
            }
            Err(e) => {
                failed_results.push(ImportResult {
                    url,
                    name,
                    status: ImportStatus::Failed,
                    error_message: Some(e.to_string()),
                    uid: None,
                });
            }
        }
    }

    let processed = success_results.len() + failed_results.len();
    tracker.emit(
        "finalizing",
        processed,
        None,
        Some("导入阶段完成，正在收尾".to_string()),
    );

    (success_results, failed_results)
}

/// 生成订阅名称
fn generate_subscription_name(url: &str, options: &BatchImportOptions) -> Option<String> {
    if !options.auto_generate_names {
        return None;
    }

    // 从URL中提取域名作为基础名称
    let base_name = if let Ok(parsed_url) = Url::parse(url) {
        parsed_url.host_str().unwrap_or("订阅").to_string()
    } else {
        "订阅".to_string()
    };

    // 添加前缀
    let name = if let Some(prefix) = &options.name_prefix {
        format!("{}{}", prefix, base_name)
    } else {
        base_name
    };

    Some(name)
}

// ===== 批量导出功能 =====

/// 导出预览结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportPreview {
    pub format: String,
    pub subscription_count: u32,
    pub content_size: u64,
    pub preview_content: String,
    pub include_settings: bool,
}

/// 导出选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub format: String,           // 导出格式: json, yaml, txt, clash
    pub include_settings: bool,   // 是否包含设置
    pub include_groups: bool,     // 是否包含分组信息
    pub compress: bool,           // 是否压缩
    pub encrypt: bool,            // 是否加密
    pub password: Option<String>, // 加密密码
}

/// 批量导出订阅
#[tauri::command]
pub async fn batch_export_subscriptions(
    subscription_uids: Vec<String>,
    options: ExportOptions,
) -> Result<String, String> {
    let _start_time = std::time::Instant::now();

    match options.format.as_str() {
        "json" => export_as_json(subscription_uids, &options).await,
        "yaml" => export_as_yaml(subscription_uids, &options).await,
        "txt" => export_as_text(subscription_uids).await,
        "clash" => export_as_clash_config(subscription_uids, &options).await,
        _ => Err("不支持的导出格式".to_string()),
    }
}

/// 导出到文件
#[tauri::command]
pub async fn export_subscriptions_to_file(
    subscription_uids: Vec<String>,
    file_path: String,
    options: ExportOptions,
) -> Result<(), String> {
    let export_data = batch_export_subscriptions(subscription_uids, options).await?;

    std::fs::write(&file_path, export_data).map_err(|e| format!("写入文件失败: {}", e))?;

    Ok(())
}

/// 获取导出预览
#[tauri::command]
pub async fn preview_export(
    subscription_uids: Vec<String>,
    options: ExportOptions,
) -> Result<ExportPreview, String> {
    let export_data =
        batch_export_subscriptions(subscription_uids.clone(), options.clone()).await?;

    let preview = ExportPreview {
        format: options.format,
        subscription_count: subscription_uids.len() as u32,
        content_size: export_data.len() as u64,
        preview_content: if export_data.len() > 1000 {
            format!("{}...", &export_data[..1000])
        } else {
            export_data
        },
        include_settings: options.include_settings,
    };

    Ok(preview)
}

/// 获取所有订阅用于导出
#[tauri::command]
pub async fn get_all_subscriptions_for_export() -> Result<Vec<ExportableSubscription>, String> {
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    let empty_vec = Vec::new();
    let items = profiles_ref.items.as_ref().unwrap_or(&empty_vec);

    let mut exportable_subscriptions = Vec::new();

    for item in items {
        // 只导出remote类型的订阅（即有URL的订阅）
        if item.itype.as_ref() == Some(&"remote".to_string()) {
            let exportable = ExportableSubscription {
                uid: item.uid.as_ref().unwrap_or(&"unknown".to_string()).clone(),
                name: item
                    .name
                    .as_ref()
                    .unwrap_or(&"未命名订阅".to_string())
                    .clone(),
                url: item.url.clone(),
                subscription_type: item
                    .itype
                    .as_ref()
                    .unwrap_or(&"unknown".to_string())
                    .clone(),
                created_at: chrono::Utc::now().timestamp(), // 创建时间暂时使用当前时间
                updated_at: item.updated.as_ref().map(|u| *u as i64),
                node_count: 0, // 节点数量需要解析配置文件获得，暂时设为0
                is_valid: true,
            };
            exportable_subscriptions.push(exportable);
        }
    }

    Ok(exportable_subscriptions)
}

/// 可导出的订阅信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportableSubscription {
    pub uid: String,
    pub name: String,
    pub url: Option<String>,
    pub subscription_type: String,
    pub created_at: i64,
    pub updated_at: Option<i64>,
    pub node_count: u32,
    pub is_valid: bool,
}

// 导出格式实现

async fn export_as_json(
    subscription_uids: Vec<String>,
    options: &ExportOptions,
) -> Result<String, String> {
    let mut export_obj = serde_json::Map::new();

    // 添加元数据
    export_obj.insert(
        "export_time".to_string(),
        serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
    );
    export_obj.insert(
        "format_version".to_string(),
        serde_json::Value::String("1.0".to_string()),
    );
    export_obj.insert(
        "exported_by".to_string(),
        serde_json::Value::String("Liebesu_Clash".to_string()),
    );

    // 添加订阅数据
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    let empty_vec = Vec::new();
    let items = profiles_ref.items.as_ref().unwrap_or(&empty_vec);

    let mut subscriptions = Vec::new();
    for uid in subscription_uids {
        // 从实际配置中查找对应的订阅
        if let Some(item) = items.iter().find(|item| item.uid.as_ref() == Some(&uid)) {
            let subscription = serde_json::json!({
                "uid": uid,
                "name": item.name.as_ref().unwrap_or(&"未命名订阅".to_string()),
                "url": item.url.as_ref().unwrap_or(&"".to_string()),
                "type": item.itype.as_ref().unwrap_or(&"unknown".to_string()),
                "created_at": chrono::Utc::now().timestamp(),
                "updated_at": item.updated.as_ref().map(|u| *u as i64).unwrap_or_else(|| chrono::Utc::now().timestamp()),
                "valid": true,
                "user_agent": item.option.as_ref().and_then(|opt| opt.user_agent.as_ref()),
                "update_interval": item.option.as_ref().and_then(|opt| opt.update_interval)
            });
            subscriptions.push(subscription);
        }
    }

    export_obj.insert(
        "subscriptions".to_string(),
        serde_json::Value::Array(subscriptions),
    );

    // 可选包含设置
    if options.include_settings {
        export_obj.insert(
            "settings".to_string(),
            serde_json::json!({
                "auto_update": true,
                "update_interval": 86400,
                "proxy_mode": "rule",
                "mixed_port": 7890,
                "socks_port": 7891
            }),
        );
    }

    // 可选包含分组
    if options.include_groups {
        export_obj.insert(
            "groups".to_string(),
            serde_json::json!([
                {
                    "id": "group1",
                    "name": "美国节点",
                    "type": "Region",
                    "subscription_uids": ["sub1"]
                }
            ]),
        );
    }

    serde_json::to_string_pretty(&export_obj).map_err(|e| format!("JSON序列化失败: {}", e))
}

async fn export_as_yaml(
    subscription_uids: Vec<String>,
    options: &ExportOptions,
) -> Result<String, String> {
    let json_data = export_as_json(subscription_uids, options).await?;
    let json_value: serde_json::Value =
        serde_json::from_str(&json_data).map_err(|e| format!("JSON解析失败: {}", e))?;

    serde_yaml_ng::to_string(&json_value).map_err(|e| format!("YAML序列化失败: {}", e))
}

async fn export_as_text(subscription_uids: Vec<String>) -> Result<String, String> {
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    let empty_vec = Vec::new();
    let items = profiles_ref.items.as_ref().unwrap_or(&empty_vec);

    let mut lines = Vec::new();
    lines.push(format!(
        "# 订阅导出 - {}",
        chrono::Utc::now().format("%Y-%m-%d %H:%M:%S")
    ));
    lines.push("# 每行一个订阅链接".to_string());
    lines.push(format!("# 导出数量: {}", subscription_uids.len()));
    lines.push("".to_string());

    for uid in subscription_uids {
        // 从实际配置读取订阅URL
        if let Some(item) = items.iter().find(|item| item.uid.as_ref() == Some(&uid)) {
            if let Some(url) = &item.url {
                lines.push(format!("{}", url));
            }
        }
    }

    Ok(lines.join("\n"))
}

async fn export_as_clash_config(
    subscription_uids: Vec<String>,
    options: &ExportOptions,
) -> Result<String, String> {
    let mut config = serde_yaml_ng::Mapping::new();

    // 基础配置
    if options.include_settings {
        config.insert(
            serde_yaml_ng::Value::String("port".to_string()),
            serde_yaml_ng::Value::Number(serde_yaml_ng::Number::from(7890)),
        );
        config.insert(
            serde_yaml_ng::Value::String("socks-port".to_string()),
            serde_yaml_ng::Value::Number(serde_yaml_ng::Number::from(7891)),
        );
        config.insert(
            serde_yaml_ng::Value::String("mode".to_string()),
            serde_yaml_ng::Value::String("rule".to_string()),
        );
        config.insert(
            serde_yaml_ng::Value::String("log-level".to_string()),
            serde_yaml_ng::Value::String("info".to_string()),
        );
        config.insert(
            serde_yaml_ng::Value::String("external-controller".to_string()),
            serde_yaml_ng::Value::String("127.0.0.1:9090".to_string()),
        );
    }

    // 代理提供者
    let mut proxy_providers = serde_yaml_ng::Mapping::new();
    for (index, uid) in subscription_uids.iter().enumerate() {
        let mut provider = serde_yaml_ng::Mapping::new();
        provider.insert(
            serde_yaml_ng::Value::String("type".to_string()),
            serde_yaml_ng::Value::String("http".to_string()),
        );
        provider.insert(
            serde_yaml_ng::Value::String("url".to_string()),
            serde_yaml_ng::Value::String(format!("https://example.com/sub/{}", uid)),
        );
        provider.insert(
            serde_yaml_ng::Value::String("interval".to_string()),
            serde_yaml_ng::Value::Number(serde_yaml_ng::Number::from(3600)),
        );
        provider.insert(
            serde_yaml_ng::Value::String("path".to_string()),
            serde_yaml_ng::Value::String(format!("./providers/provider_{}.yaml", index + 1)),
        );
        provider.insert(
            serde_yaml_ng::Value::String("health-check".to_string()),
            serde_yaml_ng::Value::Mapping({
                let mut health_check = serde_yaml_ng::Mapping::new();
                health_check.insert(
                    serde_yaml_ng::Value::String("enable".to_string()),
                    serde_yaml_ng::Value::Bool(true),
                );
                health_check.insert(
                    serde_yaml_ng::Value::String("interval".to_string()),
                    serde_yaml_ng::Value::Number(serde_yaml_ng::Number::from(600)),
                );
                health_check.insert(
                    serde_yaml_ng::Value::String("url".to_string()),
                    serde_yaml_ng::Value::String("http://www.gstatic.com/generate_204".to_string()),
                );
                health_check
            }),
        );

        proxy_providers.insert(
            serde_yaml_ng::Value::String(format!("provider_{}", index + 1)),
            serde_yaml_ng::Value::Mapping(provider),
        );
    }

    if !proxy_providers.is_empty() {
        config.insert(
            serde_yaml_ng::Value::String("proxy-providers".to_string()),
            serde_yaml_ng::Value::Mapping(proxy_providers),
        );
    }

    // 代理组
    if options.include_groups {
        let mut proxy_groups = Vec::new();

        // 自动选择组
        let mut auto_group = serde_yaml_ng::Mapping::new();
        auto_group.insert(
            serde_yaml_ng::Value::String("name".to_string()),
            serde_yaml_ng::Value::String("自动选择".to_string()),
        );
        auto_group.insert(
            serde_yaml_ng::Value::String("type".to_string()),
            serde_yaml_ng::Value::String("url-test".to_string()),
        );
        auto_group.insert(
            serde_yaml_ng::Value::String("use".to_string()),
            serde_yaml_ng::Value::Sequence(
                subscription_uids
                    .iter()
                    .enumerate()
                    .map(|(i, _)| serde_yaml_ng::Value::String(format!("provider_{}", i + 1)))
                    .collect(),
            ),
        );
        proxy_groups.push(serde_yaml_ng::Value::Mapping(auto_group));

        config.insert(
            serde_yaml_ng::Value::String("proxy-groups".to_string()),
            serde_yaml_ng::Value::Sequence(proxy_groups),
        );
    }

    serde_yaml_ng::to_string(&config).map_err(|e| format!("Clash配置序列化失败: {}", e))
}
