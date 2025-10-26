import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useVerge } from "@/hooks/use-verge";
import useSWR from "swr";
import {
  getProxies,
  getRules,
  getClashConfig,
  getProxyProviders,
  getRuleProviders,
  getConnections,
  getTrafficData,
  getMemoryData,
} from "@/services/cmds";
import {
  getSystemProxy,
  getRunningMode,
  getAppUptime,
  forceRefreshProxies,
  forceRefreshClashConfig,
} from "@/services/cmds";
import { useClashInfo } from "@/hooks/use-clash";
import { useVisibility } from "@/hooks/use-visibility";
import { listen } from "@tauri-apps/api/event";

// 连接速度计算接口
interface ConnectionSpeedData {
  id: string;
  upload: number;
  download: number;
  timestamp: number;
}

interface ConnectionWithSpeed extends IConnectionsItem {
  curUpload: number;
  curDownload: number;
}

// 定义AppDataContext类型 - 使用宽松类型
interface AppDataContextType {
  proxies: any;
  clashConfig: any;
  rules: any[];
  sysproxy: any;
  runningMode?: string;
  uptime: number;
  proxyProviders: any;
  ruleProviders: any;
  connections: {
    data: ConnectionWithSpeed[];
    count: number;
    uploadTotal: number;
    downloadTotal: number;
  };
  traffic: { up: number; down: number };
  memory: { inuse: number };
  systemProxyAddress: string;

  refreshProxy: () => Promise<any>;
  refreshClashConfig: () => Promise<any>;
  refreshRules: () => Promise<any>;
  refreshSysproxy: () => Promise<any>;
  refreshProxyProviders: () => Promise<any>;
  refreshRuleProviders: () => Promise<any>;
  refreshAll: () => Promise<any>;
}

// 创建上下文
const AppDataContext = createContext<AppDataContextType | null>(null);

// 全局数据提供者组件
export const AppDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pageVisible = useVisibility();
  const { clashInfo } = useClashInfo();
  const { verge } = useVerge();

  // 存储上一次连接数据用于速度计算
  const previousConnectionsRef = useRef<Map<string, ConnectionSpeedData>>(
    new Map(),
  );

  // 计算连接速度的函数
  const calculateConnectionSpeeds = (
    currentConnections: IConnectionsItem[],
  ): ConnectionWithSpeed[] => {
    const now = Date.now();
    const currentMap = new Map<string, ConnectionSpeedData>();

    return currentConnections.map((conn) => {
      const connWithSpeed: ConnectionWithSpeed = {
        ...conn,
        curUpload: 0,
        curDownload: 0,
      };

      const currentData: ConnectionSpeedData = {
        id: conn.id,
        upload: conn.upload,
        download: conn.download,
        timestamp: now,
      };

      currentMap.set(conn.id, currentData);

      const previousData = previousConnectionsRef.current.get(conn.id);
      if (previousData) {
        const timeDiff = (now - previousData.timestamp) / 1000; // 转换为秒

        if (timeDiff > 0) {
          const uploadDiff = conn.upload - previousData.upload;
          const downloadDiff = conn.download - previousData.download;

          // 计算每秒速度 (字节/秒)
          connWithSpeed.curUpload = Math.max(0, uploadDiff / timeDiff);
          connWithSpeed.curDownload = Math.max(0, downloadDiff / timeDiff);
        }
      }

      return connWithSpeed;
    });
  };

  // 基础数据 - 中频率更新 (5秒)
  const { data: proxiesData, mutate: refreshProxy } = useSWR(
    "getProxies",
    getProxies,
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
      suspense: false,
      errorRetryCount: 3,
      // 避免初始渲染出现空数组导致“无数据”误判，提供安全的兜底结构
      fallbackData: {
        global: { name: "GLOBAL", type: "Selector", now: "", all: [] },
        direct: { name: "DIRECT", type: "Direct", history: [] },
        groups: [],
        records: {},
        proxies: [],
      },
      onError: (error) => {
        console.warn("[AppDataProvider] 加载代理数据失败: ", error);
      },
    },
  );

  // 监听profile和clash配置变更事件
  useEffect(() => {
    let profileUnlisten: Promise<() => void> | undefined;
    let lastProfileId: string | null = null;
    let lastUpdateTime = 0;
    const refreshThrottle = 500;

    const setupEventListeners = async () => {
      try {
        // 监听profile切换事件
        profileUnlisten = listen<string>("profile-changed", (event) => {
          const newProfileId = event.payload;
          const now = Date.now();

          console.log(`[AppDataProvider] Profile事件: ${newProfileId}`);

          if (
            lastProfileId === newProfileId &&
            now - lastUpdateTime < refreshThrottle
          ) {
            console.log("[AppDataProvider] 重复事件被防抖，跳过");
            return;
          }

          lastProfileId = newProfileId;
          lastUpdateTime = now;

          setTimeout(async () => {
            try {
              console.log(`[AppDataProvider] 处理Profile事件: ${newProfileId}`);
              
              // 如果是订阅更新事件，需要刷新clashConfig和proxies
              if (newProfileId === "updated") {
                console.log("[AppDataProvider] 检测到订阅更新事件，刷新所有数据");
                
                // 先强制刷新运行时配置
                await forceRefreshClashConfig();
                
                // 刷新前端clash配置缓存
                await refreshClashConfig();
                
                // 强制刷新代理缓存
                await forceRefreshProxies();
                
                // 刷新前端代理数据
                await refreshProxy();
                
                console.log("[AppDataProvider] 订阅更新后数据刷新完成");
              } else {
                // 普通的profile切换事件
                console.log("[AppDataProvider] 处理profile切换事件");
                
                // 先执行 forceRefreshProxies，完成后稍延迟再刷新前端数据
                await forceRefreshProxies();
                
                setTimeout(() => {
                  refreshProxy().catch((e) =>
                    console.warn("[AppDataProvider] 普通刷新也失败:", e),
                  );
                }, 200); // 200ms 延迟，保证后端缓存已清理
              }
            } catch (error) {
              console.error("[AppDataProvider] Profile事件处理失败:", error);
              
              // 降级处理：至少尝试刷新代理数据
              try {
                await refreshProxy();
              } catch (e) {
                console.warn("[AppDataProvider] 降级刷新也失败:", e);
              }
            }
          }, 0);
        });

        // 监听Clash配置刷新事件(enhance操作等)
        const handleRefreshClash = () => {
          const now = Date.now();
          console.log("[AppDataProvider] Clash配置刷新事件");

          if (now - lastUpdateTime > refreshThrottle) {
            lastUpdateTime = now;

            setTimeout(async () => {
              try {
                console.log("[AppDataProvider] Clash刷新 - 强制刷新运行时配置");

                // 先强制刷新运行时配置（带超时保护）
                await Promise.race([
                  forceRefreshClashConfig(),
                  new Promise((_, reject) =>
                    setTimeout(
                      () =>
                        reject(new Error("forceRefreshClashConfig timeout")),
                      8000,
                    ),
                  ),
                ]);

                // 刷新前端clash配置缓存
                await refreshClashConfig();

                console.log("[AppDataProvider] Clash刷新 - 强制刷新代理缓存");
                // 再强制刷新代理缓存（带超时保护），最后刷新前端代理数据
                await Promise.race([
                  forceRefreshProxies(),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("forceRefreshProxies timeout")),
                      8000,
                    ),
                  ),
                ]);
                await refreshProxy();
              } catch (error) {
                console.error(
                  "[AppDataProvider] Clash刷新时刷新配置或代理缓存失败:",
                  error,
                );
                // 尝试仅刷新前端缓存，尽量恢复界面显示
                try {
                  await refreshClashConfig();
                } catch (e) {
                  console.warn("[AppDataProvider] 刷新前端clash配置失败:", e);
                }
                try {
                  await refreshProxy();
                } catch (e) {
                  console.warn(
                    "[AppDataProvider] Clash刷新普通代理刷新也失败:",
                    e,
                  );
                }
              }
            }, 0);
          }
        };

        // 监听代理配置刷新事件(托盘代理切换等)
        const handleRefreshProxy = () => {
          const now = Date.now();
          console.log("[AppDataProvider] 代理配置刷新事件");

          if (now - lastUpdateTime > refreshThrottle) {
            lastUpdateTime = now;

            setTimeout(() => {
              refreshProxy().catch((e) =>
                console.warn("[AppDataProvider] 代理刷新失败:", e),
              );
            }, 100);
          }
        };

        // 监听强制代理刷新事件(托盘代理切换立即刷新)
        const handleForceRefreshProxies = () => {
          console.log("[AppDataProvider] 强制代理刷新事件");

          // 立即刷新，无延迟，无防抖
          forceRefreshProxies()
            .then(() => {
              console.log("[AppDataProvider] 强制刷新代理缓存完成");
              // 强制刷新完成后，立即刷新前端显示
              return refreshProxy();
            })
            .then(() => {
              console.log("[AppDataProvider] 前端代理数据刷新完成");
            })
            .catch((e) => {
              console.warn("[AppDataProvider] 强制代理刷新失败:", e);
              // 如果强制刷新失败，尝试普通刷新
              refreshProxy().catch((e2) =>
                console.warn("[AppDataProvider] 普通代理刷新也失败:", e2),
              );
            });
        };

        // 使用 Tauri 事件监听器替代 window 事件监听器
        const setupTauriListeners = async () => {
          try {
            const unlistenClash = await listen(
              "verge://refresh-clash-config",
              handleRefreshClash,
            );
            const unlistenProxy = await listen(
              "verge://refresh-proxy-config",
              handleRefreshProxy,
            );
            const unlistenForceRefresh = await listen(
              "verge://force-refresh-proxies",
              handleForceRefreshProxies,
            );

            return () => {
              unlistenClash();
              unlistenProxy();
              unlistenForceRefresh();
            };
          } catch (error) {
            console.warn("[AppDataProvider] 设置 Tauri 事件监听器失败:", error);

            // 降级到 window 事件监听器
            window.addEventListener(
              "verge://refresh-clash-config",
              handleRefreshClash,
            );
            window.addEventListener(
              "verge://refresh-proxy-config",
              handleRefreshProxy,
            );
            window.addEventListener(
              "verge://force-refresh-proxies",
              handleForceRefreshProxies,
            );

            return () => {
              window.removeEventListener(
                "verge://refresh-clash-config",
                handleRefreshClash,
              );
              window.removeEventListener(
                "verge://refresh-proxy-config",
                handleRefreshProxy,
              );
              window.removeEventListener(
                "verge://force-refresh-proxies",
                handleForceRefreshProxies,
              );
            };
          }
        };

        const cleanupTauriListeners = setupTauriListeners();

        return async () => {
          const cleanup = await cleanupTauriListeners;
          cleanup();
        };
      } catch (error) {
        console.error("[AppDataProvider] 事件监听器设置失败:", error);
        return () => {};
      }
    };

    const cleanupPromise = setupEventListeners();

    return () => {
      profileUnlisten?.then((unlisten) => unlisten()).catch(console.error);
      cleanupPromise.then((cleanup) => cleanup());
    };
  }, [refreshProxy]);

  const { data: clashConfig, mutate: refreshClashConfig } = useSWR(
    "getClashConfig",
    getClashConfig,
    {
      refreshInterval: 120000, // 🚀 120秒刷新间隔，降低大量节点压力
      dedupingInterval: 30000, // 🚀 30秒内去重，避免重复请求
      revalidateOnFocus: false,
      revalidateOnReconnect: false, // 🚀 重连时不重新验证
      suspense: false,
      errorRetryCount: 2, // 🚀 减少重试次数
      errorRetryInterval: 10000, // 🚀 错误重试间隔10秒
      onError: (error) => {
        console.error("[ClashConfig] 获取配置失败:", error);
        // 🚀 大量节点时的超时是正常现象，不需要报警
        if (
          error?.message?.includes("timeout") ||
          error?.message?.includes("exhausted")
        ) {
          console.warn(
            "[ClashConfig] 配置获取超时，可能是节点数量过多(2000+)，这是正常现象",
          );
        }
      },
    },
  );

  // 提供者数据
  const { data: proxyProviders, mutate: refreshProxyProviders } = useSWR(
    "getProxyProviders",
    getProxyProviders,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 3000,
      suspense: false,
      errorRetryCount: 3,
    },
  );

  const { data: ruleProviders, mutate: refreshRuleProviders } = useSWR(
    "getRuleProviders",
    getRuleProviders,
    {
      revalidateOnFocus: false,
      suspense: false,
      errorRetryCount: 3,
    },
  );

  // 低频率更新数据
  const { data: rulesData, mutate: refreshRules } = useSWR(
    "getRules",
    getRules,
    {
      revalidateOnFocus: false,
      suspense: false,
      errorRetryCount: 3,
    },
  );

  const { data: sysproxy, mutate: refreshSysproxy } = useSWR(
    "getSystemProxy",
    getSystemProxy,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      suspense: false,
      errorRetryCount: 3,
    },
  );

  const { data: runningMode } = useSWR("getRunningMode", getRunningMode, {
    revalidateOnFocus: false,
    suspense: false,
    errorRetryCount: 3,
  });

  // 高频率更新数据 (2秒)
  const { data: uptimeData } = useSWR("appUptime", getAppUptime, {
    refreshInterval: 2000,
    revalidateOnFocus: false,
    suspense: false,
  });

  // 连接数据 - 使用IPC轮询更新并计算速度
  const {
    data: connectionsData = {
      connections: [],
      uploadTotal: 0,
      downloadTotal: 0,
    },
  } = useSWR(
    clashInfo && pageVisible ? "getConnections" : null,
    async () => {
      const data = await getConnections();
      const rawConnections: IConnectionsItem[] = data.connections || [];

      // 计算带速度的连接数据
      const connectionsWithSpeed = calculateConnectionSpeeds(rawConnections);

      // 更新上一次数据的引用
      const currentMap = new Map<string, ConnectionSpeedData>();
      const now = Date.now();
      rawConnections.forEach((conn) => {
        currentMap.set(conn.id, {
          id: conn.id,
          upload: conn.upload,
          download: conn.download,
          timestamp: now,
        });
      });
      previousConnectionsRef.current = currentMap;

      return {
        connections: connectionsWithSpeed,
        uploadTotal: data.uploadTotal || 0,
        downloadTotal: data.downloadTotal || 0,
      };
    },
    {
      refreshInterval: 2000, // ⚡ 降低轮询频率到2秒，减少IPC压力
      dedupingInterval: 1000, // ⚡ 1秒内去重，避免重复请求
      revalidateOnFocus: false, // ⚡ 窗口聚焦时不重新验证
      shouldRetryOnError: false, // ⚡ 错误时不重试，快速失败
      errorRetryInterval: 5000, // ⚡ 错误重试间隔5秒
      errorRetryCount: 2, // ⚡ 最多重试2次
      fallbackData: { connections: [], uploadTotal: 0, downloadTotal: 0 },
      keepPreviousData: true,
      onError: (error) => {
        console.error("[Connections] IPC 获取数据错误:", error);
      },
    },
  );

  // 流量数据 - 使用IPC轮询更新
  const { data: trafficData = { up: 0, down: 0 } } = useSWR(
    clashInfo && pageVisible ? "getTrafficData" : null,
    getTrafficData,
    {
      refreshInterval: 1000, // 1秒刷新一次
      fallbackData: { up: 0, down: 0 },
      keepPreviousData: true,
      onSuccess: () => {
        // console.log("[Traffic][AppDataProvider] IPC 获取到流量数据:", data);
      },
      onError: (error) => {
        console.error("[Traffic][AppDataProvider] IPC 获取数据错误:", error);
      },
    },
  );

  // 内存数据 - 使用IPC轮询更新
  const { data: memoryData = { inuse: 0 } } = useSWR(
    clashInfo && pageVisible ? "getMemoryData" : null,
    getMemoryData,
    {
      refreshInterval: 2000, // 2秒刷新一次
      fallbackData: { inuse: 0 },
      keepPreviousData: true,
      onError: (error) => {
        console.error("[Memory] IPC 获取数据错误:", error);
      },
    },
  );

  // 提供统一的刷新方法
  const refreshAll = async () => {
    await Promise.all([
      refreshProxy(),
      refreshClashConfig(),
      refreshRules(),
      refreshSysproxy(),
      refreshProxyProviders(),
      refreshRuleProviders(),
    ]);
  };

  // 聚合所有数据
  const value = useMemo(() => {
    // 计算系统代理地址
    const calculateSystemProxyAddress = () => {
      if (!verge || !clashConfig) return "-";

      const isPacMode = verge.proxy_auto_config ?? false;

      if (isPacMode) {
        // PAC模式：显示我们期望设置的代理地址
        const proxyHost = verge.proxy_host || "127.0.0.1";
        const proxyPort =
          verge.verge_mixed_port || clashConfig["mixed-port"] || 7897;
        return `${proxyHost}:${proxyPort}`;
      } else {
        // HTTP代理模式：优先使用系统地址，但如果格式不正确则使用期望地址
        const systemServer = sysproxy?.server;
        if (
          systemServer &&
          systemServer !== "-" &&
          !systemServer.startsWith(":")
        ) {
          return systemServer;
        } else {
          // 系统地址无效，返回期望的代理地址
          const proxyHost = verge.proxy_host || "127.0.0.1";
          const proxyPort =
            verge.verge_mixed_port || clashConfig["mixed-port"] || 7897;
          return `${proxyHost}:${proxyPort}`;
        }
      }
    };

    return {
      // 数据
      proxies: proxiesData,
      clashConfig,
      rules: rulesData || [],
      sysproxy,
      runningMode,
      uptime: uptimeData || 0,

      // 提供者数据
      proxyProviders: proxyProviders || {},
      ruleProviders: ruleProviders || {},

      // 连接数据
      connections: {
        data: connectionsData.connections || [],
        count: connectionsData.connections?.length || 0,
        uploadTotal: connectionsData.uploadTotal || 0,
        downloadTotal: connectionsData.downloadTotal || 0,
      },

      // 实时流量数据
      traffic: trafficData,
      memory: memoryData,

      systemProxyAddress: calculateSystemProxyAddress(),

      // 刷新方法
      refreshProxy,
      refreshClashConfig,
      refreshRules,
      refreshSysproxy,
      refreshProxyProviders,
      refreshRuleProviders,
      refreshAll,
    };
  }, [
    proxiesData,
    clashConfig,
    rulesData,
    sysproxy,
    runningMode,
    uptimeData,
    connectionsData,
    trafficData,
    memoryData,
    proxyProviders,
    ruleProviders,
    verge,
    refreshProxy,
    refreshClashConfig,
    refreshRules,
    refreshSysproxy,
    refreshProxyProviders,
    refreshRuleProviders,
  ]);

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
};

// 自定义Hook访问全局数据
export const useAppData = () => {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error("useAppData必须在AppDataProvider内使用");
  }

  return context;
};
