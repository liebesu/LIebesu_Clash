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
  Grid2 as Grid,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  FormControlLabel,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tab,
  Tabs,
  Paper,
  LinearProgress,
  Alert,
} from "@mui/material";
import {
  PlayArrow,
  Pause,
  Delete,
  Add,
  Edit,
  Schedule,
  TrendingUp,
  Assignment,
  Refresh,
  Settings,
  Error,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import {
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
  toggleTask,
  executeTaskImmediately,
  getTaskSystemOverview,
  createDefaultTasks,
  type TaskConfig,
  type TaskSystemOverview,
  type TaskExecutionResult,
} from "@/services/cmds";

interface TaskManagerDialogProps {
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
      id={`task-manager-tabpanel-${index}`}
      aria-labelledby={`task-manager-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const TaskManagerDialog: React.FC<TaskManagerDialogProps> = ({
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  
  // 状态管理
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 数据状态
  const [tasks, setTasks] = useState<TaskConfig[]>([]);
  const [overview, setOverview] = useState<TaskSystemOverview | null>(null);
  const [editingTask, setEditingTask] = useState<TaskConfig | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // 状态图标映射
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Active":
        return <PlayArrow color="success" />;
      case "Paused":
        return <Pause color="warning" />;
      case "Disabled":
        return <Pause color="disabled" />;
      case "Error":
        return <Error color="error" />;
      default:
        return <Schedule color="disabled" />;
    }
  };

  // 状态颜色映射
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "success";
      case "Paused":
        return "warning";
      case "Disabled":
        return "default";
      case "Error":
        return "error";
      default:
        return "default";
    }
  };

  // 任务类型文本映射
  const getTaskTypeText = (type: string) => {
    switch (type) {
      case "SubscriptionUpdate":
        return "订阅更新";
      case "HealthCheck":
        return "健康检查";
      case "AutoCleanup":
        return "自动清理";
      case "Custom":
        return "自定义任务";
      default:
        return type;
    }
  };

  // 格式化时间
  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return "未知";
    return new Date(timestamp * 1000).toLocaleString();
  };

  // 格式化间隔时间
  const formatInterval = (minutes: number) => {
    if (minutes < 60) return `${minutes}分钟`;
    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}小时`;
    return `${Math.floor(minutes / (24 * 60))}天`;
  };

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const [tasksData, overviewData] = await Promise.all([
        getAllTasks(),
        getTaskSystemOverview(),
      ]);
      setTasks(tasksData);
      setOverview(overviewData);
    } catch (error) {
      console.error("加载任务数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 切换任务状态
  const handleToggleTask = async (taskId: string, enabled: boolean) => {
    try {
      await toggleTask(taskId, enabled);
      await loadData(); // 重新加载数据
    } catch (error) {
      console.error("切换任务状态失败:", error);
    }
  };

  // 立即执行任务
  const handleExecuteTask = async (taskId: string) => {
    try {
      await executeTaskImmediately(taskId);
      await loadData(); // 重新加载数据
    } catch (error) {
      console.error("执行任务失败:", error);
    }
  };

  // 删除任务
  const handleDeleteTask = async (taskId: string) => {
    if (window.confirm("确定要删除这个任务吗？")) {
      try {
        await deleteTask(taskId);
        await loadData(); // 重新加载数据
      } catch (error) {
        console.error("删除任务失败:", error);
      }
    }
  };

  // 创建默认任务
  const handleCreateDefaultTasks = async () => {
    try {
      await createDefaultTasks();
      await loadData(); // 重新加载数据
    } catch (error) {
      console.error("创建默认任务失败:", error);
    }
  };

  // 组件挂载时加载数据
  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  // 渲染系统概览
  const renderOverview = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        系统概览
      </Typography>
      
      {overview && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: "center" }}>
                <Typography color="text.secondary" gutterBottom>
                  总任务数
                </Typography>
                <Typography variant="h4">
                  {overview.total_tasks}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: "center" }}>
                <Typography color="success.main" gutterBottom>
                  活跃任务
                </Typography>
                <Typography variant="h4" color="success.main">
                  {overview.active_tasks}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: "center" }}>
                <Typography color="warning.main" gutterBottom>
                  暂停任务
                </Typography>
                <Typography variant="h4" color="warning.main">
                  {overview.paused_tasks}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: "center" }}>
                <Typography color="error.main" gutterBottom>
                  错误任务
                </Typography>
                <Typography variant="h4" color="error.main">
                  {overview.error_tasks}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {overview?.next_execution && (
        <Alert severity="info" sx={{ mb: 2 }}>
          下次执行时间: {formatTimestamp(overview.next_execution)}
        </Alert>
      )}

      <Box display="flex" gap={2} sx={{ mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={handleCreateDefaultTasks}
        >
          创建默认任务
        </Button>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={loadData}
          disabled={loading}
        >
          刷新
        </Button>
      </Box>
    </Box>
  );

  // 渲染任务列表
  const renderTaskList = () => (
    <Box>
      <Box display="flex" justifyContent="between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          任务列表 ({tasks.length})
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setCreateDialogOpen(true)}
        >
          新建任务
        </Button>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <List>
        {tasks.map((task) => (
          <React.Fragment key={task.id}>
            <ListItem>
              <Box display="flex" alignItems="center" gap={2} sx={{ flex: 1 }}>
                {getStatusIcon(task.status)}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1">
                    {task.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    类型: {getTaskTypeText(task.task_type)} | 
                    间隔: {formatInterval(task.interval_minutes)} |
                    最后执行: {formatTimestamp(task.last_run)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {task.description}
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip 
                    label={task.status} 
                    color={getStatusColor(task.status) as any}
                    size="small"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={task.enabled}
                        onChange={(e) => handleToggleTask(task.id, e.target.checked)}
                      />
                    }
                    label="启用"
                  />
                </Box>
              </Box>
              <ListItemSecondaryAction>
                <Box display="flex" gap={1}>
                  <IconButton
                    size="small"
                    onClick={() => handleExecuteTask(task.id)}
                    title="立即执行"
                  >
                    <PlayArrow />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => setEditingTask(task)}
                    title="编辑"
                  >
                    <Edit />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteTask(task.id)}
                    title="删除"
                    color="error"
                  >
                    <Delete />
                  </IconButton>
                </Box>
              </ListItemSecondaryAction>
            </ListItem>
          </React.Fragment>
        ))}
      </List>

      {tasks.length === 0 && !loading && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography color="text.secondary">
            暂无任务，点击"新建任务"或"创建默认任务"开始
          </Typography>
        </Paper>
      )}
    </Box>
  );

  // 渲染执行历史
  const renderExecutionHistory = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        最近执行历史
      </Typography>
      
      {overview?.recent_executions && overview.recent_executions.length > 0 ? (
        <List>
          {overview.recent_executions.map((execution) => (
            <ListItem key={execution.execution_id}>
              <ListItemText
                primary={`任务 ${execution.task_id}`}
                secondary={
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      状态: {execution.status} | 
                      开始时间: {formatTimestamp(execution.start_time)} |
                      耗时: {execution.duration_ms}ms
                    </Typography>
                    {execution.message && (
                      <Typography variant="body2" color="text.secondary">
                        消息: {execution.message}
                      </Typography>
                    )}
                    {execution.error_details && (
                      <Typography variant="body2" color="error">
                        错误: {execution.error_details}
                      </Typography>
                    )}
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography color="text.secondary">
            暂无执行历史
          </Typography>
        </Paper>
      )}
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={2}>
          <Assignment />
          <Typography variant="h6">任务管理</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs 
            value={currentTab} 
            onChange={(_, newValue) => setCurrentTab(newValue)}
            aria-label="任务管理标签"
          >
            <Tab label="概览" />
            <Tab label="任务列表" />
            <Tab label="执行历史" />
          </Tabs>
        </Box>

        <TabPanel value={currentTab} index={0}>
          {renderOverview()}
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          {renderTaskList()}
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          {renderExecutionHistory()}
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

export default TaskManagerDialog;
