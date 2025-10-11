import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
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
} from "@mui/material";
import {
  CheckCircle,
  Warning,
  Error,
  HelpOutline,
  Refresh,
  ExpandMore,
  ExpandLess,
  AccessTime,
  Storage,
  Speed,
  Dns,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import {
  checkAllSubscriptionsHealth,
  checkSubscriptionHealth,
  getSubscriptionDetails,
  type SubscriptionHealthResult,
  type BatchHealthResult,
} from "@/services/cmds";

interface HealthCheckDialogProps {
  open: boolean;
  onClose: () => void;
  initialUid?: string; // 如果提供了，只检查单个订阅
}

const HealthCheckDialog: React.FC<HealthCheckDialogProps> = ({
  open,
  onClose,
  initialUid,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchHealthResult | null>(
    null,
  );
  const [singleResult, setSingleResult] =
    useState<SubscriptionHealthResult | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(
    new Set(),
  );
  const [progress, setProgress] = useState(0);

  // 健康状态图标映射
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Healthy":
        return <CheckCircle color="success" />;
      case "Warning":
        return <Warning color="warning" />;
      case "Unhealthy":
        return <Error color="error" />;
      case "Checking":
        return <Refresh className="animate-spin" color="primary" />;
      default:
        return <HelpOutline color="disabled" />;
    }
  };

  // 健康状态颜色映射
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Healthy":
        return "success";
      case "Warning":
        return "warning";
      case "Unhealthy":
        return "error";
      case "Checking":
        return "primary";
      default:
        return "default";
    }
  };

  // 健康状态文本映射
  const getStatusText = (status: string) => {
    switch (status) {
      case "Healthy":
        return "健康";
      case "Warning":
        return "警告";
      case "Unhealthy":
        return "不健康";
      case "Checking":
        return "检查中";
      default:
        return "未知";
    }
  };

  // 格式化响应时间
  const formatResponseTime = (time?: number) => {
    if (!time) return "N/A";
    if (time < 1000) return `${time}ms`;
    return `${(time / 1000).toFixed(1)}s`;
  };

  // 格式化时间戳
  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return "未知";
    return new Date(timestamp * 1000).toLocaleString();
  };

  // 执行健康检查
  const runHealthCheck = async () => {
    setLoading(true);
    setProgress(0);

    try {
      if (initialUid) {
        // 检查单个订阅
        const result = await checkSubscriptionHealth(initialUid);
        setSingleResult(result);
      } else {
        // 批量检查所有订阅
        setProgress(30);
        const result = await checkAllSubscriptionsHealth();
        setBatchResult(result);
        setProgress(100);
      }
    } catch (error) {
      console.error("健康检查失败:", error);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // 切换详情展开状态
  const toggleExpanded = (uid: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(uid)) {
      newExpanded.delete(uid);
    } else {
      newExpanded.add(uid);
    }
    setExpandedResults(newExpanded);
  };

  // 获取详细信息
  const getDetailedInfo = async (uid: string) => {
    try {
      const details = await getSubscriptionDetails(uid);
      // 更新结果中的详细信息
      if (batchResult) {
        const updatedResults = batchResult.results.map((result) =>
          result.uid === uid ? { ...result, ...details } : result,
        );
        setBatchResult({ ...batchResult, results: updatedResults });
      }
    } catch (error) {
      console.error("获取详细信息失败:", error);
    }
  };

  // 组件挂载时自动运行检查
  useEffect(() => {
    if (open) {
      runHealthCheck();
    }
  }, [open, initialUid]);

  // 渲染单个订阅结果
  const renderSubscriptionResult = (result: SubscriptionHealthResult) => {
    const isExpanded = expandedResults.has(result.uid);

    return (
      <Card key={result.uid} variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            <Box display="flex" alignItems="center" gap={1}>
              {getStatusIcon(result.status)}
              <Typography variant="h6" component="div">
                {result.name}
              </Typography>
              <Chip
                label={getStatusText(result.status)}
                color={getStatusColor(result.status) as any}
                size="small"
              />
            </Box>
            <IconButton onClick={() => toggleExpanded(result.uid)}>
              {isExpanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          </Box>

          {/* 基础信息 */}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Box display="flex" alignItems="center" gap={1}>
                <Speed fontSize="small" />
                <Typography variant="body2">
                  响应时间: {formatResponseTime(result.response_time)}
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Box display="flex" alignItems="center" gap={1}>
                <Storage fontSize="small" />
                <Typography variant="body2">
                  节点数: {result.node_count || "N/A"}
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Box display="flex" alignItems="center" gap={1}>
                <AccessTime fontSize="small" />
                <Typography variant="body2">
                  检查时间: {formatTimestamp(result.last_checked)}
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Button
                size="small"
                startIcon={<Dns />}
                onClick={() => getDetailedInfo(result.uid)}
              >
                详细信息
              </Button>
            </Grid>
          </Grid>

          {/* 详细信息展开区域 */}
          <Collapse in={isExpanded}>
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 2 }} />

              {/* 错误信息 */}
              {result.error_message && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    错误信息: {result.error_message}
                  </Typography>
                </Alert>
              )}

              {/* 详细信息列表 */}
              <List dense>
                {result.url && (
                  <ListItem>
                    <ListItemText primary="订阅URL" secondary={result.url} />
                  </ListItem>
                )}
                <ListItem>
                  <ListItemText
                    primary="最后更新"
                    secondary={formatTimestamp(result.last_update)}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText primary="UID" secondary={result.uid} />
                </ListItem>
              </List>
            </Box>
          </Collapse>
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            {initialUid ? "订阅健康检查" : "批量健康检查"}
          </Typography>
          <IconButton onClick={runHealthCheck} disabled={loading}>
            <Refresh />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* 加载进度 */}
        {loading && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress
              variant={progress > 0 ? "determinate" : "indeterminate"}
              value={progress}
            />
            <Typography variant="body2" align="center" sx={{ mt: 1 }}>
              正在检查订阅健康状态...
            </Typography>
          </Box>
        )}

        {/* 批量检查结果统计 */}
        {batchResult && !loading && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              检查结果概览
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Card variant="outlined">
                  <CardContent sx={{ textAlign: "center" }}>
                    <Typography color="text.secondary" gutterBottom>
                      总数
                    </Typography>
                    <Typography variant="h4">{batchResult.total}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Card variant="outlined">
                  <CardContent sx={{ textAlign: "center" }}>
                    <Typography color="success.main" gutterBottom>
                      健康
                    </Typography>
                    <Typography variant="h4" color="success.main">
                      {batchResult.healthy}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Card variant="outlined">
                  <CardContent sx={{ textAlign: "center" }}>
                    <Typography color="warning.main" gutterBottom>
                      警告
                    </Typography>
                    <Typography variant="h4" color="warning.main">
                      {batchResult.warning}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Card variant="outlined">
                  <CardContent sx={{ textAlign: "center" }}>
                    <Typography color="error.main" gutterBottom>
                      不健康
                    </Typography>
                    <Typography variant="h4" color="error.main">
                      {batchResult.unhealthy}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              检查耗时: {(batchResult.check_duration / 1000).toFixed(1)} 秒
            </Typography>
          </Box>
        )}

        {/* 详细结果列表 */}
        {batchResult && !loading && (
          <Box>
            <Typography variant="h6" gutterBottom>
              详细结果 ({batchResult.results.length})
            </Typography>
            {batchResult.results.map(renderSubscriptionResult)}
          </Box>
        )}

        {/* 单个订阅结果 */}
        {singleResult && !loading && (
          <Box>{renderSubscriptionResult(singleResult)}</Box>
        )}

        {/* 无结果状态 */}
        {!loading && !batchResult && !singleResult && (
          <Box textAlign="center" py={4}>
            <Typography color="text.secondary">
              点击刷新按钮开始健康检查
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
        <Button
          variant="contained"
          onClick={runHealthCheck}
          disabled={loading}
          startIcon={<Refresh />}
        >
          {loading ? "检查中..." : "重新检查"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default HealthCheckDialog;
