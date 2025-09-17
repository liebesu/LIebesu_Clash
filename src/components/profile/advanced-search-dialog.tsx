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
  ListItemSecondaryAction,
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
  Autocomplete,
  Checkbox,
  FormControlLabel,
  Divider,
  Collapse,
  Badge,
  Tooltip,
  Avatar,
  ListItemAvatar,
  Menu,
  ListItemIcon,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import {
  Search,
  FilterList,
  SavedSearch,
  History,
  Clear,
  Add,
  Remove,
  ExpandMore,
  ExpandLess,
  Sort,
  ViewList,
  ViewModule,
  Star,
  StarBorder,
  Edit,
  Delete,
  PlayArrow,
  Refresh,
  Settings,
  TrendingUp,
  Public,
  Business,
  Speed,
  Schedule,
  Tag,
  Analytics,
  MoreVert,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import {
  advancedSearch,
  quickSearch,
  saveSearch,
  getSavedSearches,
  deleteSavedSearch,
  executeSavedSearch,
  getSearchHistory,
  clearSearchHistory,
  getSearchSuggestions,
  getFieldValueSuggestions,
  updateSearchIndex,
  getSearchStatistics,
  SearchCriteria,
  SearchFilter,
  SearchField,
  FilterOperator,
  SortBy,
  SortOrder,
  SearchResult,
  SubscriptionSearchItem,
  SavedSearch,
  SearchHistory,
  SearchSuggestion,
  SearchStatistics,
} from "@/services/cmds";
import { showNotice } from "@/services/noticeService";

interface AdvancedSearchDialogProps {
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
      id={`search-tabpanel-${index}`}
      aria-labelledby={`search-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const AdvancedSearchDialog: React.FC<AdvancedSearchDialogProps> = ({
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  
  // 状态管理
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 搜索状态
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria>({
    query: "",
    filters: [],
    sort_by: "Relevance",
    sort_order: "Descending",
    limit: 50,
    offset: 0,
  });
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const [quickSearchResults, setQuickSearchResults] = useState<SubscriptionSearchItem[]>([]);
  
  // 过滤器状态
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [newFilter, setNewFilter] = useState<SearchFilter>({
    field: "Name",
    operator: "Contains",
    value: "",
    case_sensitive: false,
  });
  
  // 保存的搜索
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [saveSearchDescription, setSaveSearchDescription] = useState("");
  
  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  
  // 搜索统计
  const [searchStats, setSearchStats] = useState<SearchStatistics | null>(null);
  
  // 建议和提示
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [fieldValueSuggestions, setFieldValueSuggestions] = useState<string[]>([]);
  
  // UI状态
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedSearchId, setSelectedSearchId] = useState<string>("");

  // 字段选项
  const searchFields: { value: SearchField; label: string }[] = [
    { value: "Name", label: "订阅名称" },
    { value: "Description", label: "描述" },
    { value: "Url", label: "订阅链接" },
    { value: "Type", label: "订阅类型" },
    { value: "Country", label: "国家" },
    { value: "Provider", label: "服务商" },
    { value: "Tags", label: "标签" },
    { value: "Groups", label: "分组" },
    { value: "NodeCount", label: "节点数量" },
    { value: "Latency", label: "延迟" },
    { value: "Speed", label: "速度" },
    { value: "Status", label: "状态" },
    { value: "TrafficUsage", label: "流量使用" },
    { value: "CreatedAt", label: "创建时间" },
    { value: "UpdatedAt", label: "更新时间" },
    { value: "ExpiryDate", label: "到期时间" },
  ];

  // 操作符选项
  const filterOperators: { value: FilterOperator; label: string }[] = [
    { value: "Contains", label: "包含" },
    { value: "NotContains", label: "不包含" },
    { value: "Equals", label: "等于" },
    { value: "NotEquals", label: "不等于" },
    { value: "StartsWith", label: "开始于" },
    { value: "EndsWith", label: "结束于" },
    { value: "Matches", label: "正则匹配" },
    { value: "GreaterThan", label: "大于" },
    { value: "LessThan", label: "小于" },
    { value: "GreaterEqual", label: "大于等于" },
    { value: "LessEqual", label: "小于等于" },
    { value: "IsEmpty", label: "为空" },
    { value: "IsNotEmpty", label: "不为空" },
    { value: "InList", label: "在列表中" },
  ];

  // 排序选项
  const sortOptions: { value: SortBy; label: string }[] = [
    { value: "Relevance", label: "相关性" },
    { value: "Name", label: "名称" },
    { value: "UpdatedAt", label: "更新时间" },
    { value: "CreatedAt", label: "创建时间" },
    { value: "NodeCount", label: "节点数量" },
    { value: "Latency", label: "延迟" },
    { value: "Speed", label: "速度" },
    { value: "TrafficUsage", label: "流量使用" },
    { value: "ExpiryDate", label: "到期时间" },
  ];

  // 加载数据
  const loadData = async () => {
    try {
      const [searches, history, stats] = await Promise.all([
        getSavedSearches(),
        getSearchHistory(20),
        getSearchStatistics(),
      ]);
      
      setSavedSearches(searches);
      setSearchHistory(history);
      setSearchStats(stats);
    } catch (error) {
      console.error("加载搜索数据失败:", error);
    }
  };

  // 组件挂载时加载数据
  useEffect(() => {
    if (open) {
      loadData();
      updateSearchIndex(); // 更新搜索索引
    }
  }, [open]);

  // 执行高级搜索
  const handleAdvancedSearch = async () => {
    if (!searchCriteria.query.trim() && searchCriteria.filters.length === 0) {
      showNotice("请输入搜索关键词或添加过滤条件", "warning");
      return;
    }

    setLoading(true);
    try {
      const result = await advancedSearch(searchCriteria);
      setSearchResult(result);
      loadData(); // 重新加载历史和统计
    } catch (error) {
      console.error("搜索失败:", error);
      showNotice("搜索失败: " + error, "error");
    } finally {
      setLoading(false);
    }
  };

  // 执行快速搜索
  const handleQuickSearch = async (query: string) => {
    if (!query.trim()) {
      setQuickSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const results = await quickSearch(query, 10);
      setQuickSearchResults(results);
    } catch (error) {
      console.error("快速搜索失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 快速搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (quickSearchQuery) {
        handleQuickSearch(quickSearchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [quickSearchQuery]);

  // 添加过滤器
  const handleAddFilter = () => {
    if (!newFilter.value.trim()) {
      showNotice("请输入过滤值", "warning");
      return;
    }

    setSearchCriteria({
      ...searchCriteria,
      filters: [...searchCriteria.filters, { ...newFilter }],
    });

    setNewFilter({
      field: "Name",
      operator: "Contains",
      value: "",
      case_sensitive: false,
    });
  };

  // 移除过滤器
  const handleRemoveFilter = (index: number) => {
    const newFilters = [...searchCriteria.filters];
    newFilters.splice(index, 1);
    setSearchCriteria({
      ...searchCriteria,
      filters: newFilters,
    });
  };

  // 保存搜索
  const handleSaveSearch = async () => {
    if (!saveSearchName.trim()) {
      showNotice("请输入搜索名称", "warning");
      return;
    }

    try {
      await saveSearch(saveSearchName, saveSearchDescription, searchCriteria);
      showNotice("搜索保存成功", "success");
      setSaveDialogOpen(false);
      setSaveSearchName("");
      setSaveSearchDescription("");
      loadData();
    } catch (error) {
      console.error("保存搜索失败:", error);
      showNotice("保存搜索失败: " + error, "error");
    }
  };

  // 执行保存的搜索
  const handleExecuteSavedSearch = async (searchId: string) => {
    setLoading(true);
    try {
      const result = await executeSavedSearch(searchId);
      setSearchResult(result);
      setCurrentTab(0); // 切换到搜索结果页
      loadData();
    } catch (error) {
      console.error("执行保存的搜索失败:", error);
      showNotice("执行搜索失败: " + error, "error");
    } finally {
      setLoading(false);
    }
  };

  // 删除保存的搜索
  const handleDeleteSavedSearch = async (searchId: string) => {
    if (!confirm("确定要删除这个保存的搜索吗？")) {
      return;
    }

    try {
      await deleteSavedSearch(searchId);
      showNotice("搜索删除成功", "success");
      loadData();
      handleMenuClose();
    } catch (error) {
      console.error("删除搜索失败:", error);
      showNotice("删除搜索失败: " + error, "error");
    }
  };

  // 清理搜索历史
  const handleClearHistory = async () => {
    if (!confirm("确定要清空搜索历史吗？")) {
      return;
    }

    try {
      await clearSearchHistory();
      showNotice("搜索历史已清空", "success");
      loadData();
    } catch (error) {
      console.error("清空历史失败:", error);
      showNotice("清空历史失败: " + error, "error");
    }
  };

  // 获取字段值建议
  const handleGetFieldSuggestions = async (field: SearchField) => {
    try {
      const suggestions = await getFieldValueSuggestions(field);
      setFieldValueSuggestions(suggestions);
    } catch (error) {
      console.error("获取建议失败:", error);
    }
  };

  // 菜单处理
  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, searchId: string) => {
    setMenuAnchor(event.currentTarget);
    setSelectedSearchId(searchId);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedSearchId("");
  };

  // 格式化时间
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // 获取字段标签
  const getFieldLabel = (field: SearchField) => {
    return searchFields.find(f => f.value === field)?.label || field;
  };

  // 获取操作符标签
  const getOperatorLabel = (operator: FilterOperator) => {
    return filterOperators.find(o => o.value === operator)?.label || operator;
  };

  // 高亮搜索结果
  const highlightText = (text: string, highlights: string[]) => {
    if (!highlights.length) return text;
    
    let highlightedText = text;
    highlights.forEach(highlight => {
      const regex = new RegExp(`(${highlight})`, "gi");
      highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });
    
    return highlightedText;
  };

  // 渲染搜索界面
  const renderSearchInterface = () => (
    <Box>
      {/* 主搜索框 */}
      <Box sx={{ mb: 3 }}>
        <Box display="flex" gap={2} alignItems="center">
          <TextField
            fullWidth
            label="搜索关键词"
            value={searchCriteria.query}
            onChange={(e) => setSearchCriteria({
              ...searchCriteria,
              query: e.target.value,
            })}
            placeholder="输入订阅名称、描述、标签等..."
            InputProps={{
              startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} />,
            }}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleAdvancedSearch();
              }
            }}
          />
          <Button
            variant="contained"
            startIcon={<Search />}
            onClick={handleAdvancedSearch}
            disabled={loading}
            sx={{ minWidth: "120px" }}
          >
            {loading ? "搜索中..." : "搜索"}
          </Button>
        </Box>

        {/* 快速操作 */}
        <Box display="flex" gap={1} alignItems="center" sx={{ mt: 2 }}>
          <Button
            size="small"
            startIcon={<FilterList />}
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            variant={showAdvancedFilters ? "contained" : "outlined"}
          >
            高级过滤 {searchCriteria.filters.length > 0 && `(${searchCriteria.filters.length})`}
          </Button>
          <Button
            size="small"
            startIcon={<SavedSearch />}
            onClick={() => setSaveDialogOpen(true)}
            disabled={!searchCriteria.query.trim() && searchCriteria.filters.length === 0}
          >
            保存搜索
          </Button>
          <Button
            size="small"
            startIcon={<Clear />}
            onClick={() => {
              setSearchCriteria({
                query: "",
                filters: [],
                sort_by: "Relevance",
                sort_order: "Descending",
                limit: 50,
                offset: 0,
              });
              setSearchResult(null);
            }}
          >
            清空
          </Button>
        </Box>
      </Box>

      {/* 高级过滤器 */}
      <Collapse in={showAdvancedFilters}>
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              高级过滤器
            </Typography>

            {/* 现有过滤器 */}
            {searchCriteria.filters.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  当前过滤器:
                </Typography>
                {searchCriteria.filters.map((filter, index) => (
                  <Chip
                    key={index}
                    label={`${getFieldLabel(filter.field)} ${getOperatorLabel(filter.operator)} "${filter.value}"`}
                    onDelete={() => handleRemoveFilter(index)}
                    sx={{ mr: 1, mb: 1 }}
                  />
                ))}
              </Box>
            )}

            {/* 添加新过滤器 */}
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>字段</InputLabel>
                  <Select
                    value={newFilter.field}
                    onChange={(e) => {
                      const field = e.target.value as SearchField;
                      setNewFilter({ ...newFilter, field });
                      handleGetFieldSuggestions(field);
                    }}
                    label="字段"
                  >
                    {searchFields.map((field) => (
                      <MenuItem key={field.value} value={field.value}>
                        {field.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>操作</InputLabel>
                  <Select
                    value={newFilter.operator}
                    onChange={(e) => setNewFilter({
                      ...newFilter,
                      operator: e.target.value as FilterOperator,
                    })}
                    label="操作"
                  >
                    {filterOperators.map((op) => (
                      <MenuItem key={op.value} value={op.value}>
                        {op.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Autocomplete
                  freeSolo
                  options={fieldValueSuggestions}
                  value={newFilter.value}
                  onInputChange={(_, value) => setNewFilter({
                    ...newFilter,
                    value,
                  })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="值"
                      size="small"
                      fullWidth
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={1}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={newFilter.case_sensitive}
                      onChange={(e) => setNewFilter({
                        ...newFilter,
                        case_sensitive: e.target.checked,
                      })}
                    />
                  }
                  label="区分大小写"
                />
              </Grid>
              <Grid item xs={12} sm={1}>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Add />}
                  onClick={handleAddFilter}
                  fullWidth
                >
                  添加
                </Button>
              </Grid>
            </Grid>

            {/* 排序选项 */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                排序方式:
              </Typography>
              <Box display="flex" gap={2} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>排序字段</InputLabel>
                  <Select
                    value={searchCriteria.sort_by}
                    onChange={(e) => setSearchCriteria({
                      ...searchCriteria,
                      sort_by: e.target.value as SortBy,
                    })}
                    label="排序字段"
                  >
                    {sortOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel>顺序</InputLabel>
                  <Select
                    value={searchCriteria.sort_order}
                    onChange={(e) => setSearchCriteria({
                      ...searchCriteria,
                      sort_order: e.target.value as SortOrder,
                    })}
                    label="顺序"
                  >
                    <MenuItem value="Ascending">升序</MenuItem>
                    <MenuItem value="Descending">降序</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Collapse>

      {/* 搜索结果 */}
      {searchResult && (
        <Card variant="outlined">
          <CardContent>
            <Box display="flex" justifyContent="between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">
                搜索结果 ({searchResult.total_count} 项，用时 {searchResult.search_time_ms}ms)
              </Typography>
              <Box display="flex" gap={1}>
                <IconButton
                  size="small"
                  onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
                >
                  {viewMode === "list" ? <ViewModule /> : <ViewList />}
                </IconButton>
                <Button
                  size="small"
                  startIcon={<SavedSearch />}
                  onClick={() => setSaveDialogOpen(true)}
                >
                  保存搜索
                </Button>
              </Box>
            </Box>

            {/* 搜索建议 */}
            {searchResult.suggestions.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  搜索建议:
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                  {searchResult.suggestions.map((suggestion, index) => (
                    <Chip
                      key={index}
                      label={suggestion}
                      size="small"
                      onClick={() => setSearchCriteria({
                        ...searchCriteria,
                        query: suggestion,
                      })}
                      clickable
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* 分面过滤器 */}
            {Object.keys(searchResult.facets).length > 0 && (
              <Accordion sx={{ mb: 2 }}>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography variant="subtitle2">按类别过滤</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    {Object.entries(searchResult.facets).map(([facetName, values]) => (
                      <Grid item xs={12} sm={6} md={4} key={facetName}>
                        <Typography variant="subtitle2" gutterBottom>
                          {facetName}
                        </Typography>
                        {values.slice(0, 5).map((value) => (
                          <FormControlLabel
                            key={value.value}
                            control={
                              <Checkbox
                                size="small"
                                checked={value.selected}
                                onChange={() => {
                                  // TODO: 处理分面选择
                                }}
                              />
                            }
                            label={`${value.value} (${value.count})`}
                          />
                        ))}
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            )}

            {/* 结果列表 */}
            {searchResult.items.length > 0 ? (
              viewMode === "list" ? (
                <List>
                  {searchResult.items.map((item) => (
                    <React.Fragment key={item.uid}>
                      <ListItem>
                        <ListItemAvatar>
                          <Avatar>
                            {item.subscription_type.charAt(0).toUpperCase()}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Box display="flex" alignItems="center" gap={1}>
                              <Typography variant="subtitle1">
                                {item.name}
                              </Typography>
                              <Chip
                                label={item.subscription_type}
                                size="small"
                                variant="outlined"
                              />
                              {item.country && (
                                <Chip
                                  label={item.country}
                                  size="small"
                                  color="primary"
                                />
                              )}
                              <Chip
                                label={`${item.node_count} 节点`}
                                size="small"
                                color="info"
                              />
                            </Box>
                          }
                          secondary={
                            <Box>
                              {item.description && (
                                <Typography variant="body2" color="text.secondary">
                                  {item.description}
                                </Typography>
                              )}
                              <Box display="flex" gap={1} sx={{ mt: 1 }}>
                                {item.tags.map((tag, index) => (
                                  <Chip
                                    key={index}
                                    label={tag}
                                    size="small"
                                    variant="outlined"
                                  />
                                ))}
                              </Box>
                              {item.latency && (
                                <Typography variant="caption" color="text.secondary">
                                  延迟: {item.latency.toFixed(0)}ms
                                </Typography>
                              )}
                              {item.speed && (
                                <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                                  速度: {item.speed.toFixed(1)} Mbps
                                </Typography>
                              )}
                            </Box>
                          }
                        />
                        <ListItemSecondaryAction>
                          <Typography variant="body2" color="primary">
                            相关性: {(item.relevance_score * 10).toFixed(1)}
                          </Typography>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                </List>
              ) : (
                <Grid container spacing={2}>
                  {searchResult.items.map((item) => (
                    <Grid item xs={12} sm={6} md={4} key={item.uid}>
                      <Card variant="outlined" sx={{ height: "100%" }}>
                        <CardContent>
                          <Box display="flex" justifyContent="between" alignItems="start" sx={{ mb: 1 }}>
                            <Typography variant="h6" noWrap>
                              {item.name}
                            </Typography>
                            <Chip
                              label={item.subscription_type}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                          
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {item.description || "无描述"}
                          </Typography>

                          <Box display="flex" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
                            {item.country && (
                              <Chip label={item.country} size="small" color="primary" />
                            )}
                            <Chip label={`${item.node_count} 节点`} size="small" color="info" />
                            {item.latency && (
                              <Chip label={`${item.latency.toFixed(0)}ms`} size="small" />
                            )}
                          </Box>

                          <Box display="flex" justifyContent="between" alignItems="center">
                            <Typography variant="caption" color="text.secondary">
                              相关性: {(item.relevance_score * 10).toFixed(1)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item.status}
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )
            ) : (
              <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                没有找到匹配的订阅
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* 保存搜索对话框 */}
      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>保存搜索</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="搜索名称"
            value={saveSearchName}
            onChange={(e) => setSaveSearchName(e.target.value)}
            sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            fullWidth
            label="描述 (可选)"
            value={saveSearchDescription}
            onChange={(e) => setSaveSearchDescription(e.target.value)}
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSaveSearch}
            disabled={!saveSearchName.trim()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  // 渲染快速搜索
  const renderQuickSearch = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        快速搜索
      </Typography>
      
      <TextField
        fullWidth
        label="快速搜索"
        value={quickSearchQuery}
        onChange={(e) => setQuickSearchQuery(e.target.value)}
        placeholder="输入关键词进行实时搜索..."
        InputProps={{
          startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} />,
        }}
        sx={{ mb: 3 }}
      />

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {quickSearchResults.length > 0 ? (
        <List>
          {quickSearchResults.map((item) => (
            <React.Fragment key={item.uid}>
              <ListItem>
                <ListItemAvatar>
                  <Avatar>
                    {item.subscription_type.charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={item.name}
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {item.description || "无描述"}
                      </Typography>
                      <Box display="flex" gap={1} sx={{ mt: 1 }}>
                        {item.country && (
                          <Chip label={item.country} size="small" />
                        )}
                        <Chip label={`${item.node_count} 节点`} size="small" />
                      </Box>
                    </Box>
                  }
                />
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>
      ) : quickSearchQuery ? (
        <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
          没有找到匹配的订阅
        </Typography>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Search sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
          <Typography color="text.secondary">
            输入关键词开始搜索
          </Typography>
        </Paper>
      )}
    </Box>
  );

  // 渲染保存的搜索
  const renderSavedSearches = () => (
    <Box>
      <Box display="flex" justifyContent="between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          保存的搜索 ({savedSearches.length})
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Refresh />}
          onClick={loadData}
        >
          刷新
        </Button>
      </Box>

      {savedSearches.length > 0 ? (
        <List>
          {savedSearches.map((search) => (
            <React.Fragment key={search.id}>
              <ListItem>
                <ListItemAvatar>
                  <Avatar>
                    <SavedSearch />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="subtitle1">{search.name}</Typography>
                      {search.is_favorite && <Star color="warning" />}
                      <Chip
                        label={`使用 ${search.usage_count} 次`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {search.description || "无描述"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        创建于: {formatDate(search.created_at)}
                        {search.last_used && ` | 最后使用: ${formatDate(search.last_used)}`}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      startIcon={<PlayArrow />}
                      onClick={() => handleExecuteSavedSearch(search.id)}
                      disabled={loading}
                    >
                      执行
                    </Button>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuClick(e, search.id)}
                    >
                      <MoreVert />
                    </IconButton>
                  </Box>
                </ListItemSecondaryAction>
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <SavedSearch sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
          <Typography color="text.secondary">
            暂无保存的搜索
          </Typography>
        </Paper>
      )}

      {/* 操作菜单 */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {/* TODO: 编辑搜索 */}}>
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          编辑
        </MenuItem>
        <MenuItem onClick={() => {/* TODO: 收藏/取消收藏 */}}>
          <ListItemIcon>
            <Star fontSize="small" />
          </ListItemIcon>
          收藏
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => handleDeleteSavedSearch(selectedSearchId)}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          删除
        </MenuItem>
      </Menu>
    </Box>
  );

  // 渲染搜索历史
  const renderSearchHistory = () => (
    <Box>
      <Box display="flex" justifyContent="between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          搜索历史 ({searchHistory.length})
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Clear />}
          onClick={handleClearHistory}
          disabled={searchHistory.length === 0}
        >
          清空历史
        </Button>
      </Box>

      {searchStats && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              搜索统计
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="primary">
                    {searchStats.total_searches}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    总搜索次数
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="info.main">
                    {searchStats.total_saved_searches}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    保存的搜索
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="success.main">
                    {searchStats.avg_search_time_ms}ms
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    平均响应时间
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="warning.main">
                    {searchStats.popular_queries.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    热门查询
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {searchStats.popular_queries.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  热门查询:
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                  {searchStats.popular_queries.slice(0, 10).map((query) => (
                    <Chip
                      key={query.query}
                      label={`${query.query} (${query.count})`}
                      size="small"
                      onClick={() => setSearchCriteria({
                        ...searchCriteria,
                        query: query.query,
                      })}
                      clickable
                    />
                  ))}
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {searchHistory.length > 0 ? (
        <List>
          {searchHistory.map((history) => (
            <React.Fragment key={history.id}>
              <ListItem>
                <ListItemAvatar>
                  <Avatar>
                    <History />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={history.query || "高级搜索"}
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        找到 {history.result_count} 个结果，用时 {history.search_duration_ms}ms
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(history.search_time)}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Button
                    size="small"
                    onClick={() => {
                      setSearchCriteria(history.criteria);
                      setCurrentTab(0);
                    }}
                  >
                    重新搜索
                  </Button>
                </ListItemSecondaryAction>
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <History sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
          <Typography color="text.secondary">
            暂无搜索历史
          </Typography>
        </Paper>
      )}
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={2}>
          <Search />
          <Typography variant="h6">高级搜索</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs 
            value={currentTab} 
            onChange={(_, newValue) => setCurrentTab(newValue)}
            aria-label="搜索标签"
          >
            <Tab label="高级搜索" />
            <Tab label="快速搜索" />
            <Tab label="保存的搜索" />
            <Tab label="搜索历史" />
          </Tabs>
        </Box>

        <TabPanel value={currentTab} index={0}>
          {renderSearchInterface()}
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          {renderQuickSearch()}
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          {renderSavedSearches()}
        </TabPanel>

        <TabPanel value={currentTab} index={3}>
          {renderSearchHistory()}
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

export default AdvancedSearchDialog;
