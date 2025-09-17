import React, { useState, useRef } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  LinearProgress,
  Card,
  CardContent,
  Grid,
  Chip,
  Alert,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Tab,
  Tabs,
  Paper,
  Stepper,
  Step,
  StepLabel,
} from "@mui/material";
import {
  CloudUpload,
  ContentPaste,
  Visibility,
  PlayArrow,
  CheckCircle,
  Warning,
  Error,
  Info,
  ExpandMore,
  ExpandLess,
  Refresh,
  Settings,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import {
  batchImportFromText,
  previewBatchImport,
  type BatchImportResult,
  type BatchImportOptions,
  type ImportResult,
} from "@/services/cmds";

interface BatchImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImportComplete?: (result: BatchImportResult) => void;
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
      id={`batch-import-tabpanel-${index}`}
      aria-labelledby={`batch-import-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const BatchImportDialog: React.FC<BatchImportDialogProps> = ({
  open,
  onClose,
  onImportComplete,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 状态管理
  const [currentTab, setCurrentTab] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // 输入内容
  const [textContent, setTextContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  
  // 导入选项
  const [options, setOptions] = useState<BatchImportOptions>({
    skip_duplicates: true,
    auto_generate_names: true,
    name_prefix: "",
    default_user_agent: "clash-verge-rev",
    update_interval: 1440, // 24小时
  });
  
  // 结果数据
  const [previewResult, setPreviewResult] = useState<BatchImportResult | null>(null);
  const [importResult, setImportResult] = useState<BatchImportResult | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  // 步骤标签
  const steps = ["选择输入方式", "配置选项", "预览结果", "执行导入"];

  // 状态图标映射
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Success":
        return <CheckCircle color="success" />;
      case "Duplicate":
        return <Info color="info" />;
      case "Failed":
        return <Error color="error" />;
      case "Invalid":
        return <Warning color="warning" />;
      default:
        return <Info color="disabled" />;
    }
  };

  // 状态颜色映射
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Success":
        return "success";
      case "Duplicate":
        return "info";
      case "Failed":
        return "error";
      case "Invalid":
        return "warning";
      default:
        return "default";
    }
  };

  // 状态文本映射
  const getStatusText = (status: string) => {
    switch (status) {
      case "Success":
        return "导入成功";
      case "Duplicate":
        return "重复订阅";
      case "Failed":
        return "导入失败";
      case "Invalid":
        return "无效URL";
      default:
        return "未知";
    }
  };

  // 从剪贴板粘贴
  const handlePasteFromClipboard = async () => {
    try {
      const text = await readText();
      setTextContent(text || "");
      setCurrentTab(0); // 切换到文本输入标签
    } catch (error) {
      console.error("读取剪贴板失败:", error);
    }
  };

  // 选择文件
  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "文本文件",
            extensions: ["txt", "json", "yaml", "yml"],
          },
        ],
      });

      if (selected) {
        const filePath = Array.isArray(selected) ? selected[0] : selected;
        const content = await readTextFile(filePath);
        setTextContent(content);
        setSelectedFile(filePath);
        setCurrentTab(0);
      }
    } catch (error) {
      console.error("读取文件失败:", error);
    }
  };

  // 预览导入
  const handlePreview = async () => {
    if (!textContent.trim()) {
      return;
    }

    setLoading(true);
    setProgress(30);

    try {
      const result = await previewBatchImport(textContent, options);
      setPreviewResult(result);
      setActiveStep(2);
      setProgress(100);
    } catch (error) {
      console.error("预览失败:", error);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // 执行导入
  const handleImport = async () => {
    if (!textContent.trim()) {
      return;
    }

    setLoading(true);
    setProgress(30);

    try {
      const result = await batchImportFromText(textContent, options);
      setImportResult(result);
      setActiveStep(3);
      setProgress(100);
      
      if (onImportComplete) {
        onImportComplete(result);
      }
    } catch (error) {
      console.error("导入失败:", error);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // 切换结果展开状态
  const toggleExpanded = (url: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(url)) {
      newExpanded.delete(url);
    } else {
      newExpanded.add(url);
    }
    setExpandedResults(newExpanded);
  };

  // 重置对话框
  const resetDialog = () => {
    setActiveStep(0);
    setCurrentTab(0);
    setTextContent("");
    setSelectedFile(null);
    setPreviewResult(null);
    setImportResult(null);
    setExpandedResults(new Set());
    setProgress(0);
  };

  // 关闭对话框
  const handleClose = () => {
    resetDialog();
    onClose();
  };

  // 渲染导入结果统计
  const renderResultSummary = (result: BatchImportResult) => (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid item xs={6} sm={3}>
        <Card variant="outlined">
          <CardContent sx={{ textAlign: "center" }}>
            <Typography color="text.secondary" gutterBottom>
              总数
            </Typography>
            <Typography variant="h4">
              {result.total_input}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={6} sm={3}>
        <Card variant="outlined">
          <CardContent sx={{ textAlign: "center" }}>
            <Typography color="success.main" gutterBottom>
              成功
            </Typography>
            <Typography variant="h4" color="success.main">
              {result.imported}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={6} sm={3}>
        <Card variant="outlined">
          <CardContent sx={{ textAlign: "center" }}>
            <Typography color="info.main" gutterBottom>
              重复
            </Typography>
            <Typography variant="h4" color="info.main">
              {result.duplicates}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={6} sm={3}>
        <Card variant="outlined">
          <CardContent sx={{ textAlign: "center" }}>
            <Typography color="error.main" gutterBottom>
              失败
            </Typography>
            <Typography variant="h4" color="error.main">
              {result.failed}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  // 渲染结果详情列表
  const renderResultDetails = (results: ImportResult[]) => (
    <List>
      {results.map((result, index) => {
        const isExpanded = expandedResults.has(result.url);
        return (
          <React.Fragment key={index}>
            <ListItem>
              <Box display="flex" alignItems="center" gap={1} sx={{ flex: 1 }}>
                {getStatusIcon(result.status)}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2">
                    {result.name || "未命名订阅"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {result.url}
                  </Typography>
                </Box>
                <Chip 
                  label={getStatusText(result.status)} 
                  color={getStatusColor(result.status) as any}
                  size="small"
                />
              </Box>
              <ListItemSecondaryAction>
                <IconButton onClick={() => toggleExpanded(result.url)}>
                  {isExpanded ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
            
            <Collapse in={isExpanded}>
              <Box sx={{ pl: 4, pr: 2, pb: 2 }}>
                {result.error_message && (
                  <Alert severity="error" sx={{ mb: 1 }}>
                    {result.error_message}
                  </Alert>
                )}
                <Typography variant="body2" color="text.secondary">
                  URL: {result.url}
                </Typography>
                {result.uid && (
                  <Typography variant="body2" color="text.secondary">
                    UID: {result.uid}
                  </Typography>
                )}
              </Box>
            </Collapse>
            
            {index < results.length - 1 && <Divider />}
          </React.Fragment>
        );
      })}
    </List>
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="between">
          <Typography variant="h6">批量导入订阅</Typography>
          <IconButton onClick={resetDialog}>
            <Refresh />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* 进度条 */}
        {loading && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress variant={progress > 0 ? "determinate" : "indeterminate"} value={progress} />
            <Typography variant="body2" align="center" sx={{ mt: 1 }}>
              正在处理...
            </Typography>
          </Box>
        )}

        {/* 步骤指示器 */}
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* 步骤1: 输入内容 */}
        {activeStep === 0 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              选择导入方式
            </Typography>
            
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={4}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<ContentPaste />}
                  onClick={handlePasteFromClipboard}
                  size="large"
                >
                  从剪贴板粘贴
                </Button>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<CloudUpload />}
                  onClick={handleSelectFile}
                  size="large"
                >
                  选择文件
                </Button>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<Settings />}
                  onClick={() => setActiveStep(1)}
                  size="large"
                >
                  配置选项
                </Button>
              </Grid>
            </Grid>

            <TextField
              fullWidth
              multiline
              rows={12}
              label="订阅链接"
              placeholder="支持多种格式：&#10;1. 每行一个URL&#10;2. JSON格式的URL数组&#10;3. YAML格式的URL列表&#10;4. 混合格式（自动识别）"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              sx={{ mb: 2 }}
            />

            {selectedFile && (
              <Alert severity="info" sx={{ mb: 2 }}>
                已选择文件: {selectedFile}
              </Alert>
            )}

            <Box display="flex" gap={2}>
              <Button
                variant="contained"
                onClick={() => setActiveStep(1)}
                disabled={!textContent.trim()}
              >
                下一步：配置选项
              </Button>
              <Button
                variant="outlined"
                startIcon={<Visibility />}
                onClick={handlePreview}
                disabled={!textContent.trim() || loading}
              >
                直接预览
              </Button>
            </Box>
          </Box>
        )}

        {/* 步骤2: 配置选项 */}
        {activeStep === 1 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              配置导入选项
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={options.skip_duplicates}
                      onChange={(e) => setOptions({...options, skip_duplicates: e.target.checked})}
                    />
                  }
                  label="跳过重复订阅"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={options.auto_generate_names}
                      onChange={(e) => setOptions({...options, auto_generate_names: e.target.checked})}
                    />
                  }
                  label="自动生成订阅名称"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="名称前缀（可选）"
                  value={options.name_prefix || ""}
                  onChange={(e) => setOptions({...options, name_prefix: e.target.value})}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="默认User-Agent"
                  value={options.default_user_agent || ""}
                  onChange={(e) => setOptions({...options, default_user_agent: e.target.value})}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="更新间隔（分钟）"
                  value={options.update_interval || 1440}
                  onChange={(e) => setOptions({...options, update_interval: parseInt(e.target.value)})}
                />
              </Grid>
            </Grid>

            <Box display="flex" gap={2} sx={{ mt: 3 }}>
              <Button onClick={() => setActiveStep(0)}>
                上一步
              </Button>
              <Button
                variant="contained"
                onClick={handlePreview}
                disabled={!textContent.trim() || loading}
              >
                预览导入
              </Button>
            </Box>
          </Box>
        )}

        {/* 步骤3: 预览结果 */}
        {activeStep === 2 && previewResult && (
          <Box>
            <Typography variant="h6" gutterBottom>
              预览导入结果
            </Typography>

            {renderResultSummary(previewResult)}

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              预览耗时: {(previewResult.import_duration / 1000).toFixed(1)} 秒
            </Typography>

            <Paper variant="outlined" sx={{ maxHeight: 400, overflow: "auto" }}>
              {renderResultDetails(previewResult.results)}
            </Paper>

            <Box display="flex" gap={2} sx={{ mt: 3 }}>
              <Button onClick={() => setActiveStep(1)}>
                上一步
              </Button>
              <Button
                variant="contained"
                startIcon={<PlayArrow />}
                onClick={handleImport}
                disabled={previewResult.imported === 0 || loading}
              >
                确认导入 ({previewResult.imported} 个订阅)
              </Button>
            </Box>
          </Box>
        )}

        {/* 步骤4: 导入完成 */}
        {activeStep === 3 && importResult && (
          <Box>
            <Typography variant="h6" gutterBottom>
              导入完成
            </Typography>

            {renderResultSummary(importResult)}

            <Alert 
              severity={importResult.failed > 0 ? "warning" : "success"} 
              sx={{ mb: 2 }}
            >
              {importResult.failed > 0 
                ? `导入完成，但有 ${importResult.failed} 个订阅导入失败`
                : `成功导入 ${importResult.imported} 个订阅`
              }
            </Alert>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              导入耗时: {(importResult.import_duration / 1000).toFixed(1)} 秒
            </Typography>

            <Paper variant="outlined" sx={{ maxHeight: 400, overflow: "auto" }}>
              {renderResultDetails(importResult.results)}
            </Paper>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          {activeStep === 3 ? "完成" : "取消"}
        </Button>
        {activeStep === 3 && (
          <Button
            variant="outlined"
            onClick={resetDialog}
            startIcon={<Refresh />}
          >
            重新导入
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BatchImportDialog;
