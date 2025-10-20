import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  LinearProgress,
  Alert,
  AlertTitle,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
} from "@mui/material";
import {
  Update as UpdateIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  Analytics as AnalyticsIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { showNotice } from "../../services/noticeService";
import {
  getSubscriptionCleanupPreview,
  getOverQuotaCleanupPreview,
  updateAllSubscriptions,
  cleanupExpiredSubscriptions,
  cleanupOverQuotaSubscriptions,
  getSubscriptionManagementStats,
  setAutoCleanupRules as saveAutoCleanupRules,
  getAutoCleanupRules,
  type SubscriptionCleanupOptions,
  type CleanupPreview,
  type BatchUpdateResult,
  type CleanupResult,
  type SubscriptionInfo,
} from "../../services/cmds";

interface SubscriptionBatchManagerDialogProps {
  open: boolean;
  onClose: () => void;
  onProfilesChanged?: () => void | Promise<void>;
}

export const SubscriptionBatchManagerDialog: React.FC<
  SubscriptionBatchManagerDialogProps
> = ({ open, onClose, onProfilesChanged }) => {
  const { t } = useTranslation();

  // State for different tabs/sections
  const [currentTab, setCurrentTab] = useState<
    "update" | "cleanup" | "stats" | "settings"
  >("update");

  // Batch update states
  const [updateInProgress, setUpdateInProgress] = useState(false);
  const [updateResult, setUpdateResult] = useState<BatchUpdateResult | null>(
    null,
  );

  // Cleanup states
  const [cleanupOptions, setCleanupOptions] =
    useState<SubscriptionCleanupOptions>({
      days_threshold: 3,
      preview_only: true,
      exclude_favorites: true,
      exclude_groups: [],
    });
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(
    null,
  );
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(
    null,
  );
  const [cleanupInProgress, setCleanupInProgress] = useState(false);
  const [cleanupTabValue, setCleanupTabValue] = useState(0);

  // Stats states
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Auto cleanup states
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(false);
  const [autoCleanupRules, setAutoCleanupRules] = useState<any>(null);

  // Load initial data
  useEffect(() => {
    if (open) {
      loadStats();
      loadAutoCleanupRules();
    }
  }, [open]);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const data = await getSubscriptionManagementStats();
      setStats(data);
    } catch (error) {
      console.error("获取统计信息失败:", error);
      showNotice("error", "获取统计信息失败: " + error);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadAutoCleanupRules = async () => {
    try {
      const rules = await getAutoCleanupRules();
      setAutoCleanupRules(rules);
      setAutoCleanupEnabled(rules.enabled);
    } catch (error) {
      console.error("获取自动清理规则失败:", error);
    }
  };

  const handleUpdateAll = async () => {
    setUpdateInProgress(true);
    setUpdateResult(null);

    try {
      const result = await updateAllSubscriptions();
      setUpdateResult(result);
      showNotice(
        "success",
        `更新完成: ${result.successful_updates}个成功, ${result.failed_updates}个失败`,
      );
      loadStats(); // 重新加载统计信息
    } catch (error) {
      console.error("批量更新失败:", error);
      showNotice("error", "批量更新失败: " + error);
    } finally {
      setUpdateInProgress(false);
    }
  };

  const handlePreviewCleanup = async () => {
    try {
      const preview =
        cleanupTabValue === 0
          ? await getOverQuotaCleanupPreview(cleanupOptions)
          : await getSubscriptionCleanupPreview(cleanupOptions);
      setCleanupPreview(preview);
    } catch (error) {
      console.error("生成清理预览失败:", error);
      showNotice("error", "生成清理预览失败: " + error);
    }
  };

  const handleExecuteCleanup = async () => {
    if (!cleanupPreview) return;

    setCleanupInProgress(true);

    try {
      const executeOptions = { ...cleanupOptions, preview_only: false };
      const result =
        cleanupTabValue === 0
          ? await cleanupOverQuotaSubscriptions(executeOptions)
          : await cleanupExpiredSubscriptions(executeOptions);
      setCleanupResult(result);
      setCleanupPreview(null);
      const cleanupType = cleanupTabValue === 0 ? "超额" : "过期";
      showNotice(
        "success",
        `清理完成: 删除了 ${result.deleted_count} 个${cleanupType}订阅`,
      );

      // 重新加载统计信息
      await loadStats();

      // 通知父组件刷新订阅列表
      if (onProfilesChanged) {
        await onProfilesChanged();
      }
    } catch (error) {
      console.error("执行清理失败:", error);
      showNotice("error", "执行清理失败: " + error);
    } finally {
      setCleanupInProgress(false);
    }
  };

  const handleSaveAutoCleanupRules = async () => {
    try {
      await saveAutoCleanupRules(autoCleanupEnabled, cleanupOptions);
      showNotice("success", "自动清理规则保存成功");
      loadAutoCleanupRules();
    } catch (error) {
      console.error("保存自动清理规则失败:", error);
      showNotice("error", "保存自动清理规则失败: " + error);
    }
  };

  const renderUpdateTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        批量更新所有订阅
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        <AlertTitle>说明</AlertTitle>
        此操作将尝试更新所有远程订阅链接，获取最新的节点信息。
      </Alert>

      {stats && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              当前订阅状态
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Box textAlign="center">
                  <Typography variant="h4" color="primary">
                    {stats.total_subscriptions}
                  </Typography>
                  <Typography variant="body2">总订阅数</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Box textAlign="center">
                  <Typography variant="h4" color="success.main">
                    {stats.remote_subscriptions}
                  </Typography>
                  <Typography variant="body2">远程订阅</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Box textAlign="center">
                  <Typography variant="h4" color="warning.main">
                    {stats.outdated_1d}
                  </Typography>
                  <Typography variant="body2">1天未更新</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Box textAlign="center">
                  <Typography variant="h4" color="error.main">
                    {stats.outdated_3d}
                  </Typography>
                  <Typography variant="body2">3天未更新</Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      <Box display="flex" gap={2} mb={2}>
        <Button
          variant="contained"
          startIcon={<UpdateIcon />}
          onClick={handleUpdateAll}
          disabled={updateInProgress}
          size="large"
        >
          {updateInProgress ? "更新中..." : "开始批量更新"}
        </Button>

        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadStats}
          disabled={statsLoading}
        >
          刷新状态
        </Button>
      </Box>

      {updateInProgress && (
        <Box mb={2}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" mt={1}>
            正在更新订阅，请稍候...
          </Typography>
        </Box>
      )}

      {updateResult && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              更新结果
            </Typography>

            <Grid container spacing={2} mb={2}>
              <Grid size={{ xs: 4 }}>
                <Box textAlign="center">
                  <Typography variant="h5" color="success.main">
                    {updateResult.successful_updates}
                  </Typography>
                  <Typography variant="body2">成功</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <Box textAlign="center">
                  <Typography variant="h5" color="error.main">
                    {updateResult.failed_updates}
                  </Typography>
                  <Typography variant="body2">失败</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <Box textAlign="center">
                  <Typography variant="h5" color="primary">
                    {updateResult.total_subscriptions}
                  </Typography>
                  <Typography variant="body2">总数</Typography>
                </Box>
              </Grid>
            </Grid>

            {updateResult.failed_subscriptions.length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    查看失败详情 ({updateResult.failed_subscriptions.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List>
                    {updateResult.failed_subscriptions.map((name, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <ErrorIcon color="error" />
                        </ListItemIcon>
                        <ListItemText
                          primary={name}
                          secondary={
                            updateResult.error_messages[name] || "未知错误"
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );

  const renderCleanupTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        清理订阅
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        <AlertTitle>清理功能</AlertTitle>
        提供两种清理方式：清理超额订阅和清理过期订阅，帮助您管理订阅列表。
      </Alert>

      <Tabs
        value={cleanupTabValue}
        onChange={(_, newValue) => setCleanupTabValue(newValue)}
        sx={{ mb: 2 }}
      >
        <Tab label="清理超额订阅" />
        <Tab label="清理过期订阅" />
      </Tabs>

      {cleanupTabValue === 0 && renderOverQuotaCleanup()}
      {cleanupTabValue === 1 && renderExpiredCleanup()}
    </Box>
  );

  const renderOverQuotaCleanup = () => (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        清理超额订阅
      </Typography>

      <Alert severity="warning" sx={{ mb: 2 }}>
        <AlertTitle>注意</AlertTitle>
        将清理已超出流量额度的订阅，删除操作不可恢复，请谨慎操作。
      </Alert>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            超额订阅统计
          </Typography>
          <Typography variant="body2" color="text.secondary">
            总订阅数: {cleanupPreview?.total_subscriptions || 0}
          </Typography>
          {cleanupPreview?.expired_subscriptions &&
            cleanupPreview.expired_subscriptions.length > 0 && (
              <Typography variant="body2" color="error">
                超额订阅数: {cleanupPreview.expired_subscriptions.length}
              </Typography>
            )}
        </CardContent>
      </Card>

      {cleanupPreview?.expired_subscriptions &&
        cleanupPreview.expired_subscriptions.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                将删除的超额订阅
              </Typography>
              <List dense>
                {cleanupPreview.expired_subscriptions.map((sub, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <WarningIcon color="error" />
                    </ListItemIcon>
                    <ListItemText
                      primary={sub.name}
                      secondary={`UID: ${sub.uid} | 最后更新: ${sub.last_updated ? new Date(sub.last_updated).toLocaleString() : "未知"}`}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        )}

      <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handlePreviewCleanup}
          disabled={cleanupInProgress}
        >
          预览清理
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={handleExecuteCleanup}
          disabled={
            cleanupInProgress || !cleanupPreview?.expired_subscriptions?.length
          }
        >
          执行清理
        </Button>
      </Box>
    </Box>
  );

  const renderExpiredCleanup = () => (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        清理过期订阅
      </Typography>

      <Alert severity="warning" sx={{ mb: 2 }}>
        <AlertTitle>注意</AlertTitle>
        删除操作不可恢复，请谨慎操作。建议先预览再执行删除。
      </Alert>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            清理选项
          </Typography>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>删除时间窗口</InputLabel>
                <Select
                  value={cleanupOptions.days_threshold}
                  label="删除时间窗口"
                  onChange={(e) =>
                    setCleanupOptions((prev) => ({
                      ...prev,
                      days_threshold: e.target.value as number,
                    }))
                  }
                >
                  <MenuItem value={1}>1天未更新</MenuItem>
                  <MenuItem value={3}>3天未更新</MenuItem>
                  <MenuItem value={7}>7天未更新</MenuItem>
                  <MenuItem value={14}>14天未更新</MenuItem>
                  <MenuItem value={30}>30天未更新</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={cleanupOptions.exclude_favorites}
                    onChange={(e) =>
                      setCleanupOptions((prev) => ({
                        ...prev,
                        exclude_favorites: e.target.checked,
                      }))
                    }
                  />
                }
                label="排除收藏订阅"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box display="flex" gap={2} mb={2}>
        <Button
          variant="outlined"
          startIcon={<InfoIcon />}
          onClick={handlePreviewCleanup}
        >
          生成预览
        </Button>

        {cleanupPreview && (
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={handleExecuteCleanup}
            disabled={cleanupInProgress || cleanupPreview.will_be_deleted === 0}
          >
            {cleanupInProgress
              ? "删除中..."
              : `删除 ${cleanupPreview.will_be_deleted} 个订阅`}
          </Button>
        )}
      </Box>

      {cleanupInProgress && (
        <Box mb={2}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" mt={1}>
            正在删除过期订阅，请稍候...
          </Typography>
        </Box>
      )}

      {cleanupPreview && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              清理预览
            </Typography>

            <Grid container spacing={2} mb={2}>
              <Grid size={{ xs: 4 }}>
                <Box textAlign="center">
                  <Typography variant="h5" color="error.main">
                    {cleanupPreview.will_be_deleted}
                  </Typography>
                  <Typography variant="body2">将被删除</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <Box textAlign="center">
                  <Typography variant="h5" color="success.main">
                    {cleanupPreview.will_be_kept}
                  </Typography>
                  <Typography variant="body2">将被保留</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <Box textAlign="center">
                  <Typography variant="h5" color="primary">
                    {cleanupPreview.total_subscriptions}
                  </Typography>
                  <Typography variant="body2">总数</Typography>
                </Box>
              </Grid>
            </Grid>

            {cleanupPreview.expired_subscriptions.length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    查看待删除订阅 (
                    {cleanupPreview.expired_subscriptions.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense>
                    {cleanupPreview.expired_subscriptions.map((sub, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <WarningIcon color="error" />
                        </ListItemIcon>
                        <ListItemText
                          primary={sub.name}
                          secondary={`UID: ${sub.uid} | 最后更新: ${sub.last_updated ? new Date(sub.last_updated).toLocaleString() : "未知"}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}

      {cleanupResult && (
        <Alert severity="success">
          <AlertTitle>清理完成</AlertTitle>
          成功删除了 {cleanupResult.deleted_count} 个过期订阅。
        </Alert>
      )}
    </Box>
  );

  const renderStatsTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        订阅管理统计
      </Typography>

      <Box display="flex" justifyContent="flex-end" mb={2}>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadStats}
          disabled={statsLoading}
        >
          刷新数据
        </Button>
      </Box>

      {statsLoading && <LinearProgress sx={{ mb: 2 }} />}

      {stats && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  订阅概览
                </Typography>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography>总订阅数:</Typography>
                  <Typography fontWeight="bold">
                    {stats.total_subscriptions}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography>远程订阅:</Typography>
                  <Typography color="success.main">
                    {stats.remote_subscriptions}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography>本地订阅:</Typography>
                  <Typography color="info.main">
                    {stats.local_subscriptions}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography>从未更新:</Typography>
                  <Typography color="error.main">
                    {stats.never_updated}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  更新状态
                </Typography>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography>最新状态:</Typography>
                  <Typography color="success.main">
                    {stats.up_to_date}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography>1天未更新:</Typography>
                  <Typography color="warning.main">
                    {stats.outdated_1d}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography>3天未更新:</Typography>
                  <Typography color="error.main">
                    {stats.outdated_3d}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography>7天未更新:</Typography>
                  <Typography color="error.main">
                    {stats.outdated_7d}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );

  const renderSettingsTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        自动管理设置
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        <AlertTitle>自动清理</AlertTitle>
        启用后将定期检查并清理过期订阅，减少手动维护工作。
      </Alert>

      <Card>
        <CardContent>
          <FormControlLabel
            control={
              <Switch
                checked={autoCleanupEnabled}
                onChange={(e) => setAutoCleanupEnabled(e.target.checked)}
              />
            }
            label="启用自动清理"
          />

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle1" gutterBottom>
            自动清理规则
          </Typography>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>自动删除时间窗口</InputLabel>
                <Select
                  value={cleanupOptions.days_threshold}
                  label="自动删除时间窗口"
                  onChange={(e) =>
                    setCleanupOptions((prev) => ({
                      ...prev,
                      days_threshold: e.target.value as number,
                    }))
                  }
                  disabled={!autoCleanupEnabled}
                >
                  <MenuItem value={3}>3天未更新</MenuItem>
                  <MenuItem value={7}>7天未更新</MenuItem>
                  <MenuItem value={14}>14天未更新</MenuItem>
                  <MenuItem value={30}>30天未更新</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={cleanupOptions.exclude_favorites}
                    onChange={(e) =>
                      setCleanupOptions((prev) => ({
                        ...prev,
                        exclude_favorites: e.target.checked,
                      }))
                    }
                    disabled={!autoCleanupEnabled}
                  />
                }
                label="排除收藏订阅"
              />
            </Grid>
          </Grid>

          <Box mt={2}>
            <Button
              variant="contained"
              startIcon={<SettingsIcon />}
              onClick={handleSaveAutoCleanupRules}
            >
              保存设置
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>订阅批量管理</DialogTitle>

      <DialogContent>
        <Box display="flex" borderBottom={1} borderColor="divider" mb={2}>
          <Button
            onClick={() => setCurrentTab("update")}
            variant={currentTab === "update" ? "contained" : "text"}
            startIcon={<UpdateIcon />}
            sx={{ mr: 1 }}
          >
            批量更新
          </Button>
          <Button
            onClick={() => setCurrentTab("cleanup")}
            variant={currentTab === "cleanup" ? "contained" : "text"}
            startIcon={<DeleteIcon />}
            sx={{ mr: 1 }}
          >
            清理订阅
          </Button>
          <Button
            onClick={() => setCurrentTab("stats")}
            variant={currentTab === "stats" ? "contained" : "text"}
            startIcon={<AnalyticsIcon />}
            sx={{ mr: 1 }}
          >
            统计信息
          </Button>
          <Button
            onClick={() => setCurrentTab("settings")}
            variant={currentTab === "settings" ? "contained" : "text"}
            startIcon={<ScheduleIcon />}
          >
            自动管理
          </Button>
        </Box>

        {currentTab === "update" && renderUpdateTab()}
        {currentTab === "cleanup" && renderCleanupTab()}
        {currentTab === "stats" && renderStatsTab()}
        {currentTab === "settings" && renderSettingsTab()}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
};
