import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Grid,
  Divider,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Speed,
  Star,
  Close,
  Refresh,
  TrendingUp,
  NetworkCheck,
  Timer,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { showNotice } from '@/services/noticeService';

interface SpeedTestResult {
  node_name: string;
  node_type: string;
  server: string;
  latency_ms?: number;
  download_speed_mbps?: number;
  upload_speed_mbps?: number;
  stability_score?: number;
  status: string;
  error_message?: string;
  profile_name: string;
  profile_uid: string;
}

interface GlobalSpeedTestProgress {
  current_node: string;
  completed: number;
  total: number;
  percentage: number;
  current_profile: string;
}

interface GlobalSpeedTestSummary {
  total_nodes: number;
  tested_nodes: number;
  successful_tests: number;
  failed_tests: number;
  best_node?: SpeedTestResult;
  top_10_nodes: SpeedTestResult[];
  results_by_profile: Record<string, SpeedTestResult[]>;
  duration_seconds: number;
}

interface GlobalSpeedTestDialogProps {
  open: boolean;
  onClose: () => void;
}

export const GlobalSpeedTestDialog: React.FC<GlobalSpeedTestDialogProps> = ({
  open,
  onClose,
}) => {
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState<GlobalSpeedTestProgress | null>(null);
  const [summary, setSummary] = useState<GlobalSpeedTestSummary | null>(null);
  const [results, setResults] = useState<SpeedTestResult[]>([]);

  useEffect(() => {
    let progressUnlisten: (() => void) | null = null;
    let completeUnlisten: (() => void) | null = null;

    const setupListeners = async () => {
      // 监听进度更新
      progressUnlisten = await listen<GlobalSpeedTestProgress>(
        'global-speed-test-progress',
        (event) => {
          setProgress(event.payload);
        }
      );

      // 监听完成事件
      completeUnlisten = await listen<GlobalSpeedTestSummary>(
        'global-speed-test-complete',
        (event) => {
          setSummary(event.payload);
          setResults(event.payload.top_10_nodes);
          setTesting(false);
          setProgress(null);
          showNotice('success', '全局测速完成！', 2000);
        }
      );
    };

    if (open) {
      setupListeners();
    }

    return () => {
      progressUnlisten?.();
      completeUnlisten?.();
    };
  }, [open]);

  const handleStartTest = async () => {
    try {
      setTesting(true);
      setProgress(null);
      setSummary(null);
      setResults([]);
      
      showNotice('info', '开始全局节点测速...', 2000);
      await invoke('start_global_speed_test');
    } catch (error: any) {
      console.error('启动全局测速失败:', error);
      showNotice('error', `启动测速失败: ${error.message}`, 3000);
      setTesting(false);
    }
  };

  const handleApplyBestNode = async () => {
    if (!summary?.best_node) {
      showNotice('warning', '没有找到最佳节点', 2000);
      return;
    }

    try {
      await invoke('apply_best_node');
      showNotice('success', `已切换到最佳节点: ${summary.best_node.node_name}`, 3000);
    } catch (error: any) {
      console.error('切换节点失败:', error);
      showNotice('error', `切换失败: ${error.message}`, 3000);
    }
  };

  const handleClose = () => {
    if (!testing) {
      onClose();
    }
  };

  const formatSpeed = (speed?: number) => {
    if (!speed) return 'N/A';
    return `${speed.toFixed(1)} Mbps`;
  };

  const formatLatency = (latency?: number) => {
    if (!latency) return 'N/A';
    return `${latency}ms`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pass':
        return 'success';
      case 'Failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const getQualityColor = (score?: number) => {
    if (!score) return '#666';
    if (score >= 90) return '#4caf50';
    if (score >= 70) return '#ff9800';
    return '#f44336';
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { minHeight: '80vh' }
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <NetworkCheck color="primary" />
            <Typography variant="h6">全局节点测速</Typography>
          </Box>
          <IconButton onClick={handleClose} disabled={testing}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* 控制面板 */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={6}>
                <Button
                  variant="contained"
                  startIcon={testing ? <Stop /> : <PlayArrow />}
                  onClick={handleStartTest}
                  disabled={testing}
                  size="large"
                  fullWidth
                >
                  {testing ? '测速进行中...' : '开始全局测速'}
                </Button>
              </Grid>
              <Grid item xs={12} md={6}>
                <Button
                  variant="outlined"
                  startIcon={<Star />}
                  onClick={handleApplyBestNode}
                  disabled={!summary?.best_node || testing}
                  size="large"
                  fullWidth
                >
                  切换到最佳节点
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* 进度显示 */}
        {progress && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                测速进度
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  当前订阅: {progress.current_profile}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  当前节点: {progress.current_node}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  进度: {progress.completed} / {progress.total} ({progress.percentage.toFixed(1)}%)
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={progress.percentage} 
                sx={{ height: 8, borderRadius: 4 }}
              />
            </CardContent>
          </Card>
        )}

        {/* 测试结果摘要 */}
        {summary && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                测试结果摘要
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="primary">
                      {summary.total_nodes}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      总节点数
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="success.main">
                      {summary.successful_tests}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      成功测试
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="error.main">
                      {summary.failed_tests}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      失败测试
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="info.main">
                      {summary.duration_seconds}s
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      总耗时
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
              
              {summary.best_node && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" gutterBottom>
                    🏆 最佳节点
                  </Typography>
                  <Box sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                    <Typography variant="body1" fontWeight="bold">
                      {summary.best_node.node_name}
                    </Typography>
                    <Typography variant="body2">
                      延迟: {formatLatency(summary.best_node.latency_ms)} | 
                      下载: {formatSpeed(summary.best_node.download_speed_mbps)} | 
                      稳定性: {summary.best_node.stability_score?.toFixed(1)}分
                    </Typography>
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* 详细结果表格 */}
        {results.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top 10 节点排名
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>排名</TableCell>
                      <TableCell>节点名称</TableCell>
                      <TableCell>类型</TableCell>
                      <TableCell>订阅</TableCell>
                      <TableCell>延迟</TableCell>
                      <TableCell>下载速度</TableCell>
                      <TableCell>上传速度</TableCell>
                      <TableCell>稳定性</TableCell>
                      <TableCell>状态</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.map((result, index) => (
                      <TableRow key={`${result.profile_uid}-${result.node_name}`}>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            {index === 0 && <Star sx={{ color: '#ffd700', mr: 0.5 }} />}
                            #{index + 1}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {result.node_name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={result.node_type} size="small" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {result.profile_name}
                          </Typography>
                        </TableCell>
                        <TableCell>{formatLatency(result.latency_ms)}</TableCell>
                        <TableCell>{formatSpeed(result.download_speed_mbps)}</TableCell>
                        <TableCell>{formatSpeed(result.upload_speed_mbps)}</TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: getQualityColor(result.stability_score),
                                mr: 1,
                              }}
                            />
                            {result.stability_score?.toFixed(1) || 'N/A'}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={result.status} 
                            size="small" 
                            color={getStatusColor(result.status) as any}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}

        {/* 空状态 */}
        {!testing && !summary && (
          <Box 
            display="flex" 
            flexDirection="column" 
            alignItems="center" 
            justifyContent="center"
            sx={{ py: 8 }}
          >
            <Speed sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              点击开始进行全局节点测速
            </Typography>
            <Typography variant="body2" color="text.disabled" textAlign="center">
              将测试所有订阅中的节点，找出最快最稳定的节点
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={testing}>
          关闭
        </Button>
        {summary && (
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={handleStartTest}
            disabled={testing}
          >
            重新测速
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
