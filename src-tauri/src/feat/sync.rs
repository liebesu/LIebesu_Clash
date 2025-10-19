use crate::cmd::subscription_groups::get_favorite_subscription_uids;
use crate::config::{Config, PrfItem, PrfOption};
use crate::core::{CoreManager, handle};
use crate::state::subscription_sync::{SUBSCRIPTION_SYNC_STORE, SubscriptionSyncState, SyncPhase};
use crate::utils::network::{resolve_mixed_port, wait_for_port_ready};
use crate::{logging, utils::logging::Type};
use anyhow::{Context, Result, anyhow};
use tokio::time::{Duration, sleep};

pub async fn schedule_subscription_sync(uid: String, phase: SyncPhase) -> Result<()> {
    let options = {
        let store = SUBSCRIPTION_SYNC_STORE.inner.read();
        store.preferences()
    };

    let (item, option) = load_profile_for_sync(&uid).await?;
    let mut attempt = 0;
    let mut delay = options.backoff_base;

    while attempt < options.max_retry {
        attempt += 1;
        let mut merged_option = option.clone();
        if attempt > 1 {
            merged_option = merged_option.map(|mut opt| {
                opt.self_proxy = Some(true);
                opt.with_proxy = Some(false);
                opt
            });

            if let Some(port) = resolve_mixed_port().await {
                wait_for_port_ready(port, options.backoff_max, options.backoff_base).await?;
            }
        }

        match super::profile::update_profile(uid.clone(), merged_option.clone(), Some(true)).await {
            Ok(_) => {
                let mut store = SUBSCRIPTION_SYNC_STORE.inner.write();
                store.mark_success(&uid);
                if phase == SyncPhase::Startup {
                    store.state_mut(&uid).phase = SyncPhase::Background;
                    store.decrement_startup_active();
                }
                return Ok(());
            }
            Err(err) => {
                {
                    let mut store = SUBSCRIPTION_SYNC_STORE.inner.write();
                    store.mark_failure(&uid, err.to_string());
                }
                logging!(
                    warn,
                    Type::Config,
                    "订阅 {} 同步失败 (尝试 {}/{}): {}",
                    item.name.clone().unwrap_or(uid.clone()),
                    attempt,
                    options.max_retry,
                    err
                );

                if attempt >= options.max_retry {
                    handle::Handle::notice_message(
                        "subscription_sync::failed",
                        format!("{}: {}", item.name.clone().unwrap_or(uid.clone()), err),
                    );
                    if phase == SyncPhase::Startup {
                        let mut store = SUBSCRIPTION_SYNC_STORE.inner.write();
                        store.decrement_startup_active();
                    }
                    break;
                }

                sleep(delay).await;
                delay = (delay * 2).min(options.backoff_max);
            }
        }
    }

    Err(anyhow!(
        "subscription sync failed after {} attempts",
        options.max_retry
    ))
}

async fn load_profile_for_sync(uid: &str) -> Result<(PrfItem, Option<PrfOption>)> {
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    let profile = profiles_ref
        .get_item(&uid.to_string())
        .context("profile not found")?;
    Ok((profile.clone(), profile.option.clone()))
}
