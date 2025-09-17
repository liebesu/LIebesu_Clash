use super::CmdResult;
use crate::{
    config::{Config, PrfItem, PrfOption},
    feat,
    logging,
    utils::logging::Type,
    wrap_err,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;
use url::Url;

/// 批量导入结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchImportResult {
    pub total_input: usize,       // 输入的总数
    pub valid_urls: usize,        // 有效的URL数量
    pub imported: usize,          // 成功导入的数量
    pub duplicates: usize,        // 重复的数量
    pub failed: usize,            // 失败的数量
    pub results: Vec<ImportResult>, // 详细结果
    pub import_duration: u64,     // 导入耗时（毫秒）
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
    Success,      // 成功导入
    Duplicate,    // 重复（已存在）
    Failed,       // 导入失败
    Invalid,      // 无效的URL
}

/// 导入配置选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchImportOptions {
    pub skip_duplicates: bool,    // 跳过重复项
    pub auto_generate_names: bool, // 自动生成名称
    pub name_prefix: Option<String>, // 名称前缀
    pub default_user_agent: Option<String>, // 默认User-Agent
    pub update_interval: Option<i32>, // 更新间隔（分钟）
}

impl Default for BatchImportOptions {
    fn default() -> Self {
        Self {
            skip_duplicates: true,
            auto_generate_names: true,
            name_prefix: None,
            default_user_agent: Some("clash-verge-rev".to_string()),
            update_interval: Some(60 * 24), // 24小时
        }
    }
}

/// 从文本批量导入订阅
#[tauri::command]
pub async fn batch_import_from_text(
    text_content: String,
    options: Option<BatchImportOptions>,
) -> CmdResult<BatchImportResult> {
    let start_time = std::time::Instant::now();
    let options = options.unwrap_or_default();
    
    logging!(info, Type::Cmd, true, "[批量导入] 从文本导入订阅，内容长度: {}", text_content.len());
    
    // 解析文本内容
    let urls = parse_subscription_urls(&text_content)?;
    let total_input = urls.len();
    
    logging!(info, Type::Cmd, true, "[批量导入] 解析出 {} 个URL", total_input);
    
    // 验证和过滤URL
    let (valid_urls, invalid_results) = validate_urls(urls);
    let valid_count = valid_urls.len();
    
    logging!(info, Type::Cmd, true, "[批量导入] 有效URL: {}, 无效URL: {}", valid_count, invalid_results.len());
    
    // 检查重复
    let (new_urls, duplicate_results) = if options.skip_duplicates {
        check_duplicates(valid_urls).await?
    } else {
        (valid_urls, Vec::new())
    };
    
    let duplicate_count = duplicate_results.len();
    logging!(info, Type::Cmd, true, "[批量导入] 重复URL: {}", duplicate_count);
    
    // 执行导入
    let (success_results, failed_results) = import_subscriptions(new_urls, &options).await;
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
    
    logging!(info, Type::Cmd, true, 
        "[批量导入] 完成 - 总数: {}, 有效: {}, 导入: {}, 重复: {}, 失败: {}, 耗时: {}ms",
        total_input, valid_count, imported_count, duplicate_count, failed_count, import_duration
    );
    
    Ok(result)
}

/// 从文件批量导入订阅
#[tauri::command]
pub async fn batch_import_from_file(
    file_path: String,
    options: Option<BatchImportOptions>,
) -> CmdResult<BatchImportResult> {
    logging!(info, Type::Cmd, true, "[批量导入] 从文件导入: {}", file_path);
    
    // 读取文件内容
    let content = tokio::fs::read_to_string(&file_path).await
        .map_err(|e| format!("读取文件失败: {}", e))?;
    
    // 调用文本导入逻辑
    batch_import_from_text(content, options).await
}

/// 从剪贴板批量导入订阅
#[tauri::command]
pub async fn batch_import_from_clipboard(
    options: Option<BatchImportOptions>,
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
    
    logging!(info, Type::Cmd, true, "[批量导入预览] 内容长度: {}", text_content.len());
    
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
    let preview_results: Vec<ImportResult> = new_urls.into_iter().map(|url| {
        ImportResult {
            name: generate_subscription_name(&url, &options),
            url,
            status: ImportStatus::Success,
            error_message: None,
            uid: Some(Uuid::new_v4().to_string()),
        }
    }).collect();
    
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
    
    // 尝试解析JSON格式
    if let Ok(json_urls) = parse_json_urls(content) {
        urls.extend(json_urls);
        return Ok(urls);
    }
    
    // 尝试解析YAML格式
    if let Ok(yaml_urls) = parse_yaml_urls(content) {
        urls.extend(yaml_urls);
        return Ok(urls);
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
    let unique_urls: Vec<String> = urls.into_iter().collect::<HashSet<_>>().into_iter().collect();
    Ok(unique_urls)
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
fn parse_yaml_urls(content: &str) -> Result<Vec<String>, serde_yaml::Error> {
    let value: serde_yaml::Value = serde_yaml::from_str(content)?;
    let mut urls = Vec::new();
    
    if let Some(sequence) = value.as_sequence() {
        for item in sequence {
            if let Some(url_str) = item.as_str() {
                urls.push(url_str.to_string());
            } else if let Some(mapping) = item.as_mapping() {
                for (key, val) in mapping {
                    if let (Some(key_str), Some(val_str)) = (key.as_str(), val.as_str()) {
                        if key_str.to_lowercase().contains("url") || key_str.to_lowercase().contains("link") {
                            urls.push(val_str.to_string());
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
                    return Some(url_str.to_string());
                }
            }
        }
    }
    None
}

/// 从单行文本中提取URL
fn extract_url_from_line(line: &str) -> Option<String> {
    // 直接是URL的情况
    if line.starts_with("http://") || line.starts_with("https://") {
        return Some(line.to_string());
    }
    
    // 包含URL的情况（用空格或其他分隔符分隔）
    for part in line.split_whitespace() {
        if part.starts_with("http://") || part.starts_with("https://") {
            return Some(part.to_string());
        }
    }
    
    // 使用正则表达式提取URL（简单实现）
    if let Some(start) = line.find("http") {
        let url_part = &line[start..];
        if let Some(end) = url_part.find(' ') {
            return Some(url_part[..end].to_string());
        } else {
            return Some(url_part.to_string());
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
    let existing_urls: HashSet<String> = profiles_ref.items
        .iter()
        .filter_map(|item| {
            item.option.as_ref()?.url.as_ref().map(|url| url.clone())
        })
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
) -> (Vec<ImportResult>, Vec<ImportResult>) {
    let mut success_results = Vec::new();
    let mut failed_results = Vec::new();
    
    for url in urls {
        let name = generate_subscription_name(&url, options);
        
        // 创建订阅项
        let uid = Uuid::new_v4().to_string();
        let item = PrfItem {
            uid: Some(uid.clone()),
            name: name.clone(),
            desc: None,
            file: None,
            url: None,
            selected: None,
            extra: None,
            updated: None,
            option: Some(PrfOption {
                url: Some(url.clone()),
                user_agent: options.default_user_agent.clone(),
                update_interval: options.update_interval,
                ..Default::default()
            }),
        };
        
        // 尝试导入
        match feat::import_profile(url.clone(), Some(item.option.clone().unwrap())).await {
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
