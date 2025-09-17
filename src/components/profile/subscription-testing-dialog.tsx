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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tab,
  Tabs,
  Paper,
  LinearProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from "@mui/material";
import {
  PlayArrow,
  Speed,
  NetworkCheck,
  TrendingUp,
  ExpandMore,
  Refresh,
  Assessment,
  Timeline,
  Grade,
  Warning,
  CheckCircle,
  Error,
  Info,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import {
  testSubscription,
  testAllSubscriptions,
  quickConnectivityTest,
  getNodeQualityRanking,
  getOptimizationSuggestions,
  type TestType,
  type SubscriptionTestResult,
  type BatchTestResult,
  type NodeTestResult,
  type TestConfig,
} from "@/services/cmds";
import { getProfiles } from "@/services/cmds";

interface SubscriptionTestingDialogProps {
  open: boolean;
  onClose: () => void;
  initialSubscriptionUid?: string;
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
      id={`testing-tabpanel-${index}`}
      aria-labelledby={`testing-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const SubscriptionTestingDialog: React.FC<SubscriptionTestingDialogProps> = ({
  open,
  onClose,
  initialSubscriptionUid,
}) => {
  const { t } = useTranslation();
  
  // 状态管理
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // 测试配置
  const [selectedSubscription, setSelectedSubscription] = useState<string>(
    initialSubscriptionUid || ""
  );
  const [testType, setTestType] = useState<TestType>("Connectivity");
  
  // 数据状态
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [singleTestResult, setSingleTestResult] = useState<SubscriptionTestResult | null>(null);
  const [batchTestResult, setBatchTestResult] = useState<BatchTestResult | null>(null);
  const [qualityRanking, setQualityRanking] = useState<NodeTestResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // 状态图标映射
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Pass":
        return <CheckCircle color="success" />;
      case "Warning":
        return <Warning color="warning" />;
      case "Fail":
        return <Error color="error" />;
      case "Timeout":
        return <Info color="disabled" />;
      default:
        return <Info color="disabled" />;
    }
  };

  // 质量等级颜色
  const getQualityColor = (grade: string) => {
    switch (grade) {
      case "Excellent":
        return "success";
      case "Good":
        return "info";
      case "Fair":
        return "warning";
      case "Poor":
        return "error";
      case "VeryPoor":
        return "error";
      default:
        return "default";
    }
  };

  // 质量等级文本
  const getQualityText = (grade: string) => {
    switch (grade) {
      case "Excellent":
        return "优秀";
      case "Good":
        return "良好";
      case "Fair":
        return "一般";
      case "Poor":
        return "较差";
      case "VeryPoor":
        return "很差";
      default:
        return grade;
    }
  };

  // 测试类型文本
  const getTestTypeText = (type: TestType) => {
    switch (type) {
      case "Connectivity":
        return "连通性测试";
      case "Latency":
        return "延迟测试";
      case "Speed":
        return "速度测试";
      case "Stability":
        return "稳定性测试";
      case "Comprehensive":
        return "综合测试";
      default:
        return type;
    }
  };

  // 加载订阅列表
  const loadSubscriptions = async () => {
    try {
      const profilesData = await getProfiles();
      const remoteSubscriptions = profilesData?.items?.filter(
        (item: any) => item.type === "remote"
      ) || [];
      setSubscriptions(remoteSubscriptions);
      
      if (!selectedSubscription && remoteSubscriptions.length > 0) {
        setSelectedSubscription(remoteSubscriptions[0].uid);
      }
    } catch (error) {
      console.error("加载订阅列表失败:", error);
    }
  };

  // 执行单个订阅测试
  const handleTestSubscription = async () => {
    if (!selectedSubscription) return;
    
    setLoading(true);
    setProgress(30);
    
    try {
      const result = await testSubscription(selectedSubscription, testType);
      setSingleTestResult(result);
      setProgress(100);
    } catch (error) {
      console.error("测试失败:", error);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // 执行批量测试
  const handleBatchTest = async () => {
    setLoading(true);
    setProgress(20);
    
    try {
      const result = await testAllSubscriptions(testType);
      setBatchTestResult(result);
      setProgress(100);
    } catch (error) {
      console.error("批量测试失败:", error);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // 快速连通性测试
  const handleQuickTest = async () => {
    if (!selectedSubscription) return;
    
    setLoading(true);
    setProgress(30);
    
    try {
      const results = await quickConnectivityTest(selectedSubscription);
      // 创建一个简化的测试结果
      const quickResult: SubscriptionTestResult = {
        subscription_uid: selectedSubscription,
        subscription_name: subscriptions.find(s => s.uid === selectedSubscription)?.name || "Unknown",
        test_type: "Connectivity",
        overall_status: results.some(r => r.status === "Pass") ? "Pass" : "Fail",
        total_nodes: results.length,
        passed_nodes: results.filter(r => r.status === "Pass").length,
        failed_nodes: results.filter(r => r.status === "Fail").length,
        warning_nodes: results.filter(r => r.status === "Warning").length,
        quality_grade: "Fair",
        node_results: results,
        recommendations: [],
        test_duration_ms: 0,
        test_time: Date.now() / 1000,
      };
      setSingleTestResult(quickResult);
      setProgress(100);
    } catch (error) {
      console.error("快速测试失败:", error);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // 获取质量排名
  const handleGetQualityRanking = async () => {
    if (!selectedSubscription) return;
    
    setLoading(true);
    
    try {
      const ranking = await getNodeQualityRanking(selectedSubscription, 10);
      setQualityRanking(ranking);
    } catch (error) {
      console.error("获取质量排名失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 获取优化建议
  const handleGetSuggestions = async () => {
    if (!selectedSubscription) return;
    
    setLoading(true);
    
    try {
      const suggestions = await getOptimizationSuggestions(selectedSubscription);
      setSuggestions(suggestions);
    } catch (error) {
      console.error("获取优化建议失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时加载数据
  useEffect(() => {
    if (open) {
      loadSubscriptions();
    }
  }, [open]);

  // 渲染测试控制面板
  const renderTestControls = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        测试配置
      </Typography>
      
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>选择订阅</InputLabel>
            <Select
              value={selectedSubscription}
              onChange={(e) => setSelectedSubscription(e.target.value)}
              label="选择订阅"
            >
              {subscriptions.map((sub) => (
                <MenuItem key={sub.uid} value={sub.uid}>
                  {sub.name || "未命名订阅"}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>测试类型</InputLabel>
            <Select
              value={testType}
              onChange={(e) => setTestType(e.target.value as TestType)}
              label="测试类型"
            >
              <MenuItem value="Connectivity">连通性测试</MenuItem>
              <MenuItem value="Latency">延迟测试</MenuItem>
              <MenuItem value="Speed">速度测试</MenuItem>
              <MenuItem value="Stability">稳定性测试</MenuItem>
              <MenuItem value="Comprehensive">综合测试</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Box display="flex" gap={2} flexWrap="wrap">
        <Button
          variant="contained"
          startIcon={<PlayArrow />}
          onClick={handleTestSubscription}
          disabled={!selectedSubscription || loading}
        >
          开始测试
        </Button>
        <Button
          variant="outlined"
          startIcon={<NetworkCheck />}
          onClick={handleQuickTest}
          disabled={!selectedSubscription || loading}
        >
          快速连通性测试
        </Button>
        <Button
          variant="outlined"
          startIcon={<Assessment />}
          onClick={handleBatchTest}
          disabled={loading}
        >
          批量测试所有订阅
        </Button>
        <Button
          variant="outlined"
          startIcon={<Grade />}
          onClick={handleGetQualityRanking}
          disabled={!selectedSubscription || loading}
        >
          质量排名
        </Button>
        <Button
          variant="outlined"
          startIcon={<Timeline />}
          onClick={handleGetSuggestions}
          disabled={!selectedSubscription || loading}
        >
          优化建议
        </Button>
      </Box>

      {loading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant={progress > 0 ? "determinate" : "indeterminate"} value={progress} />
          <Typography variant="body2" align="center" sx={{ mt: 1 }}>
            正在执行测试...
          </Typography>
        </Box>
      )}
    </Box>
  );

  // 渲染单个测试结果
  const renderSingleTestResult = () => (
    <Box>
      {singleTestResult ? (
        <Box>
          <Typography variant="h6" gutterBottom>
            测试结果 - {singleTestResult.subscription_name}
          </Typography>
          
          {/* 概览信息 */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="text.secondary" gutterBottom>
                    总节点数
                  </Typography>
                  <Typography variant="h4">
                    {singleTestResult.total_nodes}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="success.main" gutterBottom>
                    通过节点
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {singleTestResult.passed_nodes}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="warning.main" gutterBottom>
                    警告节点
                  </Typography>
                  <Typography variant="h4" color="warning.main">
                    {singleTestResult.warning_nodes}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="error.main" gutterBottom>
                    失败节点
                  </Typography>
                  <Typography variant="h4" color="error.main">
                    {singleTestResult.failed_nodes}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* 性能指标 */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {singleTestResult.avg_latency_ms && (
              <Grid item xs={12} sm={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      平均延迟
                    </Typography>
                    <Typography variant="h5">
                      {singleTestResult.avg_latency_ms.toFixed(0)}ms
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
            {singleTestResult.avg_download_speed_mbps && (
              <Grid item xs={12} sm={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      平均下载速度
                    </Typography>
                    <Typography variant="h5">
                      {singleTestResult.avg_download_speed_mbps.toFixed(1)} Mbps
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
            {singleTestResult.overall_stability_score && (
              <Grid item xs={12} sm={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      稳定性评分
                    </Typography>
                    <Typography variant="h5">
                      {singleTestResult.overall_stability_score}/100
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>

          {/* 质量等级 */}
          <Box display="flex" alignItems="center" gap={2} sx={{ mb: 3 }}>
            <Typography variant="h6">质量等级:</Typography>
            <Chip 
              label={getQualityText(singleTestResult.quality_grade)} 
              color={getQualityColor(singleTestResult.quality_grade) as any}
              size="large"
            />
          </Box>

          {/* 节点详细结果 */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">节点详细结果 ({singleTestResult.node_results.length})</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>状态</TableCell>
                      <TableCell>节点名称</TableCell>
                      <TableCell>类型</TableCell>
                      <TableCell>服务器</TableCell>
                      <TableCell>延迟</TableCell>
                      <TableCell>下载速度</TableCell>
                      <TableCell>错误信息</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {singleTestResult.node_results.map((node, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {getStatusIcon(node.status)}
                        </TableCell>
                        <TableCell>{node.node_name}</TableCell>
                        <TableCell>{node.node_type}</TableCell>
                        <TableCell>{node.server}:{node.port}</TableCell>
                        <TableCell>
                          {node.latency_ms ? `${node.latency_ms}ms` : "N/A"}
                        </TableCell>
                        <TableCell>
                          {node.download_speed_mbps ? `${node.download_speed_mbps.toFixed(1)} Mbps` : "N/A"}
                        </TableCell>
                        <TableCell>
                          {node.error_message && (
                            <Typography variant="body2" color="error">
                              {node.error_message}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>

          {/* 建议 */}
          {singleTestResult.recommendations.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" gutterBottom>
                优化建议
              </Typography>
              <List>
                {singleTestResult.recommendations.map((suggestion, index) => (
                  <ListItem key={index}>
                    <ListItemText primary={suggestion} />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography color="text.secondary">
            请先执行测试以查看结果
          </Typography>
        </Paper>
      )}
    </Box>
  );

  // 渲染批量测试结果
  const renderBatchTestResult = () => (
    <Box>
      {batchTestResult ? (
        <Box>
          <Typography variant="h6" gutterBottom>
            批量测试结果
          </Typography>
          
          {/* 测试摘要 */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="text.secondary" gutterBottom>
                    总订阅数
                  </Typography>
                  <Typography variant="h4">
                    {batchTestResult.total_subscriptions}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="success.main" gutterBottom>
                    完成测试
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {batchTestResult.completed_subscriptions}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="info.main" gutterBottom>
                    总节点数
                  </Typography>
                  <Typography variant="h4" color="info.main">
                    {batchTestResult.summary.total_nodes}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="success.main" gutterBottom>
                    可用节点
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {batchTestResult.summary.working_nodes}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* 订阅结果列表 */}
          <Typography variant="h6" gutterBottom>
            订阅详细结果
          </Typography>
          <List>
            {batchTestResult.results.map((result) => (
              <ListItem key={result.subscription_uid}>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={2}>
                      <Typography variant="subtitle1">
                        {result.subscription_name}
                      </Typography>
                      <Chip 
                        label={getQualityText(result.quality_grade)} 
                        color={getQualityColor(result.quality_grade) as any}
                        size="small"
                      />
                      {getStatusIcon(result.overall_status)}
                    </Box>
                  }
                  secondary={
                    <Typography variant="body2" color="text.secondary">
                      节点: {result.total_nodes} | 
                      通过: {result.passed_nodes} | 
                      失败: {result.failed_nodes} |
                      平均延迟: {result.avg_latency_ms ? `${result.avg_latency_ms.toFixed(0)}ms` : "N/A"}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography color="text.secondary">
            请先执行批量测试以查看结果
          </Typography>
        </Paper>
      )}
    </Box>
  );

  // 渲染质量排名和建议
  const renderAnalysis = () => (
    <Box>
      {/* 质量排名 */}
      {qualityRanking.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            节点质量排名 (Top {qualityRanking.length})
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>排名</TableCell>
                  <TableCell>节点名称</TableCell>
                  <TableCell>延迟</TableCell>
                  <TableCell>下载速度</TableCell>
                  <TableCell>稳定性</TableCell>
                  <TableCell>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {qualityRanking.map((node, index) => (
                  <TableRow key={index}>
                    <TableCell>#{index + 1}</TableCell>
                    <TableCell>{node.node_name}</TableCell>
                    <TableCell>
                      {node.latency_ms ? `${node.latency_ms}ms` : "N/A"}
                    </TableCell>
                    <TableCell>
                      {node.download_speed_mbps ? `${node.download_speed_mbps.toFixed(1)} Mbps` : "N/A"}
                    </TableCell>
                    <TableCell>
                      {node.stability_score ? `${node.stability_score}/100` : "N/A"}
                    </TableCell>
                    <TableCell>
                      {getStatusIcon(node.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* 优化建议 */}
      {suggestions.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            优化建议
          </Typography>
          <List>
            {suggestions.map((suggestion, index) => (
              <ListItem key={index}>
                <ListItemText 
                  primary={suggestion}
                  sx={{ 
                    "& .MuiListItemText-primary": {
                      fontWeight: "medium"
                    }
                  }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {qualityRanking.length === 0 && suggestions.length === 0 && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography color="text.secondary">
            请先获取质量排名或优化建议
          </Typography>
        </Paper>
      )}
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={2}>
          <Speed />
          <Typography variant="h6">订阅测试工具</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs 
            value={currentTab} 
            onChange={(_, newValue) => setCurrentTab(newValue)}
            aria-label="测试工具标签"
          >
            <Tab label="测试配置" />
            <Tab label="单个测试结果" />
            <Tab label="批量测试结果" />
            <Tab label="分析与建议" />
          </Tabs>
        </Box>

        <TabPanel value={currentTab} index={0}>
          {renderTestControls()}
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          {renderSingleTestResult()}
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          {renderBatchTestResult()}
        </TabPanel>

        <TabPanel value={currentTab} index={3}>
          {renderAnalysis()}
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          关闭
        </Button>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={() => {
            setSingleTestResult(null);
            setBatchTestResult(null);
            setQualityRanking([]);
            setSuggestions([]);
          }}
        >
          清除结果
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SubscriptionTestingDialog;
