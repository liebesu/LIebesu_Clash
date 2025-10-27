#![allow(dead_code, unused)]
#![allow(
    clippy::unwrap_used,
    clippy::clone_on_ref_ptr,
    clippy::unused_async,
    clippy::too_many_arguments,
    clippy::too_many_lines,
    clippy::enum_variant_names,
    clippy::large_enum_variant,
    clippy::needless_pass_by_value,
    clippy::single_match_else,
    clippy::map_entry
)]
// TODO: 后续阶段逐条处理 CoreManager 相关的 Clippy 警告。
use crate::{
    config::*,
    core::{
        handle,
        service::{self},
        sysopt::Sysopt,
    },
    ipc::IpcManager,
    logging, logging_error,
    process::AsyncHandler,
    singleton_lazy,
    utils::{
        dirs,
        help::{self},
        logging::Type,
    },
};
use anyhow::Result;
use chrono::Local;
use parking_lot::Mutex;
use std::{
    fmt,
    fs::{File, create_dir_all},
    io::Write,
    path::PathBuf,
    sync::Arc,
};
use tauri_plugin_shell::{ShellExt, process::CommandChild};

#[derive(Debug)]
pub struct CoreManager {
    running: Arc<Mutex<RunningMode>>,
    child_sidecar: Arc<Mutex<Option<CommandChild>>>,
}

/// 内核运行模式
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
pub enum RunningMode {
    /// 服务模式运行
    Service,
    /// Sidecar 模式运行
    Sidecar,
    /// 未运行
    NotRunning,
}

impl fmt::Display for RunningMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RunningMode::Service => write!(f, "Service"),
            RunningMode::Sidecar => write!(f, "Sidecar"),
            RunningMode::NotRunning => write!(f, "NotRunning"),
        }
    }
}

use crate::config::IVerge;

impl CoreManager {
    /// 检查文件是否为脚本文件
    fn is_script_file(&self, path: &str) -> Result<bool> {
        // 1. 先通过扩展名快速判断
        if path.ends_with(".yaml") || path.ends_with(".yml") {
            return Ok(false); // YAML文件不是脚本文件
        } else if path.ends_with(".js") {
            return Ok(true); // JS文件是脚本文件
        }

        // 2. 读取文件内容
        let content = match std::fs::read_to_string(path) {
            Ok(content) => content,
            Err(err) => {
                logging!(
                    warn,
                    Type::Config,
                    true,
                    "无法读取文件以检测类型: {}, 错误: {}",
                    path,
                    err
                );
                return Err(anyhow::anyhow!(
                    "Failed to read file to detect type: {}",
                    err
                ));
            }
        };

        // 3. 检查是否存在明显的YAML特征
        let has_yaml_features = content.contains(": ")
            || content.contains("#")
            || content.contains("---")
            || content.lines().any(|line| line.trim().starts_with("- "));

        // 4. 检查是否存在明显的JS特征
        let has_js_features = content.contains("function ")
            || content.contains("const ")
            || content.contains("let ")
            || content.contains("var ")
            || content.contains("//")
            || content.contains("/*")
            || content.contains("*/")
            || content.contains("export ")
            || content.contains("import ");

        // 5. 决策逻辑
        if has_yaml_features && !has_js_features {
            // 只有YAML特征，没有JS特征
            return Ok(false);
        } else if has_js_features && !has_yaml_features {
            // 只有JS特征，没有YAML特征
            return Ok(true);
        } else if has_yaml_features && has_js_features {
            // 两种特征都有，需要更精细判断
            // 优先检查是否有明确的JS结构特征
            if content.contains("function main")
                || content.contains("module.exports")
                || content.contains("export default")
            {
                return Ok(true);
            }

            // 检查冒号后是否有空格（YAML的典型特征）
            let yaml_pattern_count = content.lines().filter(|line| line.contains(": ")).count();

            if yaml_pattern_count > 2 {
                return Ok(false); // 多个键值对格式，更可能是YAML
            }
        }

        // 默认情况：无法确定时，假设为非脚本文件（更安全）
        logging!(
            debug,
            Type::Config,
            true,
            "无法确定文件类型，默认当作YAML处理: {}",
            path
        );
        Ok(false)
    }
    /// 使用默认配置
    pub async fn use_default_config(&self, msg_type: &str, msg_content: &str) -> Result<()> {
        let runtime_path = dirs::app_home_dir()?.join(RUNTIME_CONFIG);

        // Extract clash config before async operations
        let clash_config = Config::clash().await.latest_ref().0.clone();

        *Config::runtime().await.draft_mut() = Box::new(IRuntime {
            config: Some(clash_config.clone()),
            exists_keys: vec![],
            chain_logs: Default::default(),
        });
        help::save_yaml(
            &runtime_path,
            &clash_config,
            Some("# Liebesu_Clash Runtime"),
        )
        .await?;
        handle::Handle::notice_message(msg_type, msg_content);
        Ok(())
    }
    /// 验证运行时配置
    pub async fn validate_config(&self) -> Result<(bool, String)> {
        logging!(info, Type::Config, true, "生成临时配置文件用于验证");
        let config_path = Config::generate_file(ConfigType::Check).await?;
        let config_path = dirs::path_to_str(&config_path)?;
        self.validate_config_internal(config_path).await
    }
    /// 验证指定的配置文件
    pub async fn validate_config_file(
        &self,
        config_path: &str,
        is_merge_file: Option<bool>,
    ) -> Result<(bool, String)> {
        // 检查程序是否正在退出，如果是则跳过验证
        if handle::Handle::global().is_exiting() {
            logging!(info, Type::Core, true, "应用正在退出，跳过验证");
            return Ok((true, String::new()));
        }

        // 检查文件是否存在
        if !std::path::Path::new(config_path).exists() {
            let error_msg = format!("File not found: {config_path}");
            //handle::Handle::notice_message("config_validate::file_not_found", &error_msg);
            return Ok((false, error_msg));
        }

        // 如果是合并文件且不是强制验证，执行语法检查但不进行完整验证
        if is_merge_file.unwrap_or(false) {
            logging!(
                info,
                Type::Config,
                true,
                "检测到Merge文件，仅进行语法检查: {}",
                config_path
            );
            return self.validate_file_syntax(config_path);
        }

        // 检查是否为脚本文件
        let is_script = if config_path.ends_with(".js") {
            true
        } else {
            match self.is_script_file(config_path) {
                Ok(result) => result,
                Err(err) => {
                    // 如果无法确定文件类型，尝试使用Clash内核验证
                    logging!(
                        warn,
                        Type::Config,
                        true,
                        "无法确定文件类型: {}, 错误: {}",
                        config_path,
                        err
                    );
                    return self.validate_config_internal(config_path).await;
                }
            }
        };

        if is_script {
            logging!(
                info,
                Type::Config,
                true,
                "检测到脚本文件，使用JavaScript验证: {}",
                config_path
            );
            return self.validate_script_file(config_path);
        }

        // 对YAML配置文件使用Clash内核验证
        logging!(
            info,
            Type::Config,
            true,
            "使用Clash内核验证配置文件: {}",
            config_path
        );
        self.validate_config_internal(config_path).await
    }
    /// 内部验证配置文件的实现
    async fn validate_config_internal(&self, config_path: &str) -> Result<(bool, String)> {
        // 检查程序是否正在退出，如果是则跳过验证
        if handle::Handle::global().is_exiting() {
            logging!(info, Type::Core, true, "应用正在退出，跳过验证");
            return Ok((true, String::new()));
        }

        logging!(
            info,
            Type::Config,
            true,
            "开始验证配置文件: {}",
            config_path
        );

        let clash_core = Config::verge().await.latest_ref().get_valid_clash_core();
        logging!(info, Type::Config, true, "使用内核: {}", clash_core);

        let app_handle = handle::Handle::global().app_handle().ok_or_else(|| {
            let msg = "Failed to get app handle";
            logging!(error, Type::Core, true, "{}", msg);
            anyhow::anyhow!(msg)
        })?;
        let app_dir = dirs::app_home_dir()?;
        let app_dir_str = dirs::path_to_str(&app_dir)?;
        logging!(info, Type::Config, true, "验证目录: {}", app_dir_str);

        // 使用子进程运行clash验证配置
        let output = app_handle
            .shell()
            .sidecar(clash_core)?
            .args(["-t", "-d", app_dir_str, "-f", config_path])
            .output()
            .await?;

        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);

        // 检查进程退出状态和错误输出
        let error_keywords = ["FATA", "fatal", "Parse config error", "level=fatal"];
        let has_error =
            !output.status.success() || error_keywords.iter().any(|&kw| stderr.contains(kw));

        logging!(info, Type::Config, true, "-------- 验证结果 --------");

        if !stderr.is_empty() {
            logging!(info, Type::Config, true, "stderr输出:\n{}", stderr);
        }

        if has_error {
            logging!(info, Type::Config, true, "发现错误，开始处理错误信息");
            let error_msg = if !stdout.is_empty() {
                stdout.to_string()
            } else if !stderr.is_empty() {
                stderr.to_string()
            } else if let Some(code) = output.status.code() {
                format!("验证进程异常退出，退出码: {code}")
            } else {
                "验证进程被终止".to_string()
            };

            logging!(info, Type::Config, true, "-------- 验证结束 --------");
            Ok((false, error_msg)) // 返回错误消息给调用者处理
        } else {
            logging!(info, Type::Config, true, "验证成功");
            logging!(info, Type::Config, true, "-------- 验证结束 --------");
            Ok((true, String::new()))
        }
    }
    /// 只进行文件语法检查，不进行完整验证
    fn validate_file_syntax(&self, config_path: &str) -> Result<(bool, String)> {
        logging!(info, Type::Config, true, "开始检查文件: {}", config_path);

        // 读取文件内容
        let content = match std::fs::read_to_string(config_path) {
            Ok(content) => content,
            Err(err) => {
                let error_msg = format!("Failed to read file: {err}");
                logging!(error, Type::Config, true, "无法读取文件: {}", error_msg);
                return Ok((false, error_msg));
            }
        };
        // 对YAML文件尝试解析，只检查语法正确性
        logging!(info, Type::Config, true, "进行YAML语法检查");
        match serde_yaml_ng::from_str::<serde_yaml_ng::Value>(&content) {
            Ok(_) => {
                logging!(info, Type::Config, true, "YAML语法检查通过");
                Ok((true, String::new()))
            }
            Err(err) => {
                // 使用标准化的前缀，以便错误处理函数能正确识别
                let error_msg = format!("YAML syntax error: {err}");
                logging!(error, Type::Config, true, "YAML语法错误: {}", error_msg);
                Ok((false, error_msg))
            }
        }
    }
    /// 验证脚本文件语法
    fn validate_script_file(&self, path: &str) -> Result<(bool, String)> {
        // 读取脚本内容
        let content = match std::fs::read_to_string(path) {
            Ok(content) => content,
            Err(err) => {
                let error_msg = format!("Failed to read script file: {err}");
                logging!(warn, Type::Config, true, "脚本语法错误: {}", err);
                //handle::Handle::notice_message("config_validate::script_syntax_error", &error_msg);
                return Ok((false, error_msg));
            }
        };

        logging!(debug, Type::Config, true, "验证脚本文件: {}", path);

        // 使用boa引擎进行基本语法检查
        use boa_engine::{Context, Source};

        let mut context = Context::default();
        let result = context.eval(Source::from_bytes(&content));

        match result {
            Ok(_) => {
                logging!(debug, Type::Config, true, "脚本语法验证通过: {}", path);

                // 检查脚本是否包含main函数
                if !content.contains("function main")
                    && !content.contains("const main")
                    && !content.contains("let main")
                {
                    let error_msg = "Script must contain a main function";
                    logging!(warn, Type::Config, true, "脚本缺少main函数: {}", path);
                    //handle::Handle::notice_message("config_validate::script_missing_main", error_msg);
                    return Ok((false, error_msg.to_string()));
                }

                Ok((true, String::new()))
            }
            Err(err) => {
                let error_msg = format!("Script syntax error: {err}");
                logging!(warn, Type::Config, true, "脚本语法错误: {}", err);
                //handle::Handle::notice_message("config_validate::script_syntax_error", &error_msg);
                Ok((false, error_msg))
            }
        }
    }
    /// 更新proxies等配置
    pub async fn update_config(&self) -> Result<(bool, String)> {
        // 检查程序是否正在退出，如果是则跳过完整验证流程
        if handle::Handle::global().is_exiting() {
            logging!(info, Type::Config, true, "应用正在退出，跳过验证");
            return Ok((true, String::new()));
        }

        logging!(info, Type::Config, true, "开始更新配置");

        // 1. 先生成新的配置内容
        logging!(info, Type::Config, true, "生成新的配置内容");
        Config::generate().await?;

        // 2. 验证配置
        match self.validate_config().await {
            Ok((true, _)) => {
                logging!(info, Type::Config, true, "配置验证通过");
                // 4. 验证通过后，生成正式的运行时配置
                logging!(info, Type::Config, true, "生成运行时配置");
                let run_path = Config::generate_file(ConfigType::Run).await?;
                logging_error!(Type::Config, true, self.put_configs_force(run_path).await);
                Ok((true, "something".into()))
            }
            Ok((false, error_msg)) => {
                logging!(warn, Type::Config, true, "配置验证失败: {}", error_msg);
                Config::runtime().await.discard();
                Ok((false, error_msg))
            }
            Err(e) => {
                logging!(warn, Type::Config, true, "验证过程发生错误: {}", e);
                Config::runtime().await.discard();
                Err(e)
            }
        }
    }
    pub async fn put_configs_force(&self, path_buf: PathBuf) -> Result<(), String> {
        let run_path_str = dirs::path_to_str(&path_buf).map_err(|e| {
            let msg = e.to_string();
            logging_error!(Type::Core, true, "{}", msg);
            msg
        });
        match IpcManager::global().put_configs_force(run_path_str?).await {
            Ok(_) => {
                Config::runtime().await.apply();
                logging!(info, Type::Core, true, "Configuration updated successfully");
                Ok(())
            }
            Err(e) => {
                let msg = e.to_string();
                Config::runtime().await.discard();
                logging_error!(Type::Core, true, "Failed to update configuration: {}", msg);
                Err(msg)
            }
        }
    }
}

impl CoreManager {
    /// 清理多余的 mihomo 进程
    async fn cleanup_orphaned_mihomo_processes(&self) -> Result<()> {
        logging!(info, Type::Core, true, "开始清理多余的 mihomo 进程");

        // 获取当前管理的进程 PID
        let current_pid = {
            let child_guard = self.child_sidecar.lock();
            child_guard.as_ref().map(|child| child.pid())
        };

        let target_processes = ["verge-mihomo", "verge-mihomo-alpha"];

        // 并行查找所有目标进程
        let mut process_futures = Vec::new();
        for &target in &target_processes {
            let process_name = if cfg!(windows) {
                format!("{target}.exe")
            } else {
                target.to_string()
            };
            process_futures.push(self.find_processes_by_name(process_name, target));
        }

        let process_results = futures::future::join_all(process_futures).await;

        // 收集所有需要终止的进程PID
        let mut pids_to_kill = Vec::new();
        for result in process_results {
            match result {
                Ok((pids, process_name)) => {
                    for pid in pids {
                        // 跳过当前管理的进程
                        if let Some(current) = current_pid
                            && pid == current
                        {
                            logging!(
                                debug,
                                Type::Core,
                                true,
                                "跳过当前管理的进程: {} (PID: {})",
                                process_name,
                                pid
                            );
                            continue;
                        }
                        pids_to_kill.push((pid, process_name.clone()));
                    }
                }
                Err(e) => {
                    logging!(debug, Type::Core, true, "查找进程时发生错误: {}", e);
                }
            }
        }

        if pids_to_kill.is_empty() {
            logging!(debug, Type::Core, true, "未发现多余的 mihomo 进程");
            return Ok(());
        }

        let mut kill_futures = Vec::new();
        for (pid, process_name) in &pids_to_kill {
            kill_futures.push(self.kill_process_with_verification(*pid, process_name.clone()));
        }

        let kill_results = futures::future::join_all(kill_futures).await;

        let killed_count = kill_results.into_iter().filter(|&success| success).count();

        if killed_count > 0 {
            logging!(
                info,
                Type::Core,
                true,
                "清理完成，共终止了 {} 个多余的 mihomo 进程",
                killed_count
            );
        }

        Ok(())
    }

    /// 根据进程名查找进程PID列
    async fn find_processes_by_name(
        &self,
        process_name: String,
        _target: &str,
    ) -> Result<(Vec<u32>, String)> {
        #[cfg(windows)]
        {
            use std::mem;
            use winapi::um::handleapi::CloseHandle;
            use winapi::um::tlhelp32::{
                CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
                TH32CS_SNAPPROCESS,
            };
            use winapi::um::winnt::HANDLE;

            let process_name_clone = process_name.clone();
            let pids = AsyncHandler::spawn_blocking(move || -> Result<Vec<u32>> {
                let mut pids = Vec::new();

                unsafe {
                    // 创建进程快照
                    let snapshot: HANDLE = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
                    if snapshot == winapi::um::handleapi::INVALID_HANDLE_VALUE {
                        return Err(anyhow::anyhow!("Failed to create process snapshot"));
                    }

                    let mut pe32: PROCESSENTRY32W = mem::zeroed();
                    pe32.dwSize = mem::size_of::<PROCESSENTRY32W>() as u32;

                    // 获取第一个进程
                    if Process32FirstW(snapshot, &mut pe32) != 0 {
                        loop {
                            // 将宽字符转换为String
                            let end_pos = pe32
                                .szExeFile
                                .iter()
                                .position(|&x| x == 0)
                                .unwrap_or(pe32.szExeFile.len());
                            let exe_file = String::from_utf16_lossy(&pe32.szExeFile[..end_pos]);

                            // 检查进程名是否匹配
                            if exe_file.eq_ignore_ascii_case(&process_name_clone) {
                                pids.push(pe32.th32ProcessID);
                            }
                            if Process32NextW(snapshot, &mut pe32) == 0 {
                                break;
                            }
                        }
                    }

                    // 关闭句柄
                    CloseHandle(snapshot);
                }

                Ok(pids)
            })
            .await??;

            Ok((pids, process_name))
        }

        #[cfg(not(windows))]
        {
            let output = if cfg!(target_os = "macos") {
                tokio::process::Command::new("pgrep")
                    .arg(&process_name)
                    .output()
                    .await?
            } else {
                // Linux
                tokio::process::Command::new("pidof")
                    .arg(&process_name)
                    .output()
                    .await?
            };

            if !output.status.success() {
                return Ok((Vec::new(), process_name));
            }

            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut pids = Vec::new();

            // Unix系统直接解析PID列表
            for pid_str in stdout.split_whitespace() {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    pids.push(pid);
                }
            }

            Ok((pids, process_name))
        }
    }

    /// 终止进程并验证结果 - 使用Windows API直接终止，更优雅高效
    async fn kill_process_with_verification(&self, pid: u32, process_name: String) -> bool {
        logging!(
            info,
            Type::Core,
            true,
            "尝试终止进程: {} (PID: {})",
            process_name,
            pid
        );

        #[cfg(windows)]
        let success = {
            use winapi::um::handleapi::CloseHandle;
            use winapi::um::processthreadsapi::{OpenProcess, TerminateProcess};
            use winapi::um::winnt::{HANDLE, PROCESS_TERMINATE};

            AsyncHandler::spawn_blocking(move || -> bool {
                unsafe {
                    let process_handle: HANDLE = OpenProcess(PROCESS_TERMINATE, 0, pid);
                    if process_handle.is_null() {
                        return false;
                    }
                    let result = TerminateProcess(process_handle, 1);
                    CloseHandle(process_handle);

                    result != 0
                }
            })
            .await
            .unwrap_or(false)
        };

        #[cfg(not(windows))]
        let success = {
            tokio::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output()
                .await
                .map(|output| output.status.success())
                .unwrap_or(false)
        };

        if success {
            // 短暂等待并验证进程是否真正终止
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            let still_running = self.is_process_running(pid).await.unwrap_or(false);
            if still_running {
                logging!(
                    warn,
                    Type::Core,
                    true,
                    "进程 {} (PID: {}) 终止命令成功但进程仍在运行",
                    process_name,
                    pid
                );
                false
            } else {
                logging!(
                    info,
                    Type::Core,
                    true,
                    "成功终止进程: {} (PID: {})",
                    process_name,
                    pid
                );
                true
            }
        } else {
            logging!(
                warn,
                Type::Core,
                true,
                "无法终止进程: {} (PID: {})",
                process_name,
                pid
            );
            false
        }
    }

    /// Windows API检查进程
    async fn is_process_running(&self, pid: u32) -> Result<bool> {
        #[cfg(windows)]
        {
            use winapi::shared::minwindef::DWORD;
            use winapi::um::handleapi::CloseHandle;
            use winapi::um::processthreadsapi::GetExitCodeProcess;
            use winapi::um::processthreadsapi::OpenProcess;
            use winapi::um::winnt::{HANDLE, PROCESS_QUERY_INFORMATION};

            AsyncHandler::spawn_blocking(move || -> Result<bool> {
                unsafe {
                    let process_handle: HANDLE = OpenProcess(PROCESS_QUERY_INFORMATION, 0, pid);
                    if process_handle.is_null() {
                        return Ok(false);
                    }
                    let mut exit_code: DWORD = 0;
                    let result = GetExitCodeProcess(process_handle, &mut exit_code);
                    CloseHandle(process_handle);

                    if result == 0 {
                        return Ok(false);
                    }
                    Ok(exit_code == 259)
                }
            })
            .await?
        }

        #[cfg(not(windows))]
        {
            let output = tokio::process::Command::new("ps")
                .args(["-p", &pid.to_string()])
                .output()
                .await?;

            Ok(output.status.success() && !output.stdout.is_empty())
        }
    }

    async fn start_core_by_sidecar(&self) -> Result<()> {
        logging!(trace, Type::Core, true, "Running core by sidecar");
        let config_file = &Config::generate_file(ConfigType::Run).await?;
        let app_handle = handle::Handle::global()
            .app_handle()
            .ok_or(anyhow::anyhow!("failed to get app handle"))?;
        let clash_core = Config::verge().await.latest_ref().get_valid_clash_core();
        let config_dir = dirs::app_home_dir()?;

        // --- Preflight: ensure IPC path directory exists and stale socket cleaned ---
        #[cfg(unix)]
        {
            if let Ok(ipc) = dirs::ipc_path() {
                if let Some(parent) = ipc.parent() {
                    let _ = create_dir_all(parent);
                }
                // 如果存在旧的 socket 文件，先删除，避免 bind EADDRINUSE / 权限问题
                if ipc.exists() {
                    let _ = std::fs::remove_file(&ipc);
                }
            }
        }

        let service_log_dir = dirs::app_home_dir()?.join("logs").join("service");
        create_dir_all(&service_log_dir)?;

        let now = Local::now();
        let timestamp = now.format("%Y%m%d_%H%M%S").to_string();

        let log_path = service_log_dir.join(format!("sidecar_{timestamp}.log"));

        let mut log_file = File::create(log_path)?;

        let (mut rx, child) = app_handle
            .shell()
            .sidecar(&clash_core)?
            .args([
                "-d",
                dirs::path_to_str(&config_dir)?,
                "-f",
                dirs::path_to_str(config_file)?,
            ])
            .spawn()?;

        AsyncHandler::spawn(move || async move {
            while let Some(event) = rx.recv().await {
                if let tauri_plugin_shell::process::CommandEvent::Stdout(line) = event
                    && let Err(e) = writeln!(log_file, "{}", String::from_utf8_lossy(&line))
                {
                    logging!(
                        error,
                        Type::Core,
                        true,
                        "[Sidecar] Failed to write stdout to file: {}",
                        e
                    );
                }
            }
        });

        let pid = child.pid();
        logging!(
            trace,
            Type::Core,
            true,
            "Started core by sidecar pid: {}",
            pid
        );
        *self.child_sidecar.lock() = Some(child);
        self.set_running_mode(RunningMode::Sidecar);
        Ok(())
    }
    fn stop_core_by_sidecar(&self) -> Result<()> {
        logging!(trace, Type::Core, true, "Stopping core by sidecar");

        if let Some(child) = self.child_sidecar.lock().take() {
            let pid = child.pid();
            child.kill()?;
            logging!(
                trace,
                Type::Core,
                true,
                "Stopped core by sidecar pid: {}",
                pid
            );
        }
        self.set_running_mode(RunningMode::NotRunning);
        Ok(())
    }
}

impl CoreManager {
    async fn start_core_by_service(&self) -> Result<()> {
        logging!(trace, Type::Core, true, "Running core by service");
        let config_file = &Config::generate_file(ConfigType::Run).await?;
        service::run_core_by_service(config_file).await?;
        self.set_running_mode(RunningMode::Service);
        Ok(())
    }
    async fn stop_core_by_service(&self) -> Result<()> {
        logging!(trace, Type::Core, true, "Stopping core by service");
        service::stop_core_by_service().await?;
        self.set_running_mode(RunningMode::NotRunning);
        Ok(())
    }
}

impl Default for CoreManager {
    fn default() -> Self {
        CoreManager {
            running: Arc::new(Mutex::new(RunningMode::NotRunning)),
            child_sidecar: Arc::new(Mutex::new(None)),
        }
    }
}

// Use simplified singleton_lazy macro
singleton_lazy!(CoreManager, CORE_MANAGER, CoreManager::default);

impl CoreManager {
    // 当服务安装失败时的回退逻辑
    async fn attempt_service_init(&self) -> Result<()> {
        if service::check_service_needs_reinstall().await {
            logging!(info, Type::Core, true, "服务版本不匹配或状态异常，执行重装");
            if let Err(e) = service::reinstall_service().await {
                logging!(
                    warn,
                    Type::Core,
                    true,
                    "服务重装失败 during attempt_service_init: {}",
                    e
                );
                return Err(e);
            }
            // 如果重装成功，还需要尝试启动服务
            logging!(info, Type::Core, true, "服务重装成功，尝试启动服务");
        }

        if let Err(e) = self.start_core_by_service().await {
            logging!(
                warn,
                Type::Core,
                true,
                "通过服务启动核心失败 during attempt_service_init: {}",
                e
            );
            // 确保 prefer_sidecar 在 start_core_by_service 失败时也被设置
            let mut state = service::ServiceState::get().await;
            if !state.prefer_sidecar {
                state.prefer_sidecar = true;
                state.last_error = Some(format!("通过服务启动核心失败: {e}"));
                if let Err(save_err) = state.save().await {
                    logging!(
                        error,
                        Type::Core,
                        true,
                        "保存ServiceState失败 (in attempt_service_init/start_core_by_service): {}",
                        save_err
                    );
                }
            }
            return Err(e);
        }
        Ok(())
    }

    pub async fn init(&self) -> Result<()> {
        logging!(info, Type::Core, true, "开始核心初始化");
        self.start_core().await?;
        logging!(info, Type::Core, true, "核心初始化完成");
        Ok(())
    }

    pub fn set_running_mode(&self, mode: RunningMode) {
        let mut guard = self.running.lock();
        *guard = mode;
    }

    pub fn get_running_mode(&self) -> RunningMode {
        let guard = self.running.lock();
        (*guard).clone()
    }

    /// 启动核心 - 简化版本,优先尝试服务模式,失败则回退到Sidecar模式
    pub async fn start_core(&self) -> Result<()> {
        // 先尝试服务模式
        if service::is_service_available().await.is_ok() {
            logging!(info, Type::Core, true, "服务可用，尝试使用服务模式启动");
            match self.start_core_by_service().await {
                Ok(_) => {
                    logging!(info, Type::Core, true, "服务模式启动成功");
                    return Ok(());
                }
                Err(e) => {
                    logging!(
                        warn,
                        Type::Core,
                        true,
                        "服务模式启动失败: {}, 回退到Sidecar模式",
                        e
                    );
                    // 出现失败时，清理可能残留的 unix socket，避免后续 Sidecar bind 失败
                    #[cfg(unix)]
                    if let Ok(ipc) = dirs::ipc_path() {
                        let _ = std::fs::remove_file(&ipc);
                    }
                }
            }
        }

        // 服务模式不可用或失败,使用Sidecar模式
        logging!(info, Type::Core, true, "使用Sidecar模式启动");
        self.start_core_by_sidecar().await?;
        Ok(())
    }

    /// 停止核心运行
    pub async fn stop_core(&self) -> Result<()> {
        log::info!(target: "app", "🛑 [核心管理] 开始停止Clash核心服务");

        // 🔧 修复：停止服务前先重置系统代理设置
        log::info!(target: "app", "🔄 [系统代理] 停止前重置系统代理设置");
        if let Err(e) = Sysopt::global().reset_sysproxy().await {
            log::warn!(target: "app", "⚠️ [系统代理] 重置系统代理失败: {}", e);
        } else {
            log::info!(target: "app", "✅ [系统代理] 系统代理已重置");
        }

        let result = match self.get_running_mode() {
            RunningMode::Service => {
                log::info!(target: "app", "🔄 [核心管理] 通过服务方式停止核心");
                self.stop_core_by_service().await
            }
            RunningMode::Sidecar => {
                log::info!(target: "app", "🔄 [核心管理] 通过进程方式停止核心");
                self.stop_core_by_sidecar()
            }
            RunningMode::NotRunning => {
                log::info!(target: "app", "ℹ️ [核心管理] 核心未运行，无需停止");
                Ok(())
            }
        };

        match &result {
            Ok(_) => log::info!(target: "app", "✅ [核心管理] Clash核心服务已完全停止"),
            Err(e) => log::error!(target: "app", "❌ [核心管理] 停止Clash核心服务失败: {}", e),
        }

        result
    }

    /// 重启内核
    pub async fn restart_core(&self) -> Result<()> {
        self.stop_core().await?;
        self.start_core().await?;
        Ok(())
    }

    /// 切换核心
    pub async fn change_core(&self, clash_core: Option<String>) -> Result<(), String> {
        if clash_core.is_none() {
            let error_message = "Clash core should not be Null";
            logging!(error, Type::Core, true, "{}", error_message);
            return Err(error_message.to_string());
        }
        let core = clash_core.as_ref().ok_or_else(|| {
            let msg = "Clash core should not be None";
            logging!(error, Type::Core, true, "{}", msg);
            msg.to_string()
        })?;
        if !IVerge::VALID_CLASH_CORES.contains(&core.as_str()) {
            let error_message = format!("Clash core invalid name: {core}");
            logging!(error, Type::Core, true, "{}", error_message);
            return Err(error_message);
        }

        Config::verge().await.draft_mut().clash_core = clash_core.clone();
        Config::verge().await.apply();

        // 分离数据获取和异步调用避免Send问题
        let verge_data = Config::verge().await.latest_ref().clone();
        logging_error!(Type::Core, true, verge_data.save_file().await);

        let run_path = Config::generate_file(ConfigType::Run).await.map_err(|e| {
            let msg = e.to_string();
            logging_error!(Type::Core, true, "{}", msg);
            msg
        })?;

        self.put_configs_force(run_path).await?;

        Ok(())
    }
}
