#![allow(non_snake_case)]
#![recursion_limit = "512"]

mod cmd;
pub mod config;
mod core;
mod enhance;
mod feat;
mod ipc;
mod module;
mod process;
mod state;
mod utils;
#[cfg(target_os = "macos")]
use crate::utils::window_manager::WindowManager;
use crate::{
    core::handle,
    core::hotkey,
    process::AsyncHandler,
    utils::{resolve, server},
};
use config::Config;
use tauri::AppHandle;
#[cfg(target_os = "macos")]
use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_deep_link::DeepLinkExt;
use tokio::time::{Duration, timeout};
use utils::logging::Type;

/// Application initialization helper functions
mod app_init {
    use super::*;

    /// Initialize singleton monitoring for other instances
    pub fn init_singleton_check() {
        AsyncHandler::spawn_blocking(move || async move {
            logging!(info, Type::Setup, true, "开始检查单例实例...");
            match timeout(Duration::from_millis(500), server::check_singleton()).await {
                Ok(result) => {
                    if result.is_err() {
                        logging!(info, Type::Setup, true, "检测到已有应用实例运行");
                        if let Some(app_handle) = handle::Handle::global().app_handle() {
                            app_handle.exit(0);
                        } else {
                            std::process::exit(0);
                        }
                    } else {
                        logging!(info, Type::Setup, true, "未检测到其他应用实例");
                    }
                }
                Err(_) => {
                    logging!(
                        warn,
                        Type::Setup,
                        true,
                        "单例检查超时，假定没有其他实例运行"
                    );
                }
            }
        });
    }

    /// Setup plugins for the Tauri builder
    pub fn setup_plugins(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
        #[allow(unused_mut)]
        let mut builder = builder
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_clipboard_manager::init())
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_deep_link::init());

        // Enable updater plugin only on non-macOS targets to avoid missing config issues
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
        }

        #[cfg(all(debug_assertions, not(feature = "tokio-trace")))]
        {
            builder = builder.plugin(tauri_plugin_devtools::init());
        }
        builder
    }

    /// Setup deep link handling
    pub fn setup_deep_links(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
        #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
        {
            logging!(info, Type::Setup, true, "注册深层链接...");
            app.deep_link().register_all()?;
        }

        app.deep_link().on_open_url(|event| {
            let url = event.urls().first().map(|u| u.to_string());
            if let Some(url) = url {
                AsyncHandler::spawn(|| async {
                    if let Err(e) = resolve::resolve_scheme(url).await {
                        logging!(error, Type::Setup, true, "Failed to resolve scheme: {}", e);
                    }
                });
            }
        });

        Ok(())
    }

    /// Setup autostart plugin
    pub fn setup_autostart(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
        #[cfg(target_os = "macos")]
        let mut auto_start_plugin_builder = tauri_plugin_autostart::Builder::new();
        #[cfg(not(target_os = "macos"))]
        let auto_start_plugin_builder = tauri_plugin_autostart::Builder::new();

        #[cfg(target_os = "macos")]
        {
            auto_start_plugin_builder = auto_start_plugin_builder
                .macos_launcher(MacosLauncher::LaunchAgent)
                .app_name(app.config().identifier.clone());
        }
        app.handle().plugin(auto_start_plugin_builder.build())?;
        Ok(())
    }

    /// Setup window state management
    pub fn setup_window_state(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
        logging!(info, Type::Setup, true, "初始化窗口状态管理...");
        let window_state_plugin = tauri_plugin_window_state::Builder::new()
            .with_filename("window_state.json")
            .with_state_flags(tauri_plugin_window_state::StateFlags::default())
            .build();
        app.handle().plugin(window_state_plugin)?;
        Ok(())
    }

    /// Generate all command handlers for the application
    pub fn generate_handlers()
    -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
        tauri::generate_handler![
            // Common commands
            cmd::get_sys_proxy,
            cmd::get_auto_proxy,
            cmd::open_app_dir,
            cmd::open_logs_dir,
            cmd::open_web_url,
            cmd::open_core_dir,
            cmd::get_portable_flag,
            cmd::get_network_interfaces,
            cmd::get_system_hostname,
            cmd::restart_app,
            // Core management
            cmd::start_core,
            cmd::stop_core,
            cmd::restart_core,
            // Application lifecycle
            cmd::notify_ui_ready,
            cmd::update_ui_stage,
            cmd::reset_ui_ready_state,
            cmd::get_running_mode,
            cmd::get_app_uptime,
            cmd::get_auto_launch_status,
            cmd::is_admin,
            // Lightweight mode
            cmd::entry_lightweight_mode,
            cmd::exit_lightweight_mode,
            // Service management
            cmd::install_service,
            cmd::uninstall_service,
            cmd::reinstall_service,
            cmd::repair_service,
            cmd::is_service_available,
            // Clash core commands
            cmd::get_clash_info,
            cmd::patch_clash_config,
            cmd::patch_clash_mode,
            cmd::change_clash_core,
            cmd::get_runtime_config,
            cmd::get_runtime_yaml,
            cmd::get_runtime_exists,
            cmd::get_runtime_logs,
            cmd::get_runtime_proxy_chain_config,
            cmd::update_proxy_chain_config_in_runtime,
            cmd::invoke_uwp_tool,
            cmd::copy_clash_env,
            cmd::get_proxies,
            cmd::force_refresh_proxies,
            cmd::get_providers_proxies,
            cmd::sync_tray_proxy_selection,
            cmd::update_proxy_and_sync,
            cmd::save_dns_config,
            cmd::apply_dns_config,
            cmd::check_dns_config_exists,
            cmd::get_dns_config_content,
            cmd::validate_dns_config,
            cmd::get_clash_version,
            cmd::get_clash_config,
            cmd::force_refresh_clash_config,
            cmd::update_geo_data,
            cmd::upgrade_clash_core,
            cmd::get_clash_rules,
            cmd::update_proxy_choice,
            cmd::get_proxy_providers,
            cmd::get_rule_providers,
            cmd::proxy_provider_health_check,
            cmd::update_proxy_provider,
            cmd::update_rule_provider,
            // Health check commands
            cmd::check_subscription_health,
            cmd::check_all_subscriptions_health,
            cmd::get_subscription_details,
            cmd::cleanup_health_check_cache,
            // Batch import commands
            cmd::batch_import_from_text,
            cmd::batch_import_from_file,
            cmd::batch_import_from_clipboard,
            cmd::preview_batch_import,
            // Batch export commands
            cmd::batch_export_subscriptions,
            cmd::export_subscriptions_to_file,
            cmd::preview_export,
            cmd::get_all_subscriptions_for_export,
            // Task manager commands
            cmd::get_all_tasks,
            cmd::create_task,
            cmd::update_task,
            cmd::delete_task,
            cmd::toggle_task,
            cmd::execute_task_immediately,
            cmd::get_task_execution_history,
            cmd::get_task_statistics,
            cmd::get_task_system_overview,
            cmd::cleanup_execution_history,
            cmd::create_default_tasks,
            // Subscription testing commands
            cmd::test_subscription,
            cmd::test_all_subscriptions,
            cmd::quick_connectivity_test,
            cmd::get_node_quality_ranking,
            cmd::get_optimization_suggestions,
            cmd::schedule_periodic_test,
            // Global speed test commands
            cmd::start_global_speed_test,
            cmd::cancel_global_speed_test,
            cmd::apply_best_node,
            // Traffic stats commands
            cmd::record_traffic_usage,
            cmd::get_subscription_traffic_stats,
            cmd::get_all_traffic_stats,
            cmd::get_traffic_overview,
            cmd::get_traffic_alerts,
            cmd::mark_alert_as_read,
            cmd::cleanup_traffic_history,
            cmd::export_traffic_data,
            cmd::set_subscription_quota,
            cmd::get_traffic_prediction,
            // Subscription groups commands
            cmd::create_subscription_group,
            cmd::update_subscription_group,
            cmd::delete_subscription_group,
            cmd::get_all_subscription_groups,
            cmd::get_subscription_group,
            cmd::add_subscription_to_group,
            cmd::remove_subscription_from_group,
            cmd::get_subscription_groups,
            cmd::batch_add_subscriptions_to_group,
            cmd::batch_remove_subscriptions_from_group,
            cmd::apply_auto_grouping_rules,
            cmd::get_group_statistics,
            cmd::get_all_group_statistics,
            cmd::export_subscription_groups,
            cmd::import_subscription_groups,
            cmd::get_smart_grouping_suggestions,
            cmd::create_default_groups,
            // Backup and restore commands
            cmd::create_backup,
            cmd::get_all_backups,
            cmd::get_backup_details,
            cmd::restore_backup,
            cmd::delete_backup,
            cmd::validate_backup,
            cmd::export_backup,
            cmd::import_backup,
            cmd::set_webdav_config,
            cmd::get_webdav_config,
            cmd::sync_to_webdav,
            cmd::sync_from_webdav,
            cmd::get_sync_status,
            cmd::cleanup_old_backups,
            // Advanced search commands
            cmd::advanced_search,
            cmd::quick_search,
            cmd::save_search,
            cmd::get_saved_searches,
            cmd::delete_saved_search,
            cmd::execute_saved_search,
            cmd::get_search_history,
            cmd::clear_search_history,
            cmd::get_search_suggestions,
            cmd::get_field_value_suggestions,
            cmd::update_search_index,
            cmd::get_search_statistics,
            // Subscription batch manager commands
            cmd::get_subscription_cleanup_preview,
            cmd::update_all_subscriptions,
            cmd::cleanup_expired_subscriptions,
            cmd::get_subscription_management_stats,
            cmd::set_auto_cleanup_rules,
            cmd::get_auto_cleanup_rules,
            cmd::get_clash_connections,
            cmd::delete_clash_connection,
            cmd::close_all_clash_connections,
            cmd::get_group_proxy_delays,
            cmd::is_clash_debug_enabled,
            cmd::clash_gc,
            // Logging and monitoring
            cmd::get_clash_logs,
            cmd::start_logs_monitoring,
            cmd::stop_logs_monitoring,
            cmd::clear_logs,
            cmd::get_traffic_data,
            cmd::get_memory_data,
            cmd::get_formatted_traffic_data,
            cmd::get_formatted_memory_data,
            cmd::get_system_monitor_overview,
            cmd::start_traffic_service,
            cmd::stop_traffic_service,
            // Verge configuration
            cmd::get_verge_config,
            cmd::patch_verge_config,
            cmd::test_delay,
            cmd::get_app_dir,
            cmd::copy_icon_file,
            cmd::download_icon_cache,
            cmd::open_devtools,
            cmd::exit_app,
            cmd::get_network_interfaces_info,
            // Profile management
            cmd::get_profiles,
            cmd::enhance_profiles,
            cmd::patch_profiles_config,
            cmd::view_profile,
            cmd::patch_profile,
            cmd::create_profile,
            cmd::import_profile,
            cmd::reorder_profile,
            cmd::update_profile,
            cmd::delete_profile,
            cmd::read_profile_file,
            cmd::save_profile_file,
            cmd::get_next_update_time,
            // Script validation
            cmd::script_validate_notice,
            cmd::validate_script_file,
            // Clash API
            cmd::clash_api_get_proxy_delay,
            // Backup and WebDAV
            cmd::create_webdav_backup,
            cmd::save_webdav_config,
            cmd::list_webdav_backup,
            cmd::delete_webdav_backup,
            cmd::restore_webdav_backup,
            // Diagnostics and system info
            cmd::export_diagnostic_info,
            cmd::get_system_info,
            // Media unlock checker
            cmd::get_unlock_items,
            cmd::check_media_unlock,
        ]
    }
}

pub fn run() {
    // 强制启用控制台输出用于诊断启动问题
    println!("=== Liebesu_Clash 应用启动 ===");
    println!("时间: {}", chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"));
    println!("版本: {}", env!("CARGO_PKG_VERSION"));
    println!("目标架构: {}", std::env::consts::ARCH);
    println!("目标操作系统: {}", std::env::consts::OS);
    
    // 检查关键环境变量
    println!("工作目录: {:?}", std::env::current_dir());
    println!("可执行文件路径: {:?}", std::env::current_exe());
    if let Some(path) = std::env::var_os("PATH") {
        println!("PATH 长度: {}", path.len());
    }
    
    #[cfg(windows)]
    {
        println!("Windows 子系统: GUI");
        
        // 检查 WebView2 相关环境
        if let Ok(temp_dir) = std::env::var("TEMP") {
            println!("TEMP 目录: {}", temp_dir);
        }
        if let Ok(appdata) = std::env::var("APPDATA") {
            println!("APPDATA 目录: {}", appdata);
        }
        if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
            println!("LOCALAPPDATA 目录: {}", localappdata);
        }
    }
    
    println!("开始单例检查...");
    
    // Setup singleton check
    app_init::init_singleton_check();

    // We don't need init_portable_flag here anymore due to the init_config will do the things
    // let _ = utils::dirs::init_portable_flag();

    // Set Linux environment variable
    #[cfg(target_os = "linux")]
    {
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }

        let desktop_env = std::env::var("XDG_CURRENT_DESKTOP")
            .unwrap_or_default()
            .to_uppercase();
        let is_kde_desktop = desktop_env.contains("KDE");
        let is_plasma_desktop = desktop_env.contains("PLASMA");

        if is_kde_desktop || is_plasma_desktop {
            unsafe {
                std::env::set_var("GTK_CSD", "0");
            }
            logging!(
                info,
                Type::Setup,
                true,
                "KDE detected: Disabled GTK CSD for better titlebar stability."
            );
        }
    }

    println!("创建 Tauri 构建器...");
    
    // Create and configure the Tauri builder
    let builder = app_init::setup_plugins(tauri::Builder::default())
        .setup(|app| {
            println!("Tauri 应用设置阶段开始...");
            logging!(info, Type::Setup, true, "开始应用初始化...");

            println!("设置自启动插件...");
            // Setup autostart plugin
            if let Err(e) = app_init::setup_autostart(app) {
                println!("自启动插件设置失败: {}", e);
                logging!(error, Type::Setup, true, "Failed to setup autostart: {}", e);
            } else {
                println!("自启动插件设置成功");
            }

            println!("设置深度链接...");
            // Setup deep links
            if let Err(e) = app_init::setup_deep_links(app) {
                println!("深度链接设置失败: {}", e);
                logging!(
                    error,
                    Type::Setup,
                    true,
                    "Failed to setup deep links: {}",
                    e
                );
            } else {
                println!("深度链接设置成功");
            }

            println!("设置窗口状态管理...");
            // Setup window state management
            if let Err(e) = app_init::setup_window_state(app) {
                println!("窗口状态设置失败: {}", e);
                logging!(
                    error,
                    Type::Setup,
                    true,
                    "Failed to setup window state: {}",
                    e
                );
            } else {
                println!("窗口状态设置成功");
            }

            let app_handle = app.handle().clone();

            println!("执行主要设置操作...");
            logging!(info, Type::Setup, true, "执行主要设置操作...");

            println!("设置应用句柄...");
            resolve::resolve_setup_handle(app_handle);
            
            println!("设置异步解析器...");
            resolve::resolve_setup_async();
            
            println!("设置同步解析器...");
            resolve::resolve_setup_sync();

            println!("Tauri 初始化完成");
            logging!(info, Type::Setup, true, "初始化完成，继续执行");
            Ok(())
        })
        .invoke_handler(app_init::generate_handlers());

    /// Event handling helper functions
    mod event_handlers {
        use crate::core::handle;

        use super::*;

        /// Handle application ready/resumed events
        pub fn handle_ready_resumed(app_handle: &AppHandle) {
            logging!(info, Type::System, true, "应用就绪或恢复");
            handle::Handle::global().init(app_handle.clone());

            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app_handle.get_webview_window("main") {
                    logging!(info, Type::Window, true, "设置macOS窗口标题");
                    let _ = window.set_title("Liebesu_Clash");
                }
            }
        }

        /// Handle application reopen events (macOS)
        #[cfg(target_os = "macos")]
        pub async fn handle_reopen(app_handle: &AppHandle, has_visible_windows: bool) {
            logging!(
                info,
                Type::System,
                true,
                "处理 macOS 应用重新打开事件: has_visible_windows={}",
                has_visible_windows
            );

            handle::Handle::global().init(app_handle.clone());

            if !has_visible_windows {
                // 当没有可见窗口时，设置为 regular 模式并显示主窗口
                handle::Handle::global().set_activation_policy_regular();

                logging!(info, Type::System, true, "没有可见窗口，尝试显示主窗口");

                let result = WindowManager::show_main_window().await;
                logging!(
                    info,
                    Type::System,
                    true,
                    "窗口显示操作完成，结果: {:?}",
                    result
                );
            } else {
                logging!(info, Type::System, true, "已有可见窗口，无需额外操作");
            }
        }

        /// Handle window close requests
        pub fn handle_window_close(api: &tauri::WindowEvent) {
            #[cfg(target_os = "macos")]
            handle::Handle::global().set_activation_policy_accessory();

            if core::handle::Handle::global().is_exiting() {
                return;
            }

            log::info!(target: "app", "closing window...");
            if let tauri::WindowEvent::CloseRequested { api, .. } = api {
                api.prevent_close();
                if let Some(window) = core::handle::Handle::global().get_window() {
                    let _ = window.hide();
                } else {
                    logging!(warn, Type::Window, true, "尝试隐藏窗口但窗口不存在");
                }
            }
        }

        /// Handle window focus events
        pub fn handle_window_focus(focused: bool) {
            AsyncHandler::spawn(move || async move {
                let is_enable_global_hotkey = Config::verge()
                    .await
                    .latest_ref()
                    .enable_global_hotkey
                    .unwrap_or(true);

                if focused {
                    #[cfg(target_os = "macos")]
                    {
                        use crate::core::hotkey::SystemHotkey;
                        if let Err(e) = hotkey::Hotkey::global()
                            .register_system_hotkey(SystemHotkey::CmdQ)
                            .await
                        {
                            logging!(error, Type::Hotkey, true, "Failed to register CMD+Q: {}", e);
                        }
                        if let Err(e) = hotkey::Hotkey::global()
                            .register_system_hotkey(SystemHotkey::CmdW)
                            .await
                        {
                            logging!(error, Type::Hotkey, true, "Failed to register CMD+W: {}", e);
                        }
                    }

                    if !is_enable_global_hotkey
                        && let Err(e) = hotkey::Hotkey::global().init().await
                    {
                        logging!(error, Type::Hotkey, true, "Failed to init hotkeys: {}", e);
                    }
                    return;
                }

                // Handle unfocused state
                #[cfg(target_os = "macos")]
                {
                    use crate::core::hotkey::SystemHotkey;
                    if let Err(e) =
                        hotkey::Hotkey::global().unregister_system_hotkey(SystemHotkey::CmdQ)
                    {
                        logging!(
                            error,
                            Type::Hotkey,
                            true,
                            "Failed to unregister CMD+Q: {}",
                            e
                        );
                    }
                    if let Err(e) =
                        hotkey::Hotkey::global().unregister_system_hotkey(SystemHotkey::CmdW)
                    {
                        logging!(
                            error,
                            Type::Hotkey,
                            true,
                            "Failed to unregister CMD+W: {}",
                            e
                        );
                    }
                }

                if !is_enable_global_hotkey && let Err(e) = hotkey::Hotkey::global().reset() {
                    logging!(error, Type::Hotkey, true, "Failed to reset hotkeys: {}", e);
                }
            });
        }

        /// Handle window destroyed events
        pub fn handle_window_destroyed() {
            #[cfg(target_os = "macos")]
            {
                use crate::core::hotkey::SystemHotkey;
                if let Err(e) =
                    hotkey::Hotkey::global().unregister_system_hotkey(SystemHotkey::CmdQ)
                {
                    logging!(
                        error,
                        Type::Hotkey,
                        true,
                        "Failed to unregister CMD+Q on destroy: {}",
                        e
                    );
                }
                if let Err(e) =
                    hotkey::Hotkey::global().unregister_system_hotkey(SystemHotkey::CmdW)
                {
                    logging!(
                        error,
                        Type::Hotkey,
                        true,
                        "Failed to unregister CMD+W on destroy: {}",
                        e
                    );
                }
            }
        }
    }

    println!("构建 Tauri 应用程序...");
    // Build the application
    let app = builder
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            println!("❌ 构建 Tauri 应用程序失败: {}", e);
            eprintln!("❌ 构建 Tauri 应用程序失败: {}", e);
            logging!(
                error,
                Type::Setup,
                true,
                "Failed to build Tauri application: {}",
                e
            );
            
            // 在 Windows 上显示错误对话框
            #[cfg(windows)]
            {
                use std::ffi::CString;
                use std::ptr;
                
                unsafe extern "system" {
                    fn MessageBoxA(hwnd: *mut std::ffi::c_void, text: *const i8, caption: *const i8, utype: u32) -> i32;
                }
                
                let error_msg = format!("Liebesu_Clash 启动失败\n\n错误: {}\n\n请检查日志文件获取详细信息。", e);
                if let (Ok(msg), Ok(title)) = (CString::new(error_msg), CString::new("启动错误")) {
                    unsafe {
                        MessageBoxA(ptr::null_mut(), msg.as_ptr(), title.as_ptr(), 0x10 | 0x0);
                    }
                }
            }
            
            std::process::exit(1);
        });

    println!("✅ Tauri 应用程序构建成功，开始运行事件循环...");

    app.run(|app_handle, e| {
        match e {
            tauri::RunEvent::Ready => {
                println!("🚀 应用程序就绪事件");
            },
            tauri::RunEvent::Resumed => {
                println!("🔄 应用程序恢复事件");
            },
            _ => {}
        }
        
        // 原有的事件处理
        match e {
            tauri::RunEvent::Ready | tauri::RunEvent::Resumed => {
                event_handlers::handle_ready_resumed(app_handle);
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
                let app_handle = app_handle.clone();
                AsyncHandler::spawn(move || async move {
                    event_handlers::handle_reopen(&app_handle, has_visible_windows).await;
                });
            }
            tauri::RunEvent::ExitRequested { api, code, .. } => {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
            tauri::RunEvent::Exit => {
                // Avoid duplicate cleanup
                if core::handle::Handle::global().is_exiting() {
                    return;
                }
                feat::clean();
            }
            tauri::RunEvent::WindowEvent { label, event, .. } => {
                if label == "main" {
                    match event {
                        tauri::WindowEvent::CloseRequested { .. } => {
                            event_handlers::handle_window_close(&event);
                        }
                        tauri::WindowEvent::Focused(focused) => {
                            event_handlers::handle_window_focus(focused);
                        }
                        tauri::WindowEvent::Destroyed => {
                            event_handlers::handle_window_destroyed();
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    });
}
