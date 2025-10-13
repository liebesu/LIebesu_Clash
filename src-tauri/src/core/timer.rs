use crate::{
    cmd::subscription_groups::get_favorite_subscription_uids,
    config::Config,
    feat, logging, logging_error, singleton,
    state::subscription_sync::{SUBSCRIPTION_SYNC_STORE, SubscriptionSyncState, SyncPhase},
    utils::logging::Type,
};
use anyhow::{Context, Result};
use delay_timer::prelude::{DelayTimer, DelayTimerBuilder, TaskBuilder};
use parking_lot::RwLock;
use std::{
    collections::HashMap,
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::SystemTime,
};

type TaskID = u64;

#[derive(Debug, Clone)]
pub struct TimerTask {
    pub task_id: TaskID,
    pub interval_minutes: u64,
    #[allow(unused)]
    pub last_run: i64, // Timestamp of last execution
}

pub struct Timer {
    /// cron manager
    pub delay_timer: Arc<RwLock<DelayTimer>>,

    /// save the current state - using RwLock for better read concurrency
    pub timer_map: Arc<RwLock<HashMap<String, TimerTask>>>,

    /// increment id - atomic counter for better performance
    pub timer_count: AtomicU64,

    /// Flag to mark if timer is initialized - atomic for better performance
    pub initialized: AtomicBool,
}

// Use singleton macro
singleton!(Timer, TIMER_INSTANCE);

impl Timer {
    fn new() -> Self {
        Timer {
            delay_timer: Arc::new(RwLock::new(DelayTimerBuilder::default().build())),
            timer_map: Arc::new(RwLock::new(HashMap::new())),
            timer_count: AtomicU64::new(1),
            initialized: AtomicBool::new(false),
        }
    }

    /// Initialize timer with better error handling and atomic operations
    pub async fn init(&self) -> Result<()> {
        // Use compare_exchange for thread-safe initialization check
        if self
            .initialized
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            logging!(debug, Type::Timer, "Timer already initialized, skipping...");
            return Ok(());
        }

        // Initialize timer tasks
        if let Err(e) = self.refresh().await {
            // Reset initialization flag on error
            self.initialized.store(false, Ordering::SeqCst);
            logging_error!(Type::Timer, false, "Failed to initialize timer: {}", e);
            return Err(e);
        }

        // Log timer info first
        {
            let timer_map = self.timer_map.read();
            logging!(
                info,
                Type::Timer,
                "已注册的定时任务数量: {}",
                timer_map.len()
            );

            for (uid, task) in timer_map.iter() {
                logging!(
                    info,
                    Type::Timer,
                    "注册了定时任务 - uid={}, interval={}min, task_id={}",
                    uid,
                    task.interval_minutes,
                    task.task_id
                );
            }
        }

        // 使用启动节流队列逻辑
        logging!(info, Type::Timer, "准备启动节流队列...");
        if let Err(e) = self.prepare_profiles().await {
            logging_error!(Type::Timer, false, "启动节流队列准备失败: {}", e);
        }

        logging!(info, Type::Timer, "Timer initialization completed");
        Ok(())
    }

    /// Refresh timer tasks with better error handling
    pub async fn refresh(&self) -> Result<()> {
        // Generate diff outside of lock to minimize lock contention
        let diff_map = self.gen_diff().await;

        if diff_map.is_empty() {
            logging!(debug, Type::Timer, "No timer changes needed");
            return Ok(());
        }

        logging!(
            info,
            Type::Timer,
            "Refreshing {} timer tasks",
            diff_map.len()
        );

        // Apply changes - first collect operations to perform without holding locks
        let mut operations_to_add: Vec<(String, TaskID, u64)> = Vec::new();
        let _operations_to_remove: Vec<String> = Vec::new();

        // Perform sync operations while holding locks
        {
            let mut timer_map = self.timer_map.write();
            let delay_timer = self.delay_timer.write();

            for (uid, diff) in diff_map {
                match diff {
                    DiffFlag::Del(tid) => {
                        timer_map.remove(&uid);
                        if let Err(e) = delay_timer.remove_task(tid) {
                            logging!(
                                warn,
                                Type::Timer,
                                "Failed to remove task {} for uid {}: {}",
                                tid,
                                uid,
                                e
                            );
                        } else {
                            logging!(debug, Type::Timer, "Removed task {} for uid {}", tid, uid);
                        }
                    }
                    DiffFlag::Add(tid, interval) => {
                        let task = TimerTask {
                            task_id: tid,
                            interval_minutes: interval,
                            last_run: chrono::Local::now().timestamp(),
                        };

                        timer_map.insert(uid.clone(), task);
                        operations_to_add.push((uid, tid, interval));
                    }
                    DiffFlag::Mod(tid, interval) => {
                        // Remove old task first
                        if let Err(e) = delay_timer.remove_task(tid) {
                            logging!(
                                warn,
                                Type::Timer,
                                "Failed to remove old task {} for uid {}: {}",
                                tid,
                                uid,
                                e
                            );
                        }

                        // Then add the new one
                        let task = TimerTask {
                            task_id: tid,
                            interval_minutes: interval,
                            last_run: chrono::Local::now().timestamp(),
                        };

                        timer_map.insert(uid.clone(), task);
                        operations_to_add.push((uid, tid, interval));
                    }
                }
            }
        } // Locks are dropped here

        // Now perform async operations without holding locks
        for (uid, tid, interval) in operations_to_add {
            // Re-acquire locks for individual operations
            let mut delay_timer = self.delay_timer.write();
            if let Err(e) = self.add_task(&mut delay_timer, uid.clone(), tid, interval) {
                logging_error!(Type::Timer, "Failed to add task for uid {}: {}", uid, e);

                // Rollback on failure - remove from timer_map
                self.timer_map.write().remove(&uid);
            } else {
                logging!(debug, Type::Timer, "Added task {} for uid {}", tid, uid);
            }
        }

        Ok(())
    }

    /// Generate map of profile UIDs to update intervals
    async fn gen_map(&self) -> HashMap<String, u64> {
        let mut new_map = HashMap::new();

        if let Some(items) = Config::profiles().await.latest_ref().get_items() {
            for item in items.iter() {
                if let Some(option) = item.option.as_ref()
                    && let (Some(interval), Some(uid)) = (option.update_interval, &item.uid)
                    && interval > 0
                {
                    logging!(
                        debug,
                        Type::Timer,
                        "找到定时更新配置: uid={}, interval={}min",
                        uid,
                        interval
                    );
                    new_map.insert(uid.clone(), interval);
                }
            }
        }

        logging!(
            debug,
            Type::Timer,
            "生成的定时更新配置数量: {}",
            new_map.len()
        );
        new_map
    }

    /// Generate differences between current and new timer configuration
    async fn gen_diff(&self) -> HashMap<String, DiffFlag> {
        let mut diff_map = HashMap::new();
        let new_map = self.gen_map().await;

        // Read lock for comparing current state
        let timer_map = self.timer_map.read();
        logging!(
            debug,
            Type::Timer,
            "当前 timer_map 大小: {}",
            timer_map.len()
        );

        // Find tasks to modify or delete
        for (uid, task) in timer_map.iter() {
            match new_map.get(uid) {
                Some(&interval) if interval != task.interval_minutes => {
                    // Task exists but interval changed
                    logging!(
                        debug,
                        Type::Timer,
                        "定时任务间隔变更: uid={}, 旧={}, 新={}",
                        uid,
                        task.interval_minutes,
                        interval
                    );
                    diff_map.insert(uid.clone(), DiffFlag::Mod(task.task_id, interval));
                }
                None => {
                    // Task no longer needed
                    logging!(debug, Type::Timer, "定时任务已删除: uid={}", uid);
                    diff_map.insert(uid.clone(), DiffFlag::Del(task.task_id));
                }
                _ => {
                    // Task exists with same interval, no change needed
                    logging!(debug, Type::Timer, "定时任务保持不变: uid={}", uid);
                }
            }
        }

        // Find new tasks to add
        let mut next_id = self.timer_count.load(Ordering::Relaxed);
        let original_id = next_id;

        for (uid, &interval) in new_map.iter() {
            if !timer_map.contains_key(uid) {
                logging!(
                    debug,
                    Type::Timer,
                    "新增定时任务: uid={}, interval={}min",
                    uid,
                    interval
                );
                diff_map.insert(uid.clone(), DiffFlag::Add(next_id, interval));
                next_id += 1;
            }
        }

        // Update counter only if we added new tasks
        if next_id > original_id {
            self.timer_count.store(next_id, Ordering::Relaxed);
        }

        logging!(debug, Type::Timer, "定时任务变更数量: {}", diff_map.len());
        diff_map
    }

    /// Add a timer task with better error handling
    fn add_task(
        &self,
        delay_timer: &mut DelayTimer,
        uid: String,
        tid: TaskID,
        minutes: u64,
    ) -> Result<()> {
        logging!(
            info,
            Type::Timer,
            "Adding task: uid={}, id={}, interval={}min",
            uid,
            tid,
            minutes
        );

        // Create a task with reasonable retries and backoff
        let task = TaskBuilder::default()
            .set_task_id(tid)
            .set_maximum_parallel_runnable_num(1)
            .set_frequency_repeated_by_minutes(minutes)
            .spawn_async_routine(move || {
                let uid = uid.clone();
                Box::pin(async move {
                    Self::async_task(uid).await;
                }) as Pin<Box<dyn std::future::Future<Output = ()> + Send>>
            })
            .context("failed to create timer task")?;

        delay_timer
            .add_task(task)
            .context("failed to add timer task")?;

        Ok(())
    }

    /// Get next update time for a profile
    pub async fn get_next_update_time(&self, uid: &str) -> Option<i64> {
        logging!(info, Type::Timer, "获取下次更新时间，uid={}", uid);

        // First extract timer task data without holding the lock across await
        let task_interval = {
            let timer_map = self.timer_map.read();
            match timer_map.get(uid) {
                Some(t) => t.interval_minutes,
                None => {
                    logging!(warn, Type::Timer, "找不到对应的定时任务，uid={}", uid);
                    return None;
                }
            }
        };

        // Get the profile updated timestamp - now safe to await
        let config_profiles = Config::profiles().await;
        let profiles = config_profiles.data_ref().clone();
        let items = match profiles.get_items() {
            Some(i) => i,
            None => {
                logging!(warn, Type::Timer, "获取配置列表失败");
                return None;
            }
        };

        let profile = match items.iter().find(|item| item.uid.as_deref() == Some(uid)) {
            Some(p) => p,
            None => {
                logging!(warn, Type::Timer, "找不到对应的配置，uid={}", uid);
                return None;
            }
        };

        let updated = profile.updated.unwrap_or(0) as i64;

        // Calculate next update time
        if updated > 0 && task_interval > 0 {
            let next_time = updated + (task_interval as i64 * 60);
            logging!(
                info,
                Type::Timer,
                "计算得到下次更新时间: {}, uid={}",
                next_time,
                uid
            );
            Some(next_time)
        } else {
            logging!(
                warn,
                Type::Timer,
                "更新时间或间隔无效，updated={}, interval={}",
                updated,
                task_interval
            );
            None
        }
    }

    /// Emit update events for frontend notification
    fn emit_update_event(_uid: &str, _is_start: bool) {
        {
            if _is_start {
                super::handle::Handle::notify_profile_update_started(_uid.to_string());
            } else {
                super::handle::Handle::notify_profile_update_completed(_uid.to_string());
            }
        }
    }

    /// Async task with better error handling and logging
    async fn async_task(uid: String) {
        let task_start = std::time::Instant::now();
        logging!(info, Type::Timer, "Running timer task for profile: {}", uid);

        match tokio::time::timeout(std::time::Duration::from_secs(40), async {
            Self::emit_update_event(&uid, true);

            if uid.starts_with("remote-fetch-") {
                logging!(info, Type::Timer, "执行远程订阅自动同步任务: {}", uid);
                let handle = match crate::core::handle::Handle::global().app_handle() {
                    Some(h) => h,
                    None => {
                        logging_error!(
                            Type::Timer,
                            false,
                            "自动同步远程订阅失败: {}",
                            "AppHandle 不可用"
                        );
                        return Ok(());
                    }
                };

                if let Err(err) =
                    crate::cmd::sync_subscription_from_remote(handle, None, None).await
                {
                    logging_error!(Type::Timer, false, "自动同步远程订阅失败: {}", err);
                }
                Ok(())
            } else {
                let is_current =
                    Config::profiles().await.latest_ref().current.as_ref() == Some(&uid);
                logging!(
                    info,
                    Type::Timer,
                    "配置 {} 是否为当前激活配置: {}",
                    uid,
                    is_current
                );

                feat::update_profile(uid.clone(), None, Some(is_current)).await
            }
        })
        .await
        {
            Ok(result) => match result {
                Ok(_) => {
                    let duration = task_start.elapsed().as_millis();
                    logging!(
                        info,
                        Type::Timer,
                        "Timer task completed successfully for uid: {} (took {}ms)",
                        uid,
                        duration
                    );
                }
                Err(e) => {
                    logging_error!(Type::Timer, "Failed to update profile uid {}: {}", uid, e);
                }
            },
            Err(_) => {
                logging_error!(Type::Timer, false, "Timer task timed out for uid: {}", uid);
            }
        }

        // Emit completed event
        Self::emit_update_event(&uid, false);
    }

    async fn prepare_profiles(&self) -> Result<Vec<(String, SubscriptionSyncState)>> {
        let (items, current_uid) = {
            let profiles = Config::profiles().await;
            let profiles_ref = profiles.latest_ref();
            let items = profiles_ref.get_items().cloned().unwrap_or_default();
            let current_uid = profiles_ref.get_current().clone();
            (items, current_uid)
        };

        let favorite_uids = get_favorite_subscription_uids().await;

        let (immediate, remote_profiles) = {
            let mut store = SUBSCRIPTION_SYNC_STORE.inner.write();
            let preferences = store.preferences();

            let mut remote_profiles: Vec<(String, SubscriptionSyncState)> = items
                .into_iter()
                .filter_map(|item| {
                    let uid = item.uid?;
                    let is_remote = item.itype.as_ref().is_some_and(|t| t == "remote");
                    if !is_remote {
                        return None;
                    }

                    let state = store.state_mut(&uid);
                    state.is_current = current_uid.as_ref() == Some(&uid);
                    state.is_favorite = favorite_uids.iter().any(|f| f == &uid);
                    state.phase = SyncPhase::Startup;
                    Some((uid, state.clone()))
                })
                .collect();

            // 按收藏 + 当前优先排序
            remote_profiles.sort_by(|a, b| match (a.1.is_favorite, b.1.is_favorite) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => match (a.1.is_current, b.1.is_current) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => {
                        b.1.last_success
                            .unwrap_or(SystemTime::UNIX_EPOCH)
                            .cmp(&a.1.last_success.unwrap_or(SystemTime::UNIX_EPOCH))
                    }
                },
            });

            let immediate: Vec<String> = remote_profiles
                .iter()
                .take(preferences.startup_limit.max(1))
                .map(|(uid, _)| uid.clone())
                .collect();
            let deferred: Vec<String> = remote_profiles
                .iter()
                .skip(preferences.startup_limit.max(1))
                .map(|(uid, _)| uid.clone())
                .collect();

            store.reset_queue(immediate.clone(), deferred);
            store.increment_startup_active(immediate.len());

            (immediate, remote_profiles)
        };

        for uid in immediate {
            let uid_clone = uid.clone();
            tokio::spawn(async move {
                let permit = {
                    let manager = SUBSCRIPTION_SYNC_STORE.inner.read();
                    manager.semaphore().clone()
                };
                let _permit = permit.acquire_owned().await.expect("semaphore closed");
                if let Err(err) =
                    feat::sync::schedule_subscription_sync(uid_clone.clone(), SyncPhase::Startup)
                        .await
                {
                    logging!(
                        error,
                        Type::Timer,
                        "Startup sync failed for {}: {}",
                        uid_clone,
                        err
                    );
                }
            });
        }

        self.start_background_dispatcher().await;

        Ok(remote_profiles)
    }

    async fn start_background_dispatcher(&self) {
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;

                let (batch_size, deferred_batch) = {
                    let mut store = SUBSCRIPTION_SYNC_STORE.inner.write();
                    if !store.startup_completed() {
                        // 等待启动队列完成
                        continue;
                    }
                    let prefs = store.preferences();
                    let batch = store.queue.drain_batch(prefs.max_concurrency);
                    (prefs.max_concurrency, batch)
                };

                if deferred_batch.is_empty() {
                    continue;
                }

                logging!(
                    info,
                    Type::Timer,
                    "后台调度器: 开始处理 {} 个延迟订阅",
                    deferred_batch.len()
                );

                for uid in deferred_batch {
                    let uid_clone = uid.clone();
                    tokio::spawn(async move {
                        let permit = {
                            let manager = SUBSCRIPTION_SYNC_STORE.inner.read();
                            manager.semaphore().clone()
                        };
                        let _permit = permit.acquire_owned().await.expect("semaphore closed");
                        if let Err(err) = feat::sync::schedule_subscription_sync(
                            uid_clone.clone(),
                            SyncPhase::Background,
                        )
                        .await
                        {
                            logging!(error, Type::Timer, "后台同步失败: {} - {}", uid_clone, err);
                        }
                    });
                }
            }
        });
    }
}

#[derive(Debug)]
enum DiffFlag {
    Del(TaskID),
    Add(TaskID, u64),
    Mod(TaskID, u64),
}
