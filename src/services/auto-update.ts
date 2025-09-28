import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useNotification } from "@/components/base/enhanced-notification";

// 自动更新相关接口
export interface UpdateInfo {
  available: boolean;
  current_version: string;
  latest_version?: string;
  release_notes?: string;
  download_url?: string;
  published_at?: string;
  size_bytes?: number;
  signature?: string;
  auto_update_enabled: boolean;
  last_check_time?: number;
}

export interface UpdateConfig {
  auto_check_enabled: boolean;
  auto_install_enabled: boolean;
  check_interval_hours: number;
  notification_enabled: boolean;
  beta_channel_enabled: boolean;
  last_check_timestamp?: number;
  skip_version?: string;
}

export interface UpdateHistoryItem {
  version: string;
  timestamp: number;
  status: "Available" | "Downloaded" | "Installed" | "Failed" | "Skipped";
  notes?: string;
}

// 自动更新服务类
export class AutoUpdateService {
  private static instance: AutoUpdateService;
  private notification = useNotification();
  private listeners: (() => void)[] = [];
  
  public static getInstance(): AutoUpdateService {
    if (!this.instance) {
      this.instance = new AutoUpdateService();
    }
    return this.instance;
  }

  private constructor() {
    this.setupEventListeners();
  }

  // 设置事件监听器
  private setupEventListeners() {
    // 监听更新可用事件
    const updateAvailableListener = listen<UpdateInfo>("update-available", (event) => {
      console.log("🔄 检测到新版本更新:", event.payload);
      this.handleUpdateAvailable(event.payload);
    });

    // 监听下载开始事件
    const downloadStartedListener = listen<string>("update-download-started", (event) => {
      console.log("📥 开始下载更新:", event.payload);
      this.handleDownloadStarted(event.payload);
    });

    // 监听下载进度事件
    const downloadProgressListener = listen<number>("update-download-progress", (event) => {
      this.handleDownloadProgress(event.payload);
    });

    // 监听安装成功事件
    const installSuccessListener = listen("update-install-success", () => {
      console.log("✅ 更新安装成功");
      this.handleInstallSuccess();
    });

    // 监听安装失败事件
    const installFailedListener = listen<string>("update-install-failed", (event) => {
      console.error("❌ 更新安装失败:", event.payload);
      this.handleInstallFailed(event.payload);
    });

    // 监听更新通知事件
    const updateNotificationListener = listen<UpdateInfo>("update-notification", (event) => {
      console.log("🔔 更新通知:", event.payload);
      this.handleUpdateNotification(event.payload);
    });

    // 保存监听器引用，以便后续清理
    Promise.all([
      updateAvailableListener,
      downloadStartedListener,
      downloadProgressListener,
      installSuccessListener,
      installFailedListener,
      updateNotificationListener,
    ]).then(listeners => {
      this.listeners = listeners;
    });
  }

  // 检查更新
  async checkForUpdates(): Promise<UpdateInfo> {
    try {
      console.log("🔍 开始检查更新...");
      const updateInfo = await invoke<UpdateInfo>("check_for_updates");
      console.log("✅ 更新检查完成:", updateInfo);
      return updateInfo;
    } catch (error) {
      console.error("❌ 检查更新失败:", error);
      throw new Error(`检查更新失败: ${error}`);
    }
  }

  // 下载并安装更新
  async downloadAndInstallUpdate(): Promise<void> {
    try {
      console.log("📥 开始下载并安装更新...");
      await invoke<void>("download_and_install_update");
      console.log("✅ 更新下载并安装成功");
    } catch (error) {
      console.error("❌ 下载并安装更新失败:", error);
      throw new Error(`下载并安装更新失败: ${error}`);
    }
  }

  // 获取更新配置
  async getUpdateConfig(): Promise<UpdateConfig> {
    try {
      return await invoke<UpdateConfig>("get_update_config");
    } catch (error) {
      console.error("❌ 获取更新配置失败:", error);
      throw new Error(`获取更新配置失败: ${error}`);
    }
  }

  // 设置更新配置
  async setUpdateConfig(config: UpdateConfig): Promise<void> {
    try {
      await invoke<void>("set_update_config", { config });
      console.log("✅ 更新配置已保存");
    } catch (error) {
      console.error("❌ 保存更新配置失败:", error);
      throw new Error(`保存更新配置失败: ${error}`);
    }
  }

  // 跳过指定版本
  async skipUpdateVersion(version: string): Promise<void> {
    try {
      await invoke<void>("skip_update_version", { version });
      console.log(`✅ 已跳过版本: ${version}`);
    } catch (error) {
      console.error("❌ 跳过版本失败:", error);
      throw new Error(`跳过版本失败: ${error}`);
    }
  }

  // 获取更新历史
  async getUpdateHistory(): Promise<UpdateHistoryItem[]> {
    try {
      return await invoke<UpdateHistoryItem[]>("get_update_history");
    } catch (error) {
      console.error("❌ 获取更新历史失败:", error);
      throw new Error(`获取更新历史失败: ${error}`);
    }
  }

  // 处理更新可用事件
  private handleUpdateAvailable(updateInfo: UpdateInfo) {
    if (!updateInfo.latest_version) return;

    this.notification.info("发现新版本更新", {
      title: "更新可用",
      persistent: true,
      actions: [
        {
          label: "立即更新",
          action: () => this.downloadAndInstallUpdate(),
          color: "primary",
        },
        {
          label: "查看详情",
          action: () => this.showUpdateDetails(updateInfo),
          color: "secondary",
        },
        {
          label: "跳过此版本",
          action: () => this.skipUpdateVersion(updateInfo.latest_version!),
          color: "warning",
        },
      ],
    });
  }

  // 处理下载开始事件
  private handleDownloadStarted(version: string) {
    this.notification.loading(`正在下载 v${version}...`, {
      title: "更新下载中",
      persistent: true,
      id: "update-download",
    });
  }

  // 处理下载进度事件
  private handleDownloadProgress(progress: number) {
    this.notification.updateNotification("update-download", {
      type: "progress",
      progress,
      message: `下载进度: ${progress}%`,
    });
  }

  // 处理安装成功事件
  private handleInstallSuccess() {
    this.notification.removeNotification("update-download");
    this.notification.success("更新安装成功", {
      title: "更新完成",
      duration: 5000,
      actions: [
        {
          label: "立即重启",
          action: () => {
            // 应用将自动重启
            console.log("🔄 应用即将重启以应用更新");
          },
          color: "primary",
        },
      ],
    });
  }

  // 处理安装失败事件
  private handleInstallFailed(error: string) {
    this.notification.removeNotification("update-download");
    this.notification.error(`更新安装失败: ${error}`, {
      title: "更新失败",
      actions: [
        {
          label: "重试",
          action: () => this.downloadAndInstallUpdate(),
          color: "primary",
        },
        {
          label: "手动下载",
          action: () => this.openManualDownload(),
          color: "secondary",
        },
      ],
    });
  }

  // 处理更新通知事件
  private handleUpdateNotification(updateInfo: UpdateInfo) {
    if (updateInfo.available && updateInfo.latest_version) {
      this.notification.info(
        `新版本 v${updateInfo.latest_version} 现已可用`,
        {
          title: "更新提醒",
          duration: 10000,
          actions: [
            {
              label: "查看更新",
              action: () => this.showUpdateDetails(updateInfo),
              color: "primary",
            },
          ],
        }
      );
    }
  }

  // 显示更新详情
  private showUpdateDetails(updateInfo: UpdateInfo) {
    // 这里可以打开更新详情对话框
    console.log("📋 显示更新详情:", updateInfo);
    
    // 触发自定义事件，让UI组件处理
    window.dispatchEvent(new CustomEvent("show-update-details", { 
      detail: updateInfo 
    }));
  }

  // 打开手动下载页面
  private openManualDownload() {
    // 打开GitHub Releases页面
    window.open("https://github.com/liebesu/LIebesu_Clash/releases/latest", "_blank");
  }

  // 启动自动检查
  async startAutoCheck() {
    try {
      const config = await this.getUpdateConfig();
      if (config.auto_check_enabled) {
        console.log("🔄 启动自动更新检查");
        // 每小时检查一次
        setInterval(() => {
          this.checkForUpdates().catch(console.error);
        }, 60 * 60 * 1000);
        
        // 立即检查一次（延迟5秒避免影响启动性能）
        setTimeout(() => {
          this.checkForUpdates().catch(console.error);
        }, 5000);
      }
    } catch (error) {
      console.error("❌ 启动自动检查失败:", error);
    }
  }

  // 清理监听器
  destroy() {
    this.listeners.forEach(unlisten => {
      if (typeof unlisten === 'function') {
        unlisten();
      }
    });
    this.listeners = [];
  }
}

// 导出单例实例
export const autoUpdateService = AutoUpdateService.getInstance();

// 便捷的Hook
export const useAutoUpdate = () => {
  return {
    checkForUpdates: () => autoUpdateService.checkForUpdates(),
    downloadAndInstallUpdate: () => autoUpdateService.downloadAndInstallUpdate(),
    getUpdateConfig: () => autoUpdateService.getUpdateConfig(),
    setUpdateConfig: (config: UpdateConfig) => autoUpdateService.setUpdateConfig(config),
    skipUpdateVersion: (version: string) => autoUpdateService.skipUpdateVersion(version),
    getUpdateHistory: () => autoUpdateService.getUpdateHistory(),
    startAutoCheck: () => autoUpdateService.startAutoCheck(),
  };
};

export default autoUpdateService;
