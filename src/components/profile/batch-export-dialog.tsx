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
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  FormControlLabel,
  Checkbox,
  LinearProgress,
  Alert,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Paper,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from "@mui/material";
import {
  GetApp,
  ContentCopy,
  CheckCircle,
  Warning,
  ExpandMore,
  Visibility,
  VisibilityOff,
  FolderZip,
  Code,
  Settings,
  Group,
  Security,
  Public,
  Save,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import {
  getAllSubscriptionsForExport,
  batchExportSubscriptions,
  exportSubscriptionsToFile,
  previewExport,
  ExportOptions,
  ExportPreview,
  ExportableSubscription,
} from "@/services/cmds";
import { showNotice } from "@/services/noticeService";

interface BatchExportDialogProps {
  open: boolean;
  onClose: () => void;
}

const BatchExportDialog: React.FC<BatchExportDialogProps> = ({
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  
  // 数据状态
  const [subscriptions, setSubscriptions] = useState<ExportableSubscription[]>([]);
  const [selectedSubscriptions, setSelectedSubscriptions] = useState<Set<string>>(new Set());
  const [exportPreview, setExportPreview] = useState<ExportPreview | null>(null);
  const [exportResult, setExportResult] = useState<string>("");
  
  // 导出选项
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: "json",
    include_settings: false,
    include_groups: false,
    compress: false,
    encrypt: false,
    password: "",
  });
  
  // UI状态
  const [showPassword, setShowPassword] = useState(false);
  const [selectAll, setSelectAll] = useState(false);

  // 导出格式选项
  const formatOptions = [
    { value: "json", label: "JSON 格式", icon: <Code />, description: "标准JSON格式，易于解析" },
    { value: "yaml", label: "YAML 格式", icon: <Settings />, description: "YAML格式，可读性好" },
    { value: "txt", label: "文本格式", icon: <Public />, description: "纯文本链接列表" },
    { value: "clash", label: "Clash 配置", icon: <Security />, description: "完整Clash配置文件" },
  ];

  // 加载订阅列表
  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const data = await getAllSubscriptionsForExport();
      setSubscriptions(data);
    } catch (error) {
      console.error("加载订阅列表失败:", error);
      showNotice("error", "加载订阅列表失败");
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时加载数据
  useEffect(() => {
    if (open) {
      loadSubscriptions();
      setCurrentStep(0);
      setSelectedSubscriptions(new Set());
      setSelectAll(false);
      setExportPreview(null);
      setExportResult("");
      setExportOptions({
        format: "json",
        include_settings: false,
        include_groups: false,
        compress: false,
        encrypt: false,
        password: "",
      });
    }
  }, [open]);

  // 全选/取消全选
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedSubscriptions(new Set(subscriptions.filter(s => s.is_valid).map(s => s.uid)));
    } else {
      setSelectedSubscriptions(new Set());
    }
  };

  // 切换订阅选择
  const handleToggleSubscription = (uid: string) => {
    const newSelected = new Set(selectedSubscriptions);
    if (newSelected.has(uid)) {
      newSelected.delete(uid);
    } else {
      newSelected.add(uid);
    }
    setSelectedSubscriptions(newSelected);
    
    // 更新全选状态
    const validSubscriptions = subscriptions.filter(s => s.is_valid);
    setSelectAll(newSelected.size === validSubscriptions.length && validSubscriptions.length > 0);
  };

  // 生成导出预览
  const handleGeneratePreview = async () => {
    if (selectedSubscriptions.size === 0) {
      showNotice("info", "请选择要导出的订阅");
      return;
    }

    setLoading(true);
    try {
      const preview = await previewExport(Array.from(selectedSubscriptions), exportOptions);
      setExportPreview(preview);
      setCurrentStep(2);
    } catch (error) {
      console.error("生成预览失败:", error);
      showNotice("error", "生成预览失败: " + error);
    } finally {
      setLoading(false);
    }
  };

  // 执行导出
  const handleExport = async () => {
    if (!exportPreview) return;

    setLoading(true);
    try {
      const result = await batchExportSubscriptions(Array.from(selectedSubscriptions), exportOptions);
      setExportResult(result);
      setCurrentStep(3);
      showNotice("success", "导出成功");
    } catch (error) {
      console.error("导出失败:", error);
      showNotice("error", "导出失败: " + error);
    } finally {
      setLoading(false);
    }
  };

  // 保存到文件
  const handleSaveToFile = async () => {
    try {
      // TODO: 使用文件选择器选择保存路径
      const fileName = `subscriptions_export_${Date.now()}.${exportOptions.format}`;
      const filePath = `/tmp/${fileName}`; // 临时路径，实际应该使用文件选择器
      
      await exportSubscriptionsToFile(Array.from(selectedSubscriptions), filePath, exportOptions);
      showNotice("success", `已保存到: ${filePath}`);
    } catch (error) {
      console.error("保存文件失败:", error);
      showNotice("error", "保存文件失败: " + error);
    }
  };

  // 复制到剪贴板
  const handleCopyToClipboard = async () => {
    if (!exportResult) return;

    try {
      await navigator.clipboard.writeText(exportResult);
      showNotice("success", "已复制到剪贴板");
    } catch (error) {
      console.error("复制失败:", error);
      showNotice("error", "复制失败");
    }
  };

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
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  // 渲染订阅选择步骤
  const renderSubscriptionSelection = () => (
    <Box>
      <Box display="flex" justifyContent="between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          选择要导出的订阅
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              checked={selectAll}
              onChange={(e) => handleSelectAll(e.target.checked)}
            />
          }
          label={`全选 (${subscriptions.filter(s => s.is_valid).length} 个可用)`}
        />
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Card variant="outlined" sx={{ maxHeight: 400, overflow: "auto" }}>
        <List>
          {subscriptions.map((subscription) => (
            <ListItem
              key={subscription.uid}
              onClick={() => handleToggleSubscription(subscription.uid)}
            >
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="subtitle1">
                      {subscription.name}
                    </Typography>
                    <Chip
                      label={subscription.subscription_type}
                      size="small"
                      variant="outlined"
                    />
                    <Chip
                      label={`${subscription.node_count} 节点`}
                      size="small"
                      color="info"
                    />
                    {!subscription.is_valid && (
                      <Chip
                        label="无效"
                        size="small"
                        color="error"
                        icon={<Warning />}
                      />
                    )}
                  </Box>
                }
                secondary={
                  <Box>
                    {subscription.url && (
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {subscription.url}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      创建: {formatDate(subscription.created_at)}
                      {subscription.updated_at && ` | 更新: ${formatDate(subscription.updated_at)}`}
                    </Typography>
                  </Box>
                }
              />
              <ListItemSecondaryAction>
                <Checkbox
                  checked={selectedSubscriptions.has(subscription.uid)}
                  onChange={() => handleToggleSubscription(subscription.uid)}
                  disabled={!subscription.is_valid}
                />
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Card>

      <Box display="flex" justifyContent="between" alignItems="center" sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          已选择 {selectedSubscriptions.size} 个订阅
        </Typography>
        <Button
          variant="contained"
          onClick={() => setCurrentStep(1)}
          disabled={selectedSubscriptions.size === 0}
        >
          下一步
        </Button>
      </Box>
    </Box>
  );

  // 渲染导出选项步骤
  const renderExportOptions = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        配置导出选项
      </Typography>

      <Grid container spacing={3}>
        {/* 导出格式 */}
        <Grid size={{ xs: 12 }}>
          <Typography variant="subtitle2" gutterBottom>
            导出格式
          </Typography>
          <Grid container spacing={2}>
            {formatOptions.map((option) => (
              <Grid size={{ xs: 12, sm: 6} key={option.value}>
                <Card
                  variant={exportOptions.format === option.value ? "elevation" : "outlined"}
                  sx={{
                    cursor: "pointer",
                    border: exportOptions.format === option.value ? 2 : 1,
                    borderColor: exportOptions.format === option.value ? "primary.main" : "divider",
                  }}
                  onClick={() => setExportOptions({ ...exportOptions, format: option.value })}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} sx={{ mb: 1 }}>
                      {option.icon}
                      <Typography variant="h6">{option.label}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {option.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>

        {/* 包含选项 */}
        <Grid size={{ xs: 12 }}>
          <Typography variant="subtitle2" gutterBottom>
            包含内容
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={exportOptions.include_settings}
                onChange={(e) => setExportOptions({
                  ...exportOptions,
                  include_settings: e.target.checked,
                })}
              />
            }
            label="包含应用设置"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={exportOptions.include_groups}
                onChange={(e) => setExportOptions({
                  ...exportOptions,
                  include_groups: e.target.checked,
                })}
              />
            }
            label="包含分组信息"
          />
        </Grid>

        {/* 高级选项 */}
        <Grid size={{ xs: 12 }}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="subtitle2">高级选项</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={exportOptions.compress}
                        onChange={(e) => setExportOptions({
                          ...exportOptions,
                          compress: e.target.checked,
                        })}
                      />
                    }
                    label="压缩导出文件"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={exportOptions.encrypt}
                        onChange={(e) => setExportOptions({
                          ...exportOptions,
                          encrypt: e.target.checked,
                        })}
                      />
                    }
                    label="加密导出文件"
                  />
                </Grid>
                {exportOptions.encrypt && (
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="加密密码"
                      type={showPassword ? "text" : "password"}
                      value={exportOptions.password}
                      onChange={(e) => setExportOptions({
                        ...exportOptions,
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
                    />
                  </Grid>
                )}
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>
      </Grid>

      <Box display="flex" justifyContent="between" sx={{ mt: 3 }}>
        <Button onClick={() => setCurrentStep(0)}>
          上一步
        </Button>
        <Button
          variant="contained"
          onClick={handleGeneratePreview}
          disabled={loading || (exportOptions.encrypt && !exportOptions.password)}
        >
          {loading ? "生成中..." : "生成预览"}
        </Button>
      </Box>
    </Box>
  );

  // 渲染导出预览步骤
  const renderExportPreview = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        导出预览
      </Typography>

      {exportPreview && (
        <Box>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    导出格式
                  </Typography>
                  <Typography variant="h6">
                    {formatOptions.find(f => f.value === exportPreview.format)?.label}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    订阅数量
                  </Typography>
                  <Typography variant="h6">
                    {exportPreview.subscription_count} 个
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    内容大小
                  </Typography>
                  <Typography variant="h6">
                    {formatFileSize(exportPreview.content_size)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    包含设置
                  </Typography>
                  <Typography variant="h6">
                    {exportPreview.include_settings ? "是" : "否"}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Typography variant="subtitle2" gutterBottom>
            预览内容:
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              maxHeight: 300,
              overflow: "auto",
              fontFamily: "monospace",
              fontSize: "0.875rem",
              bgcolor: "grey.50",
            }}
          >
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {exportPreview.preview_content}
            </pre>
          </Paper>
        </Box>
      )}

      <Box display="flex" justifyContent="between" sx={{ mt: 3 }}>
        <Button onClick={() => setCurrentStep(1)}>
          上一步
        </Button>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={loading}
        >
          {loading ? "导出中..." : "确认导出"}
        </Button>
      </Box>
    </Box>
  );

  // 渲染导出结果步骤
  const renderExportResult = () => (
    <Box>
      <Box display="flex" alignItems="center" gap={2} sx={{ mb: 2 }}>
        <CheckCircle color="success" />
        <Typography variant="h6">
          导出完成
        </Typography>
      </Box>

      <Alert severity="success" sx={{ mb: 2 }}>
        成功导出 {selectedSubscriptions.size} 个订阅，大小: {formatFileSize(exportResult.length)}
      </Alert>

      <Box display="flex" gap={2} sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<ContentCopy />}
          onClick={handleCopyToClipboard}
        >
          复制到剪贴板
        </Button>
        <Button
          variant="outlined"
          startIcon={<Save />}
          onClick={handleSaveToFile}
        >
          保存到文件
        </Button>
      </Box>

      <Typography variant="subtitle2" gutterBottom>
        导出内容:
      </Typography>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          maxHeight: 300,
          overflow: "auto",
          fontFamily: "monospace",
          fontSize: "0.875rem",
          bgcolor: "grey.50",
        }}
      >
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {exportResult}
        </pre>
      </Paper>

      <Box display="flex" justifyContent="between" sx={{ mt: 3 }}>
        <Button onClick={() => setCurrentStep(0)}>
          重新导出
        </Button>
        <Button variant="contained" onClick={onClose}>
          完成
        </Button>
      </Box>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={2}>
          <GetApp />
          <Typography variant="h6">批量导出订阅</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Stepper activeStep={currentStep} orientation="vertical">
          <Step>
            <StepLabel>选择订阅</StepLabel>
            <StepContent>
              {renderSubscriptionSelection()}
            </StepContent>
          </Step>

          <Step>
            <StepLabel>配置选项</StepLabel>
            <StepContent>
              {renderExportOptions()}
            </StepContent>
          </Step>

          <Step>
            <StepLabel>预览导出</StepLabel>
            <StepContent>
              {renderExportPreview()}
            </StepContent>
          </Step>

          <Step>
            <StepLabel>导出完成</StepLabel>
            <StepContent>
              {renderExportResult()}
            </StepContent>
          </Step>
        </Stepper>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {currentStep === 3 ? "完成" : "取消"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BatchExportDialog;
