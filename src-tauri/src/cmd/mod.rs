use anyhow::Result;

pub type CmdResult<T = ()> = Result<T, String>;

// Command modules
pub mod app;
pub mod batch_import;
pub mod clash;
pub mod health_check;
pub mod lightweight;
pub mod media_unlock_checker;
pub mod network;
pub mod profile;
pub mod proxy;
pub mod runtime;
pub mod save_profile;
pub mod service;
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
pub use app::*;
pub use batch_import::*;
pub use clash::*;
pub use health_check::*;
pub use lightweight::*;
pub use media_unlock_checker::*;
pub use network::*;
pub use profile::*;
pub use proxy::*;
pub use runtime::*;
pub use save_profile::*;
pub use service::*;
pub use subscription_groups::*;
pub use subscription_testing::*;
pub use system::*;
pub use task_manager::*;
pub use traffic_stats::*;
pub use uwp::*;
pub use validate::*;
pub use verge::*;
pub use webdav::*;
