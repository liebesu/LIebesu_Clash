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
  // 兼容不同后端参数命名（snake_case 与 camelCase）
  return invoke<BatchImportResult>("batch_import_from_text", {
    text_content: textContent,
    textContent: textContent,
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
  // 兼容不同后端参数命名（snake_case 与 camelCase）
  return invoke<BatchImportResult>("batch_import_from_file", {
    file_path: filePath,
    filePath: filePath,
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
  // 兼容不同后端参数命名（snake_case 与 camelCase）
  return invoke<BatchImportResult>("preview_batch_import", {
    text_content: textContent,
    textContent: textContent,
    options,
  });
}

// ===== 批量导出相关 =====

export interface ExportOptions {
  format: string;              // 导出格式: json, yaml, txt, clash
  include_settings: boolean;   // 是否包含设置
  include_groups: boolean;     // 是否包含分组信息
  compress: boolean;           // 是否压缩
  encrypt: boolean;            // 是否加密
  password?: string;           // 加密密码
}

export interface ExportPreview {
  format: string;
  subscription_count: number;
  content_size: number;
  preview_content: string;
  include_settings: boolean;
}

export interface ExportableSubscription {
  uid: string;
  name: string;
  url?: string;
  subscription_type: string;
  created_at: number;
  updated_at?: number;
  node_count: number;
  is_valid: boolean;
}

/**
 * 批量导出订阅
 */
export async function batchExportSubscriptions(
  subscriptionUids: string[],
  options: ExportOptions
) {
  // 兼容 snake_case 与 camelCase
  return invoke<string>("batch_export_subscriptions", {
    subscription_uids: subscriptionUids,
    subscriptionUids: subscriptionUids,
    options,
  });
}

/**
 * 导出订阅到文件
 */
export async function exportSubscriptionsToFile(
  subscriptionUids: string[],
  filePath: string,
  options: ExportOptions
) {
  // 兼容 snake_case 与 camelCase
  return invoke<void>("export_subscriptions_to_file", {
    subscription_uids: subscriptionUids,
    subscriptionUids: subscriptionUids,
    file_path: filePath,
    filePath: filePath,
    options,
  });
}

/**
 * 预览导出内容
 */
export async function previewExport(
  subscriptionUids: string[],
  options: ExportOptions
) {
  // 兼容 snake_case 与 camelCase
  return invoke<ExportPreview>("preview_export", {
    subscription_uids: subscriptionUids,
    subscriptionUids: subscriptionUids,
    options,
  });
}

/**
 * 获取所有可导出的订阅
 */
export async function getAllSubscriptionsForExport() {
  return invoke<ExportableSubscription[]>("get_all_subscriptions_for_export");
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

// ===== 流量统计相关 =====

export interface TrafficRecord {
  subscription_uid: string;
  subscription_name: string;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  session_duration_seconds: number;
  start_time: number;
  end_time: number;
  avg_speed_mbps: number;
  peak_speed_mbps: number;
}

export interface SubscriptionTrafficStats {
  subscription_uid: string;
  subscription_name: string;
  total_upload_bytes: number;
  total_download_bytes: number;
  total_bytes: number;
  session_count: number;
  total_duration_seconds: number;
  avg_speed_mbps: number;
  peak_speed_mbps: number;
  first_used?: number;
  last_used?: number;
  daily_usage: DailyUsage[];
  monthly_usage: MonthlyUsage[];
  quota_info?: QuotaInfo;
}

export interface DailyUsage {
  date: string;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  session_count: number;
  duration_seconds: number;
}

export interface MonthlyUsage {
  month: string;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  session_count: number;
  duration_seconds: number;
}

export interface QuotaInfo {
  total_quota_bytes?: number;
  used_quota_bytes: number;
  remaining_quota_bytes?: number;
  quota_reset_date?: number;
  expire_date?: number;
  warning_threshold: number;
  is_unlimited: boolean;
}

export interface TrafficAlert {
  alert_id: string;
  subscription_uid: string;
  subscription_name: string;
  alert_type: "QuotaUsage" | "ExpirationDate" | "HighUsage" | "SpeedDrop" | "ConnectionIssue";
  message: string;
  threshold_value: number;
  current_value: number;
  created_at: number;
  is_read: boolean;
  severity: "Info" | "Warning" | "Critical" | "Emergency";
}

export interface TrafficOverview {
  total_subscriptions: number;
  active_subscriptions: number;
  total_upload_bytes: number;
  total_download_bytes: number;
  total_bytes: number;
  avg_speed_mbps: number;
  peak_speed_mbps: number;
  total_sessions: number;
  total_duration_seconds: number;
  today_usage: number;
  this_month_usage: number;
  alerts_count: number;
  critical_alerts_count: number;
}

export interface TrafficPrediction {
  subscription_uid: string;
  predicted_monthly_usage: number;
  predicted_exhaust_date?: number;
  recommended_plan?: string;
  confidence_level: number;
  trend_direction: "Increasing" | "Stable" | "Decreasing";
}

/**
 * 记录流量使用
 */
export async function recordTrafficUsage(
  subscriptionUid: string,
  uploadBytes: number,
  downloadBytes: number,
  durationSeconds: number
) {
  return invoke<void>("record_traffic_usage", {
    subscription_uid: subscriptionUid,
    upload_bytes: uploadBytes,
    download_bytes: downloadBytes,
    duration_seconds: durationSeconds,
  });
}

/**
 * 获取订阅流量统计
 */
export async function getSubscriptionTrafficStats(subscriptionUid: string) {
  return invoke<SubscriptionTrafficStats>("get_subscription_traffic_stats", {
    subscription_uid: subscriptionUid,
  });
}

/**
 * 获取所有订阅流量统计
 */
export async function getAllTrafficStats() {
  return invoke<SubscriptionTrafficStats[]>("get_all_traffic_stats");
}

/**
 * 获取流量概览
 */
export async function getTrafficOverview() {
  return invoke<TrafficOverview>("get_traffic_overview");
}

/**
 * 获取流量警告
 */
export async function getTrafficAlerts(includeRead?: boolean) {
  return invoke<TrafficAlert[]>("get_traffic_alerts", {
    include_read: includeRead,
  });
}

/**
 * 标记警告为已读
 */
export async function markAlertAsRead(alertId: string) {
  return invoke<void>("mark_alert_as_read", { alert_id: alertId });
}

/**
 * 清理历史数据
 */
export async function cleanupTrafficHistory(daysToKeep: number) {
  return invoke<number>("cleanup_traffic_history", { days_to_keep: daysToKeep });
}

/**
 * 导出流量数据
 */
export async function exportTrafficData(
  subscriptionUid?: string,
  startDate?: string,
  endDate?: string
) {
  return invoke<string>("export_traffic_data", {
    subscription_uid: subscriptionUid,
    start_date: startDate,
    end_date: endDate,
  });
}

/**
 * 设置订阅配额信息
 */
export async function setSubscriptionQuota(subscriptionUid: string, quotaInfo: QuotaInfo) {
  return invoke<void>("set_subscription_quota", {
    subscription_uid: subscriptionUid,
    quota_info: quotaInfo,
  });
}

/**
 * 获取流量预测
 */
export async function getTrafficPrediction(subscriptionUid: string) {
  return invoke<TrafficPrediction>("get_traffic_prediction", {
    subscription_uid: subscriptionUid,
  });
}

// ===== 订阅分组相关 =====

export interface SubscriptionGroup {
  id: string;
  name: string;
  description: string;
  group_type: "Region" | "Provider" | "Usage" | "Speed" | "Custom";
  color: string;
  icon: string;
  subscription_uids: string[];
  tags: string[];
  is_favorite: boolean;
  sort_order: number;
  auto_rules: AutoRule[];
  created_at: number;
  updated_at: number;
}

export interface AutoRule {
  rule_type: "NameContains" | "NameMatches" | "UrlContains" | "UrlMatches" | "TagEquals" | "SpeedRange" | "LatencyRange";
  condition: "Contains" | "NotContains" | "Equals" | "NotEquals" | "StartsWith" | "EndsWith" | "Matches" | "NotMatches" | "GreaterThan" | "LessThan" | "Between";
  value: string;
  is_enabled: boolean;
}

export interface GroupStatistics {
  group_id: string;
  group_name: string;
  total_subscriptions: number;
  active_subscriptions: number;
  total_nodes: number;
  avg_latency_ms: number;
  avg_speed_mbps: number;
  health_score: number;
  last_updated: number;
}

export interface BatchOperationResult {
  total_items: number;
  successful_items: number;
  failed_items: number;
  errors: string[];
  operation_duration_ms: number;
}

export interface GroupSuggestion {
  suggested_name: string;
  suggested_type: "Region" | "Provider" | "Usage" | "Speed" | "Custom";
  suggested_subscriptions: string[];
  confidence_score: number;
  reason: string;
}

export interface GroupExportData {
  groups: SubscriptionGroup[];
  export_time: number;
  version: string;
}

/**
 * 创建分组
 */
export async function createSubscriptionGroup(group: SubscriptionGroup) {
  return invoke<string>("create_subscription_group", { group });
}

/**
 * 更新分组
 */
export async function updateSubscriptionGroup(group: SubscriptionGroup) {
  return invoke<void>("update_subscription_group", { group });
}

/**
 * 删除分组
 */
export async function deleteSubscriptionGroup(groupId: string) {
  return invoke<void>("delete_subscription_group", { group_id: groupId });
}

/**
 * 获取所有分组
 */
export async function getAllSubscriptionGroups() {
  return invoke<SubscriptionGroup[]>("get_all_subscription_groups");
}

/**
 * 获取单个分组
 */
export async function getSubscriptionGroup(groupId: string) {
  return invoke<SubscriptionGroup>("get_subscription_group", { group_id: groupId });
}

/**
 * 添加订阅到分组
 */
export async function addSubscriptionToGroup(groupId: string, subscriptionUid: string) {
  return invoke<void>("add_subscription_to_group", {
    group_id: groupId,
    subscription_uid: subscriptionUid,
  });
}

/**
 * 从分组中移除订阅
 */
export async function removeSubscriptionFromGroup(groupId: string, subscriptionUid: string) {
  return invoke<void>("remove_subscription_from_group", {
    group_id: groupId,
    subscription_uid: subscriptionUid,
  });
}

/**
 * 获取订阅所属的分组
 */
export async function getSubscriptionGroups(subscriptionUid: string) {
  return invoke<SubscriptionGroup[]>("get_subscription_groups", {
    subscription_uid: subscriptionUid,
  });
}

/**
 * 批量添加订阅到分组
 */
export async function batchAddSubscriptionsToGroup(
  groupId: string,
  subscriptionUids: string[]
) {
  return invoke<BatchOperationResult>("batch_add_subscriptions_to_group", {
    group_id: groupId,
    subscription_uids: subscriptionUids,
  });
}

/**
 * 批量从分组移除订阅
 */
export async function batchRemoveSubscriptionsFromGroup(
  groupId: string,
  subscriptionUids: string[]
) {
  return invoke<BatchOperationResult>("batch_remove_subscriptions_from_group", {
    group_id: groupId,
    subscription_uids: subscriptionUids,
  });
}

/**
 * 应用自动分组规则
 */
export async function applyAutoGroupingRules() {
  return invoke<BatchOperationResult>("apply_auto_grouping_rules");
}

/**
 * 获取分组统计信息
 */
export async function getGroupStatistics(groupId: string) {
  return invoke<GroupStatistics>("get_group_statistics", { group_id: groupId });
}

/**
 * 获取所有分组统计信息
 */
export async function getAllGroupStatistics() {
  return invoke<GroupStatistics[]>("get_all_group_statistics");
}

/**
 * 导出分组配置
 */
export async function exportSubscriptionGroups() {
  return invoke<string>("export_subscription_groups");
}

/**
 * 导入分组配置
 */
export async function importSubscriptionGroups(importData: string) {
  return invoke<BatchOperationResult>("import_subscription_groups", {
    import_data: importData,
  });
}

/**
 * 获取智能分组建议
 */
export async function getSmartGroupingSuggestions() {
  return invoke<GroupSuggestion[]>("get_smart_grouping_suggestions");
}

/**
 * 创建默认分组
 */
export async function createDefaultGroups() {
  return invoke<string[]>("create_default_groups");
}

// ===== 备份恢复相关 =====

export interface BackupData {
  backup_id: string;
  backup_name: string;
  description: string;
  version: string;
  app_version: string;
  created_at: number;
  file_size: number;
  checksum: string;
  is_encrypted: boolean;
  backup_type: BackupType;
  profiles: ProfileBackup[];
  settings: SettingsBackup;
  groups?: GroupsBackup;
  traffic_stats?: TrafficStatsBackup;
  tasks?: TasksBackup;
}

export type BackupType = "Full" | "Profiles" | "Settings" | "Custom";

export interface ProfileBackup {
  uid: string;
  name: string;
  desc?: string;
  file?: string;
  url?: string;
  selected: string[];
  chain: string[];
  valid: boolean;
  updated?: number;
  option?: string;
  home?: string;
  extra?: string;
}

export interface SettingsBackup {
  clash_config: string;
  verge_config: string;
  profiles_config: string;
}

export interface GroupsBackup {
  groups: string;
}

export interface TrafficStatsBackup {
  traffic_data: string;
}

export interface TasksBackup {
  tasks_data: string;
}

export interface BackupOptions {
  backup_type: BackupType;
  include_profiles: boolean;
  include_settings: boolean;
  include_groups: boolean;
  include_traffic_stats: boolean;
  include_tasks: boolean;
  encrypt: boolean;
  password?: string;
  compression_level: number;
  backup_name: string;
  description: string;
}

export interface RestoreOptions {
  backup_id: string;
  restore_profiles: boolean;
  restore_settings: boolean;
  restore_groups: boolean;
  restore_traffic_stats: boolean;
  restore_tasks: boolean;
  merge_mode: boolean;
  password?: string;
  create_backup_before_restore: boolean;
}

export interface BackupInfo {
  backup_id: string;
  backup_name: string;
  description: string;
  file_path: string;
  file_size: number;
  created_at: number;
  version: string;
  app_version: string;
  backup_type: BackupType;
  is_encrypted: boolean;
  checksum: string;
  is_valid: boolean;
}

export interface RestoreResult {
  success: boolean;
  restored_items: number;
  failed_items: number;
  errors: string[];
  warnings: string[];
  operation_duration_ms: number;
  backup_created?: string;
}

export interface WebDAVConfig {
  enabled: boolean;
  server_url: string;
  username: string;
  password: string;
  remote_path: string;
  auto_sync: boolean;
  sync_interval_hours: number;
  encrypt_before_upload: boolean;
  compression_enabled: boolean;
}

export interface SyncStatus {
  last_sync?: number;
  last_upload?: number;
  last_download?: number;
  pending_uploads: number;
  pending_downloads: number;
  sync_errors: string[];
  is_syncing: boolean;
}

/**
 * 创建备份
 */
export async function createBackup(options: BackupOptions) {
  return invoke<string>("create_backup", { options });
}

/**
 * 获取所有备份
 */
export async function getAllBackups() {
  return invoke<BackupInfo[]>("get_all_backups");
}

/**
 * 获取备份详情
 */
export async function getBackupDetails(backupId: string) {
  return invoke<BackupData>("get_backup_details", { backup_id: backupId });
}

/**
 * 恢复备份
 */
export async function restoreBackup(options: RestoreOptions) {
  return invoke<RestoreResult>("restore_backup", { options });
}

/**
 * 删除备份
 */
export async function deleteBackup(backupId: string) {
  return invoke<void>("delete_backup", { backup_id: backupId });
}

/**
 * 验证备份
 */
export async function validateBackup(backupId: string) {
  return invoke<boolean>("validate_backup", { backup_id: backupId });
}

/**
 * 导出备份
 */
export async function exportBackup(backupId: string, exportPath: string) {
  return invoke<void>("export_backup", {
    backup_id: backupId,
    export_path: exportPath,
  });
}

/**
 * 导入备份
 */
export async function importBackup(importPath: string, backupName: string) {
  return invoke<string>("import_backup", {
    import_path: importPath,
    backup_name: backupName,
  });
}

/**
 * 设置WebDAV配置
 */
export async function setWebDAVConfig(config: WebDAVConfig) {
  return invoke<void>("set_webdav_config", { config });
}

/**
 * 获取WebDAV配置
 */
export async function getWebDAVConfig() {
  return invoke<WebDAVConfig>("get_webdav_config");
}

/**
 * 同步到WebDAV
 */
export async function syncToWebDAV() {
  return invoke<SyncStatus>("sync_to_webdav");
}

/**
 * 从WebDAV同步
 */
export async function syncFromWebDAV() {
  return invoke<SyncStatus>("sync_from_webdav");
}

/**
 * 获取同步状态
 */
export async function getSyncStatus() {
  return invoke<SyncStatus>("get_sync_status");
}

/**
 * 清理旧备份
 */
export async function cleanupOldBackups(keepDays: number, keepCount: number) {
  return invoke<number>("cleanup_old_backups", {
    keep_days: keepDays,
    keep_count: keepCount,
  });
}

// ===== 高级搜索相关 =====

export interface SearchCriteria {
  query: string;
  filters: SearchFilter[];
  sort_by: SortBy;
  sort_order: SortOrder;
  limit?: number;
  offset?: number;
}

export interface SearchFilter {
  field: SearchField;
  operator: FilterOperator;
  value: string;
  case_sensitive: boolean;
}

export type SearchField =
  | "Name"
  | "Description"
  | "Url"
  | "Type"
  | "UpdatedAt"
  | "CreatedAt"
  | "NodeCount"
  | "Tags"
  | "Groups"
  | "Country"
  | "Provider"
  | "Protocol"
  | "Latency"
  | "Speed"
  | "Status"
  | "TrafficUsage"
  | "ExpiryDate";

export type FilterOperator =
  | "Equals"
  | "NotEquals"
  | "Contains"
  | "NotContains"
  | "StartsWith"
  | "EndsWith"
  | "Matches"
  | "NotMatches"
  | "GreaterThan"
  | "LessThan"
  | "GreaterEqual"
  | "LessEqual"
  | "Between"
  | "NotBetween"
  | "IsEmpty"
  | "IsNotEmpty"
  | "InList"
  | "NotInList";

export type SortBy =
  | "Name"
  | "UpdatedAt"
  | "CreatedAt"
  | "NodeCount"
  | "Latency"
  | "Speed"
  | "TrafficUsage"
  | "ExpiryDate"
  | "Relevance";

export type SortOrder = "Ascending" | "Descending";

export interface SearchResult {
  total_count: number;
  items: SubscriptionSearchItem[];
  search_time_ms: number;
  suggestions: string[];
  facets: Record<string, FacetValue[]>;
}

export interface SubscriptionSearchItem {
  uid: string;
  name: string;
  description?: string;
  url?: string;
  subscription_type: string;
  node_count: number;
  country?: string;
  provider?: string;
  tags: string[];
  groups: string[];
  created_at: number;
  updated_at?: number;
  latency?: number;
  speed?: number;
  traffic_usage?: number;
  expiry_date?: number;
  status: string;
  relevance_score: number;
  highlights: Record<string, string[]>;
}

export interface FacetValue {
  value: string;
  count: number;
  selected: boolean;
}

export interface SavedSearch {
  id: string;
  name: string;
  description: string;
  criteria: SearchCriteria;
  created_at: number;
  updated_at: number;
  is_favorite: boolean;
  usage_count: number;
  last_used?: number;
}

export interface SearchHistory {
  id: string;
  query: string;
  criteria: SearchCriteria;
  result_count: number;
  search_time: number;
  search_duration_ms: number;
}

export interface SearchSuggestion {
  suggestion: string;
  suggestion_type: SuggestionType;
  frequency: number;
  relevance: number;
}

export type SuggestionType = "Query" | "Filter" | "Tag" | "Country" | "Provider";

export interface SearchStatistics {
  total_searches: number;
  total_saved_searches: number;
  avg_search_time_ms: number;
  popular_queries: PopularQuery[];
  recent_searches: string[];
}

export interface PopularQuery {
  query: string;
  count: number;
}

/**
 * 高级搜索
 */
export async function advancedSearch(criteria: SearchCriteria) {
  return invoke<SearchResult>("advanced_search", { criteria });
}

/**
 * 快速搜索
 */
export async function quickSearch(query: string, limit?: number) {
  return invoke<SubscriptionSearchItem[]>("quick_search", { query, limit });
}

/**
 * 保存搜索
 */
export async function saveSearch(
  name: string,
  description: string,
  criteria: SearchCriteria
) {
  return invoke<string>("save_search", { name, description, criteria });
}

/**
 * 获取保存的搜索
 */
export async function getSavedSearches() {
  return invoke<SavedSearch[]>("get_saved_searches");
}

/**
 * 删除保存的搜索
 */
export async function deleteSavedSearch(searchId: string) {
  return invoke<void>("delete_saved_search", { search_id: searchId });
}

/**
 * 执行保存的搜索
 */
export async function executeSavedSearch(searchId: string) {
  return invoke<SearchResult>("execute_saved_search", { search_id: searchId });
}

/**
 * 获取搜索历史
 */
export async function getSearchHistory(limit?: number) {
  return invoke<SearchHistory[]>("get_search_history", { limit });
}

/**
 * 清理搜索历史
 */
export async function clearSearchHistory() {
  return invoke<void>("clear_search_history");
}

/**
 * 获取搜索建议
 */
export async function getSearchSuggestions(query: string) {
  return invoke<SearchSuggestion[]>("get_search_suggestions", { query });
}

/**
 * 获取字段值建议
 */
export async function getFieldValueSuggestions(field: SearchField) {
  return invoke<string[]>("get_field_value_suggestions", { field });
}

/**
 * 更新搜索索引
 */
export async function updateSearchIndex() {
  return invoke<void>("update_search_index");
}

/**
 * 获取搜索统计
 */
export async function getSearchStatistics() {
  return invoke<SearchStatistics>("get_search_statistics");
}

// Subscription Batch Manager Interfaces
export interface SubscriptionCleanupOptions {
  days_threshold: number;
  preview_only: boolean;
  exclude_favorites: boolean;
  exclude_groups: string[];
}

export interface SubscriptionInfo {
  uid: string;
  name: string;
  url?: string;
  last_updated?: string;
  days_since_update: number;
  size?: number;
  node_count?: number;
  is_favorite: boolean;
  groups: string[];
}

export interface CleanupPreview {
  total_subscriptions: number;
  expired_subscriptions: SubscriptionInfo[];
  will_be_deleted: number;
  will_be_kept: number;
  cleanup_options: SubscriptionCleanupOptions;
}

export interface BatchUpdateResult {
  total_subscriptions: number;
  successful_updates: number;
  failed_updates: number;
  updated_subscriptions: string[];
  failed_subscriptions: string[];
  error_messages: Record<string, string>;
}

export interface CleanupResult {
  deleted_count: number;
  deleted_subscriptions: string[];
  cleanup_options: SubscriptionCleanupOptions;
  cleanup_time: string;
}

/**
 * 获取订阅清理预览
 */
export async function getSubscriptionCleanupPreview(options: SubscriptionCleanupOptions) {
  return invoke<CleanupPreview>("get_subscription_cleanup_preview", { options });
}

/**
 * 批量更新所有订阅
 */
export async function updateAllSubscriptions() {
  return invoke<BatchUpdateResult>("update_all_subscriptions");
}

/**
 * 清理过期订阅
 */
export async function cleanupExpiredSubscriptions(options: SubscriptionCleanupOptions) {
  return invoke<CleanupResult>("cleanup_expired_subscriptions", { options });
}

/**
 * 获取订阅管理统计信息
 */
export async function getSubscriptionManagementStats() {
  return invoke<any>("get_subscription_management_stats");
}

/**
 * 设置自动清理规则
 */
export async function setAutoCleanupRules(enabled: boolean, cleanupOptions: SubscriptionCleanupOptions) {
  return invoke<void>("set_auto_cleanup_rules", { enabled, cleanupOptions });
}

/**
 * 获取自动清理规则
 */
export async function getAutoCleanupRules() {
  return invoke<any>("get_auto_cleanup_rules");
}

// ===== 全局节点测速相关命令 =====

/**
 * 开始全局节点测速
 */
export async function startGlobalSpeedTest(): Promise<string> {
  return invoke<string>("start_global_speed_test");
}

/**
 * 切换到最佳节点
 */
export async function applyBestNode(): Promise<string> {
  return invoke<string>("apply_best_node");
}

export async function cancelGlobalSpeedTest(): Promise<string> {
  return invoke<string>("cancel_global_speed_test");
}
