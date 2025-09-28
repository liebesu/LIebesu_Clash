import useSWR from "swr";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getVergeConfig, patchVergeConfig } from "@/services/cmds";
import { useSystemState } from "@/hooks/use-system-state";
import { showNotice } from "@/services/noticeService";

export const useVerge = () => {
  const { t } = useTranslation();
  const { isAdminMode, isServiceMode } = useSystemState();

  const { data: verge, mutate: mutateVerge } = useSWR(
    "getVergeConfig",
    async () => {
      const config = await getVergeConfig();
      return config;
    },
  );

  const patchVerge = async (value: Partial<IVergeConfig>) => {
    await patchVergeConfig(value);
    mutateVerge();
  };

  const isTunAvailable = isServiceMode || isAdminMode;
  const { enable_tun_mode } = verge ?? {};

  // 当服务不可用且TUN模式开启时自动关闭TUN
  useEffect(() => {
    if (enable_tun_mode && !isTunAvailable && verge) {
      console.log("[useVerge] 检测到服务不可用，自动关闭TUN模式");

      // 添加延迟，确保核心配置已准备好
      const timer = setTimeout(() => {
        patchVergeConfig({ enable_tun_mode: false })
          .then(() => {
            mutateVerge();
            showNotice(
              "info",
              t("TUN Mode automatically disabled due to service unavailable"),
            );
          })
          .catch((err) => {
            // 静默处理错误，避免用户看到噪音错误
            console.debug("[useVerge] 自动关闭TUN模式失败（核心可能未准备好）:", err);
          });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isTunAvailable, enable_tun_mode, verge, mutateVerge, t]);

  return {
    verge,
    mutateVerge,
    patchVerge,
  };
};
