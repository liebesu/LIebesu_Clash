import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  Alert,
  Chip,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slider,
  TextField,
} from "@mui/material";
import {
  Update,
  Download,
  Check,
  Error,
  History,
  Settings,
  Info,
  Refresh,
  Schedule,
  NotificationsActive,
  Security,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useAutoUpdate, UpdateInfo, UpdateConfig, UpdateHistoryItem } from "@/services/auto-update";
import { useUIStateContext } from "@/providers/ui-state-provider";
import { EnhancedLoading } from "@/components/base/enhanced-loading";
// 临时移除date-fns依赖，使用简单的时间格式化
// import { formatDistanceToNow } from "date-fns";
// import { zhCN } from "date-fns/locale";

export const AutoUpdateSettings: React.FC = () => {
  const { t } = useTranslation();
  const autoUpdate = useAutoUpdate();
  const uiState = useUIStateContext();

  // 状态管理
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateConfig, setUpdateConfig] = useState<UpdateConfig | null>(null);
  const [updateHistory, setUpdateHistory] = useState<UpdateHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // 加载初始数据
  useEffect(() => {
    loadInitialData();
    setupEventListeners();
  }, []);

  const loadInitialData = async () => {
    try {
      const [config, history] = await Promise.all([
        autoUpdate.getUpdateConfig(),
        autoUpdate.getUpdateHistory(),
      ]);
      setUpdateConfig(config);
      setUpdateHistory(history);
    } catch (error) {
      console.error("加载更新数据失败:", error);
    }
  };

  const setupEventListeners = () => {
    // 监听更新详情显示事件
    const handleShowUpdateDetails = (event: CustomEvent) => {
      setUpdateInfo(event.detail);
    };

    window.addEventListener("show-update-details", handleShowUpdateDetails as EventListener);

    return () => {
      window.removeEventListener("show-update-details", handleShowUpdateDetails as EventListener);
    };
  };

  // 检查更新
  const handleCheckUpdate = async () => {
    if (checking) return;

    setChecking(true);
    try {
      const info = await uiState.executeOperation(
        async () => await autoUpdate.checkForUpdates(),
        {
          loadingMessage: "正在检查更新...",
          successMessage: "更新检查完成",
          errorMessage: "检查更新失败",
        }
      );
      setUpdateInfo(info);
    } catch (error) {
      console.error("检查更新失败:", error);
    } finally {
      setChecking(false);
    }
  };

  // 下载并安装更新
  const handleDownloadUpdate = async () => {
    if (downloading) return;

    setDownloading(true);
    try {
      await uiState.executeOperation(
        async () => await autoUpdate.downloadAndInstallUpdate(),
        {
          loadingMessage: "正在下载并安装更新...",
          successMessage: "更新安装成功，应用即将重启",
          errorMessage: "更新安装失败",
          timeout: 300000, // 5分钟超时
        }
      );
    } catch (error) {
      console.error("下载更新失败:", error);
    } finally {
      setDownloading(false);
    }
  };

  // 更新配置
  const handleConfigChange = async (newConfig: Partial<UpdateConfig>) => {
    if (!updateConfig) return;

    const updatedConfig = { ...updateConfig, ...newConfig };
    try {
      await autoUpdate.setUpdateConfig(updatedConfig);
      setUpdateConfig(updatedConfig);
    } catch (error) {
      console.error("保存配置失败:", error);
    }
  };

  // 跳过版本
  const handleSkipVersion = async () => {
    if (!updateInfo?.latest_version) return;

    try {
      await autoUpdate.skipUpdateVersion(updateInfo.latest_version);
      setUpdateInfo({ ...updateInfo, available: false });
    } catch (error) {
      console.error("跳过版本失败:", error);
    }
  };

  // 格式化时间
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return "从未";
    const now = Date.now();
    const time = timestamp * 1000;
    const diff = now - time;
    
    if (diff < 60 * 1000) return "刚刚";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`;
  };

  // 获取状态图标
  const getStatusIcon = (available: boolean, autoEnabled: boolean) => {
    if (available) return <Download color="primary" />;
    if (autoEnabled) return <Update color="success" />;
    return <Check color="disabled" />;
  };

  if (!updateConfig) {
    return <EnhancedLoading type="skeleton" skeletonLines={5} />;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Update />
        {t("自动更新")}
      </Typography>

      {/* 当前状态卡片 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {getStatusIcon(updateInfo?.available || false, updateConfig.auto_check_enabled)}
              <Box>
                <Typography variant="h6">
                  当前版本: v{updateInfo?.current_version || "未知"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  上次检查: {formatTime(updateInfo?.last_check_time)}
                </Typography>
              </Box>
            </Box>
            <Button
              variant="outlined"
              onClick={handleCheckUpdate}
              disabled={checking}
              startIcon={checking ? <EnhancedLoading type="inline" size="small" /> : <Refresh />}
            >
              {checking ? "检查中..." : "检查更新"}
            </Button>
          </Box>

          {/* 更新可用提示 */}
          {updateInfo?.available && updateInfo.latest_version && (
            <Alert
              severity="info"
              sx={{ mb: 2 }}
              action={
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    color="inherit"
                    size="small"
                    onClick={handleDownloadUpdate}
                    disabled={downloading}
                    startIcon={downloading ? <EnhancedLoading type="inline" size="small" /> : <Download />}
                  >
                    {downloading ? "下载中..." : "立即更新"}
                  </Button>
                  <Button color="inherit" size="small" onClick={handleSkipVersion}>
                    跳过
                  </Button>
                </Box>
              }
            >
              <Typography variant="body2">
                新版本 v{updateInfo.latest_version} 现已可用！
              </Typography>
              {updateInfo.release_notes && (
                <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
                  更新说明: {updateInfo.release_notes.substring(0, 200)}...
                </Typography>
              )}
            </Alert>
          )}

          {/* 无更新提示 */}
          {updateInfo && !updateInfo.available && (
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="body2">
                您正在使用最新版本！
              </Typography>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 自动更新设置 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Settings />
            更新设置
          </Typography>

          <List>
            <ListItem>
              <ListItemText
                primary="自动检查更新"
                secondary="定期自动检查是否有新版本可用"
              />
              <ListItemSecondaryAction>
                <FormControlLabel
                  control={
                    <Switch
                      checked={updateConfig.auto_check_enabled}
                      onChange={(e) => handleConfigChange({ auto_check_enabled: e.target.checked })}
                    />
                  }
                  label=""
                />
              </ListItemSecondaryAction>
            </ListItem>

            <ListItem>
              <ListItemText
                primary="自动安装更新"
                secondary="自动下载并安装更新（需要重启应用）"
              />
              <ListItemSecondaryAction>
                <FormControlLabel
                  control={
                    <Switch
                      checked={updateConfig.auto_install_enabled}
                      onChange={(e) => handleConfigChange({ auto_install_enabled: e.target.checked })}
                      disabled={!updateConfig.auto_check_enabled}
                    />
                  }
                  label=""
                />
              </ListItemSecondaryAction>
            </ListItem>

            <ListItem>
              <ListItemText
                primary="更新通知"
                secondary="有新版本时显示桌面通知"
              />
              <ListItemSecondaryAction>
                <FormControlLabel
                  control={
                    <Switch
                      checked={updateConfig.notification_enabled}
                      onChange={(e) => handleConfigChange({ notification_enabled: e.target.checked })}
                    />
                  }
                  label=""
                />
              </ListItemSecondaryAction>
            </ListItem>

            <ListItem>
              <ListItemText
                primary="Beta 版本"
                secondary="接收 Beta 测试版本更新"
              />
              <ListItemSecondaryAction>
                <FormControlLabel
                  control={
                    <Switch
                      checked={updateConfig.beta_channel_enabled}
                      onChange={(e) => handleConfigChange({ beta_channel_enabled: e.target.checked })}
                    />
                  }
                  label=""
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>

          {/* 检查频率设置 */}
          {updateConfig.auto_check_enabled && (
            <Box sx={{ mt: 2, px: 2 }}>
              <Typography variant="body2" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Schedule fontSize="small" />
                检查频率: 每 {updateConfig.check_interval_hours} 小时
              </Typography>
              <Slider
                value={updateConfig.check_interval_hours}
                onChange={(_, value) => handleConfigChange({ check_interval_hours: value as number })}
                min={1}
                max={168} // 一周
                step={1}
                marks={[
                  { value: 1, label: "1h" },
                  { value: 6, label: "6h" },
                  { value: 24, label: "1d" },
                  { value: 168, label: "1w" },
                ]}
                valueLabelDisplay="auto"
                sx={{ mt: 1 }}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* 操作按钮 */}
      <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
        <Button
          variant="outlined"
          onClick={() => setShowHistory(true)}
          startIcon={<History />}
        >
          更新历史
        </Button>
        <Button
          variant="outlined"
          onClick={() => setShowAdvanced(true)}
          startIcon={<Security />}
        >
          高级设置
        </Button>
      </Box>

      {/* 更新历史对话框 */}
      <Dialog open={showHistory} onClose={() => setShowHistory(false)} maxWidth="md" fullWidth>
        <DialogTitle>更新历史</DialogTitle>
        <DialogContent>
          {updateHistory.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              暂无更新历史记录
            </Typography>
          ) : (
            <List>
              {updateHistory.map((item, index) => (
                <ListItem key={index} divider>
                  <ListItemText
                    primary={`v${item.version}`}
                    secondary={
                      <Box>
                        <Typography variant="body2">
                          {formatTime(item.timestamp)}
                        </Typography>
                        {item.notes && (
                          <Typography variant="caption" color="text.secondary">
                            {item.notes}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Chip
                      label={item.status}
                      size="small"
                      color={
                        item.status === "Installed" ? "success" :
                        item.status === "Failed" ? "error" :
                        item.status === "Skipped" ? "warning" : "default"
                      }
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHistory(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 高级设置对话框 */}
      <Dialog open={showAdvanced} onClose={() => setShowAdvanced(false)} maxWidth="sm" fullWidth>
        <DialogTitle>高级设置</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                高级设置仅供有经验的用户使用，错误的配置可能导致自动更新功能异常。
              </Typography>
            </Alert>

            {updateConfig.skip_version && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  跳过的版本:
                </Typography>
                <Chip
                  label={`v${updateConfig.skip_version}`}
                  onDelete={() => handleConfigChange({ skip_version: undefined })}
                  color="warning"
                />
              </Box>
            )}

            <Typography variant="body2" color="text.secondary">
              • 自动更新服务将在后台定期检查新版本
              • Beta 版本可能包含未经充分测试的功能
              • 自动安装需要应用重启才能生效
              • 可以随时在此页面手动检查和安装更新
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAdvanced(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AutoUpdateSettings;
