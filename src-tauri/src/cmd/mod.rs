use anyhow::Result;

pub type CmdResult<T = ()> = Result<T, String>;

// Command modules
pub mod advanced_search;
pub mod app;
pub mod auto_update;
pub mod backup_restore;
pub mod batch_import;
pub mod clash;
pub mod global_speed_test;
pub mod speed_test_monitor;

// Re-export the command functions
pub use speed_test_monitor::{force_cancel_frozen_speed_test, get_speed_test_health_report};
pub mod health_check;
pub mod lightweight;
pub mod media_unlock_checker;
pub mod network;
pub mod profile;
pub mod proxy;
pub mod runtime;
pub mod save_profile;
pub mod service;
pub mod subscription_batch_manager;
pub mod subscription_groups;
pub mod subscription_testing;
pub mod system;
pub mod task_manager;
pub mod traffic_stats;
pub mod uwp;
pub mod validate;
pub mod verge;
pub mod webdav;

// Re-export all command functions for backwards compatibility
pub use advanced_search::*;
pub use app::*;
pub use backup_restore::*;
pub use batch_import::*;
pub use clash::*;
pub use global_speed_test::*;
pub use speed_test_monitor::*;
pub use health_check::*;
pub use lightweight::*;
pub use media_unlock_checker::*;
pub use network::*;
pub use profile::*;
pub use proxy::*;
pub use runtime::*;
pub use save_profile::*;
pub use service::*;
pub use subscription_batch_manager::*;
pub use subscription_groups::*;
pub use subscription_testing::*;
pub use system::*;
pub use task_manager::*;
pub use traffic_stats::*;
pub use uwp::*;
pub use validate::*;
pub use verge::*;
pub use webdav::*;
