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
  TextField,
  Switch,
  FormControlLabel,
} from "@mui/material";
import {
  BarChart,
  Timeline,
  DataUsage,
  Warning,
  CheckCircle,
  Error,
  CloudDownload,
  CloudUpload,
  Speed,
  Schedule,
  ExpandMore,
  Refresh,
  GetApp,
  Settings,
  NotificationsActive,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

// 模拟数据接口 - 等待后端集成
interface TrafficRecord {
  subscription_uid: string;
  subscription_name: string;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  session_duration_seconds: number;
  start_time: number;
  end_time: number;
  avg_speed_mbps: number;
  peak_speed_mbps: number;
}

interface SubscriptionTrafficStats {
  subscription_uid: string;
  subscription_name: string;
  total_upload_bytes: number;
  total_download_bytes: number;
  total_bytes: number;
  session_count: number;
  total_duration_seconds: number;
  avg_speed_mbps: number;
  peak_speed_mbps: number;
  first_used?: number;
  last_used?: number;
  daily_usage: DailyUsage[];
  monthly_usage: MonthlyUsage[];
  quota_info?: QuotaInfo;
}

interface DailyUsage {
  date: string;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  session_count: number;
  duration_seconds: number;
}

interface MonthlyUsage {
  month: string;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  session_count: number;
  duration_seconds: number;
}

interface QuotaInfo {
  total_quota_bytes?: number;
  used_quota_bytes: number;
  remaining_quota_bytes?: number;
  quota_reset_date?: number;
  expire_date?: number;
  warning_threshold: number;
  is_unlimited: boolean;
}

interface TrafficAlert {
  alert_id: string;
  subscription_uid: string;
  subscription_name: string;
  alert_type: "QuotaUsage" | "ExpirationDate" | "HighUsage" | "SpeedDrop" | "ConnectionIssue";
  message: string;
  threshold_value: number;
  current_value: number;
  created_at: number;
  is_read: boolean;
  severity: "Info" | "Warning" | "Critical" | "Emergency";
}

interface TrafficOverview {
  total_subscriptions: number;
  active_subscriptions: number;
  total_upload_bytes: number;
  total_download_bytes: number;
  total_bytes: number;
  avg_speed_mbps: number;
  peak_speed_mbps: number;
  total_sessions: number;
  total_duration_seconds: number;
  today_usage: number;
  this_month_usage: number;
  alerts_count: number;
  critical_alerts_count: number;
}

interface TrafficStatsDialogProps {
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
      id={`traffic-stats-tabpanel-${index}`}
      aria-labelledby={`traffic-stats-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const TrafficStatsDialog: React.FC<TrafficStatsDialogProps> = ({
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  
  // 状态管理
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 数据状态
  const [overview, setOverview] = useState<TrafficOverview | null>(null);
  const [subscriptionStats, setSubscriptionStats] = useState<SubscriptionTrafficStats[]>([]);
  const [alerts, setAlerts] = useState<TrafficAlert[]>([]);
  const [selectedSubscription, setSelectedSubscription] = useState<string>("");

  // 格式化字节数
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // 格式化时间
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时`;
    return `${Math.floor(seconds / 86400)}天`;
  };

  // 格式化日期
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  // 获取警告图标
  const getAlertIcon = (severity: string) => {
    switch (severity) {
      case "Critical":
      case "Emergency":
        return <Error color="error" />;
      case "Warning":
        return <Warning color="warning" />;
      default:
        return <CheckCircle color="info" />;
    }
  };

  // 获取警告颜色
  const getAlertColor = (severity: string) => {
    switch (severity) {
      case "Critical":
      case "Emergency":
        return "error";
      case "Warning":
        return "warning";
      default:
        return "info";
    }
  };

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      // TODO: 调用实际的API
      // const [overviewData, statsData, alertsData] = await Promise.all([
      //   getTrafficOverview(),
      //   getAllTrafficStats(),
      //   getTrafficAlerts(),
      // ]);

      // 模拟数据
      const mockOverview: TrafficOverview = {
        total_subscriptions: 5,
        active_subscriptions: 3,
        total_upload_bytes: 2 * 1024 * 1024 * 1024, // 2GB
        total_download_bytes: 15 * 1024 * 1024 * 1024, // 15GB
        total_bytes: 17 * 1024 * 1024 * 1024, // 17GB
        avg_speed_mbps: 25.6,
        peak_speed_mbps: 89.3,
        total_sessions: 156,
        total_duration_seconds: 48600, // 13.5小时
        today_usage: 1.2 * 1024 * 1024 * 1024, // 1.2GB
        this_month_usage: 12 * 1024 * 1024 * 1024, // 12GB
        alerts_count: 3,
        critical_alerts_count: 1,
      };

      const mockStats: SubscriptionTrafficStats[] = [
        {
          subscription_uid: "sub1",
          subscription_name: "高速节点-美国",
          total_upload_bytes: 512 * 1024 * 1024,
          total_download_bytes: 6 * 1024 * 1024 * 1024,
          total_bytes: 6.5 * 1024 * 1024 * 1024,
          session_count: 45,
          total_duration_seconds: 18000,
          avg_speed_mbps: 35.2,
          peak_speed_mbps: 89.3,
          first_used: Date.now() / 1000 - 30 * 24 * 3600,
          last_used: Date.now() / 1000 - 3600,
          daily_usage: [],
          monthly_usage: [],
          quota_info: {
            total_quota_bytes: 100 * 1024 * 1024 * 1024, // 100GB
            used_quota_bytes: 6.5 * 1024 * 1024 * 1024,
            remaining_quota_bytes: 93.5 * 1024 * 1024 * 1024,
            quota_reset_date: Date.now() / 1000 + 15 * 24 * 3600,
            expire_date: Date.now() / 1000 + 25 * 24 * 3600,
            warning_threshold: 0.8,
            is_unlimited: false,
          },
        },
        {
          subscription_uid: "sub2",
          subscription_name: "稳定节点-日本",
          total_upload_bytes: 256 * 1024 * 1024,
          total_download_bytes: 4 * 1024 * 1024 * 1024,
          total_bytes: 4.25 * 1024 * 1024 * 1024,
          session_count: 32,
          total_duration_seconds: 12600,
          avg_speed_mbps: 28.7,
          peak_speed_mbps: 65.1,
          first_used: Date.now() / 1000 - 20 * 24 * 3600,
          last_used: Date.now() / 1000 - 7200,
          daily_usage: [],
          monthly_usage: [],
          quota_info: {
            total_quota_bytes: 50 * 1024 * 1024 * 1024,
            used_quota_bytes: 4.25 * 1024 * 1024 * 1024,
            remaining_quota_bytes: 45.75 * 1024 * 1024 * 1024,
            quota_reset_date: Date.now() / 1000 + 20 * 24 * 3600,
            expire_date: Date.now() / 1000 + 35 * 24 * 3600,
            warning_threshold: 0.8,
            is_unlimited: false,
          },
        },
      ];

      const mockAlerts: TrafficAlert[] = [
        {
          alert_id: "alert1",
          subscription_uid: "sub2",
          subscription_name: "稳定节点-日本",
          alert_type: "QuotaUsage",
          message: "配额使用已达到 85%",
          threshold_value: 0.8,
          current_value: 0.85,
          created_at: Date.now() / 1000 - 3600,
          is_read: false,
          severity: "Warning",
        },
        {
          alert_id: "alert2",
          subscription_uid: "sub1",
          subscription_name: "高速节点-美国",
          alert_type: "ExpirationDate",
          message: "订阅将在 25 天后到期",
          threshold_value: 30,
          current_value: 25,
          created_at: Date.now() / 1000 - 7200,
          is_read: false,
          severity: "Info",
        },
      ];

      setOverview(mockOverview);
      setSubscriptionStats(mockStats);
      setAlerts(mockAlerts);
      
      if (mockStats.length > 0) {
        setSelectedSubscription(mockStats[0].subscription_uid);
      }
    } catch (error) {
      console.error("加载流量统计数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时加载数据
  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  // 渲染概览面板
  const renderOverview = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        流量统计概览
      </Typography>
      
      {overview && (
        <>
          {/* 主要指标卡片 */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="text.secondary" gutterBottom>
                    总订阅数
                  </Typography>
                  <Typography variant="h4">
                    {overview.total_subscriptions}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="success.main" gutterBottom>
                    活跃订阅
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {overview.active_subscriptions}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="info.main" gutterBottom>
                    总使用量
                  </Typography>
                  <Typography variant="h4" color="info.main">
                    {formatBytes(overview.total_bytes)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={6} sm={3}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography color="warning.main" gutterBottom>
                    警告数量
                  </Typography>
                  <Typography variant="h4" color="warning.main">
                    {overview.alerts_count}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* 流量详情 */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid xs={12} sm={4}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} sx={{ mb: 1 }}>
                    <CloudUpload color="primary" />
                    <Typography variant="h6">上传流量</Typography>
                  </Box>
                  <Typography variant="h5">
                    {formatBytes(overview.total_upload_bytes)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    总会话数: {overview.total_sessions}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={12} sm={4}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} sx={{ mb: 1 }}>
                    <CloudDownload color="primary" />
                    <Typography variant="h6">下载流量</Typography>
                  </Box>
                  <Typography variant="h5">
                    {formatBytes(overview.total_download_bytes)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    总时长: {formatDuration(overview.total_duration_seconds)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={12} sm={4}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} sx={{ mb: 1 }}>
                    <Speed color="primary" />
                    <Typography variant="h6">网络速度</Typography>
                  </Box>
                  <Typography variant="h5">
                    {overview.avg_speed_mbps.toFixed(1)} Mbps
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    峰值: {overview.peak_speed_mbps.toFixed(1)} Mbps
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* 今日和本月使用量 */}
          <Grid container spacing={2}>
            <Grid xs={12} sm={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    今日使用量
                  </Typography>
                  <Typography variant="h4" color="primary">
                    {formatBytes(overview.today_usage)}
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={(overview.today_usage / overview.total_bytes) * 100} 
                    sx={{ mt: 1 }}
                  />
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={12} sm={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    本月使用量
                  </Typography>
                  <Typography variant="h4" color="secondary">
                    {formatBytes(overview.this_month_usage)}
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={(overview.this_month_usage / overview.total_bytes) * 100} 
                    color="secondary"
                    sx={{ mt: 1 }}
                  />
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}

      {/* 操作按钮 */}
      <Box display="flex" gap={2} sx={{ mt: 3 }}>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={loadData}
          disabled={loading}
        >
          刷新数据
        </Button>
        <Button
          variant="outlined"
          startIcon={<GetApp />}
          onClick={() => {/* TODO: 导出数据 */}}
        >
          导出数据
        </Button>
        <Button
          variant="outlined"
          startIcon={<Settings />}
          onClick={() => {/* TODO: 打开设置 */}}
        >
          统计设置
        </Button>
      </Box>
    </Box>
  );

  // 渲染订阅详情
  const renderSubscriptionDetails = () => (
    <Box>
      <Box display="flex" justifyContent="between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          订阅流量详情
        </Typography>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>选择订阅</InputLabel>
          <Select
            value={selectedSubscription}
            onChange={(e) => setSelectedSubscription(e.target.value)}
            label="选择订阅"
          >
            {subscriptionStats.map((stats) => (
              <MenuItem key={stats.subscription_uid} value={stats.subscription_uid}>
                {stats.subscription_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {selectedSubscription && (() => {
        const stats = subscriptionStats.find(s => s.subscription_uid === selectedSubscription);
        if (!stats) return null;

        return (
          <Box>
            {/* 订阅统计卡片 */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid xs={12} sm={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      使用统计
                    </Typography>
                    <Box display="flex" justifyContent="between" sx={{ mb: 1 }}>
                      <Typography>总使用量:</Typography>
                      <Typography variant="h6">{formatBytes(stats.total_bytes)}</Typography>
                    </Box>
                    <Box display="flex" justifyContent="between" sx={{ mb: 1 }}>
                      <Typography>会话次数:</Typography>
                      <Typography>{stats.session_count}</Typography>
                    </Box>
                    <Box display="flex" justifyContent="between" sx={{ mb: 1 }}>
                      <Typography>平均速度:</Typography>
                      <Typography>{stats.avg_speed_mbps.toFixed(1)} Mbps</Typography>
                    </Box>
                    <Box display="flex" justifyContent="between">
                      <Typography>使用时长:</Typography>
                      <Typography>{formatDuration(stats.total_duration_seconds)}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {stats.quota_info && (
                <Grid xs={12} sm={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        配额信息
                      </Typography>
                      {stats.quota_info.total_quota_bytes ? (
                        <>
                          <Box display="flex" justifyContent="between" sx={{ mb: 1 }}>
                            <Typography>总配额:</Typography>
                            <Typography>{formatBytes(stats.quota_info.total_quota_bytes)}</Typography>
                          </Box>
                          <Box display="flex" justifyContent="between" sx={{ mb: 1 }}>
                            <Typography>已使用:</Typography>
                            <Typography>{formatBytes(stats.quota_info.used_quota_bytes)}</Typography>
                          </Box>
                          <Box display="flex" justifyContent="between" sx={{ mb: 2 }}>
                            <Typography>剩余:</Typography>
                            <Typography>{formatBytes(stats.quota_info.remaining_quota_bytes || 0)}</Typography>
                          </Box>
                          <LinearProgress 
                            variant="determinate" 
                            value={(stats.quota_info.used_quota_bytes / stats.quota_info.total_quota_bytes) * 100}
                            color={
                              (stats.quota_info.used_quota_bytes / stats.quota_info.total_quota_bytes) > 0.8 
                                ? "error" 
                                : "primary"
                            }
                          />
                          {stats.quota_info.expire_date && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                              到期时间: {formatDate(stats.quota_info.expire_date)}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography color="success.main">
                          无限制套餐
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              )}
            </Grid>

            {/* 使用历史 */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="h6">使用历史详情</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary">
                  首次使用: {stats.first_used ? formatDate(stats.first_used) : "未知"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  最近使用: {stats.last_used ? formatDate(stats.last_used) : "未知"}
                </Typography>
                
                {/* TODO: 添加图表组件显示使用趋势 */}
                <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
                  <BarChart sx={{ fontSize: 48, color: "text.secondary" }} />
                  <Typography color="text.secondary">
                    使用趋势图表 (开发中)
                  </Typography>
                </Paper>
              </AccordionDetails>
            </Accordion>
          </Box>
        );
      })()}
    </Box>
  );

  // 渲染警告面板
  const renderAlerts = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        流量警告 ({alerts.filter(a => !a.is_read).length} 条未读)
      </Typography>

      {alerts.length > 0 ? (
        <List>
          {alerts.map((alert) => (
            <React.Fragment key={alert.alert_id}>
              <ListItem>
                <Box display="flex" alignItems="center" gap={2} sx={{ flex: 1 }}>
                  {getAlertIcon(alert.severity)}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1">
                      {alert.subscription_name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {alert.message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(alert.created_at * 1000).toLocaleString()}
                    </Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Chip 
                      label={alert.severity} 
                      color={getAlertColor(alert.severity) as any}
                      size="small"
                    />
                    {!alert.is_read && (
                      <Chip 
                        label="未读" 
                        color="primary"
                        size="small"
                      />
                    )}
                  </Box>
                </Box>
              </ListItem>
            </React.Fragment>
          ))}
        </List>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <NotificationsActive sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
          <Typography color="text.secondary">
            暂无流量警告
          </Typography>
        </Paper>
      )}

      <Box display="flex" gap={2} sx={{ mt: 2 }}>
        <Button
          variant="outlined"
          onClick={() => {/* TODO: 标记所有为已读 */}}
          disabled={alerts.filter(a => !a.is_read).length === 0}
        >
          全部标记为已读
        </Button>
        <Button
          variant="outlined"
          onClick={() => {/* TODO: 清理已读警告 */}}
        >
          清理已读警告
        </Button>
      </Box>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={2}>
          <DataUsage />
          <Typography variant="h6">流量统计面板</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs 
            value={currentTab} 
            onChange={(_, newValue) => setCurrentTab(newValue)}
            aria-label="流量统计标签"
          >
            <Tab label="总览" />
            <Tab label="订阅详情" />
            <Tab label="警告中心" />
          </Tabs>
        </Box>

        {loading && <LinearProgress sx={{ mb: 2 }} />}

        <TabPanel value={currentTab} index={0}>
          {renderOverview()}
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          {renderSubscriptionDetails()}
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          {renderAlerts()}
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

export default TrafficStatsDialog;
