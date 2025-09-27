import React, { useState, useEffect, useRef } from 'react';
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
  Settings,
  Save,
  FastForward,
} from '@mui/icons-material';
import { 
  startGlobalSpeedTest, 
  applyBestNode, 
  cancelGlobalSpeedTest, 
  forceCancelFrozenSpeedTest,
  getSpeedTestHealthReport,
  switchToNode 
} from '@/services/cmds';
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
  subscription_url?: string;
  latency?: number;
  is_available: boolean;
  error_message?: string;
  score: number;
  region?: string;
  traffic_info?: TrafficInfo;
}

interface GlobalSpeedTestProgress {
  current_node: string;
  completed: number;
  total: number;
  percentage: number;
  current_profile: string;
  tested_nodes: number;
  successful_tests: number;
  failed_tests: number;
  current_batch: number;
  total_batches: number;
  estimated_remaining_seconds: number;
}

interface NodeTestUpdate {
  node_name: string;
  profile_name: string;
  status: string; // "testing", "success", "failed", "timeout"
  latency_ms?: number;
  error_message?: string;
  completed: number;
  total: number;
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

interface HealthCheckReport {
  is_healthy: boolean;
  issues: string[];
  recommendations: string[];
  current_state?: any;
  system_resources: any;
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
  const [recentTests, setRecentTests] = useState<NodeTestUpdate[]>([]);
  const [currentTestingNodes, setCurrentTestingNodes] = useState<Set<string>>(new Set());
  const [showConfig, setShowConfig] = useState(false);
  const [healthReport, setHealthReport] = useState<HealthCheckReport | null>(null);
  const [showHealthPanel, setShowHealthPanel] = useState(false);
  const [freezeDetected, setFreezeDetected] = useState(false);
  const [config, setConfig] = useState({
    batchSize: 3,           // 🚀 优化后的默认批次大小
    nodeTimeout: 4,         // 🚀 优化后的节点超时（秒）
    batchTimeout: 45,       // 🚀 优化后的批次超时（秒）
    overallTimeout: 300,    // 🚀 优化后的总体超时（秒，5分钟）
    maxConcurrent: 6,       // 🚀 优化后的最大并发数
  });

  // 节流更新，避免 UI 在最大化时频繁重绘导致卡顿
  const lastProgressTsRef = useRef<number>(0);
  const lastNodeUpdateTsRef = useRef<number>(0);
  const PROGRESS_THROTTLE_MS = 150;
  const NODE_THROTTLE_MS = 120;

  useEffect(() => {
    let progressUnlisten: (() => void) | null = null;
    let nodeUpdateUnlisten: (() => void) | null = null;
    let completeUnlisten: (() => void) | null = null;
    let healthUnlisten: (() => void) | null = null;
    let freezeUnlisten: (() => void) | null = null;
    let forceCancelUnlisten: (() => void) | null = null;

    const setupListeners = async () => {
      // 监听进度更新
      progressUnlisten = await listen<GlobalSpeedTestProgress>(
        'global-speed-test-progress',
        (event) => {
          const now = Date.now();
          if (now - lastProgressTsRef.current < PROGRESS_THROTTLE_MS) return;
          lastProgressTsRef.current = now;
          setProgress(event.payload);
        }
      );

      // 监听节点测试更新
      nodeUpdateUnlisten = await listen<NodeTestUpdate>(
        'node-test-update',
        (event) => {
          const now = Date.now();
          const update = event.payload;
          if (now - lastNodeUpdateTsRef.current >= NODE_THROTTLE_MS) {
            lastNodeUpdateTsRef.current = now;
            setRecentTests(prev => {
              const newTests = [update, ...prev].slice(0, 20); // 保留最近20个测试
              return newTests;
            });
          }

          // 更新当前测试中的节点
          if (update.status === 'testing') {
            setCurrentTestingNodes(prev => new Set([...prev, update.node_name]));
          } else {
            setCurrentTestingNodes(prev => {
              const newSet = new Set(prev);
              newSet.delete(update.node_name);
              return newSet;
            });
          }
        }
      );

      // 监听取消事件
      const cancelUnlisten = await listen(
        'global-speed-test-cancelled',
        () => {
          setTesting(false);
          setCancelling(false);
          setProgress(null);
          setCurrentTestingNodes(new Set());
          showNotice('info', '测速已取消');
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
          setCurrentTestingNodes(new Set());
          setFreezeDetected(false);
          setHealthReport(null);
          showNotice('success', '全局测速完成！', 2000);
        }
      );

      // 监听健康报告
      healthUnlisten = await listen<HealthCheckReport>(
        'speed-test-health-report',
        (event) => {
          setHealthReport(event.payload);
          if (!event.payload.is_healthy) {
            setShowHealthPanel(true);
          }
        }
      );

      // 监听假死检测
      freezeUnlisten = await listen<HealthCheckReport>(
        'speed-test-freeze-detected',
        (event) => {
          setFreezeDetected(true);
          setHealthReport(event.payload);
          setShowHealthPanel(true);
          showNotice('error', '检测到测速假死，建议立即取消！', 5000);
        }
      );

      // 监听强制取消事件
      forceCancelUnlisten = await listen(
        'global-speed-test-force-cancelled',
        () => {
          setTesting(false);
          setCancelling(false);
          setProgress(null);
          setCurrentTestingNodes(new Set());
          setFreezeDetected(false);
          setHealthReport(null);
          showNotice('warning', '测速已强制取消', 3000);
        }
      );
    };

    if (open) {
      setupListeners();
    }

    return () => {
      progressUnlisten?.();
      nodeUpdateUnlisten?.();
      completeUnlisten?.();
      healthUnlisten?.();
      freezeUnlisten?.();
      forceCancelUnlisten?.();
    };
  }, [open]);

  const handleStartTest = async () => {
    try {
      setTesting(true);
      setProgress(null);
      setSummary(null);
      setResults([]);
      setShowAllResults(false); // 重置显示模式
      setRecentTests([]); // 清空历史测试记录
      setCurrentTestingNodes(new Set()); // 清空当前测试节点
      
      showNotice('info', '开始全局节点测速...', 2000);
      await startGlobalSpeedTest(config);
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

  const handleForceCancelTest = async () => {
    try {
      setCancelling(true);
      await forceCancelFrozenSpeedTest();
      showNotice('warning', '正在强制取消假死的测速...', 3000);
    } catch (error: any) {
      console.error('强制取消失败:', error);
      showNotice('error', `强制取消失败: ${error.message}`, 3000);
      setCancelling(false);
    }
  };

  const handleCheckHealth = async () => {
    try {
      const report = await getSpeedTestHealthReport();
      setHealthReport(report);
      setShowHealthPanel(true);
    } catch (error: any) {
      console.error('获取健康报告失败:', error);
      showNotice('error', `获取健康报告失败: ${error.message}`, 3000);
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

  const handleSwitchToNode = async (node: SpeedTestResult) => {
    try {
      await switchToNode(node.profile_uid, node.node_name);
      showNotice('success', `已切换到节点: ${node.node_name}`, 3000);
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
        {/* 测速说明 */}
        <Card sx={{ mb: 2, border: '1px solid', borderColor: 'primary.main', bgcolor: 'primary.50' }}>
          <CardContent sx={{ py: 2 }}>
            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <NetworkCheck color="primary" fontSize="small" />
              <strong>增强版全局测速（防假死）</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              新版本增加了假死检测和自动恢复机制，支持大批量节点测速（1000+）。
              通过Clash API进行真实代理测试，包含完整的状态监控和资源管理。
            </Typography>
            
            <Typography variant="caption" sx={{ 
              display: 'block', 
              p: 1, 
              bgcolor: 'success.light', 
              borderRadius: 1,
              color: 'success.dark',
              fontWeight: 'bold' 
            }}>
              🛡️ <strong>防假死特性（全新）</strong>：<br/>
              • <strong>智能监控</strong>: 实时检测测速状态，自动识别假死情况<br/>
              • <strong>资源管理</strong>: 自动清理僵死连接，防止内存泄漏<br/>
              • <strong>强制恢复</strong>: 假死时可强制取消，立即恢复系统状态<br/>
              • <strong>详细日志</strong>: 完整记录测速过程，便于问题诊断
            </Typography>
          </CardContent>
        </Card>

        {/* 健康状态面板 */}
        {(healthReport || testing) && (
          <Card sx={{ 
            mb: 2, 
            border: '1px solid', 
            borderColor: freezeDetected ? 'error.main' : healthReport?.is_healthy === false ? 'warning.main' : 'info.main',
            bgcolor: freezeDetected ? 'error.50' : healthReport?.is_healthy === false ? 'warning.50' : 'info.50'
          }}>
            <CardContent sx={{ py: 2 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1,
                  color: freezeDetected ? 'error.dark' : healthReport?.is_healthy === false ? 'warning.dark' : 'info.dark'
                }}>
                  {freezeDetected ? '🚨' : healthReport?.is_healthy === false ? '⚠️' : '💚'} 
                  <strong>
                    {freezeDetected ? '假死检测警告' : 
                     healthReport?.is_healthy === false ? '健康状态异常' : '测速状态正常'}
                  </strong>
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setShowHealthPanel(!showHealthPanel)}
                >
                  {showHealthPanel ? '隐藏' : '详情'}
                </Button>
              </Box>
              
              {showHealthPanel && healthReport && (
                <Box>
                  {healthReport.issues.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="error.main" fontWeight="bold" display="block" gutterBottom>
                        发现的问题:
                      </Typography>
                      {healthReport.issues.map((issue, index) => (
                        <Typography key={index} variant="caption" display="block" sx={{ ml: 1 }}>
                          • {issue}
                        </Typography>
                      ))}
                    </Box>
                  )}
                  
                  {healthReport.recommendations.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="warning.main" fontWeight="bold" display="block" gutterBottom>
                        建议操作:
                      </Typography>
                      {healthReport.recommendations.map((rec, index) => (
                        <Typography key={index} variant="caption" display="block" sx={{ ml: 1 }}>
                          • {rec}
                        </Typography>
                      ))}
                    </Box>
                  )}
                  
                  {freezeDetected && (
                    <Box display="flex" gap={2} sx={{ mt: 2 }}>
                      <Button
                        variant="contained"
                        color="error"
                        size="small"
                        onClick={handleForceCancelTest}
                        disabled={cancelling}
                      >
                        强制取消假死测速
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={handleCheckHealth}
                      >
                        刷新健康状态
                      </Button>
                    </Box>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        )}

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
              <Box display="flex" gap={1}>
                <Button
                  variant="outlined"
                  startIcon={<Settings />}
                  onClick={() => setShowConfig(!showConfig)}
                  disabled={testing}
                  size="large"
                >
                  配置参数
                </Button>
                {testing && (
                  <Button
                    variant="outlined"
                    color="info"
                    onClick={handleCheckHealth}
                    size="large"
                  >
                    健康检查
                  </Button>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* 参数配置面板 */}
        {showConfig && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ⚙️ 测速参数配置
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                调整测速参数以优化性能和稳定性。保守设置适合网络较慢的环境。
              </Typography>
              
              <Box display="flex" flexDirection="column" gap={3}>
                <Box display="flex" gap={3} flexDirection={{ xs: 'column', sm: 'row' }}>
                  <Box flex={1}>
                    <Typography variant="subtitle2" gutterBottom>
                      批次大小
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      每批同时测试的节点数量 (推荐: 2-4)
                    </Typography>
                    <Box display="flex" alignItems="center" gap={2}>
                      <input
                        type="range"
                        min="1"
                        max="8"
                        value={config.batchSize}
                        onChange={(e) => setConfig(prev => ({ ...prev, batchSize: parseInt(e.target.value) }))}
                        style={{ flex: 1 }}
                      />
                      <Typography variant="body2" sx={{ minWidth: '20px' }}>
                        {config.batchSize}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box flex={1}>
                    <Typography variant="subtitle2" gutterBottom>
                      节点超时 (秒)
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      单个节点连接超时时间 (推荐: 3-8秒)
                    </Typography>
                    <Box display="flex" alignItems="center" gap={2}>
                      <input
                        type="range"
                        min="2"
                        max="15"
                        value={config.nodeTimeout}
                        onChange={(e) => setConfig(prev => ({ ...prev, nodeTimeout: parseInt(e.target.value) }))}
                        style={{ flex: 1 }}
                      />
                      <Typography variant="body2" sx={{ minWidth: '20px' }}>
                        {config.nodeTimeout}s
                      </Typography>
                    </Box>
                  </Box>
                </Box>
                
                <Box display="flex" gap={3} flexDirection={{ xs: 'column', sm: 'row' }}>
                  <Box flex={1}>
                    <Typography variant="subtitle2" gutterBottom>
                      批次超时 (秒)
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      每批次最大等待时间 (推荐: 30-120秒)
                    </Typography>
                    <Box display="flex" alignItems="center" gap={2}>
                      <input
                        type="range"
                        min="15"
                        max="300"
                        step="15"
                        value={config.batchTimeout}
                        onChange={(e) => setConfig(prev => ({ ...prev, batchTimeout: parseInt(e.target.value) }))}
                        style={{ flex: 1 }}
                      />
                      <Typography variant="body2" sx={{ minWidth: '30px' }}>
                        {config.batchTimeout}s
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box flex={1}>
                    <Typography variant="subtitle2" gutterBottom>
                      总体超时 (秒)
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      整个测速过程最大时间 (推荐: 120-600秒)
                    </Typography>
                    <Box display="flex" alignItems="center" gap={2}>
                      <input
                        type="range"
                        min="60"
                        max="1800"
                        step="30"
                        value={config.overallTimeout}
                        onChange={(e) => setConfig(prev => ({ ...prev, overallTimeout: parseInt(e.target.value) }))}
                        style={{ flex: 1 }}
                      />
                      <Typography variant="body2" sx={{ minWidth: '40px' }}>
                        {Math.floor(config.overallTimeout / 60)}m
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              <Box display="flex" gap={2} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  onClick={() => setConfig({
                    batchSize: 2,
                    nodeTimeout: 3,
                    batchTimeout: 30,
                    overallTimeout: 120,
                    maxConcurrent: 4,
                  })}
                  disabled={testing}
                >
                  重置为保守设置
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setConfig({
                    batchSize: 4,
                    nodeTimeout: 5,
                    batchTimeout: 60,
                    overallTimeout: 300,
                    maxConcurrent: 8,
                  })}
                  disabled={testing}
                >
                  平衡设置
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setConfig({
                    batchSize: 6,
                    nodeTimeout: 8,
                    batchTimeout: 120,
                    overallTimeout: 600,
                    maxConcurrent: 12,
                  })}
                  disabled={testing}
                >
                  快速设置
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Save />}
                  onClick={() => {
                    setShowConfig(false);
                    showNotice('success', '参数配置已保存', 2000);
                  }}
                  disabled={testing}
                >
                  保存配置
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* 进度显示 */}
        {progress && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                📊 测速进度
              </Typography>
              
              {/* 批次信息 */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="body1" color="primary" fontWeight="bold">
                  {progress.current_node}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  状态: {progress.current_profile}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  批次: {progress.current_batch} / {progress.total_batches} | 
                  已完成: {progress.completed} / {progress.total} 个节点 ({progress.percentage.toFixed(1)}%)
                </Typography>
                
                {/* 统计信息 */}
                <Box display="flex" gap={2} sx={{ mt: 1 }}>
                  <Typography variant="body2" sx={{ color: 'success.main' }}>
                    ✅ 成功: {progress.successful_tests}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'error.main' }}>
                    ❌ 失败: {progress.failed_tests}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'info.main' }}>
                    🔄 测试中: {currentTestingNodes.size}
                  </Typography>
                </Box>
                
                {/* 预估剩余时间 */}
                {progress.estimated_remaining_seconds > 0 && (
                  <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
                    预估剩余时间: {
                      progress.estimated_remaining_seconds > 60 
                        ? `约 ${Math.ceil(progress.estimated_remaining_seconds / 60)} 分钟`
                        : `约 ${progress.estimated_remaining_seconds} 秒`
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

        {/* 实时测试状态 */}
        {testing && (currentTestingNodes.size > 0 || recentTests.length > 0) && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🔄 实时测试状态
              </Typography>
              
              {/* 当前测试中的节点 */}
              {currentTestingNodes.size > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    正在测试的节点:
                  </Typography>
                  <Box display="flex" gap={1} flexWrap="wrap">
                    {Array.from(currentTestingNodes).map((nodeName) => (
                      <Chip
                        key={nodeName}
                        label={nodeName}
                        size="small"
                        color="primary"
                        variant="outlined"
                        icon={<Timer />}
                      />
                    ))}
                  </Box>
                </Box>
              )}
              
              {/* 最近测试结果 */}
              {recentTests.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    最近测试结果:
                  </Typography>
                  <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                    {recentTests.slice(0, 10).map((test, index) => (
                      <Box 
                        key={`${test.node_name}-${index}`}
                        sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          py: 0.5,
                          px: 1,
                          borderRadius: 1,
                          bgcolor: test.status === 'success' ? 'success.light' : 
                                  test.status === 'failed' ? 'error.light' : 'info.light',
                          mb: 0.5
                        }}
                      >
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2" fontWeight="bold">
                            {test.node_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ({test.profile_name})
                          </Typography>
                        </Box>
                        <Box display="flex" alignItems="center" gap={1}>
                          {test.status === 'success' && test.latency_ms && (
                            <Typography variant="caption" sx={{ color: 'success.dark' }}>
                              {test.latency_ms}ms
                            </Typography>
                          )}
                          {test.status === 'failed' && test.error_message && (
                            <Typography variant="caption" sx={{ color: 'error.dark' }}>
                              {test.error_message}
                            </Typography>
                          )}
                          <Chip
                            label={test.status === 'success' ? '成功' : 
                                  test.status === 'failed' ? '失败' : '测试中'}
                            size="small"
                            color={test.status === 'success' ? 'success' : 
                                  test.status === 'failed' ? 'error' : 'primary'}
                            variant="outlined"
                          />
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        )}

        {/* 滚动排行（恢复） */}
        {summary && summary.top_10_nodes.length > 0 && (
          <Card sx={{ mb: 2, overflow: 'hidden' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                whiteSpace: 'nowrap',
                py: 1,
                px: 2,
                animation: 'scrollLeft 25s linear infinite',
                '@keyframes scrollLeft': {
                  '0%': { transform: 'translateX(0)' },
                  '100%': { transform: 'translateX(-50%)' },
                },
              }}
            >
              {[...summary.top_10_nodes, ...summary.top_10_nodes].map((node, idx) => (
                <Box key={`${node.profile_uid}-${node.node_name}-${idx}`} sx={{ display: 'inline-flex', alignItems: 'center', mr: 3 }}>
                  <Star sx={{ color: idx % summary.top_10_nodes.length === 0 ? '#ffd700' : 'primary.main', fontSize: 18, mr: 0.5 }} />
                  <Typography variant="body2" sx={{ fontWeight: 'bold', mr: 1 }}>
                    {node.node_name}
                  </Typography>
                  <Chip size="small" label={formatLatency(node.latency)} sx={{ mr: 1, borderColor: getLatencyColor(node.latency), color: getLatencyColor(node.latency) }} variant="outlined" />
                  <Chip size="small" label={`${node.score.toFixed(1)}分`} sx={{ borderColor: getQualityColor(node.score), color: getQualityColor(node.score) }} variant="outlined" />
                </Box>
              ))}
            </Box>
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
                      <span style={{ color: getLatencyColor(summary.best_node.latency), fontWeight: 'bold' }}>
                        延迟: {formatLatency(summary.best_node.latency)}
                      </span> | 
                      <span style={{ color: getQualityColor(summary.best_node.score), fontWeight: 'bold' }}>
                        评分: {summary.best_node.score.toFixed(1)}分
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
                      <strong>节点评分:</strong>
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
                      <TableCell>评分</TableCell>
                      <TableCell>剩余流量</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>操作</TableCell>
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
                              color: getLatencyColor(result.latency),
                              fontWeight: 'bold'
                            }}
                          >
                            {formatLatency(result.latency)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: getQualityColor(result.score),
                                mr: 1,
                              }}
                            />
                            {result.score.toFixed(1)}
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
                            label={result.is_available ? '可用' : '不可用'} 
                            size="small" 
                            color={result.is_available ? 'success' : 'error'}
                          />
                        </TableCell>
                        <TableCell>
                          <Box display="flex" gap={1}>
                            <Tooltip title="切换到此节点">
                              <IconButton
                                size="small"
                                onClick={() => handleSwitchToNode(result)}
                                disabled={!result.is_available || testing}
                                color="primary"
                              >
                                <Speed />
                              </IconButton>
                            </Tooltip>
                            {index === 0 && (
                              <Tooltip title="最佳节点">
                                <Star sx={{ color: '#ffd700', fontSize: 20 }} />
                              </Tooltip>
                            )}
                          </Box>
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
