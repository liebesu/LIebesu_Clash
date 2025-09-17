import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tab,
  Tabs,
  Paper,
  LinearProgress,
  Alert,
  TextField,
  FormControlLabel,
  Checkbox,
  Slider,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  Switch,
  Tooltip,
} from "@mui/material";
import {
  Backup,
  Restore,
  CloudUpload,
  CloudDownload,
  Delete,
  GetApp,
  Publish,
  ExpandMore,
  CheckCircle,
  Error,
  Warning,
  Info,
  Lock,
  LockOpen,
  MoreVert,
  Sync,
  SyncDisabled,
  Schedule,
  FolderZip,
  Storage,
  Security,
  Settings,
  Refresh,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import {
  createBackup,
  getAllBackups,
  getBackupDetails,
  restoreBackup,
  deleteBackup,
  validateBackup,
  exportBackup,
  importBackup,
  setWebDAVConfig,
  getWebDAVConfig,
  syncToWebDAV,
  syncFromWebDAV,
  getSyncStatus,
  cleanupOldBackups,
  BackupOptions,
  RestoreOptions,
  BackupInfo,
  BackupData,
  RestoreResult,
  WebDAVConfig,
  SyncStatus,
  BackupType,
} from "@/services/cmds";
import { showNotice } from "@/services/noticeService";

interface BackupRestoreDialogProps {
  open: boolean;
  onClose: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`backup-tabpanel-${index}`}
      aria-labelledby={`backup-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const BackupRestoreDialog: React.FC<BackupRestoreDialogProps> = ({
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  
  // 状态管理
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 备份数据
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null);
  const [backupDetails, setBackupDetails] = useState<BackupData | null>(null);
  
  // 创建备份状态
  const [createStep, setCreateStep] = useState(0);
  const [backupOptions, setBackupOptions] = useState<BackupOptions>({
    backup_type: "Full",
    include_profiles: true,
    include_settings: true,
    include_groups: true,
    include_traffic_stats: true,
    include_tasks: true,
    encrypt: false,
    password: "",
    compression_level: 6,
    backup_name: "",
    description: "",
  });
  
  // 恢复状态
  const [restoreOptions, setRestoreOptions] = useState<RestoreOptions>({
    backup_id: "",
    restore_profiles: true,
    restore_settings: true,
    restore_groups: true,
    restore_traffic_stats: true,
    restore_tasks: true,
    merge_mode: false,
    password: "",
    create_backup_before_restore: true,
  });
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  
  // WebDAV状态
  const [webdavConfig, setWebdavConfig] = useState<WebDAVConfig>({
    enabled: false,
    server_url: "",
    username: "",
    password: "",
    remote_path: "/clash-verge-backups",
    auto_sync: false,
    sync_interval_hours: 24,
    encrypt_before_upload: true,
    compression_enabled: true,
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    last_sync: undefined,
    last_upload: undefined,
    last_download: undefined,
    pending_uploads: 0,
    pending_downloads: 0,
    sync_errors: [],
    is_syncing: false,
  });
  
  // UI状态
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedBackupId, setSelectedBackupId] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [showWebdavPassword, setShowWebdavPassword] = useState(false);

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // 格式化日期
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // 获取备份类型标签颜色
  const getBackupTypeColor = (type: BackupType) => {
    switch (type) {
      case "Full":
        return "primary";
      case "Profiles":
        return "info";
      case "Settings":
        return "warning";
      case "Custom":
        return "secondary";
      default:
        return "default";
    }
  };

  // 获取备份类型文本
  const getBackupTypeText = (type: BackupType) => {
    switch (type) {
      case "Full":
        return "完整备份";
      case "Profiles":
        return "订阅备份";
      case "Settings":
        return "设置备份";
      case "Custom":
        return "自定义备份";
      default:
        return type;
    }
  };

  // 加载备份列表
  const loadBackups = async () => {
    setLoading(true);
    try {
      const data = await getAllBackups();
      setBackups(data);
    } catch (error) {
      console.error("加载备份列表失败:", error);
      showNotice("error", "加载备份列表失败");
    } finally {
      setLoading(false);
    }
  };

  // 加载WebDAV配置
  const loadWebDAVConfig = async () => {
    try {
      const config = await getWebDAVConfig();
      setWebdavConfig(config);
      
      const status = await getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error("加载WebDAV配置失败:", error);
    }
  };

  // 组件挂载时加载数据
  useEffect(() => {
    if (open) {
      loadBackups();
      loadWebDAVConfig();
      setCreateStep(0);
      setRestoreResult(null);
      setBackupOptions({
        ...backupOptions,
        backup_name: `Backup_${new Date().toISOString().split('T')[0]}`,
        description: "手动创建的备份",
      });
    }
  }, [open]);

  // 创建备份
  const handleCreateBackup = async () => {
    if (!backupOptions.backup_name.trim()) {
      showNotice("info", "请输入备份名称");
      return;
    }

    setLoading(true);
    try {
      const backupId = await createBackup(backupOptions);
      showNotice("success", "备份创建成功");
      setCreateStep(0);
      loadBackups();
    } catch (error) {
      console.error("创建备份失败:", error);
      showNotice("error", "创建备份失败: " + error);
    } finally {
      setLoading(false);
    }
  };

  // 恢复备份
  const handleRestoreBackup = async (backup: BackupInfo) => {
    if (backup.is_encrypted && !restoreOptions.password) {
      showNotice("info", "加密备份需要密码");
      return;
    }

    setLoading(true);
    try {
      const options = {
        ...restoreOptions,
        backup_id: backup.backup_id,
      };
      const result = await restoreBackup(options);
      setRestoreResult(result);
      
      if (result.success) {
        showNotice("success", "备份恢复成功");
        loadBackups();
      } else {
        showNotice("error", "备份恢复失败");
      }
    } catch (error) {
      console.error("恢复备份失败:", error);
      showNotice("恢复备份失败: " "error", error as string);
    } finally {
      setLoading(false);
    }
  };

  // 查看备份详情
  const handleViewDetails = async (backup: BackupInfo) => {
    setLoading(true);
    try {
      const details = await getBackupDetails(backup.backup_id);
      setBackupDetails(details);
      setSelectedBackup(backup);
    } catch (error) {
      console.error("获取备份详情失败:", error);
      showNotice("获取备份详情失败: " "error", error as string);
    } finally {
      setLoading(false);
    }
  };

  // 删除备份
  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm("确定要删除这个备份吗？此操作不可恢复。")) {
      return;
    }

    setLoading(true);
    try {
      await deleteBackup(backupId);
      showNotice("success", "备份删除成功");
      loadBackups();
      handleMenuClose();
    } catch (error) {
      console.error("删除备份失败:", error);
      showNotice("删除备份失败: " "error", error as string);
    } finally {
      setLoading(false);
    }
  };

  // 验证备份
  const handleValidateBackup = async (backupId: string) => {
    setLoading(true);
    try {
      const isValid = await validateBackup(backupId);
      if (isValid) {
        showNotice("success", "备份文件完整");
      } else {
        showNotice("error", "备份文件已损坏");
      }
      handleMenuClose();
    } catch (error) {
      console.error("验证备份失败:", error);
      showNotice("验证备份失败: " "error", error as string);
    } finally {
      setLoading(false);
    }
  };

  // 同步到WebDAV
  const handleSyncToWebDAV = async () => {
    setLoading(true);
    try {
      const status = await syncToWebDAV();
      setSyncStatus(status);
      showNotice("success", "同步到云端成功");
    } catch (error) {
      console.error("同步失败:", error);
      showNotice("同步失败: " "error", error as string);
    } finally {
      setLoading(false);
    }
  };

  // 从WebDAV同步
  const handleSyncFromWebDAV = async () => {
    setLoading(true);
    try {
      const status = await syncFromWebDAV();
      setSyncStatus(status);
      loadBackups();
      showNotice("success", "从云端同步成功");
    } catch (error) {
      console.error("同步失败:", error);
      showNotice("同步失败: " "error", error as string);
    } finally {
      setLoading(false);
    }
  };

  // 保存WebDAV配置
  const handleSaveWebDAVConfig = async () => {
    setLoading(true);
    try {
      await setWebDAVConfig(webdavConfig);
      showNotice("success", "WebDAV配置保存成功");
    } catch (error) {
      console.error("保存配置失败:", error);
      showNotice("保存配置失败: " "error", error as string);
    } finally {
      setLoading(false);
    }
  };

  // 清理旧备份
  const handleCleanupOldBackups = async () => {
    if (!confirm("确定要清理旧备份吗？将保留最近30天和最新10个备份。")) {
      return;
    }

    setLoading(true);
    try {
      const deletedCount = await cleanupOldBackups(30, 10);
      showNotice("success", `已清理 ${deletedCount} 个旧备份`);
      loadBackups();
    } catch (error) {
      console.error("清理失败:", error);
      showNotice("error", "清理失败: " + error);
    } finally {
      setLoading(false);
    }
  };

  // 菜单处理
  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, backupId: string) => {
    setMenuAnchor(event.currentTarget);
    setSelectedBackupId(backupId);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedBackupId("");
  };

  // 渲染备份列表
  const renderBackupList = () => (
    <Box>
      <Box display="flex" justifyContent="between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          备份列表 ({backups.length})
        </Typography>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Refresh />}
            onClick={loadBackups}
            disabled={loading}
          >
            刷新
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Delete />}
            onClick={handleCleanupOldBackups}
            disabled={loading}
          >
            清理旧备份
          </Button>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {backups.length > 0 ? (
        <Grid container spacing={2}>
          {backups.map((backup) => (
            <Grid xs={12} sm={6} md={4} key={backup.backup_id}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" justifyContent="between" alignItems="start" sx={{ mb: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6" noWrap title={backup.backup_name}>
                        {backup.backup_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(backup.created_at)}
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={1}>
                      {backup.is_encrypted && (
                        <Lock fontSize="small" color="warning" />
                      )}
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, backup.backup_id)}
                      >
                        <MoreVert />
                      </IconButton>
                    </Box>
                  </Box>

                  <Box display="flex" gap={1} sx={{ mb: 2 }}>
                    <Chip
                      label={getBackupTypeText(backup.backup_type)}
                      color={getBackupTypeColor(backup.backup_type) as any}
                      size="small"
                    />
                    {!backup.is_valid && (
                      <Chip
                        label="已损坏"
                        color="error"
                        size="small"
                        icon={<Error />}
                      />
                    )}
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {backup.description}
                  </Typography>

                  <Box display="flex" justifyContent="between" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      大小: {formatFileSize(backup.file_size)}
                    </Typography>
                    <Typography variant="body2">
                      版本: {backup.version}
                    </Typography>
                  </Box>

                  <Box display="flex" gap={1}>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<Restore />}
                      onClick={() => handleRestoreBackup(backup)}
                      disabled={!backup.is_valid || loading}
                      fullWidth
                    >
                      恢复
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Visibility />}
                      onClick={() => handleViewDetails(backup)}
                      disabled={loading}
                    >
                      详情
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Backup sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            暂无备份文件
          </Typography>
          <Button
            variant="contained"
            startIcon={<Backup />}
            onClick={() => setCurrentTab(1)}
          >
            创建第一个备份
          </Button>
        </Paper>
      )}

      {/* 操作菜单 */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          const backup = backups.find(b => b.backup_id === selectedBackupId);
          if (backup) handleViewDetails(backup);
        }}>
          <ListItemIcon>
            <Visibility fontSize="small" />
          </ListItemIcon>
          查看详情
        </MenuItem>
        <MenuItem onClick={() => handleValidateBackup(selectedBackupId)}>
          <ListItemIcon>
            <CheckCircle fontSize="small" />
          </ListItemIcon>
          验证备份
        </MenuItem>
        <MenuItem onClick={() => {/* TODO: 导出备份 */}}>
          <ListItemIcon>
            <GetApp fontSize="small" />
          </ListItemIcon>
          导出备份
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => handleDeleteBackup(selectedBackupId)}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          删除备份
        </MenuItem>
      </Menu>

      {/* 备份详情对话框 */}
      {backupDetails && (
        <Dialog
          open={Boolean(backupDetails)}
          onClose={() => setBackupDetails(null)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>备份详情</DialogTitle>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid xs={12} sm={6}>
                <Typography variant="subtitle2">基本信息</Typography>
                <Typography variant="body2">名称: {backupDetails.backup_name}</Typography>
                <Typography variant="body2">描述: {backupDetails.description}</Typography>
                <Typography variant="body2">创建时间: {formatDate(backupDetails.created_at)}</Typography>
                <Typography variant="body2">文件大小: {formatFileSize(backupDetails.file_size)}</Typography>
                <Typography variant="body2">是否加密: {backupDetails.is_encrypted ? "是" : "否"}</Typography>
              </Grid>
              <Grid xs={12} sm={6}>
                <Typography variant="subtitle2">包含内容</Typography>
                <Typography variant="body2">订阅数量: {backupDetails.profiles.length}</Typography>
                <Typography variant="body2">包含设置: {backupDetails.settings ? "是" : "否"}</Typography>
                <Typography variant="body2">包含分组: {backupDetails.groups ? "是" : "否"}</Typography>
                <Typography variant="body2">包含流量统计: {backupDetails.traffic_stats ? "是" : "否"}</Typography>
                <Typography variant="body2">包含任务: {backupDetails.tasks ? "是" : "否"}</Typography>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBackupDetails(null)}>关闭</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );

  // 渲染创建备份
  const renderCreateBackup = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        创建新备份
      </Typography>

      <Stepper activeStep={createStep} orientation="vertical">
        <Step>
          <StepLabel>选择备份内容</StepLabel>
          <StepContent>
            <Box sx={{ mb: 2 }}>
              <Grid container spacing={2}>
                <Grid xs={12}>
                  <TextField
                    fullWidth
                    label="备份名称"
                    value={backupOptions.backup_name}
                    onChange={(e) => setBackupOptions({
                      ...backupOptions,
                      backup_name: e.target.value,
                    })}
                    required
                  />
                </Grid>
                <Grid xs={12}>
                  <TextField
                    fullWidth
                    label="备份描述"
                    value={backupOptions.description}
                    onChange={(e) => setBackupOptions({
                      ...backupOptions,
                      description: e.target.value,
                    })}
                    multiline
                    rows={2}
                  />
                </Grid>
              </Grid>

              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                备份内容选择
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={backupOptions.include_profiles}
                    onChange={(e) => setBackupOptions({
                      ...backupOptions,
                      include_profiles: e.target.checked,
                    })}
                  />
                }
                label="订阅配置"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={backupOptions.include_settings}
                    onChange={(e) => setBackupOptions({
                      ...backupOptions,
                      include_settings: e.target.checked,
                    })}
                  />
                }
                label="应用设置"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={backupOptions.include_groups}
                    onChange={(e) => setBackupOptions({
                      ...backupOptions,
                      include_groups: e.target.checked,
                    })}
                  />
                }
                label="订阅分组"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={backupOptions.include_traffic_stats}
                    onChange={(e) => setBackupOptions({
                      ...backupOptions,
                      include_traffic_stats: e.target.checked,
                    })}
                  />
                }
                label="流量统计"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={backupOptions.include_tasks}
                    onChange={(e) => setBackupOptions({
                      ...backupOptions,
                      include_tasks: e.target.checked,
                    })}
                  />
                }
                label="定时任务"
              />
            </Box>

            <Box display="flex" gap={1}>
              <Button
                variant="contained"
                onClick={() => setCreateStep(1)}
                disabled={!backupOptions.backup_name.trim()}
              >
                下一步
              </Button>
            </Box>
          </StepContent>
        </Step>

        <Step>
          <StepLabel>高级选项</StepLabel>
          <StepContent>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                压缩级别 ({backupOptions.compression_level})
              </Typography>
              <Slider
                value={backupOptions.compression_level}
                onChange={(_, value) => setBackupOptions({
                  ...backupOptions,
                  compression_level: value as number,
                })}
                min={0}
                max={9}
                step={1}
                marks
                valueLabelDisplay="auto"
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={backupOptions.encrypt}
                    onChange={(e) => setBackupOptions({
                      ...backupOptions,
                      encrypt: e.target.checked,
                    })}
                  />
                }
                label="加密备份"
              />

              {backupOptions.encrypt && (
                <TextField
                  fullWidth
                  label="加密密码"
                  type={showPassword ? "text" : "password"}
                  value={backupOptions.password}
                  onChange={(e) => setBackupOptions({
                    ...backupOptions,
                    password: e.target.value,
                  })}
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    ),
                  }}
                  sx={{ mt: 1 }}
                />
              )}
            </Box>

            <Box display="flex" gap={1}>
              <Button onClick={() => setCreateStep(0)}>
                上一步
              </Button>
              <Button
                variant="contained"
                onClick={handleCreateBackup}
                disabled={loading || (backupOptions.encrypt && !backupOptions.password)}
              >
                {loading ? "创建中..." : "创建备份"}
              </Button>
            </Box>
          </StepContent>
        </Step>
      </Stepper>

      {createStep === 0 && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="info">
            选择要备份的内容，然后进入下一步配置高级选项。
          </Alert>
        </Box>
      )}
    </Box>
  );

  // 渲染云端同步
  const renderCloudSync = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        云端同步 (WebDAV)
      </Typography>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" justifyContent="between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">同步状态</Typography>
            <Switch
              checked={webdavConfig.enabled}
              onChange={(e) => setWebdavConfig({
                ...webdavConfig,
                enabled: e.target.checked,
              })}
            />
          </Box>

          {webdavConfig.enabled ? (
            <Box>
              <Box display="flex" gap={1} sx={{ mb: 2 }}>
                <Chip
                  label={syncStatus.is_syncing ? "同步中" : "已连接"}
                  color={syncStatus.is_syncing ? "warning" : "success"}
                  icon={syncStatus.is_syncing ? <Sync /> : <CheckCircle />}
                />
                {syncStatus.sync_errors.length > 0 && (
                  <Chip
                    label={`${syncStatus.sync_errors.length} 个错误`}
                    color="error"
                    icon={<Error />}
                  />
                )}
              </Box>

              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    最后同步: {syncStatus.last_sync ? formatDate(syncStatus.last_sync) : "从未"}
                  </Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    最后上传: {syncStatus.last_upload ? formatDate(syncStatus.last_upload) : "从未"}
                  </Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    待上传: {syncStatus.pending_uploads} 个文件
                  </Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    待下载: {syncStatus.pending_downloads} 个文件
                  </Typography>
                </Grid>
              </Grid>

              <Box display="flex" gap={1}>
                <Button
                  variant="contained"
                  startIcon={<CloudUpload />}
                  onClick={handleSyncToWebDAV}
                  disabled={loading || syncStatus.is_syncing}
                >
                  上传到云端
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<CloudDownload />}
                  onClick={handleSyncFromWebDAV}
                  disabled={loading || syncStatus.is_syncing}
                >
                  从云端下载
                </Button>
              </Box>
            </Box>
          ) : (
            <Alert severity="info">
              启用WebDAV同步以自动备份到云端存储
            </Alert>
          )}
        </CardContent>
      </Card>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6">WebDAV配置</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid xs={12}>
              <TextField
                fullWidth
                label="服务器地址"
                value={webdavConfig.server_url}
                onChange={(e) => setWebdavConfig({
                  ...webdavConfig,
                  server_url: e.target.value,
                })}
                placeholder="https://your-webdav-server.com"
              />
            </Grid>
            <Grid xs={6}>
              <TextField
                fullWidth
                label="用户名"
                value={webdavConfig.username}
                onChange={(e) => setWebdavConfig({
                  ...webdavConfig,
                  username: e.target.value,
                })}
              />
            </Grid>
            <Grid xs={6}>
              <TextField
                fullWidth
                label="密码"
                type={showWebdavPassword ? "text" : "password"}
                value={webdavConfig.password}
                onChange={(e) => setWebdavConfig({
                  ...webdavConfig,
                  password: e.target.value,
                })}
                InputProps={{
                  endAdornment: (
                    <IconButton
                      onClick={() => setShowWebdavPassword(!showWebdavPassword)}
                      edge="end"
                    >
                      {showWebdavPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  ),
                }}
              />
            </Grid>
            <Grid xs={12}>
              <TextField
                fullWidth
                label="远程路径"
                value={webdavConfig.remote_path}
                onChange={(e) => setWebdavConfig({
                  ...webdavConfig,
                  remote_path: e.target.value,
                })}
              />
            </Grid>
            <Grid xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={webdavConfig.auto_sync}
                    onChange={(e) => setWebdavConfig({
                      ...webdavConfig,
                      auto_sync: e.target.checked,
                    })}
                  />
                }
                label="自动同步"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={webdavConfig.encrypt_before_upload}
                    onChange={(e) => setWebdavConfig({
                      ...webdavConfig,
                      encrypt_before_upload: e.target.checked,
                    })}
                  />
                }
                label="上传前加密"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={webdavConfig.compression_enabled}
                    onChange={(e) => setWebdavConfig({
                      ...webdavConfig,
                      compression_enabled: e.target.checked,
                    })}
                  />
                }
                label="启用压缩"
              />
            </Grid>
          </Grid>

          <Box display="flex" gap={1} sx={{ mt: 2 }}>
            <Button
              variant="contained"
              onClick={handleSaveWebDAVConfig}
              disabled={loading}
            >
              保存配置
            </Button>
            <Button
              variant="outlined"
              onClick={() => {/* TODO: 测试连接 */}}
              disabled={loading}
            >
              测试连接
            </Button>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* 恢复结果显示 */}
      {restoreResult && (
        <Alert
          severity={restoreResult.success ? "success" : "error"}
          sx={{ mt: 2 }}
          onClose={() => setRestoreResult(null)}
        >
          <Typography variant="subtitle2">
            {restoreResult.success ? "恢复成功" : "恢复失败"}
          </Typography>
          <Typography variant="body2">
            恢复了 {restoreResult.restored_items} 项，失败 {restoreResult.failed_items} 项
          </Typography>
          {restoreResult.errors.length > 0 && (
            <Typography variant="body2" color="error">
              错误: {restoreResult.errors.join(", ")}
            </Typography>
          )}
        </Alert>
      )}
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={2}>
          <Storage />
          <Typography variant="h6">备份与恢复</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs 
            value={currentTab} 
            onChange={(_, newValue) => setCurrentTab(newValue)}
            aria-label="备份恢复标签"
          >
            <Tab label="备份列表" />
            <Tab label="创建备份" />
            <Tab label="云端同步" />
          </Tabs>
        </Box>

        <TabPanel value={currentTab} index={0}>
          {renderBackupList()}
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          {renderCreateBackup()}
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          {renderCloudSync()}
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          关闭
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BackupRestoreDialog;
