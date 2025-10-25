use tauri::Emitter;

use super::CmdResult;
use crate::{
    core::{handle::Handle, tray::Tray},
    ipc::IpcManager,
    logging,
    state::proxy::ProxyRequestCache,
    utils::logging::Type,
};
use std::time::Duration;

const PROXIES_REFRESH_INTERVAL: Duration = Duration::from_secs(60);
const PROVIDERS_REFRESH_INTERVAL: Duration = Duration::from_secs(60);

#[tauri::command]
pub async fn get_proxies() -> CmdResult<serde_json::Value> {
    let cache = ProxyRequestCache::global();
    let key = ProxyRequestCache::make_key("proxies", "default");
    let value = cache
        .get_or_fetch(key.clone(), PROXIES_REFRESH_INTERVAL, || async {
            let manager = IpcManager::global();
            manager.get_proxies().await.unwrap_or_else(|e| {
                logging!(error, Type::Cmd, "Failed to fetch proxies: {e}");
                // 始终返回与前端约定的结构，避免解析失败
                serde_json::json!({ "proxies": {} })
            })
        })
        .await;
    // 规范化返回值，确保一定包含 { "proxies": { ... } }
    let normalized = match value.as_object() {
        Some(map) if map.contains_key("proxies") => (*value).clone(),
        _ => serde_json::json!({ "proxies": {} }),
    };

    // 如果内容为空，移除缓存，避免长时间缓存空数据
    if normalized
        .get("proxies")
        .and_then(|p| p.as_object())
        .map(|m| m.is_empty())
        .unwrap_or(true)
    {
        cache.map.remove(&key);
    }

    Ok(normalized)
}

/// 强制刷新代理缓存用于profile切换
#[tauri::command]
pub async fn force_refresh_proxies() -> CmdResult<serde_json::Value> {
    let cache = ProxyRequestCache::global();
    let key = ProxyRequestCache::make_key("proxies", "default");
    cache.map.remove(&key);
    get_proxies().await
}

#[tauri::command]
pub async fn get_providers_proxies() -> CmdResult<serde_json::Value> {
    let cache = ProxyRequestCache::global();
    let key = ProxyRequestCache::make_key("providers", "default");
    let value = cache
        .get_or_fetch(key.clone(), PROVIDERS_REFRESH_INTERVAL, || async {
            let manager = IpcManager::global();
            manager.get_providers_proxies().await.unwrap_or_else(|e| {
                logging!(error, Type::Cmd, "Failed to fetch provider proxies: {e}");
                // 始终返回与前端约定的结构
                serde_json::json!({ "providers": {} })
            })
        })
        .await;
    // 规范化返回值，确保一定包含 { "providers": { ... } }
    let normalized = match value.as_object() {
        Some(map) if map.contains_key("providers") => (*value).clone(),
        _ => serde_json::json!({ "providers": {} }),
    };

    // 如果内容为空，移除缓存，避免长时间缓存空数据
    if normalized
        .get("providers")
        .and_then(|p| p.as_object())
        .map(|m| m.is_empty())
        .unwrap_or(true)
    {
        cache.map.remove(&key);
    }

    Ok(normalized)
}

/// 同步托盘和GUI的代理选择状态
#[tauri::command]
pub async fn sync_tray_proxy_selection() -> CmdResult<()> {
    use crate::core::tray::Tray;

    match Tray::global().update_menu().await {
        Ok(_) => {
            logging!(info, Type::Cmd, "Tray proxy selection synced successfully");
            Ok(())
        }
        Err(e) => {
            logging!(error, Type::Cmd, "Failed to sync tray proxy selection: {e}");
            Err(e.to_string())
        }
    }
}

/// 更新代理选择并同步托盘和GUI状态
#[tauri::command]
pub async fn update_proxy_and_sync(group: String, proxy: String) -> CmdResult<()> {
    match IpcManager::global().update_proxy(&group, &proxy).await {
        Ok(_) => {
            // println!("Proxy updated successfully: {} -> {}", group,proxy);
            logging!(
                info,
                Type::Cmd,
                "Proxy updated successfully: {} -> {}",
                group,
                proxy
            );

            let cache = crate::state::proxy::ProxyRequestCache::global();
            let key = crate::state::proxy::ProxyRequestCache::make_key("proxies", "default");
            cache.map.remove(&key);

            if let Err(e) = Tray::global().update_menu().await {
                logging!(error, Type::Cmd, "Failed to sync tray menu: {}", e);
            }

            if let Some(app_handle) = Handle::global().app_handle() {
                let _ = app_handle.emit("verge://force-refresh-proxies", ());
                let _ = app_handle.emit("verge://refresh-proxy-config", ());
            }

            logging!(
                info,
                Type::Cmd,
                "Proxy and sync completed successfully: {} -> {}",
                group,
                proxy
            );
            Ok(())
        }
        Err(e) => {
            println!("1111111111111111");
            logging!(
                error,
                Type::Cmd,
                "Failed to update proxy: {} -> {}, error: {}",
                group,
                proxy,
                e
            );
            Err(e.to_string())
        }
    }
}
