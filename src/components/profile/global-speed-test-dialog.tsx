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
import { startGlobalSpeedTest, applyBestNode, cancelGlobalSpeedTest } from '@/services/cmds';
import { listen } from '@tauri-apps/api/event';
import { showNotice } from '@/services/noticeService';

interface TrafficInfo {
  total?: number;
  used?: number;
  remaining?: number;
  remaining_percentage?: number;
  expire_time?: number;
  expire_days?: number;
}

interface SpeedTestResult {
  node_name: string;
  node_type: string;
  server: string;
  port: number;
  profile_name: string;
  profile_uid: string;
  profile_type: string;
  subscription_url?: string;
  latency_ms?: number;
  download_speed_mbps?: number;
  upload_speed_mbps?: number;
  stability_score: number;
  test_duration_ms: number;
  status: string;
  region?: string;
  traffic_info?: TrafficInfo;
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
  all_results: SpeedTestResult[];  // 所有节点结果（按评分排序）
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
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<GlobalSpeedTestProgress | null>(null);
  const [summary, setSummary] = useState<GlobalSpeedTestSummary | null>(null);
  const [results, setResults] = useState<SpeedTestResult[]>([]);
  const [showAllResults, setShowAllResults] = useState(false);

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

      // 监听取消事件
      const cancelUnlisten = await listen(
        'global-speed-test-cancelled',
        () => {
          setTesting(false);
          setCancelling(false);
          setProgress(null);
          showNotice('info', '测速已取消', 2000);
        }
      );

      // 监听完成事件
      completeUnlisten = await listen<GlobalSpeedTestSummary>(
        'global-speed-test-complete',
        (event) => {
          setSummary(event.payload);
          // 默认显示前10名，但可以切换显示所有结果
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
      setShowAllResults(false); // 重置显示模式
      
      showNotice('info', '开始全局节点测速...', 2000);
      await startGlobalSpeedTest();
    } catch (error: any) {
      console.error('启动全局测速失败:', error);
      showNotice('error', `启动测速失败: ${error.message}`, 3000);
      setTesting(false);
    }
  };

  const handleCancelTest = async () => {
    try {
      setCancelling(true);
      await cancelGlobalSpeedTest();
      showNotice('info', '正在取消测速...', 2000);
    } catch (error: any) {
      console.error('取消测速失败:', error);
      showNotice('error', `取消测速失败: ${error.message}`, 3000);
      setCancelling(false);
    }
  };

  const handleApplyBestNode = async () => {
    if (!summary?.best_node) {
      showNotice('info', '没有找到最佳节点', 2000);
      return;
    }

    try {
      await applyBestNode();
      showNotice('success', `已切换到最佳节点: ${summary.best_node.node_name}`, 3000);
    } catch (error: any) {
      console.error('切换节点失败:', error);
      showNotice('error', `切换失败: ${error.message}`, 3000);
    }
  };

  const handleToggleResults = () => {
    if (!summary) return;
    
    if (showAllResults) {
      setResults(summary.top_10_nodes);
      setShowAllResults(false);
    } else {
      setResults(summary.all_results);
      setShowAllResults(true);
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
      case 'success':
        return 'success';
      case 'failed':
        return 'error';
      case 'timeout':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getQualityColor = (score?: number) => {
    if (!score) return '#666';
    if (score >= 90) return '#4caf50';  // 绿色 - 优秀
    if (score >= 70) return '#ff9800';  // 橙色 - 良好
    if (score >= 50) return '#ffeb3b';  // 黄色 - 一般
    return '#f44336';                   // 红色 - 差
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getSpeedColor = (speed?: number) => {
    if (!speed) return '#666';
    if (speed >= 100) return '#4caf50';  // 绿色 - 最优 (100+ Mbps)
    if (speed >= 50) return '#8bc34a';   // 浅绿色 - 优秀 (50+ Mbps)
    if (speed >= 20) return '#ff9800';   // 橙色 - 良好 (20+ Mbps)
    if (speed >= 5) return '#ffeb3b';    // 黄色 - 一般 (5+ Mbps)
    return '#f44336';                    // 红色 - 差 (<5 Mbps)
  };

  const getLatencyColor = (latency?: number) => {
    if (!latency) return '#666';
    if (latency <= 50) return '#4caf50';   // 绿色 - 最优 (<=50ms)
    if (latency <= 100) return '#8bc34a';  // 浅绿色 - 优秀 (<=100ms)
    if (latency <= 200) return '#ff9800';  // 橙色 - 良好 (<=200ms)
    if (latency <= 500) return '#ffeb3b';  // 黄色 - 一般 (<=500ms)
    return '#f44336';                      // 红色 - 差 (>500ms)
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
            <Box display="flex" gap={2} flexDirection={{ xs: 'column', md: 'row' }}>
              <Box flex={1}>
                <Button
                  variant="contained"
                  startIcon={testing ? <Stop /> : <PlayArrow />}
                  onClick={testing ? handleCancelTest : handleStartTest}
                  disabled={cancelling}
                  size="large"
                  fullWidth
                >
                  {cancelling ? '取消中...' : testing ? '停止测速' : '开始全局测速'}
                </Button>
              </Box>
              <Box flex={1}>
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
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* 进度显示 */}
        {progress && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                📊 测速进度
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body1" color="primary" fontWeight="bold">
                  {progress.current_node}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  状态: {progress.current_profile}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  已完成: {progress.completed} / {progress.total} 个节点 ({progress.percentage.toFixed(1)}%)
                </Typography>
                
                {/* 预估剩余时间 */}
                {progress.completed > 0 && (
                  <Typography variant="caption" color="text.disabled">
                    预估剩余时间: {
                      (() => {
                        const remaining = progress.total - progress.completed;
                        const BATCH_SIZE = 8;
                        const remainingBatches = Math.ceil(remaining / BATCH_SIZE);
                        // 每批预估15秒（包含网络延迟和处理时间）
                        const estimatedSeconds = remainingBatches * 15;
                        
                        if (estimatedSeconds > 60) {
                          const minutes = Math.ceil(estimatedSeconds / 60);
                          return `约 ${minutes} 分钟`;
                        } else {
                          return `约 ${estimatedSeconds} 秒`;
                        }
                      })()
                    }
                  </Typography>
                )}
              </Box>
              
              {/* 主进度条 */}
              <Box sx={{ mb: 1 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={progress.percentage} 
                  sx={{ 
                    height: 12, 
                    borderRadius: 6,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 6,
                      background: 'linear-gradient(45deg, #4caf50 30%, #8bc34a 90%)',
                    }
                  }}
                />
              </Box>
              
              {/* 节点计数器 */}
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary">
                  0
                </Typography>
                <Typography variant="caption" color="primary" fontWeight="bold">
                  {progress.completed} 完成
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {progress.total}
                </Typography>
              </Box>
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
              <Box display="flex" gap={2} flexWrap="wrap">
                <Box flex={1} minWidth="120px" textAlign="center">
                  <Typography variant="h4" color="primary">
                    {summary.total_nodes}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    总节点数
                  </Typography>
                </Box>
                <Box flex={1} minWidth="120px" textAlign="center">
                  <Typography variant="h4" sx={{ color: 'success.main' }}>
                    {summary.successful_tests}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    成功测试
                  </Typography>
                </Box>
                <Box flex={1} minWidth="120px" textAlign="center">
                  <Typography variant="h4" sx={{ color: 'error.main' }}>
                    {summary.failed_tests}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    失败测试
                  </Typography>
                </Box>
                <Box flex={1} minWidth="120px" textAlign="center">
                  <Typography variant="h4" sx={{ color: 'info.main' }}>
                    {summary.duration_seconds}s
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    总耗时
                  </Typography>
                </Box>
              </Box>
              
              {summary.best_node && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" gutterBottom>
                    🏆 最佳节点
                  </Typography>
                  <Box sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                    <Typography variant="body1" fontWeight="bold" sx={{ color: '#2e7d32' }}>
                      {summary.best_node.node_name}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      服务器: {summary.best_node.server}:{summary.best_node.port} | 订阅: {summary.best_node.profile_name}
                      {summary.best_node.region && ` | 地区: ${summary.best_node.region}`}
                    </Typography>
                    <Typography variant="body2">
                      <span style={{ color: getLatencyColor(summary.best_node.latency_ms), fontWeight: 'bold' }}>
                        延迟: {formatLatency(summary.best_node.latency_ms)}
                      </span> | 
                      <span style={{ color: getSpeedColor(summary.best_node.download_speed_mbps), fontWeight: 'bold' }}>
                        下载: {formatSpeed(summary.best_node.download_speed_mbps)}
                      </span> | 
                      <span style={{ color: getQualityColor(summary.best_node.stability_score), fontWeight: 'bold' }}>
                        稳定性: {summary.best_node.stability_score.toFixed(1)}分
                      </span>
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
              <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">
                  {showAllResults ? `所有节点排名 (${results.length}个)` : 'Top 10 节点排名'}
                </Typography>
                {summary && summary.all_results.length > 10 && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleToggleResults}
                    startIcon={showAllResults ? <Star /> : <TrendingUp />}
                  >
                    {showAllResults ? '显示前10名' : `显示所有 ${summary.all_results.length} 个节点`}
                  </Button>
                )}
              </Box>
              
              {/* 颜色图例 */}
              <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  📊 性能指标颜色说明
                </Typography>
                <Box display="flex" gap={2} flexWrap="wrap">
                  <Box flex={1} minWidth="200px">
                    <Typography variant="caption" display="block" gutterBottom>
                      <strong>延迟等级:</strong>
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1} sx={{ flexWrap: 'wrap' }}>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#4caf50', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">≤50ms</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#8bc34a', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">≤100ms</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#ff9800', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">≤200ms</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#ffeb3b', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">≤500ms</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#f44336', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">&gt;500ms</Typography>
                      </Box>
                    </Box>
                  </Box>
                  <Box flex={1} minWidth="200px">
                    <Typography variant="caption" display="block" gutterBottom>
                      <strong>速度等级:</strong>
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1} sx={{ flexWrap: 'wrap' }}>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#4caf50', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">≥100M</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#8bc34a', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">≥50M</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#ff9800', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">≥20M</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#ffeb3b', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">≥5M</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#f44336', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">&lt;5M</Typography>
                      </Box>
                    </Box>
                  </Box>
                  <Box flex={1} minWidth="200px">
                    <Typography variant="caption" display="block" gutterBottom>
                      <strong>稳定性评分:</strong>
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1} sx={{ flexWrap: 'wrap' }}>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#4caf50', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">90+分</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#ff9800', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">70+分</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#ffeb3b', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">50+分</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Box sx={{ width: 12, height: 12, bgcolor: '#f44336', borderRadius: '50%', mr: 0.5 }} />
                        <Typography variant="caption">&lt;50分</Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Box>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>排名</TableCell>
                      <TableCell>节点名称</TableCell>
                      <TableCell>服务器地址</TableCell>
                      <TableCell>类型</TableCell>
                      <TableCell>订阅</TableCell>
                      <TableCell>地区</TableCell>
                      <TableCell>延迟</TableCell>
                      <TableCell>下载速度</TableCell>
                      <TableCell>上传速度</TableCell>
                      <TableCell>稳定性</TableCell>
                      <TableCell>剩余流量</TableCell>
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
                          <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {result.server}
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
                        <TableCell>
                          {result.region ? (
                            <Chip label={result.region} size="small" variant="outlined" />
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              color: getLatencyColor(result.latency_ms),
                              fontWeight: 'bold'
                            }}
                          >
                            {formatLatency(result.latency_ms)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              color: getSpeedColor(result.download_speed_mbps),
                              fontWeight: 'bold'
                            }}
                          >
                            {formatSpeed(result.download_speed_mbps)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              color: getSpeedColor(result.upload_speed_mbps),
                              fontWeight: 'bold'
                            }}
                          >
                            {formatSpeed(result.upload_speed_mbps)}
                          </Typography>
                        </TableCell>
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
                            {result.stability_score.toFixed(1)}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {result.traffic_info?.remaining_percentage ? (
                            <Box display="flex" alignItems="center">
                              <Typography variant="body2" sx={{ mr: 1 }}>
                                {result.traffic_info.remaining_percentage.toFixed(0)}%
                              </Typography>
                              <LinearProgress 
                                variant="determinate" 
                                value={result.traffic_info.remaining_percentage} 
                                sx={{ 
                                  width: 40, 
                                  height: 6,
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: result.traffic_info.remaining_percentage > 50 ? 'success.main' : 
                                             result.traffic_info.remaining_percentage > 20 ? 'warning.main' : 'error.main'
                                  }
                                }} 
                              />
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
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
