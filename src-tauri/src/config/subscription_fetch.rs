use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RemoteSubscriptionConfig {
    pub enabled: bool,
    pub source_url: Option<String>,
    #[serde(default)]
    pub mode: FetchMode,
    pub custom_interval_minutes: Option<u64>,
    pub last_sync_at: Option<i64>,
    pub last_result: Option<FetchSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FetchMode {
    Manual,
    Daily,
    Custom,
}

impl Default for FetchMode {
    fn default() -> Self {
        FetchMode::Manual
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FetchSummary {
    pub fetched_urls: usize,
    pub imported: usize,
    pub duplicates: usize,
    pub failed: usize,
    pub message: Option<String>,
}

impl RemoteSubscriptionConfig {
    /// 返回用于定时任务的间隔（分钟）
    pub fn resolved_interval_minutes(&self) -> Option<u64> {
        if !self.enabled {
            return None;
        }

        match self.mode {
            FetchMode::Manual => None,
            FetchMode::Daily => Some(60 * 24),
            FetchMode::Custom => self.custom_interval_minutes.filter(|minutes| *minutes > 0),
        }
    }

    /// 返回为订阅设置 update_interval（批量导入）的分钟数
    pub fn resolved_interval_minutes_i32(&self) -> Option<i32> {
        self.resolved_interval_minutes()
            .map(|minutes| minutes.min(i32::MAX as u64) as i32)
    }
}

