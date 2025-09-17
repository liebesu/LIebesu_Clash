import { invoke } from "@tauri-apps/api/core";
import { showNotice } from "@/services/noticeService";

export async function copyClashEnv() {
  return invoke<void>("copy_clash_env");
}

export async function getProfiles() {
  return invoke<IProfilesConfig>("get_profiles");
}

export async function enhanceProfiles() {
  return invoke<void>("enhance_profiles");
}

export async function patchProfilesConfig(profiles: IProfilesConfig) {
  return invoke<void>("patch_profiles_config", { profiles });
}

export async function createProfile(
  item: Partial<IProfileItem>,
  fileData?: string | null,
) {
  return invoke<void>("create_profile", { item, fileData });
}

export async function viewProfile(index: string) {
  return invoke<void>("view_profile", { index });
}

export async function readProfileFile(index: string) {
  return invoke<string>("read_profile_file", { index });
}

export async function saveProfileFile(index: string, fileData: string) {
  return invoke<void>("save_profile_file", { index, fileData });
}

export async function importProfile(url: string, option?: IProfileOption) {
  return invoke<void>("import_profile", {
    url,
    option: option || { with_proxy: true },
  });
}

export async function reorderProfile(activeId: string, overId: string) {
  return invoke<void>("reorder_profile", {
    activeId,
    overId,
  });
}

export async function updateProfile(index: string, option?: IProfileOption) {
  return invoke<void>("update_profile", { index, option });
}

export async function deleteProfile(index: string) {
  return invoke<void>("delete_profile", { index });
}

export async function patchProfile(
  index: string,
  profile: Partial<IProfileItem>,
) {
  return invoke<void>("patch_profile", { index, profile });
}

export async function getClashInfo() {
  return invoke<IClashInfo | null>("get_clash_info");
}

// Get runtime config which controlled by verge
export async function getRuntimeConfig() {
  return invoke<IConfigData | null>("get_runtime_config");
}

export async function getRuntimeYaml() {
  return invoke<string | null>("get_runtime_yaml");
}

export async function getRuntimeExists() {
  return invoke<string[]>("get_runtime_exists");
}

export async function getRuntimeLogs() {
  return invoke<Record<string, [string, string][]>>("get_runtime_logs");
}

export async function getRuntimeProxyChainConfig() {
  return invoke<string>("get_runtime_proxy_chain_config");
}

export async function updateProxyChainConfigInRuntime(proxyChainConfig: any) {
  return invoke<void>("update_proxy_chain_config_in_runtime", {
    proxyChainConfig,
  });
}

export async function patchClashConfig(payload: Partial<IConfigData>) {
  return invoke<void>("patch_clash_config", { payload });
}

export async function patchClashMode(payload: string) {
  return invoke<void>("patch_clash_mode", { payload });
}

// New IPC-based API functions to replace HTTP API calls
export async function getVersion() {
  return invoke<{
    premium: boolean;
    meta?: boolean;
    version: string;
  }>("get_clash_version");
}

export async function getClashConfig() {
  return invoke<IConfigData>("get_clash_config");
}

export async function forceRefreshClashConfig() {
  return invoke<IConfigData>("force_refresh_clash_config");
}

export async function updateGeoData() {
  return invoke<void>("update_geo_data");
}

export async function upgradeCore() {
  return invoke<void>("upgrade_clash_core");
}

export async function getRules() {
  const response = await invoke<{ rules: IRuleItem[] }>("get_clash_rules");
  return response?.rules || [];
}

export async function getProxyDelay(
  name: string,
  url?: string,
  timeout?: number,
) {
  return invoke<{ delay: number }>("clash_api_get_proxy_delay", {
    name,
    url,
    timeout: timeout || 10000,
  });
}

export async function updateProxy(group: string, proxy: string) {
  // const start = Date.now();
  await invoke<void>("update_proxy_choice", { group, proxy });
  // const duration = Date.now() - start;
  // console.log(`[API] updateProxy 耗时: ${duration}ms`);
}

export async function syncTrayProxySelection() {
  return invoke<void>("sync_tray_proxy_selection");
}

export async function updateProxyAndSync(group: string, proxy: string) {
  return invoke<void>("update_proxy_and_sync", { group, proxy });
}

export async function getProxies(): Promise<{
  global: IProxyGroupItem;
  direct: IProxyItem;
  groups: IProxyGroupItem[];
  records: Record<string, IProxyItem>;
  proxies: IProxyItem[];
}> {
  const [proxyResponse, providerResponse] = await Promise.all([
    invoke<{ proxies: Record<string, IProxyItem> }>("get_proxies"),
    invoke<{ providers: Record<string, IProxyProviderItem> }>(
      "get_providers_proxies",
    ),
  ]);

  const proxyRecord = proxyResponse.proxies;
  const providerRecord = providerResponse.providers || {};

  // provider name map
  const providerMap = Object.fromEntries(
    Object.entries(providerRecord).flatMap(([provider, item]) =>
      item.proxies.map((p) => [p.name, { ...p, provider }]),
    ),
  );

  // compatible with proxy-providers
  const generateItem = (name: string) => {
    if (proxyRecord[name]) return proxyRecord[name];
    if (providerMap[name]) return providerMap[name];
    return {
      name,
      type: "unknown",
      udp: false,
      xudp: false,
      tfo: false,
      mptcp: false,
      smux: false,
      history: [],
    };
  };

  const { GLOBAL: global, DIRECT: direct, REJECT: reject } = proxyRecord;

  let groups: IProxyGroupItem[] = Object.values(proxyRecord).reduce<
    IProxyGroupItem[]
  >((acc, each) => {
    if (each.name !== "GLOBAL" && each.all) {
      acc.push({
        ...each,
        all: each.all!.map((item) => generateItem(item)),
      });
    }

    return acc;
  }, []);

  if (global?.all) {
    let globalGroups: IProxyGroupItem[] = global.all.reduce<IProxyGroupItem[]>(
      (acc, name) => {
        if (proxyRecord[name]?.all) {
          acc.push({
            ...proxyRecord[name],
            all: proxyRecord[name].all!.map((item) => generateItem(item)),
          });
        }
        return acc;
      },
      [],
    );

    let globalNames = new Set(globalGroups.map((each) => each.name));
    groups = groups
      .filter((group) => {
        return !globalNames.has(group.name);
      })
      .concat(globalGroups);
  }

  const proxies = [direct, reject].concat(
    Object.values(proxyRecord).filter(
      (p) => !p.all?.length && p.name !== "DIRECT" && p.name !== "REJECT",
    ),
  );

  const _global: IProxyGroupItem = {
    ...global,
    all: global?.all?.map((item) => generateItem(item)) || [],
  };

  return { global: _global, direct, groups, records: proxyRecord, proxies };
}

export async function getProxyProviders() {
  const response = await invoke<{
    providers: Record<string, IProxyProviderItem>;
  }>("get_providers_proxies");
  if (!response || !response.providers) {
    console.warn(
      "getProxyProviders: Invalid response structure, returning empty object",
    );
    return {};
  }

  const providers = response.providers as Record<string, IProxyProviderItem>;

  return Object.fromEntries(
    Object.entries(providers).filter(([, item]) => {
      const type = item.vehicleType.toLowerCase();
      return type === "http" || type === "file";
    }),
  );
}

export async function getRuleProviders() {
  const response = await invoke<{
    providers: Record<string, IRuleProviderItem>;
  }>("get_rule_providers");

  const providers = (response.providers || {}) as Record<
    string,
    IRuleProviderItem
  >;

  return Object.fromEntries(
    Object.entries(providers).filter(([, item]) => {
      const type = item.vehicleType.toLowerCase();
      return type === "http" || type === "file";
    }),
  );
}

export async function providerHealthCheck(name: string) {
  return invoke<void>("proxy_provider_health_check", { name });
}

export async function proxyProviderUpdate(name: string) {
  return invoke<void>("update_proxy_provider", { name });
}

export async function ruleProviderUpdate(name: string) {
  return invoke<void>("update_rule_provider", { name });
}

export async function getConnections() {
  return invoke<IConnections>("get_clash_connections");
}

export async function deleteConnection(id: string) {
  return invoke<void>("delete_clash_connection", { id });
}

export async function closeAllConnections() {
  return invoke<void>("close_all_clash_connections");
}

export async function getGroupProxyDelays(
  groupName: string,
  url?: string,
  timeout?: number,
) {
  return invoke<Record<string, number>>("get_group_proxy_delays", {
    groupName,
    url,
    timeout,
  });
}

export async function getTrafficData() {
  // console.log("[Traffic][Service] 开始调用 get_traffic_data");
  const result = await invoke<ITrafficItem>("get_traffic_data");
  // console.log("[Traffic][Service] get_traffic_data 返回结果:", result);
  return result;
}

export async function getMemoryData() {
  console.log("[Memory][Service] 开始调用 get_memory_data");
  const result = await invoke<{
    inuse: number;
    oslimit?: number;
    usage_percent?: number;
    last_updated?: number;
  }>("get_memory_data");
  // console.debug("[Memory][Service] get_memory_data 返回结果:", result);
  return result;
}

export async function getFormattedTrafficData() {
  console.log("[Traffic][Service] 开始调用 get_formatted_traffic_data");
  const result = await invoke<IFormattedTrafficData>(
    "get_formatted_traffic_data",
  );
  // console.debug(
  //   "[Traffic][Service] get_formatted_traffic_data 返回结果:",
  //   result,
  // );
  return result;
}

export async function getFormattedMemoryData() {
  console.log("[Memory][Service] 开始调用 get_formatted_memory_data");
  const result = await invoke<IFormattedMemoryData>(
    "get_formatted_memory_data",
  );
  // console.debug("[Memory][Service] get_formatted_memory_data 返回结果:", result);
  return result;
}

export async function getSystemMonitorOverview() {
  console.log("[Monitor][Service] 开始调用 get_system_monitor_overview");
  const result = await invoke<ISystemMonitorOverview>(
    "get_system_monitor_overview",
  );
  // console.debug(
  //   "[Monitor][Service] get_system_monitor_overview 返回结果:",
  //   result,
  // );
  return result;
}

// 带数据验证的安全版本
export async function getSystemMonitorOverviewSafe() {
  // console.log(
  //   "[Monitor][Service] 开始调用安全版本 get_system_monitor_overview",
  // );
  try {
    const result = await invoke<any>("get_system_monitor_overview");
    // console.log("[Monitor][Service] 原始数据:", result);

    // 导入验证器（动态导入避免循环依赖）
    const { systemMonitorValidator } = await import("@/utils/data-validator");

    if (systemMonitorValidator.validate(result)) {
      // console.log("[Monitor][Service] 数据验证通过");
      return result as ISystemMonitorOverview;
    } else {
      // console.warn("[Monitor][Service] 数据验证失败，使用清理后的数据");
      return systemMonitorValidator.sanitize(result);
    }
  } catch {
    // console.error("[Monitor][Service] API调用失败:", error);
    // 返回安全的默认值
    const { systemMonitorValidator } = await import("@/utils/data-validator");
    return systemMonitorValidator.sanitize(null);
  }
}

export async function startTrafficService() {
  console.log("[Traffic][Service] 开始调用 start_traffic_service");
  try {
    const result = await invoke<void>("start_traffic_service");
    console.log("[Traffic][Service] start_traffic_service 调用成功");
    return result;
  } catch (error) {
    console.error("[Traffic][Service] start_traffic_service 调用失败:", error);
    throw error;
  }
}

export async function stopTrafficService() {
  console.log("[Traffic][Service] 开始调用 stop_traffic_service");
  const result = await invoke<void>("stop_traffic_service");
  console.log("[Traffic][Service] stop_traffic_service 调用成功");
  return result;
}

export async function isDebugEnabled() {
  return invoke<boolean>("is_clash_debug_enabled");
}

export async function gc() {
  return invoke<void>("clash_gc");
}

export async function getClashLogs() {
  return invoke<any>("get_clash_logs");
}

export async function startLogsMonitoring(level?: string) {
  return invoke<void>("start_logs_monitoring", { level });
}

export async function stopLogsMonitoring() {
  return invoke<void>("stop_logs_monitoring");
}

export async function clearLogs() {
  return invoke<void>("clear_logs");
}

export async function getVergeConfig() {
  return invoke<IVergeConfig>("get_verge_config");
}

export async function patchVergeConfig(payload: IVergeConfig) {
  return invoke<void>("patch_verge_config", { payload });
}

export async function getSystemProxy() {
  return invoke<{
    enable: boolean;
    server: string;
    bypass: string;
  }>("get_sys_proxy");
}

export async function getAutotemProxy() {
  try {
    console.log("[API] 开始调用 get_auto_proxy");
    const result = await invoke<{
      enable: boolean;
      url: string;
    }>("get_auto_proxy");
    console.log("[API] get_auto_proxy 调用成功:", result);
    return result;
  } catch (error) {
    console.error("[API] get_auto_proxy 调用失败:", error);
    return {
      enable: false,
      url: "",
    };
  }
}

export async function getAutoLaunchStatus() {
  try {
    return await invoke<boolean>("get_auto_launch_status");
  } catch (error) {
    console.error("获取自启动状态失败:", error);
    return false;
  }
}

export async function changeClashCore(clashCore: string) {
  return invoke<string | null>("change_clash_core", { clashCore });
}

export async function startCore() {
  return invoke<void>("start_core");
}

export async function stopCore() {
  return invoke<void>("stop_core");
}

export async function restartCore() {
  return invoke<void>("restart_core");
}

export async function restartApp() {
  return invoke<void>("restart_app");
}

export async function getAppDir() {
  return invoke<string>("get_app_dir");
}

export async function openAppDir() {
  return invoke<void>("open_app_dir").catch((err) =>
    showNotice("error", err?.message || err.toString()),
  );
}

export async function openCoreDir() {
  return invoke<void>("open_core_dir").catch((err) =>
    showNotice("error", err?.message || err.toString()),
  );
}

export async function openLogsDir() {
  return invoke<void>("open_logs_dir").catch((err) =>
    showNotice("error", err?.message || err.toString()),
  );
}

export const openWebUrl = async (url: string) => {
  try {
    await invoke("open_web_url", { url });
  } catch (err: any) {
    showNotice("error", err.toString());
  }
};

export async function cmdGetProxyDelay(
  name: string,
  timeout: number,
  url?: string,
) {
  // 确保URL不为空
  const testUrl = url || "https://cp.cloudflare.com/generate_204";

  try {
    // 不再在前端编码代理名称，由后端统一处理编码
    const result = await invoke<{ delay: number }>(
      "clash_api_get_proxy_delay",
      {
        name,
        url: testUrl, // 传递经过验证的URL
        timeout,
      },
    );

    // 验证返回结果中是否有delay字段，并且值是一个有效的数字
    if (result && typeof result.delay === "number") {
      return result;
    } else {
      // 返回一个有效的结果对象，但标记为超时
      return { delay: 1e6 };
    }
  } catch {
    // 返回一个有效的结果对象，但标记为错误
    return { delay: 1e6 };
  }
}

/// 用于profile切换等场景
export async function forceRefreshProxies() {
  const start = Date.now();
  console.log("[API] 强制刷新代理缓存");
  const result = await invoke<any>("force_refresh_proxies");
  const duration = Date.now() - start;
  console.log(`[API] 代理缓存刷新完成，耗时: ${duration}ms`);
  return result;
}

export async function cmdTestDelay(url: string) {
  return invoke<number>("test_delay", { url });
}

export async function invoke_uwp_tool() {
  return invoke<void>("invoke_uwp_tool").catch((err) =>
    showNotice("error", err?.message || err.toString(), 1500),
  );
}

export async function getPortableFlag() {
  return invoke<boolean>("get_portable_flag");
}

export async function openDevTools() {
  return invoke("open_devtools");
}

export async function exitApp() {
  return invoke("exit_app");
}

export async function exportDiagnosticInfo() {
  return invoke("export_diagnostic_info");
}

export async function getSystemInfo() {
  return invoke<string>("get_system_info");
}

export async function copyIconFile(
  path: string,
  name: "common" | "sysproxy" | "tun",
) {
  const key = `icon_${name}_update_time`;
  const previousTime = localStorage.getItem(key) || "";

  const currentTime = String(Date.now());
  localStorage.setItem(key, currentTime);

  const iconInfo = {
    name,
    previous_t: previousTime,
    current_t: currentTime,
  };

  return invoke<void>("copy_icon_file", { path, iconInfo });
}

export async function downloadIconCache(url: string, name: string) {
  return invoke<string>("download_icon_cache", { url, name });
}

export async function getNetworkInterfaces() {
  return invoke<string[]>("get_network_interfaces");
}

export async function getSystemHostname() {
  return invoke<string>("get_system_hostname");
}

export async function getNetworkInterfacesInfo() {
  return invoke<INetworkInterface[]>("get_network_interfaces_info");
}

export async function createWebdavBackup() {
  return invoke<void>("create_webdav_backup");
}

export async function deleteWebdavBackup(filename: string) {
  return invoke<void>("delete_webdav_backup", { filename });
}

export async function restoreWebDavBackup(filename: string) {
  return invoke<void>("restore_webdav_backup", { filename });
}

export async function saveWebdavConfig(
  url: string,
  username: string,
  password: string,
) {
  return invoke<void>("save_webdav_config", {
    url,
    username,
    password,
  });
}

export async function listWebDavBackup() {
  let list: IWebDavFile[] = await invoke<IWebDavFile[]>("list_webdav_backup");
  list.map((item) => {
    item.filename = item.href.split("/").pop() as string;
  });
  return list;
}

export async function scriptValidateNotice(status: string, msg: string) {
  return invoke<void>("script_validate_notice", { status, msg });
}

export async function validateScriptFile(filePath: string) {
  return invoke<boolean>("validate_script_file", { filePath });
}

// 获取当前运行模式
export const getRunningMode = async () => {
  return invoke<string>("get_running_mode");
};

// 获取应用运行时间
export const getAppUptime = async () => {
  return invoke<number>("get_app_uptime");
};

// 安装系统服务
export const installService = async () => {
  return invoke<void>("install_service");
};

// 卸载系统服务
export const uninstallService = async () => {
  return invoke<void>("uninstall_service");
};

// 重装系统服务
export const reinstallService = async () => {
  return invoke<void>("reinstall_service");
};

// 修复系统服务
export const repairService = async () => {
  return invoke<void>("repair_service");
};

// 系统服务是否可用
export const isServiceAvailable = async () => {
  try {
    return await invoke<boolean>("is_service_available");
  } catch (error) {
    console.error("Service check failed:", error);
    return false;
  }
};
export const entry_lightweight_mode = async () => {
  return invoke<void>("entry_lightweight_mode");
};

export const exit_lightweight_mode = async () => {
  return invoke<void>("exit_lightweight_mode");
};

export const isAdmin = async () => {
  try {
    return await invoke<boolean>("is_admin");
  } catch (error) {
    console.error("检查管理员权限失败:", error);
    return false;
  }
};

export async function getNextUpdateTime(uid: string) {
  return invoke<number | null>("get_next_update_time", { uid });
}

// ===== 订阅健康检查相关 =====

export interface SubscriptionHealthResult {
  uid: string;
  name: string;
  url?: string;
  status: "Healthy" | "Warning" | "Unhealthy" | "Checking" | "Unknown";
  response_time?: number; // 毫秒
  node_count?: number;
  last_update?: number;
  error_message?: string;
  last_checked: number;
}

export interface BatchHealthResult {
  total: number;
  healthy: number;
  warning: number;
  unhealthy: number;
  results: SubscriptionHealthResult[];
  check_duration: number; // 毫秒
}

/**
 * 检查单个订阅的健康状态
 */
export async function checkSubscriptionHealth(uid: string) {
  return invoke<SubscriptionHealthResult>("check_subscription_health", { uid });
}

/**
 * 批量检查所有订阅的健康状态
 */
export async function checkAllSubscriptionsHealth() {
  return invoke<BatchHealthResult>("check_all_subscriptions_health");
}

/**
 * 获取订阅详细信息（包括节点数量等）
 */
export async function getSubscriptionDetails(uid: string) {
  return invoke<SubscriptionHealthResult>("get_subscription_details", { uid });
}

/**
 * 清理健康检查缓存
 */
export async function cleanupHealthCheckCache() {
  return invoke<void>("cleanup_health_check_cache");
}

// ===== 批量导入相关 =====

export interface BatchImportResult {
  total_input: number;       // 输入的总数
  valid_urls: number;        // 有效的URL数量
  imported: number;          // 成功导入的数量
  duplicates: number;        // 重复的数量
  failed: number;            // 失败的数量
  results: ImportResult[];   // 详细结果
  import_duration: number;   // 导入耗时（毫秒）
}

export interface ImportResult {
  url: string;
  name?: string;
  status: "Success" | "Duplicate" | "Failed" | "Invalid";
  error_message?: string;
  uid?: string;
}

export interface BatchImportOptions {
  skip_duplicates: boolean;    // 跳过重复项
  auto_generate_names: boolean; // 自动生成名称
  name_prefix?: string;        // 名称前缀
  default_user_agent?: string; // 默认User-Agent
  update_interval?: number;    // 更新间隔（分钟）
}

/**
 * 从文本批量导入订阅
 */
export async function batchImportFromText(
  textContent: string,
  options?: BatchImportOptions
) {
  return invoke<BatchImportResult>("batch_import_from_text", {
    text_content: textContent,
    options,
  });
}

/**
 * 从文件批量导入订阅
 */
export async function batchImportFromFile(
  filePath: string,
  options?: BatchImportOptions
) {
  return invoke<BatchImportResult>("batch_import_from_file", {
    file_path: filePath,
    options,
  });
}

/**
 * 从剪贴板批量导入订阅
 */
export async function batchImportFromClipboard(options?: BatchImportOptions) {
  return invoke<BatchImportResult>("batch_import_from_clipboard", { options });
}

/**
 * 获取批量导入预览（不实际导入）
 */
export async function previewBatchImport(
  textContent: string,
  options?: BatchImportOptions
) {
  return invoke<BatchImportResult>("preview_batch_import", {
    text_content: textContent,
    options,
  });
}

// ===== 任务管理相关 =====

export interface TaskConfig {
  id: string;
  name: string;
  description: string;
  task_type: "SubscriptionUpdate" | "HealthCheck" | "AutoCleanup" | "Custom";
  status: "Active" | "Paused" | "Disabled" | "Error";
  interval_minutes: number;
  enabled: boolean;
  target_profiles: string[];
  options: TaskOptions;
  created_at: number;
  updated_at: number;
  last_run?: number;
  next_run?: number;
}

export interface TaskOptions {
  max_retries: number;
  timeout_seconds: number;
  parallel_limit: number;
  auto_cleanup_days?: number;
  health_check_url?: string;
  notification_enabled: boolean;
}

export interface TaskExecutionResult {
  task_id: string;
  execution_id: string;
  status: "Success" | "Failed" | "Running" | "Timeout";
  start_time: number;
  end_time?: number;
  duration_ms?: number;
  message?: string;
  error_details?: string;
  affected_profiles: string[];
  retry_count: number;
}

export interface TaskStatistics {
  task_id: string;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  avg_duration_ms: number;
  last_execution?: TaskExecutionResult;
  success_rate: number;
}

export interface TaskSystemOverview {
  total_tasks: number;
  active_tasks: number;
  paused_tasks: number;
  error_tasks: number;
  running_tasks: number;
  next_execution?: number;
  recent_executions: TaskExecutionResult[];
}

/**
 * 获取所有任务配置
 */
export async function getAllTasks() {
  return invoke<TaskConfig[]>("get_all_tasks");
}

/**
 * 创建新任务
 */
export async function createTask(taskConfig: TaskConfig) {
  return invoke<string>("create_task", { task_config: taskConfig });
}

/**
 * 更新任务配置
 */
export async function updateTask(taskConfig: TaskConfig) {
  return invoke<void>("update_task", { task_config: taskConfig });
}

/**
 * 删除任务
 */
export async function deleteTask(taskId: string) {
  return invoke<void>("delete_task", { task_id: taskId });
}

/**
 * 启用/禁用任务
 */
export async function toggleTask(taskId: string, enabled: boolean) {
  return invoke<void>("toggle_task", { task_id: taskId, enabled });
}

/**
 * 立即执行任务
 */
export async function executeTaskImmediately(taskId: string) {
  return invoke<TaskExecutionResult>("execute_task_immediately", { task_id: taskId });
}

/**
 * 获取任务执行历史
 */
export async function getTaskExecutionHistory(taskId: string, limit?: number) {
  return invoke<TaskExecutionResult[]>("get_task_execution_history", { task_id: taskId, limit });
}

/**
 * 获取任务统计信息
 */
export async function getTaskStatistics(taskId: string) {
  return invoke<TaskStatistics>("get_task_statistics", { task_id: taskId });
}

/**
 * 获取系统任务概览
 */
export async function getTaskSystemOverview() {
  return invoke<TaskSystemOverview>("get_task_system_overview");
}

/**
 * 清理过期的执行历史
 */
export async function cleanupExecutionHistory(days: number) {
  return invoke<number>("cleanup_execution_history", { days });
}

/**
 * 创建默认任务
 */
export async function createDefaultTasks() {
  return invoke<string[]>("create_default_tasks");
}

// ===== 订阅测试相关 =====

export interface NodeTestResult {
  node_name: string;
  node_type: string;
  server: string;
  port: number;
  status: "Pass" | "Fail" | "Warning" | "Timeout" | "Error";
  latency_ms?: number;
  download_speed_mbps?: number;
  upload_speed_mbps?: number;
  packet_loss_rate?: number;
  stability_score?: number;
  error_message?: string;
  test_duration_ms: number;
  test_time: number;
}

export interface SubscriptionTestResult {
  subscription_uid: string;
  subscription_name: string;
  test_type: TestType;
  overall_status: "Pass" | "Fail" | "Warning" | "Timeout" | "Error";
  total_nodes: number;
  passed_nodes: number;
  failed_nodes: number;
  warning_nodes: number;
  avg_latency_ms?: number;
  avg_download_speed_mbps?: number;
  avg_upload_speed_mbps?: number;
  overall_stability_score?: number;
  quality_grade: "Excellent" | "Good" | "Fair" | "Poor" | "VeryPoor";
  node_results: NodeTestResult[];
  recommendations: string[];
  test_duration_ms: number;
  test_time: number;
}

export interface BatchTestResult {
  test_id: string;
  test_type: TestType;
  total_subscriptions: number;
  completed_subscriptions: number;
  results: SubscriptionTestResult[];
  summary: TestSummary;
  test_duration_ms: number;
  test_time: number;
}

export interface TestSummary {
  total_nodes: number;
  working_nodes: number;
  failed_nodes: number;
  avg_latency_ms: number;
  best_latency_ms: number;
  worst_latency_ms: number;
  fastest_node?: string;
  recommended_subscriptions: string[];
  quality_distribution: Record<string, number>;
}

export interface TestConfig {
  test_timeout_seconds: number;
  connection_timeout_seconds: number;
  max_concurrent_tests: number;
  speed_test_duration_seconds: number;
  speed_test_file_size_mb: number;
  latency_test_count: number;
  stability_test_duration_seconds: number;
  test_urls: string[];
  skip_speed_test: boolean;
  skip_stability_test: boolean;
}

export type TestType = "Connectivity" | "Latency" | "Speed" | "Stability" | "Comprehensive";

/**
 * 测试单个订阅
 */
export async function testSubscription(
  subscriptionUid: string, 
  testType: TestType, 
  config?: TestConfig
) {
  return invoke<SubscriptionTestResult>("test_subscription", {
    subscription_uid: subscriptionUid,
    test_type: testType,
    config,
  });
}

/**
 * 批量测试所有订阅
 */
export async function testAllSubscriptions(testType: TestType, config?: TestConfig) {
  return invoke<BatchTestResult>("test_all_subscriptions", {
    test_type: testType,
    config,
  });
}

/**
 * 快速连通性测试
 */
export async function quickConnectivityTest(subscriptionUid: string) {
  return invoke<NodeTestResult[]>("quick_connectivity_test", {
    subscription_uid: subscriptionUid,
  });
}

/**
 * 获取节点质量排名
 */
export async function getNodeQualityRanking(subscriptionUid: string, limit?: number) {
  return invoke<NodeTestResult[]>("get_node_quality_ranking", {
    subscription_uid: subscriptionUid,
    limit,
  });
}

/**
 * 获取优化建议
 */
export async function getOptimizationSuggestions(subscriptionUid: string) {
  return invoke<string[]>("get_optimization_suggestions", {
    subscription_uid: subscriptionUid,
  });
}

/**
 * 设置定期测试任务
 */
export async function schedulePeriodicTest(
  subscriptionUids: string[],
  testType: TestType,
  intervalHours: number
) {
  return invoke<string>("schedule_periodic_test", {
    subscription_uids: subscriptionUids,
    test_type: testType,
    interval_hours: intervalHours,
  });
}
