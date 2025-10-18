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
  ListItemIcon,
  Tab,
  Tabs,
  Paper,
  LinearProgress,
  Alert,
  Avatar,
  Divider,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  Folder,
  FolderSpecial,
  Add,
  Edit,
  Delete,
  Public,
  Business,
  SportsEsports,
  Speed,
  Star,
  StarBorder,
  MoreVert,
  Group,
  Autorenew,
  GetApp,
  Publish,
  Lightbulb,
  FilterList,
} from "@mui/icons-material";
import { showNotice } from "@/services/noticeService";
import {
  getAllSubscriptionGroups,
  getAllGroupStatistics,
  getSmartGroupingSuggestions,
  deleteSubscriptionGroup,
  createDefaultGroups,
  applyAutoGroupingRules,
  exportSubscriptionGroups,
  type SubscriptionGroup,
  type GroupStatistics,
  type GroupSuggestion,
} from "@/services/cmds";

interface SubscriptionGroupsDialogProps {
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
      id={`groups-tabpanel-${index}`}
      aria-labelledby={`groups-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const SubscriptionGroupsDialog: React.FC<SubscriptionGroupsDialogProps> = ({
  open,
  onClose,
}) => {
  
  // 状态管理
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 数据状态
  const [groups, setGroups] = useState<SubscriptionGroup[]>([]);
  const [statistics, setStatistics] = useState<GroupStatistics[]>([]);
  const [suggestions, setSuggestions] = useState<GroupSuggestion[]>([]);
  
  // 菜单状态
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  // 获取分组类型图标
  const getGroupTypeIcon = (type: string) => {
    switch (type) {
      case "Region":
        return <Public />;
      case "Provider":
        return <Business />;
      case "Usage":
        return <SportsEsports />;
      case "Speed":
        return <Speed />;
      default:
        return <Folder />;
    }
  };

  // 获取分组类型文本
  const getGroupTypeText = (type: string) => {
    switch (type) {
      case "Region":
        return "地区分组";
      case "Provider":
        return "服务商分组";
      case "Usage":
        return "用途分组";
      case "Speed":
        return "速度分组";
      case "Custom":
        return "自定义分组";
      default:
        return type;
    }
  };

  // 处理菜单点击
  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, groupId: string) => {
    setMenuAnchor(event.currentTarget);
    setSelectedGroupId(groupId);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedGroupId("");
  };

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const [groupsData, statsData, suggestionsData] = await Promise.all([
        getAllSubscriptionGroups(),
        getAllGroupStatistics(),
        getSmartGroupingSuggestions(),
      ]);

      setGroups(groupsData);
      setStatistics(statsData);
      setSuggestions(suggestionsData);
    } catch (error) {
      showNotice("error", `加载分组数据失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // 创建分组
  const handleCreateGroup = () => {
    showNotice("info", "创建分组功能开发中");
  };

  // 编辑分组
  const handleEditGroup = () => {
    showNotice("info", "编辑分组功能开发中");
    handleMenuClose();
  };

  // 删除分组
  const handleDeleteGroup = async (groupId: string) => {
    if (window.confirm("确定要删除这个分组吗？")) {
      try {
        await deleteSubscriptionGroup(groupId);
        setGroups(prev => prev.filter(g => g.id !== groupId));
        showNotice("success", "分组删除成功");
        handleMenuClose();
      } catch (error) {
        showNotice("error", `删除分组失败: ${error}`);
      }
    }
  };

  // 切换收藏状态
  const handleToggleFavorite = () => {
    showNotice("info", "收藏功能开发中");
  };

  // 应用智能建议
  const handleApplySuggestion = () => {
    showNotice("info", "应用建议功能开发中");
  };

  // 刷新建议
  const handleRefreshSuggestions = async () => {
    try {
      const suggestionsData = await getSmartGroupingSuggestions();
      setSuggestions(suggestionsData);
      showNotice("success", "建议已刷新");
    } catch (error) {
      showNotice("error", `刷新建议失败: ${error}`);
    }
  };

  // 创建默认分组
  const handleCreateDefaultGroups = async () => {
    try {
      await createDefaultGroups();
      await loadData();
      showNotice("success", "默认分组创建成功");
    } catch (error) {
      showNotice("error", `创建默认分组失败: ${error}`);
    }
  };

  // 应用自动规则
  const handleApplyAutoRules = async () => {
    try {
      await applyAutoGroupingRules();
      await loadData();
      showNotice("success", "自动规则应用成功");
    } catch (error) {
      showNotice("error", `应用自动规则失败: ${error}`);
    }
  };

  // 更新统计信息
  const handleUpdateStatistics = async () => {
    try {
      const statsData = await getAllGroupStatistics();
      setStatistics(statsData);
      showNotice("success", "统计信息已更新");
    } catch (error) {
      showNotice("error", `更新统计信息失败: ${error}`);
    }
  };

  // 导出分组
  const handleExportGroups = async () => {
    try {
      const exportData = await exportSubscriptionGroups();
      showNotice("success", "分组配置导出成功");
      console.log("Export data:", exportData);
    } catch (error) {
      showNotice("error", `导出分组失败: ${error}`);
    }
  };

  // 导入分组
  const handleImportGroups = () => {
    showNotice("info", "导入功能开发中");
  };

  // 组件挂载时加载数据
  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  // 渲染分组列表
  const renderGroupsList = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          订阅分组 ({groups.length})
        </Typography>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FilterList />}
            onClick={() => showNotice("info", "过滤功能开发中")}
          >
            过滤
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleCreateGroup}
          >
            新建分组
          </Button>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={2}>
        {groups.map((group) => {
          const stat = statistics.find(s => s.group_id === group.id);
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={group.id}>
              <Card variant="outlined" sx={{ position: "relative" }}>
                <CardContent>
                  {/* 分组头部 */}
                  <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Avatar 
                        sx={{ 
                          bgcolor: group.color, 
                          width: 32, 
                          height: 32,
                          fontSize: "1rem"
                        }}
                      >
                        {getGroupTypeIcon(group.group_type)}
                      </Avatar>
                      <Box>
                        <Typography variant="h6" sx={{ fontSize: "1.1rem" }}>
                          {group.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {getGroupTypeText(group.group_type)}
                        </Typography>
                      </Box>
                    </Box>
                    <Box display="flex" alignItems="center">
                      <IconButton
                        size="small"
                        onClick={handleToggleFavorite}
                      >
                        {group.is_favorite ? (
                          <Star color="warning" />
                        ) : (
                          <StarBorder />
                        )}
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, group.id)}
                      >
                        <MoreVert />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* 分组描述 */}
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {group.description}
                  </Typography>

                  {/* 统计信息 */}
                  {stat && (
                    <Box>
                      <Box display="flex" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="body2">订阅数量:</Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {stat.total_subscriptions}
                        </Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="body2">节点总数:</Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {stat.total_nodes}
                        </Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="body2">平均延迟:</Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {stat.avg_latency_ms.toFixed(0)}ms
                        </Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between" sx={{ mb: 2 }}>
                        <Typography variant="body2">健康评分:</Typography>
                        <Typography 
                          variant="body2" 
                          fontWeight="medium"
                          color={stat.health_score > 80 ? "success.main" : stat.health_score > 60 ? "warning.main" : "error.main"}
                        >
                          {stat.health_score.toFixed(1)}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  {/* 标签 */}
                  {group.tags.length > 0 && (
                    <Box display="flex" gap={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
                      {group.tags.map((tag, index) => (
                        <Chip 
                          key={index}
                          label={tag} 
                          size="small" 
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  )}

                  {/* 自动规则指示 */}
                  {group.auto_rules.length > 0 && (
                    <Box display="flex" alignItems="center" gap={1}>
                      <Autorenew fontSize="small" color="primary" />
                      <Typography variant="caption" color="primary">
                        {group.auto_rules.filter(r => r.is_enabled).length} 个自动规则
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {groups.length === 0 && !loading && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Group sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            暂无分组，创建第一个分组来整理您的订阅
          </Typography>
          <Button variant="contained" startIcon={<Add />} onClick={handleCreateGroup}>
            创建分组
          </Button>
        </Paper>
      )}

      {/* 操作菜单 */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEditGroup}>
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          编辑分组
        </MenuItem>
        <MenuItem onClick={() => showNotice("info", "查看详情功能开发中")}>
          <ListItemIcon>
            <FolderSpecial fontSize="small" />
          </ListItemIcon>
          查看详情
        </MenuItem>
        <Divider />
        <MenuItem 
          onClick={() => handleDeleteGroup(selectedGroupId)}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          删除分组
        </MenuItem>
      </Menu>
    </Box>
  );

  // 渲染智能建议
  const renderSmartSuggestions = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        智能分组建议
      </Typography>

      {suggestions.length > 0 ? (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            基于您的订阅特征，我们为您推荐以下分组方案
          </Alert>
          
          {suggestions.map((suggestion, index) => (
            <Card key={index} variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="start" sx={{ mb: 2 }}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Lightbulb color="primary" />
                    <Box>
                      <Typography variant="h6">
                        {suggestion.suggested_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {getGroupTypeText(suggestion.suggested_type)} • 
                        置信度: {(suggestion.confidence_score * 100).toFixed(0)}%
                      </Typography>
                    </Box>
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleApplySuggestion}
                  >
                    应用建议
                  </Button>
                </Box>
                
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {suggestion.reason}
                </Typography>
                
                <Typography variant="body2" sx={{ mb: 1 }}>
                  将包含 {suggestion.suggested_subscriptions.length} 个订阅：
                </Typography>
                <Box display="flex" gap={0.5} flexWrap="wrap">
                  {suggestion.suggested_subscriptions.map((uid, idx) => (
                    <Chip 
                      key={idx}
                      label={`订阅 ${uid}`} 
                      size="small" 
                      variant="outlined"
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Lightbulb sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            暂无智能建议
          </Typography>
          <Typography variant="body2" color="text.secondary">
            添加更多订阅后，我们将为您提供个性化的分组建议
          </Typography>
        </Paper>
      )}

      <Box display="flex" gap={2} sx={{ mt: 2 }}>
        <Button
          variant="outlined"
          startIcon={<Autorenew />}
          onClick={handleRefreshSuggestions}
        >
          刷新建议
        </Button>
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={handleCreateDefaultGroups}
        >
          创建默认分组
        </Button>
      </Box>
    </Box>
  );

  // 渲染管理工具
  const renderManagementTools = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        分组管理工具
      </Typography>

      <Grid container spacing={2}>
        {/* 批量操作 */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                批量操作
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                对多个分组执行批量操作
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Button
                  variant="outlined"
                  startIcon={<Autorenew />}
                  onClick={handleApplyAutoRules}
                >
                  应用自动规则
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Group />}
                  onClick={handleUpdateStatistics}
                >
                  更新统计信息
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 导入导出 */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                导入导出
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                备份和同步分组配置
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Button
                  variant="outlined"
                  startIcon={<GetApp />}
                  onClick={handleExportGroups}
                >
                  导出分组配置
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Publish />}
                  onClick={handleImportGroups}
                >
                  导入分组配置
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 分组统计 */}
        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                分组统计概览
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="primary">
                      {groups.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      总分组数
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="success.main">
                      {groups.filter(g => g.is_favorite).length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      收藏分组
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="info.main">
                      {groups.reduce((sum, g) => sum + g.subscription_uids.length, 0)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      管理订阅
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="warning.main">
                      {groups.reduce((sum, g) => sum + g.auto_rules.filter(r => r.is_enabled).length, 0)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      活跃规则
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={2}>
          <Group />
          <Typography variant="h6">订阅分组管理</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs 
            value={currentTab} 
            onChange={(_, newValue) => setCurrentTab(newValue)}
            aria-label="分组管理标签"
          >
            <Tab label="分组列表" />
            <Tab label="智能建议" />
            <Tab label="管理工具" />
          </Tabs>
        </Box>

        <TabPanel value={currentTab} index={0}>
          {renderGroupsList()}
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          {renderSmartSuggestions()}
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          {renderManagementTools()}
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

export default SubscriptionGroupsDialog;

