use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use once_cell::sync::Lazy;
use parking_lot::RwLock;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncPhase {
    Startup,
    Background,
}

impl Default for SyncPhase {
    fn default() -> Self {
        Self::Startup
    }
}

#[derive(Debug, Clone)]
pub struct SubscriptionSyncPreferences {
    pub startup_limit: usize,
    pub batch_interval: Duration,
    pub max_concurrency: usize,
    pub max_retry: u32,
    pub backoff_base: Duration,
    pub backoff_max: Duration,
}

impl Default for SubscriptionSyncPreferences {
    fn default() -> Self {
        Self {
            startup_limit: 10,  // 提升启动限制
            batch_interval: Duration::from_secs(15),  // 减少批次间隔
            max_concurrency: 15,  // 大幅提升并发数
            max_retry: 2,  // 减少重试次数
            backoff_base: Duration::from_secs(1),  // 减少基础延迟
            backoff_max: Duration::from_secs(8),   // 减少最大延迟
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct SubscriptionSyncState {
    pub last_success: Option<SystemTime>,
    pub last_failure: Option<SystemTime>,
    pub failure_count: u32,
    pub scheduled_at: Option<Instant>,
    pub pending_retry: bool,
    pub is_current: bool,
    pub is_favorite: bool,
    pub last_error_message: Option<String>,
    pub phase: SyncPhase,
}

#[derive(Debug, Default)]
pub struct SubscriptionSyncQueue {
    immediate: VecDeque<String>,
    deferred: VecDeque<String>,
}

impl SubscriptionSyncQueue {
    pub fn load(&mut self, immediate: Vec<String>, deferred: Vec<String>) {
        self.immediate = VecDeque::from(immediate);
        self.deferred = VecDeque::from(deferred);
    }

    pub fn pop_immediate(&mut self) -> Option<String> {
        self.immediate.pop_front()
    }

    pub fn drain_batch(&mut self, limit: usize) -> Vec<String> {
        let mut batch = Vec::with_capacity(limit);
        for _ in 0..limit {
            if let Some(uid) = self.deferred.pop_front() {
                batch.push(uid);
            } else {
                break;
            }
        }
        batch
    }

    pub fn immediate_snapshot(&self) -> Vec<String> {
        self.immediate.iter().cloned().collect()
    }

    pub fn is_empty(&self) -> bool {
        self.immediate.is_empty() && self.deferred.is_empty()
    }
}

#[derive(Debug)]
pub struct SubscriptionSyncManager {
    preferences: SubscriptionSyncPreferences,
    pub states: HashMap<String, SubscriptionSyncState>,
    pub queue: SubscriptionSyncQueue,
    semaphore: Arc<Semaphore>,
    startup_completed: bool,
    startup_active: usize,
}

impl SubscriptionSyncManager {
    pub fn new(preferences: SubscriptionSyncPreferences) -> Self {
        Self {
            preferences,
            states: HashMap::new(),
            queue: SubscriptionSyncQueue::default(),
            semaphore: Arc::new(Semaphore::new(1)),
            startup_completed: false,
            startup_active: 0,
        }
    }

    pub fn preferences(&self) -> SubscriptionSyncPreferences {
        self.preferences.clone()
    }

    pub fn update_preferences(&mut self, preferences: SubscriptionSyncPreferences) {
        self.preferences = preferences;
        if self.startup_completed {
            let concurrency = self.preferences.max_concurrency.max(1);
            self.semaphore = Arc::new(Semaphore::new(concurrency));
        }
    }

    pub fn semaphore(&self) -> Arc<Semaphore> {
        Arc::clone(&self.semaphore)
    }

    pub fn state_mut(&mut self, uid: &str) -> &mut SubscriptionSyncState {
        self.states.entry(uid.to_string()).or_default()
    }

    pub fn reset_queue(&mut self, immediate: Vec<String>, deferred: Vec<String>) {
        self.queue.load(immediate, deferred);
    }

    pub fn queue_is_empty(&self) -> bool {
        self.queue.is_empty()
    }

    pub async fn acquire_permit(&self) -> anyhow::Result<OwnedSemaphorePermit> {
        self.semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| anyhow::anyhow!("subscription sync semaphore closed"))
    }

    pub fn mark_success(&mut self, uid: &str) {
        let state = self.state_mut(uid);
        state.last_success = Some(SystemTime::now());
        state.failure_count = 0;
        state.pending_retry = false;
        state.last_error_message = None;
        state.phase = SyncPhase::Background;
    }

    pub fn mark_failure(&mut self, uid: &str, message: String) {
        let state = self.state_mut(uid);
        state.last_failure = Some(SystemTime::now());
        state.failure_count = state.failure_count.saturating_add(1);
        state.pending_retry = true;
        state.last_error_message = Some(message);
    }

    pub fn increment_startup_active(&mut self, count: usize) {
        self.startup_active = self.startup_active.saturating_add(count);
    }

    pub fn decrement_startup_active(&mut self) {
        if self.startup_active > 0 {
            self.startup_active -= 1;
        }
        if self.startup_active == 0 && !self.startup_completed {
            self.mark_startup_completed();
        }
    }

    pub fn mark_startup_completed(&mut self) {
        if self.startup_completed {
            return;
        }
        self.startup_completed = true;
        let concurrency = self.preferences.max_concurrency.max(1);
        self.semaphore = Arc::new(Semaphore::new(concurrency));
    }

    pub fn startup_completed(&self) -> bool {
        self.startup_completed
    }
}

#[derive(Debug)]
pub struct SubscriptionSyncStore {
    pub inner: RwLock<SubscriptionSyncManager>,
}

impl SubscriptionSyncStore {
    pub fn new(preferences: SubscriptionSyncPreferences) -> Self {
        Self {
            inner: RwLock::new(SubscriptionSyncManager::new(preferences)),
        }
    }
}

pub static SUBSCRIPTION_SYNC_STORE: Lazy<SubscriptionSyncStore> =
    Lazy::new(|| SubscriptionSyncStore::new(SubscriptionSyncPreferences::default()));
