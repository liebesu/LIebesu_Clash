import React, { useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Tooltip,
  Typography,
  CircularProgress,
} from "@mui/material";
import {
  PlayArrow,
  Stop,
  Refresh,
  SettingsEthernet,
} from "@mui/icons-material";
import { startCore, stopCore, restartCore } from "@/services/cmds";
import { useClashInfo } from "@/hooks/use-clash";
import { showNotice } from "@/services/noticeService";

export const ServiceControl: React.FC = () => {
  const { clashInfo } = useClashInfo();
  const [loading, setLoading] = useState<string | null>(null);

  const isRunning = clashInfo?.server !== undefined && clashInfo?.server !== "";

  const handleStart = async () => {
    console.log("[ServiceControl] 🚀 用户点击启动服务按钮");
    try {
      setLoading("start");
      console.log("[ServiceControl] ⏳ 正在调用startCore API...");
      await startCore();
      console.log("[ServiceControl] ✅ startCore API调用成功");
      showNotice("success", "服务启动成功", 2000);
      console.log("[ServiceControl] 📢 已显示启动成功通知");
    } catch (error: any) {
      console.error("[ServiceControl] ❌ 启动服务失败:", error);
      console.error(
        "[ServiceControl] 错误详情:",
        error.stack || error.toString(),
      );
      showNotice("error", `启动失败: ${error.message}`, 3000);
      console.log("[ServiceControl] 📢 已显示启动失败通知");
    } finally {
      setLoading(null);
      console.log("[ServiceControl] 🏁 启动操作完成，已重置loading状态");
    }
  };

  const handleStop = async () => {
    console.log("[ServiceControl] 🛑 用户点击停止服务按钮");
    console.log("[ServiceControl] 当前服务状态:", {
      isRunning,
      server: clashInfo?.server,
    });

    if (!isRunning) {
      console.log("[ServiceControl] ⚠️ 服务已停止，无需重复操作");
      showNotice("info", "服务已停止", 2000);
      return;
    }

    try {
      setLoading("stop");
      console.log("[ServiceControl] ⏳ 正在调用stopCore API...");

      // 🔧 修复：增加超时控制，防止API调用卡死
      const stopPromise = stopCore();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("停止服务超时")), 10000),
      );

      await Promise.race([stopPromise, timeoutPromise]);
      console.log("[ServiceControl] ✅ stopCore API调用成功");

      // 🔧 修复：立即检查状态变化
      console.log("[ServiceControl] 🔍 检查停止后的服务状态...");
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 等待1秒让状态更新

      showNotice("success", "服务停止成功", 2000);
      console.log("[ServiceControl] 📢 已显示停止成功通知");

      // 🔧 修复：多重状态刷新机制
      console.log("[ServiceControl] 🔄 开始多重状态同步...");

      // 方法1：触发自定义事件
      window.dispatchEvent(new CustomEvent("refresh-clash-status"));
      console.log("[ServiceControl] 📡 已触发自定义刷新事件");

      // 方法2：延迟再次刷新
      setTimeout(() => {
        console.log("[ServiceControl] 🔄 延迟状态刷新...");
        window.dispatchEvent(new CustomEvent("refresh-clash-status"));
        console.log("[ServiceControl] 📡 已触发延迟刷新事件");
      }, 1000);

      // 方法3：强制页面刷新（最后手段）
      setTimeout(() => {
        console.log("[ServiceControl] 🔄 强制页面刷新...");
        window.location.reload();
      }, 3000);
    } catch (error: any) {
      console.error("[ServiceControl] ❌ 停止服务失败:", error);
      console.error(
        "[ServiceControl] 错误详情:",
        error.stack || error.toString(),
      );
      showNotice("error", `停止失败: ${error.message}`, 3000);
      console.log("[ServiceControl] 📢 已显示停止失败通知");
    } finally {
      setLoading(null);
      console.log("[ServiceControl] 🏁 停止操作完成，已重置loading状态");
    }
  };

  const handleRestart = async () => {
    console.log("[ServiceControl] 🔄 用户点击重启服务按钮");
    console.log("[ServiceControl] 当前服务状态:", {
      isRunning,
      server: clashInfo?.server,
    });
    try {
      setLoading("restart");
      console.log("[ServiceControl] ⏳ 正在调用restartCore API...");
      await restartCore();
      console.log("[ServiceControl] ✅ restartCore API调用成功");
      showNotice("success", "服务重启成功", 2000);
      console.log("[ServiceControl] 📢 已显示重启成功通知");
    } catch (error: any) {
      console.error("[ServiceControl] ❌ 重启服务失败:", error);
      console.error(
        "[ServiceControl] 错误详情:",
        error.stack || error.toString(),
      );
      showNotice("error", `重启失败: ${error.message}`, 3000);
      console.log("[ServiceControl] 📢 已显示重启失败通知");
    } finally {
      setLoading(null);
      console.log("[ServiceControl] 🏁 重启操作完成，已重置loading状态");
    }
  };

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        mb: 2,
      }}
    >
      {/* 状态显示 */}
      <Box display="flex" alignItems="center" sx={{ mb: 1.5 }}>
        <SettingsEthernet
          sx={{
            mr: 1,
            color: isRunning ? "success.main" : "error.main",
            fontSize: 16,
          }}
        />
        <Typography variant="caption" color="text.secondary">
          服务状态:
        </Typography>
        <Typography
          variant="caption"
          sx={{
            ml: 0.5,
            color: isRunning ? "success.main" : "error.main",
            fontWeight: "bold",
          }}
        >
          {isRunning ? "运行中" : "已停止"}
        </Typography>
      </Box>

      {/* 控制按钮 */}
      <ButtonGroup size="small" variant="contained" fullWidth sx={{ gap: 0.5 }}>
        <Tooltip title="启动服务">
          <span>
            <Button
              onClick={handleStart}
              disabled={isRunning || loading !== null}
              color="success"
              startIcon={
                loading === "start" ? (
                  <CircularProgress size={14} />
                ) : (
                  <PlayArrow />
                )
              }
              sx={{ flex: 1, minWidth: 0 }}
            >
              启动
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="停止服务">
          <span>
            <Button
              onClick={handleStop}
              disabled={!isRunning || loading !== null}
              color="error"
              startIcon={
                loading === "stop" ? <CircularProgress size={14} /> : <Stop />
              }
              sx={{ flex: 1, minWidth: 0 }}
            >
              停止
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="重启服务">
          <span>
            <Button
              onClick={handleRestart}
              disabled={loading !== null}
              color="primary"
              startIcon={
                loading === "restart" ? (
                  <CircularProgress size={14} />
                ) : (
                  <Refresh />
                )
              }
              sx={{ flex: 1, minWidth: 0 }}
            >
              重启
            </Button>
          </span>
        </Tooltip>
      </ButtonGroup>
    </Box>
  );
};
