use crate::config::{
    Config,
    subscription_fetch::{FetchSummary, RemoteSubscriptionConfig},
};
use crate::core::{handle::Handle, Timer};
use crate::logging;
use crate::process::AsyncHandler;
use crate::utils::logging::Type;

use super::{
    CmdResult,
    batch_import::{BatchImportOptions, BatchImportResult},
};

use anyhow::{Result, anyhow};
use percent_encoding::percent_decode_str;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::Duration;
use url::Url;

const FETCH_TIMEOUT_SECONDS: u64 = 45;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchPreviewItem {
    pub url: String,
    pub status: String,
    pub name: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FetchPreviewResult {
    pub total: usize,
    pub valid: usize,
    pub invalid: usize,
    pub duplicate: usize,
    pub preview: Vec<FetchPreviewItem>,
}

#[tauri::command]
pub async fn get_remote_subscription_config() -> CmdResult<RemoteSubscriptionConfig> {
    let verge = Config::verge().await;
    let config = verge
        .latest_ref()
        .subscription_fetch
        .clone()
        .unwrap_or_default();
    Ok(config)
}

#[tauri::command]
pub async fn save_remote_subscription_config(config: RemoteSubscriptionConfig) -> CmdResult {
    let verge = Config::verge().await;
    let mut draft = verge.draft_mut();
    draft.subscription_fetch = Some(config.clone());
    verge.apply();

    // 刷新定时任务
    AsyncHandler::spawn(|| async {
        if let Err(err) = Timer::global().refresh().await {
            logging!(error, Type::Timer, "刷新定时任务失败: {}", err);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn fetch_subscription_preview(source_url: String) -> CmdResult<FetchPreviewResult> {
    let text = fetch_remote_text(&source_url).await?;
    let urls = parse_subscription_lines(&text);

    let mut valid_urls = Vec::new();
    let mut invalid = Vec::new();

    for url in urls {
        match validate_url(&url) {
            Ok(_) => valid_urls.push(url),
            Err(err) => invalid.push(FetchPreviewItem {
                url,
                status: "Invalid".into(),
                name: None,
                error_message: Some(err.to_string()),
            }),
        }
    }

    let (new_urls, duplicates) = check_duplicates(valid_urls.clone())
        .await
        .map_err(|err| err.to_string())?;

    let preview = new_urls
        .into_iter()
        .map(|url| FetchPreviewItem {
            name: Some(generate_name(&url)),
            url,
            status: "Success".into(),
            error_message: None,
        })
        .collect::<Vec<_>>();

    let duplicate_items = duplicates
        .into_iter()
        .map(|url| FetchPreviewItem {
            name: None,
            url,
            status: "Duplicate".into(),
            error_message: Some("订阅已存在".into()),
        })
        .collect::<Vec<_>>();

    let mut all_preview = Vec::new();
    all_preview.extend(preview);
    all_preview.extend(duplicate_items);
    all_preview.extend(invalid.clone());

    Ok(FetchPreviewResult {
        total: valid_urls.len() + invalid.len(),
        valid: valid_urls.len(),
        invalid: invalid.len(),
        duplicate: all_preview
            .iter()
            .filter(|item| item.status == "Duplicate")
            .count(),
        preview: all_preview,
    })
}

#[tauri::command]
pub async fn sync_subscription_from_remote(
    source_url: Option<String>,
    options: Option<super::batch_import::BatchImportOptions>,
) -> CmdResult<FetchSummary> {
    let fetch_config = Config::verge()
        .await
        .latest_ref()
        .subscription_fetch
        .clone()
        .unwrap_or_default();

    let url = source_url
        .or(fetch_config.source_url.clone())
        .ok_or_else(|| "尚未配置订阅源URL".to_string())?;

    let text = fetch_remote_text(&url).await?;
    let urls = parse_subscription_lines(&text);
    let (valid_urls, invalid_results) = validate_urls(urls);
    let (new_urls, duplicate_results) = check_duplicates(valid_urls.clone())
        .await
        .map_err(|err| err.to_string())?;

    let options = options.unwrap_or_else(|| BatchImportOptions {
        skip_duplicates: true,
        auto_generate_names: true,
        name_prefix: None,
        default_user_agent: Some("clash-verge-rev".into()),
        update_interval: fetch_config.resolved_interval_minutes_i32(),
    });

    let mut combined_text = String::new();
    for url in &new_urls {
        combined_text.push_str(url);
        combined_text.push('\n');
    }

    let import_result: BatchImportResult = if !combined_text.trim().is_empty() {
        let app_handle = Handle::global()
            .app_handle()
            .ok_or_else(|| "AppHandle not initialized".to_string())?;
        super::batch_import::batch_import_from_text(app_handle, combined_text, Some(options))
            .await
            .map_err(|e| format!("批量导入失败: {e}"))?
    } else {
        BatchImportResult {
            total_input: new_urls.len(),
            valid_urls: new_urls.len(),
            imported: 0,
            duplicates: duplicate_results.len(),
            failed: 0,
            results: Vec::new(),
            import_duration: 0,
        }
    };

    // 更新配置
    let summary = FetchSummary {
        fetched_urls: valid_urls.len(),
        imported: import_result.imported,
        duplicates: duplicate_results.len(),
        failed: import_result.failed + invalid_results.len(),
        message: None,
    };

    update_fetch_metadata(summary.clone()).await?;

    logging!(
        info,
        Type::Cmd,
        "[订阅同步] 来源: {} -> 导入 {} 个",
        url,
        summary.imported
    );

    Ok(summary)
}

async fn update_fetch_metadata(summary: FetchSummary) -> CmdResult {
    let verge = Config::verge().await;
    let mut draft = verge.draft_mut();
    let mut config = draft.subscription_fetch.clone().unwrap_or_default();
    config.last_sync_at = Some(chrono::Utc::now().timestamp());
    config.last_result = Some(summary);
    draft.subscription_fetch = Some(config);
    verge.apply();

    Ok(())
}

async fn fetch_remote_text(source_url: &str) -> CmdResult<String> {
    validate_url(source_url).map_err(|err| err.to_string())?;

    let client = Client::builder()
        .timeout(Duration::from_secs(FETCH_TIMEOUT_SECONDS))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let response = client
        .get(source_url)
        .send()
        .await
        .map_err(|e| format!("请求订阅列表失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("订阅列表返回异常状态: {e}"))?;

    response
        .text()
        .await
        .map_err(|e| format!("读取订阅列表内容失败: {e}"))
}

fn parse_subscription_lines(text: &str) -> Vec<String> {
    text.lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                None
            } else {
                Some(trimmed.trim_start_matches('@').to_string())
            }
        })
        .collect()
}

fn validate_url(url: &str) -> Result<()> {
    let decoded = percent_decode_str(url)
        .decode_utf8()
        .map_err(|e| anyhow!("URL 解码失败: {e}"))?;

    let parsed = Url::parse(decoded.as_ref()).map_err(|e| anyhow!("URL 格式错误: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(()),
        _ => Err(anyhow!("不支持的协议: {}", parsed.scheme())),
    }
}

fn validate_urls(urls: Vec<String>) -> (Vec<String>, Vec<String>) {
    let mut valids = Vec::new();
    let mut invalids = Vec::new();

    for url in urls {
        match validate_url(&url) {
            Ok(_) => valids.push(url),
            Err(_) => invalids.push(url),
        }
    }

    (valids, invalids)
}

async fn check_duplicates(urls: Vec<String>) -> Result<(Vec<String>, Vec<String>)> {
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    let empty_vec = Vec::new();
    let existing_urls: HashSet<String> = profiles_ref
        .items
        .as_ref()
        .unwrap_or(&empty_vec)
        .iter()
        .filter_map(|item| item.url.clone())
        .collect();

    let mut new_urls = Vec::new();
    let mut duplicate_urls = Vec::new();

    for url in urls {
        if existing_urls.contains(&url) {
            duplicate_urls.push(url);
        } else {
            new_urls.push(url);
        }
    }

    Ok((new_urls, duplicate_urls))
}

fn generate_name(url: &str) -> String {
    Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(|host| host.to_string()))
        .unwrap_or_else(|| "订阅".into())
}

// === 定时任务集成 ===
