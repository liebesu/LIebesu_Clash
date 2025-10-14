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
  Paper,
  LinearProgress,
  Alert,
  Avatar,
  Divider,
  Menu,
  ListItemIcon,
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
import { useTranslation } from "react-i18next";

// 模拟数据接口 - 等待后端集成
interface SubscriptionGroup {
  id: string;
  name: string;
  description: string;
  group_type: "Region" | "Provider" | "Usage" | "Speed" | "Custom";
  color: string;
  icon: string;
  subscription_uids: string[];
  tags: string[];
  is_favorite: boolean;
  sort_order: number;
  auto_rules: AutoRule[];
  created_at: number;
  updated_at: number;
}

interface AutoRule {
  rule_type:
    | "NameContains"
    | "NameMatches"
    | "UrlContains"
    | "UrlMatches"
    | "TagEquals"
    | "SpeedRange"
    | "LatencyRange";
  condition:
    | "Contains"
    | "NotContains"
    | "Equals"
    | "NotEquals"
    | "StartsWith"
    | "EndsWith"
    | "Matches"
    | "NotMatches"
    | "GreaterThan"
    | "LessThan"
    | "Between";
  value: string;
  is_enabled: boolean;
}

interface GroupStatistics {
  group_id: string;
  group_name: string;
  total_subscriptions: number;
  active_subscriptions: number;
  total_nodes: number;
  avg_latency_ms: number;
  avg_speed_mbps: number;
  health_score: number;
  last_updated: number;
}

interface GroupSuggestion {
  suggested_name: string;
  suggested_type: "Region" | "Provider" | "Usage" | "Speed" | "Custom";
  suggested_subscriptions: string[];
  confidence_score: number;
  reason: string;
}

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
  const _t = useTranslation();

  // 状态管理
  const _currentTab = useState(0)[0];
  const [loading, setLoading] = useState(false);

  // 数据状态
  const [groups, setGroups] = useState<SubscriptionGroup[]>([]);
  const [statistics, setStatistics] = useState<GroupStatistics[]>([]);
  const [suggestions, setSuggestions] = useState<GroupSuggestion[]>([]);
  const _editingGroup = useState<SubscriptionGroup | null>(null)[0];
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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

  // 格式化时间
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // 处理菜单点击
  const handleMenuClick = (
    event: React.MouseEvent<HTMLElement>,
    groupId: string,
  ) => {
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
      // TODO: 调用实际的API
      // const [groupsData, statsData, suggestionsData] = await Promise.all([
      //   getAllSubscriptionGroups(),
      //   getAllGroupStatistics(),
      //   getSmartGroupingSuggestions(),
      // ]);

      // 模拟数据
      const mockGroups: SubscriptionGroup[] = [
        {
          id: "group1",
          name: "收藏夹",
          description: "收藏的高质量订阅",
          group_type: "Custom",
          color: "#FFD700",
          icon: "star",
          subscription_uids: ["sub1", "sub3"],
          tags: ["favorite"],
          is_favorite: true,
          sort_order: 0,
          auto_rules: [],
          created_at: Date.now() / 1000 - 7 * 24 * 3600,
          updated_at: Date.now() / 1000 - 3600,
        },
        {
          id: "group2",
          name: "美国节点",
          description: "所有美国地区的订阅",
          group_type: "Region",
          color: "#1976d2",
          icon: "public",
          subscription_uids: ["sub1", "sub2"],
          tags: ["usa", "america"],
          is_favorite: false,
          sort_order: 1,
          auto_rules: [
            {
              rule_type: "NameContains",
              condition: "Contains",
              value: "美国",
              is_enabled: true,
            },
            {
              rule_type: "NameContains",
              condition: "Contains",
              value: "USA",
              is_enabled: true,
            },
          ],
          created_at: Date.now() / 1000 - 5 * 24 * 3600,
          updated_at: Date.now() / 1000 - 1800,
        },
        {
          id: "group3",
          name: "游戏专用",
          description: "适合游戏的低延迟订阅",
          group_type: "Usage",
          color: "#f44336",
          icon: "games",
          subscription_uids: ["sub4"],
          tags: ["gaming", "low-latency"],
          is_favorite: false,
          sort_order: 2,
          auto_rules: [
            {
              rule_type: "NameContains",
              condition: "Contains",
              value: "游戏",
              is_enabled: true,
            },
          ],
          created_at: Date.now() / 1000 - 3 * 24 * 3600,
          updated_at: Date.now() / 1000 - 900,
        },
      ];

      const mockStatistics: GroupStatistics[] = [
        {
          group_id: "group1",
          group_name: "收藏夹",
          total_subscriptions: 2,
          active_subscriptions: 2,
          total_nodes: 45,
          avg_latency_ms: 85.2,
          avg_speed_mbps: 32.6,
          health_score: 92.5,
          last_updated: Date.now() / 1000 - 3600,
        },
        {
          group_id: "group2",
          group_name: "美国节点",
          total_subscriptions: 2,
          active_subscriptions: 1,
          total_nodes: 38,
          avg_latency_ms: 156.7,
          avg_speed_mbps: 28.3,
          health_score: 78.9,
          last_updated: Date.now() / 1000 - 1800,
        },
        {
          group_id: "group3",
          group_name: "游戏专用",
          total_subscriptions: 1,
          active_subscriptions: 1,
          total_nodes: 22,
          avg_latency_ms: 45.1,
          avg_speed_mbps: 25.8,
          health_score: 88.6,
          last_updated: Date.now() / 1000 - 900,
        },
      ];

      const mockSuggestions: GroupSuggestion[] = [
        {
          suggested_name: "日本节点",
          suggested_type: "Region",
          suggested_subscriptions: ["sub5", "sub6"],
          confidence_score: 0.85,
          reason: '基于名称包含关键词 "日本"',
        },
        {
          suggested_name: "高速通道",
          suggested_type: "Speed",
          suggested_subscriptions: ["sub1", "sub7"],
          confidence_score: 0.78,
          reason: "基于平均速度超过 50 Mbps",
        },
      ];

      setGroups(mockGroups);
      setStatistics(mockStatistics);
      setSuggestions(mockSuggestions);
    } catch (error) {
      console.error("加载分组数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 创建分组
  const handleCreateGroup = () => {
    setCreateDialogOpen(true);
  };

  // 编辑分组
  const handleEditGroup = (group: SubscriptionGroup) => {
    setEditingGroup(group);
    handleMenuClose();
  };

  // 删除分组
  const handleDeleteGroup = (groupId: string) => {
    if (window.confirm("确定要删除这个分组吗？")) {
      // TODO: 调用删除API
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      handleMenuClose();
    }
  };

  // 切换收藏状态
  const handleToggleFavorite = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, is_favorite: !g.is_favorite } : g,
      ),
    );
  };

  // 应用智能建议
  const handleApplySuggestion = (suggestion: GroupSuggestion) => {
    const newGroup: SubscriptionGroup = {
      id: `group_${Date.now()}`,
      name: suggestion.suggested_name,
      description: `自动创建的${getGroupTypeText(suggestion.suggested_type)}`,
      group_type: suggestion.suggested_type,
      color: "#9c27b0",
      icon: "auto_awesome",
      subscription_uids: suggestion.suggested_subscriptions,
      tags: [],
      is_favorite: false,
      sort_order: groups.length,
      auto_rules: [],
      created_at: Date.now() / 1000,
      updated_at: Date.now() / 1000,
    };

    setGroups((prev) => [...prev, newGroup]);
    setSuggestions((prev) =>
      prev.filter((s) => s.suggested_name !== suggestion.suggested_name),
    );
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
      <Box
        display="flex"
        justifyContent="between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography variant="h6">订阅分组 ({groups.length})</Typography>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FilterList />}
            onClick={() => {
              /* TODO: 打开过滤器 */
            }}
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
          const stat = statistics.find((s) => s.group_id === group.id);
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={group.id}>
              <Card variant="outlined" sx={{ position: "relative" }}>
                <CardContent>
                  {/* 分组头部 */}
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="between"
                    sx={{ mb: 2 }}
                  >
                    <Box display="flex" alignItems="center" gap={1}>
                      <Avatar
                        sx={{
                          bgcolor: group.color,
                          width: 32,
                          height: 32,
                          fontSize: "1rem",
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
                        onClick={() => handleToggleFavorite(group.id)}
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
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                  >
                    {group.description}
                  </Typography>

                  {/* 统计信息 */}
                  {stat && (
                    <Box>
                      <Box
                        display="flex"
                        justifyContent="between"
                        sx={{ mb: 1 }}
                      >
                        <Typography variant="body2">订阅数量:</Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {stat.total_subscriptions}
                        </Typography>
                      </Box>
                      <Box
                        display="flex"
                        justifyContent="between"
                        sx={{ mb: 1 }}
                      >
                        <Typography variant="body2">节点总数:</Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {stat.total_nodes}
                        </Typography>
                      </Box>
                      <Box
                        display="flex"
                        justifyContent="between"
                        sx={{ mb: 1 }}
                      >
                        <Typography variant="body2">平均延迟:</Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {stat.avg_latency_ms.toFixed(0)}ms
                        </Typography>
                      </Box>
                      <Box
                        display="flex"
                        justifyContent="between"
                        sx={{ mb: 2 }}
                      >
                        <Typography variant="body2">健康评分:</Typography>
                        <Typography
                          variant="body2"
                          fontWeight="medium"
                          color={
                            stat.health_score > 80
                              ? "success.main"
                              : stat.health_score > 60
                                ? "warning.main"
                                : "error.main"
                          }
                        >
                          {stat.health_score.toFixed(1)}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  {/* 标签 */}
                  {group.tags.length > 0 && (
                    <Box
                      display="flex"
                      gap={0.5}
                      flexWrap="wrap"
                      sx={{ mb: 2 }}
                    >
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
                        {group.auto_rules.filter((r) => r.is_enabled).length}{" "}
                        个自动规则
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
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleCreateGroup}
          >
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
        <MenuItem
          onClick={() => {
            const group = groups.find((g) => g.id === selectedGroupId);
            if (group) handleEditGroup(group);
          }}
        >
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          编辑分组
        </MenuItem>
        <MenuItem
          onClick={() => {
            /* TODO: 查看详情 */
          }}
        >
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
                <Box
                  display="flex"
                  justifyContent="between"
                  alignItems="start"
                  sx={{ mb: 2 }}
                >
                  <Box display="flex" alignItems="center" gap={2}>
                    <Lightbulb color="primary" />
                    <Box>
                      <Typography variant="h6">
                        {suggestion.suggested_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {getGroupTypeText(suggestion.suggested_type)} • 置信度:{" "}
                        {(suggestion.confidence_score * 100).toFixed(0)}%
                      </Typography>
                    </Box>
                  </Box>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleApplySuggestion(suggestion)}
                  >
                    应用建议
                  </Button>
                </Box>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
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
          onClick={() => {
            /* TODO: 刷新建议 */
          }}
        >
          刷新建议
        </Button>
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={() => {
            /* TODO: 创建默认分组 */
          }}
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
                  onClick={() => {
                    /* TODO: 批量应用规则 */
                  }}
                >
                  应用自动规则
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Group />}
                  onClick={() => {
                    /* TODO: 批量统计 */
                  }}
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
                  onClick={() => {
                    /* TODO: 导出分组 */
                  }}
                >
                  导出分组配置
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Publish />}
                  onClick={() => {
                    /* TODO: 导入分组 */
                  }}
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
                      {groups.filter((g) => g.is_favorite).length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      收藏分组
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="info.main">
                      {groups.reduce(
                        (sum, g) => sum + g.subscription_uids.length,
                        0,
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      管理订阅
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="warning.main">
                      {groups.reduce(
                        (sum, g) =>
                          sum + g.auto_rules.filter((r) => r.is_enabled).length,
                        0,
                      )}
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
        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
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
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SubscriptionGroupsDialog;
