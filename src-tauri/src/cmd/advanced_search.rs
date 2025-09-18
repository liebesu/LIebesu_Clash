use anyhow::{Context, Result};
use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use nanoid::nanoid;

/// 搜索条件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchCriteria {
    pub query: String,
    pub filters: Vec<SearchFilter>,
    pub sort_by: SortBy,
    pub sort_order: SortOrder,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// 搜索过滤器
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFilter {
    pub field: SearchField,
    pub operator: FilterOperator,
    pub value: String,
    pub case_sensitive: bool,
}

/// 搜索字段
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SearchField {
    Name,           // 订阅名称
    Description,    // 描述
    Url,           // 订阅链接
    Type,          // 订阅类型
    UpdatedAt,     // 更新时间
    CreatedAt,     // 创建时间
    NodeCount,     // 节点数量
    Tags,          // 标签
    Groups,        // 分组
    Country,       // 国家
    Provider,      // 服务商
    Protocol,      // 协议类型
    Latency,       // 延迟
    Speed,         // 速度
    Status,        // 状态
    TrafficUsage,  // 流量使用
    ExpiryDate,    // 到期时间
}

/// 过滤操作符
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FilterOperator {
    Equals,         // 等于
    NotEquals,      // 不等于
    Contains,       // 包含
    NotContains,    // 不包含
    StartsWith,     // 开始于
    EndsWith,       // 结束于
    Matches,        // 正则匹配
    NotMatches,     // 正则不匹配
    GreaterThan,    // 大于
    LessThan,       // 小于
    GreaterEqual,   // 大于等于
    LessEqual,      // 小于等于
    Between,        // 在范围内
    NotBetween,     // 不在范围内
    IsEmpty,        // 为空
    IsNotEmpty,     // 不为空
    InList,         // 在列表中
    NotInList,      // 不在列表中
}

/// 排序字段
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SortBy {
    Name,
    UpdatedAt,
    CreatedAt,
    NodeCount,
    Latency,
    Speed,
    TrafficUsage,
    ExpiryDate,
    Relevance,      // 相关性
}

/// 排序顺序
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SortOrder {
    Ascending,
    Descending,
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub total_count: u32,
    pub items: Vec<SubscriptionSearchItem>,
    pub search_time_ms: u64,
    pub suggestions: Vec<String>,
    pub facets: HashMap<String, Vec<FacetValue>>,
}

/// 订阅搜索项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionSearchItem {
    pub uid: String,
    pub name: String,
    pub description: Option<String>,
    pub url: Option<String>,
    pub subscription_type: String,
    pub node_count: u32,
    pub country: Option<String>,
    pub provider: Option<String>,
    pub tags: Vec<String>,
    pub groups: Vec<String>,
    pub created_at: i64,
    pub updated_at: Option<i64>,
    pub latency: Option<f32>,
    pub speed: Option<f32>,
    pub traffic_usage: Option<u64>,
    pub expiry_date: Option<i64>,
    pub status: String,
    pub relevance_score: f32,
    pub highlights: HashMap<String, Vec<String>>, // 高亮显示的匹配部分
}

/// 分面值
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FacetValue {
    pub value: String,
    pub count: u32,
    pub selected: bool,
}

/// 保存的搜索
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedSearch {
    pub id: String,
    pub name: String,
    pub description: String,
    pub criteria: SearchCriteria,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_favorite: bool,
    pub usage_count: u32,
    pub last_used: Option<i64>,
}

/// 搜索历史
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHistory {
    pub id: String,
    pub query: String,
    pub criteria: SearchCriteria,
    pub result_count: u32,
    pub search_time: i64,
    pub search_duration_ms: u64,
}

/// 搜索建议
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchSuggestion {
    pub suggestion: String,
    pub suggestion_type: SuggestionType,
    pub frequency: u32,
    pub relevance: f32,
}

/// 建议类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SuggestionType {
    Query,      // 查询建议
    Filter,     // 过滤器建议
    Tag,        // 标签建议
    Country,    // 国家建议
    Provider,   // 服务商建议
}

/// 搜索索引项
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SearchIndexItem {
    pub uid: String,
    pub searchable_text: String,
    pub fields: HashMap<String, String>,
    pub tags: Vec<String>,
    pub numeric_fields: HashMap<String, f64>,
    pub date_fields: HashMap<String, i64>,
}

/// 执行高级搜索
#[tauri::command]
pub async fn advanced_search(criteria: SearchCriteria) -> Result<SearchResult, String> {
    let start_time = std::time::Instant::now();
    
    // 获取所有订阅数据（模拟）
    let all_subscriptions = get_all_subscriptions_for_search()
        .await
        .map_err(|e| format!("Failed to get subscriptions: {}", e))?;

    // 应用搜索过滤
    let mut filtered_items = apply_search_filters(&all_subscriptions, &criteria)
        .map_err(|e| format!("Failed to apply filters: {}", e))?;

    // 计算相关性得分
    calculate_relevance_scores(&mut filtered_items, &criteria.query);

    // 应用排序
    apply_sorting(&mut filtered_items, &criteria.sort_by, &criteria.sort_order);

    // 应用分页
    let total_count = filtered_items.len() as u32;
    let offset = criteria.offset.unwrap_or(0) as usize;
    let limit = criteria.limit.unwrap_or(100) as usize;
    
    let mut paginated_items = if offset < filtered_items.len() {
        let end = std::cmp::min(offset + limit, filtered_items.len());
        filtered_items[offset..end].to_vec()
    } else {
        Vec::new()
    };

    // 生成高亮显示
    let mut paginated_items_vec: Vec<&mut SubscriptionSearchItem> = paginated_items.iter_mut().collect();
    add_highlights(&mut paginated_items_vec, &criteria.query);

    // 生成搜索建议
    let suggestions = generate_search_suggestions(&criteria.query, &all_subscriptions)
        .map_err(|e| format!("Failed to generate suggestions: {}", e))?;

    // 生成分面
    let facets = generate_facets(&all_subscriptions, &criteria)
        .map_err(|e| format!("Failed to generate facets: {}", e))?;

    // 记录搜索历史
    record_search_history(&criteria, total_count, start_time.elapsed().as_millis() as u64)
        .await
        .map_err(|e| format!("Failed to record search history: {}", e))?;

    let search_time_ms = start_time.elapsed().as_millis() as u64;

    Ok(SearchResult {
        total_count,
        items: paginated_items,
        search_time_ms,
        suggestions,
        facets,
    })
}

/// 快速搜索
#[tauri::command]
pub async fn quick_search(query: String, limit: Option<u32>) -> Result<Vec<SubscriptionSearchItem>, String> {
    let criteria = SearchCriteria {
        query,
        filters: Vec::new(),
        sort_by: SortBy::Relevance,
        sort_order: SortOrder::Descending,
        limit,
        offset: Some(0),
    };

    let result = advanced_search(criteria).await?;
    Ok(result.items)
}

/// 保存搜索
#[tauri::command]
pub async fn save_search(name: String, description: String, criteria: SearchCriteria) -> Result<String, String> {
    let search_id = nanoid!();
    let timestamp = Utc::now().timestamp();

    let saved_search = SavedSearch {
        id: search_id.clone(),
        name,
        description,
        criteria,
        created_at: timestamp,
        updated_at: timestamp,
        is_favorite: false,
        usage_count: 0,
        last_used: None,
    };

    save_saved_search(&saved_search)
        .map_err(|e| format!("Failed to save search: {}", e))?;

    Ok(search_id)
}

/// 获取保存的搜索
#[tauri::command]
pub async fn get_saved_searches() -> Result<Vec<SavedSearch>, String> {
    load_saved_searches()
        .map_err(|e| format!("Failed to load saved searches: {}", e))
}

/// 删除保存的搜索
#[tauri::command]
pub async fn delete_saved_search(search_id: String) -> Result<(), String> {
    let mut searches = load_saved_searches()
        .map_err(|e| format!("Failed to load saved searches: {}", e))?;

    searches.retain(|s| s.id != search_id);

    save_saved_searches(&searches)
        .map_err(|e| format!("Failed to save searches: {}", e))?;

    Ok(())
}

/// 执行保存的搜索
#[tauri::command]
pub async fn execute_saved_search(search_id: String) -> Result<SearchResult, String> {
    let mut searches = load_saved_searches()
        .map_err(|e| format!("Failed to load saved searches: {}", e))?;

    if let Some(search) = searches.iter_mut().find(|s| s.id == search_id) {
        // 更新使用统计
        search.usage_count += 1;
        search.last_used = Some(Utc::now().timestamp());
        
        let criteria = search.criteria.clone();

        // 保存更新
        save_saved_searches(&searches)
            .map_err(|e| format!("Failed to update search stats: {}", e))?;

        // 执行搜索
        advanced_search(criteria).await
    } else {
        Err("Saved search not found".to_string())
    }
}

/// 获取搜索历史
#[tauri::command]
pub async fn get_search_history(limit: Option<u32>) -> Result<Vec<SearchHistory>, String> {
    let history = load_search_history()
        .map_err(|e| format!("Failed to load search history: {}", e))?;

    let limit = limit.unwrap_or(50) as usize;
    let result = if history.len() > limit {
        history[..limit].to_vec()
    } else {
        history
    };

    Ok(result)
}

/// 清理搜索历史
#[tauri::command]
pub async fn clear_search_history() -> Result<(), String> {
    save_search_history(&Vec::new())
        .map_err(|e| format!("Failed to clear search history: {}", e))?;

    Ok(())
}

/// 获取搜索建议
#[tauri::command]
pub async fn get_search_suggestions(query: String) -> Result<Vec<SearchSuggestion>, String> {
    let subscriptions = get_all_subscriptions_for_search()
        .await
        .map_err(|e| format!("Failed to get subscriptions: {}", e))?;

    generate_smart_suggestions(&query, &subscriptions)
        .map_err(|e| format!("Failed to generate suggestions: {}", e))
}

/// 获取字段值建议
#[tauri::command]
pub async fn get_field_value_suggestions(field: SearchField) -> Result<Vec<String>, String> {
    let subscriptions = get_all_subscriptions_for_search()
        .await
        .map_err(|e| format!("Failed to get subscriptions: {}", e))?;

    let mut values = HashSet::new();

    for item in subscriptions {
        match field {
            SearchField::Country => {
                if let Some(country) = item.country {
                    values.insert(country);
                }
            }
            SearchField::Provider => {
                if let Some(provider) = item.provider {
                    values.insert(provider);
                }
            }
            SearchField::Tags => {
                for tag in item.tags {
                    values.insert(tag);
                }
            }
            SearchField::Type => {
                values.insert(item.subscription_type);
            }
            SearchField::Status => {
                values.insert(item.status);
            }
            _ => {}
        }
    }

    let mut result: Vec<String> = values.into_iter().collect();
    result.sort();

    Ok(result)
}

/// 更新搜索索引
#[tauri::command]
pub async fn update_search_index() -> Result<(), String> {
    let subscriptions = get_all_subscriptions_for_search()
        .await
        .map_err(|e| format!("Failed to get subscriptions: {}", e))?;

    let index_items: Vec<SearchIndexItem> = subscriptions
        .into_iter()
        .map(|item| {
            let mut searchable_text = format!(
                "{} {} {} {}",
                item.name,
                item.description.as_ref().map(|s| s.clone()).unwrap_or_default(),
                item.url.as_ref().map(|s| s.clone()).unwrap_or_default(),
                item.tags.join(" ")
            );

            if let Some(country) = &item.country {
                searchable_text.push_str(&format!(" {}", country));
            }

            if let Some(provider) = &item.provider {
                searchable_text.push_str(&format!(" {}", provider));
            }

            let mut fields = HashMap::new();
            fields.insert("name".to_string(), item.name.clone());
            fields.insert("type".to_string(), item.subscription_type.clone());
            fields.insert("status".to_string(), item.status.clone());

            if let Some(desc) = &item.description {
                fields.insert("description".to_string(), desc.clone());
            }
            if let Some(url) = &item.url {
                fields.insert("url".to_string(), url.clone());
            }
            if let Some(country) = &item.country {
                fields.insert("country".to_string(), country.clone());
            }
            if let Some(provider) = &item.provider {
                fields.insert("provider".to_string(), provider.clone());
            }

            let mut numeric_fields = HashMap::new();
            numeric_fields.insert("node_count".to_string(), item.node_count as f64);
            if let Some(latency) = item.latency {
                numeric_fields.insert("latency".to_string(), latency as f64);
            }
            if let Some(speed) = item.speed {
                numeric_fields.insert("speed".to_string(), speed as f64);
            }
            if let Some(traffic) = item.traffic_usage {
                numeric_fields.insert("traffic_usage".to_string(), traffic as f64);
            }

            let mut date_fields = HashMap::new();
            date_fields.insert("created_at".to_string(), item.created_at);
            if let Some(updated) = item.updated_at {
                date_fields.insert("updated_at".to_string(), updated);
            }
            if let Some(expiry) = item.expiry_date {
                date_fields.insert("expiry_date".to_string(), expiry);
            }

            SearchIndexItem {
                uid: item.uid,
                searchable_text: searchable_text.to_lowercase(),
                fields,
                tags: item.tags,
                numeric_fields,
                date_fields,
            }
        })
        .collect();

    save_search_index(&index_items)
        .map_err(|e| format!("Failed to save search index: {}", e))?;

    Ok(())
}

/// 获取搜索统计
#[tauri::command]
pub async fn get_search_statistics() -> Result<SearchStatistics, String> {
    let history = load_search_history()
        .map_err(|e| format!("Failed to load search history: {}", e))?;

    let saved_searches = load_saved_searches()
        .map_err(|e| format!("Failed to load saved searches: {}", e))?;

    let total_searches = history.len() as u32;
    let total_saved_searches = saved_searches.len() as u32;

    let avg_search_time = if !history.is_empty() {
        history.iter().map(|h| h.search_duration_ms).sum::<u64>() / history.len() as u64
    } else {
        0
    };

    let mut popular_queries = HashMap::new();
    for h in &history {
        *popular_queries.entry(h.query.clone()).or_insert(0) += 1;
    }

    let mut popular_queries: Vec<(String, u32)> = popular_queries.into_iter().collect();
    popular_queries.sort_by(|a, b| b.1.cmp(&a.1));
    popular_queries.truncate(10);

    Ok(SearchStatistics {
        total_searches,
        total_saved_searches,
        avg_search_time_ms: avg_search_time,
        popular_queries: popular_queries.into_iter().map(|(q, c)| PopularQuery { query: q, count: c }).collect(),
        recent_searches: history.into_iter().take(5).map(|h| h.query).collect(),
    })
}

/// 搜索统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchStatistics {
    pub total_searches: u32,
    pub total_saved_searches: u32,
    pub avg_search_time_ms: u64,
    pub popular_queries: Vec<PopularQuery>,
    pub recent_searches: Vec<String>,
}

/// 热门查询
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PopularQuery {
    pub query: String,
    pub count: u32,
}

// 辅助函数实现

/// 获取所有订阅数据进行搜索
async fn get_all_subscriptions_for_search() -> Result<Vec<SubscriptionSearchItem>> {
    // TODO: 从实际的配置文件和数据库读取订阅数据
    // 这里使用模拟数据
    Ok(vec![
        SubscriptionSearchItem {
            uid: "sub1".to_string(),
            name: "高速美国节点".to_string(),
            description: Some("稳定高速的美国服务器".to_string()),
            url: Some("https://example.com/sub1".to_string()),
            subscription_type: "clash".to_string(),
            node_count: 25,
            country: Some("美国".to_string()),
            provider: Some("FastVPN".to_string()),
            tags: vec!["美国".to_string(), "高速".to_string(), "稳定".to_string()],
            groups: vec!["收藏夹".to_string(), "美国节点".to_string()],
            created_at: Utc::now().timestamp() - 30 * 24 * 3600,
            updated_at: Some(Utc::now().timestamp() - 3600),
            latency: Some(85.2),
            speed: Some(32.6),
            traffic_usage: Some(1024 * 1024 * 1024 * 6), // 6GB
            expiry_date: Some(Utc::now().timestamp() + 30 * 24 * 3600),
            status: "active".to_string(),
            relevance_score: 0.0,
            highlights: HashMap::new(),
        },
        SubscriptionSearchItem {
            uid: "sub2".to_string(),
            name: "日本游戏专用".to_string(),
            description: Some("低延迟日本游戏服务器".to_string()),
            url: Some("https://example.com/sub2".to_string()),
            subscription_type: "v2ray".to_string(),
            node_count: 15,
            country: Some("日本".to_string()),
            provider: Some("GameVPN".to_string()),
            tags: vec!["日本".to_string(), "游戏".to_string(), "低延迟".to_string()],
            groups: vec!["游戏专用".to_string()],
            created_at: Utc::now().timestamp() - 20 * 24 * 3600,
            updated_at: Some(Utc::now().timestamp() - 7200),
            latency: Some(45.1),
            speed: Some(25.8),
            traffic_usage: Some(1024 * 1024 * 1024 * 3), // 3GB
            expiry_date: Some(Utc::now().timestamp() + 15 * 24 * 3600),
            status: "active".to_string(),
            relevance_score: 0.0,
            highlights: HashMap::new(),
        },
        SubscriptionSearchItem {
            uid: "sub3".to_string(),
            name: "欧洲多国节点".to_string(),
            description: Some("覆盖多个欧洲国家的节点".to_string()),
            url: Some("https://example.com/sub3".to_string()),
            subscription_type: "trojan".to_string(),
            node_count: 40,
            country: Some("欧洲".to_string()),
            provider: Some("EuroVPN".to_string()),
            tags: vec!["欧洲".to_string(), "多国".to_string(), "全面".to_string()],
            groups: vec!["欧洲节点".to_string()],
            created_at: Utc::now().timestamp() - 45 * 24 * 3600,
            updated_at: Some(Utc::now().timestamp() - 1800),
            latency: Some(120.5),
            speed: Some(28.3),
            traffic_usage: Some(1024 * 1024 * 1024 * 8), // 8GB
            expiry_date: Some(Utc::now().timestamp() + 60 * 24 * 3600),
            status: "active".to_string(),
            relevance_score: 0.0,
            highlights: HashMap::new(),
        },
    ])
}

/// 应用搜索过滤器
fn apply_search_filters(
    items: &[SubscriptionSearchItem],
    criteria: &SearchCriteria,
) -> Result<Vec<SubscriptionSearchItem>> {
    let mut filtered = Vec::new();

    for item in items {
        let mut matches = true;

        // 文本查询匹配
        if !criteria.query.is_empty() {
            let query_lower = criteria.query.to_lowercase();
            let searchable_text = format!(
                "{} {} {} {} {} {}",
                item.name.to_lowercase(),
                item.description.as_ref().unwrap_or(&String::new()).to_lowercase(),
                item.url.as_ref().unwrap_or(&String::new()).to_lowercase(),
                item.tags.join(" ").to_lowercase(),
                item.country.as_ref().unwrap_or(&String::new()).to_lowercase(),
                item.provider.as_ref().unwrap_or(&String::new()).to_lowercase()
            );

            if !searchable_text.contains(&query_lower) {
                matches = false;
            }
        }

        // 应用过滤器
        for filter in &criteria.filters {
            if !apply_single_filter(item, filter)? {
                matches = false;
                break;
            }
        }

        if matches {
            filtered.push(item.clone());
        }
    }

    Ok(filtered)
}

/// 应用单个过滤器
fn apply_single_filter(
    item: &SubscriptionSearchItem,
    filter: &SearchFilter,
) -> Result<bool> {
    let field_value = get_field_value(item, &filter.field);
    
    match filter.operator {
        FilterOperator::Equals => Ok(compare_strings(&field_value, &filter.value, filter.case_sensitive) == std::cmp::Ordering::Equal),
        FilterOperator::NotEquals => Ok(compare_strings(&field_value, &filter.value, filter.case_sensitive) != std::cmp::Ordering::Equal),
        FilterOperator::Contains => Ok(contains_string(&field_value, &filter.value, filter.case_sensitive)),
        FilterOperator::NotContains => Ok(!contains_string(&field_value, &filter.value, filter.case_sensitive)),
        FilterOperator::StartsWith => Ok(starts_with_string(&field_value, &filter.value, filter.case_sensitive)),
        FilterOperator::EndsWith => Ok(ends_with_string(&field_value, &filter.value, filter.case_sensitive)),
        FilterOperator::Matches => {
            let regex = if filter.case_sensitive {
                Regex::new(&filter.value)
            } else {
                Regex::new(&format!("(?i){}", filter.value))
            };
            match regex {
                Ok(re) => Ok(re.is_match(&field_value)),
                Err(_) => Ok(false),
            }
        }
        FilterOperator::GreaterThan => {
            if let Ok(field_num) = field_value.parse::<f64>() {
                if let Ok(filter_num) = filter.value.parse::<f64>() {
                    return Ok(field_num > filter_num);
                }
            }
            Ok(false)
        }
        FilterOperator::LessThan => {
            if let Ok(field_num) = field_value.parse::<f64>() {
                if let Ok(filter_num) = filter.value.parse::<f64>() {
                    return Ok(field_num < filter_num);
                }
            }
            Ok(false)
        }
        FilterOperator::IsEmpty => Ok(field_value.is_empty()),
        FilterOperator::IsNotEmpty => Ok(!field_value.is_empty()),
        FilterOperator::InList => {
            let list: Vec<&str> = filter.value.split(',').map(|s| s.trim()).collect();
            Ok(list.contains(&field_value.as_str()))
        }
        _ => Ok(true), // 其他操作符的默认实现
    }
}

/// 获取字段值
fn get_field_value(item: &SubscriptionSearchItem, field: &SearchField) -> String {
    match field {
        SearchField::Name => item.name.clone(),
        SearchField::Description => item.description.clone().unwrap_or_default(),
        SearchField::Url => item.url.clone().unwrap_or_default(),
        SearchField::Type => item.subscription_type.clone(),
        SearchField::NodeCount => item.node_count.to_string(),
        SearchField::Country => item.country.clone().unwrap_or_default(),
        SearchField::Provider => item.provider.clone().unwrap_or_default(),
        SearchField::Tags => item.tags.join(","),
        SearchField::Groups => item.groups.join(","),
        SearchField::Status => item.status.clone(),
        SearchField::Latency => item.latency.map(|l| l.to_string()).unwrap_or_default(),
        SearchField::Speed => item.speed.map(|s| s.to_string()).unwrap_or_default(),
        SearchField::TrafficUsage => item.traffic_usage.map(|t| t.to_string()).unwrap_or_default(),
        SearchField::CreatedAt => item.created_at.to_string(),
        SearchField::UpdatedAt => item.updated_at.map(|u| u.to_string()).unwrap_or_default(),
        SearchField::ExpiryDate => item.expiry_date.map(|e| e.to_string()).unwrap_or_default(),
        _ => String::new(),
    }
}

/// 字符串比较
fn compare_strings(a: &str, b: &str, case_sensitive: bool) -> std::cmp::Ordering {
    if case_sensitive {
        a.cmp(b)
    } else {
        a.to_lowercase().cmp(&b.to_lowercase())
    }
}

/// 字符串包含检查
fn contains_string(haystack: &str, needle: &str, case_sensitive: bool) -> bool {
    if case_sensitive {
        haystack.contains(needle)
    } else {
        haystack.to_lowercase().contains(&needle.to_lowercase())
    }
}

/// 字符串开头检查
fn starts_with_string(haystack: &str, needle: &str, case_sensitive: bool) -> bool {
    if case_sensitive {
        haystack.starts_with(needle)
    } else {
        haystack.to_lowercase().starts_with(&needle.to_lowercase())
    }
}

/// 字符串结尾检查
fn ends_with_string(haystack: &str, needle: &str, case_sensitive: bool) -> bool {
    if case_sensitive {
        haystack.ends_with(needle)
    } else {
        haystack.to_lowercase().ends_with(&needle.to_lowercase())
    }
}

/// 计算相关性得分
fn calculate_relevance_scores(items: &mut [SubscriptionSearchItem], query: &str) {
    if query.is_empty() {
        for item in items {
            item.relevance_score = 1.0;
        }
        return;
    }

    let query_lower = query.to_lowercase();
    let query_words: Vec<&str> = query_lower.split_whitespace().collect();

    for item in items {
        let mut score = 0.0;

        // 名称匹配权重最高
        if item.name.to_lowercase().contains(&query_lower) {
            score += 10.0;
            if item.name.to_lowercase() == query_lower {
                score += 20.0; // 完全匹配
            }
        }

        // 描述匹配
        if let Some(desc) = &item.description {
            if desc.to_lowercase().contains(&query_lower) {
                score += 5.0;
            }
        }

        // 标签匹配
        for tag in &item.tags {
            if tag.to_lowercase().contains(&query_lower) {
                score += 3.0;
            }
        }

        // 国家和服务商匹配
        if let Some(country) = &item.country {
            if country.to_lowercase().contains(&query_lower) {
                score += 2.0;
            }
        }

        if let Some(provider) = &item.provider {
            if provider.to_lowercase().contains(&query_lower) {
                score += 2.0;
            }
        }

        // 词语匹配
        for word in &query_words {
            let text = format!("{} {} {}", 
                item.name.to_lowercase(),
                item.description.as_ref().unwrap_or(&String::new()).to_lowercase(),
                item.tags.join(" ").to_lowercase()
            );
            if text.contains(word) {
                score += 1.0;
            }
        }

        item.relevance_score = score;
    }
}

/// 应用排序
fn apply_sorting(
    items: &mut [SubscriptionSearchItem],
    sort_by: &SortBy,
    sort_order: &SortOrder,
) {
    items.sort_by(|a, b| {
        let ordering = match sort_by {
            SortBy::Name => a.name.cmp(&b.name),
            SortBy::CreatedAt => a.created_at.cmp(&b.created_at),
            SortBy::UpdatedAt => {
                a.updated_at.unwrap_or(0).cmp(&b.updated_at.unwrap_or(0))
            }
            SortBy::NodeCount => a.node_count.cmp(&b.node_count),
            SortBy::Latency => {
                a.latency.unwrap_or(f32::MAX).partial_cmp(&b.latency.unwrap_or(f32::MAX))
                    .unwrap_or(std::cmp::Ordering::Equal)
            }
            SortBy::Speed => {
                a.speed.unwrap_or(0.0).partial_cmp(&b.speed.unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal)
            }
            SortBy::TrafficUsage => {
                a.traffic_usage.unwrap_or(0).cmp(&b.traffic_usage.unwrap_or(0))
            }
            SortBy::ExpiryDate => {
                a.expiry_date.unwrap_or(i64::MAX).cmp(&b.expiry_date.unwrap_or(i64::MAX))
            }
            SortBy::Relevance => {
                b.relevance_score.partial_cmp(&a.relevance_score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            }
        };

        match sort_order {
            SortOrder::Ascending => ordering,
            SortOrder::Descending => ordering.reverse(),
        }
    });
}

/// 添加高亮显示
fn add_highlights(items: &mut Vec<&mut SubscriptionSearchItem>, query: &str) {
    if query.is_empty() {
        return;
    }

    let query_lower = query.to_lowercase();

    for item in items {
        let mut highlights = HashMap::new();

        // 高亮名称
        if item.name.to_lowercase().contains(&query_lower) {
            highlights.insert("name".to_string(), vec![query.to_string()]);
        }

        // 高亮描述
        if let Some(desc) = &item.description {
            if desc.to_lowercase().contains(&query_lower) {
                highlights.insert("description".to_string(), vec![query.to_string()]);
            }
        }

        // 高亮标签
        let matching_tags: Vec<String> = item.tags.iter()
            .filter(|tag| tag.to_lowercase().contains(&query_lower))
            .cloned()
            .collect();
        
        if !matching_tags.is_empty() {
            highlights.insert("tags".to_string(), matching_tags);
        }

        item.highlights = highlights;
    }
}

/// 生成搜索建议
fn generate_search_suggestions(
    _query: &str,
    _items: &[SubscriptionSearchItem],
) -> Result<Vec<String>> {
    // TODO: 实现智能搜索建议
    Ok(vec![
        "美国高速".to_string(),
        "日本游戏".to_string(),
        "欧洲节点".to_string(),
        "低延迟".to_string(),
        "稳定连接".to_string(),
    ])
}

/// 生成分面
fn generate_facets(
    items: &[SubscriptionSearchItem],
    _criteria: &SearchCriteria,
) -> Result<HashMap<String, Vec<FacetValue>>> {
    let mut facets = HashMap::new();

    // 国家分面
    let mut countries = HashMap::new();
    for item in items {
        if let Some(country) = &item.country {
            *countries.entry(country.clone()).or_insert(0) += 1;
        }
    }
    let country_facets: Vec<FacetValue> = countries
        .into_iter()
        .map(|(value, count)| FacetValue { value, count, selected: false })
        .collect();
    facets.insert("country".to_string(), country_facets);

    // 服务商分面
    let mut providers = HashMap::new();
    for item in items {
        if let Some(provider) = &item.provider {
            *providers.entry(provider.clone()).or_insert(0) += 1;
        }
    }
    let provider_facets: Vec<FacetValue> = providers
        .into_iter()
        .map(|(value, count)| FacetValue { value, count, selected: false })
        .collect();
    facets.insert("provider".to_string(), provider_facets);

    // 类型分面
    let mut types = HashMap::new();
    for item in items {
        *types.entry(item.subscription_type.clone()).or_insert(0) += 1;
    }
    let type_facets: Vec<FacetValue> = types
        .into_iter()
        .map(|(value, count)| FacetValue { value, count, selected: false })
        .collect();
    facets.insert("type".to_string(), type_facets);

    Ok(facets)
}

/// 生成智能建议
fn generate_smart_suggestions(
    _query: &str,
    _items: &[SubscriptionSearchItem],
) -> Result<Vec<SearchSuggestion>> {
    // TODO: 实现基于机器学习的智能建议
    Ok(vec![
        SearchSuggestion {
            suggestion: "美国".to_string(),
            suggestion_type: SuggestionType::Country,
            frequency: 15,
            relevance: 0.9,
        },
        SearchSuggestion {
            suggestion: "高速".to_string(),
            suggestion_type: SuggestionType::Tag,
            frequency: 12,
            relevance: 0.8,
        },
        SearchSuggestion {
            suggestion: "游戏".to_string(),
            suggestion_type: SuggestionType::Tag,
            frequency: 8,
            relevance: 0.7,
        },
    ])
}

/// 记录搜索历史
async fn record_search_history(
    criteria: &SearchCriteria,
    result_count: u32,
    duration_ms: u64,
) -> Result<()> {
    let history_item = SearchHistory {
        id: nanoid!(),
        query: criteria.query.clone(),
        criteria: criteria.clone(),
        result_count,
        search_time: Utc::now().timestamp(),
        search_duration_ms: duration_ms,
    };

    let mut history = load_search_history().unwrap_or_default();
    history.insert(0, history_item);

    // 保持最近 100 条记录
    if history.len() > 100 {
        history.truncate(100);
    }

    save_search_history(&history)?;
    Ok(())
}

// 数据持久化函数

/// 获取搜索数据目录
fn get_search_data_dir() -> Result<PathBuf> {
    let app_dir = crate::utils::dirs::verge_path()
        .map_err(|e| anyhow::anyhow!("Failed to get app data directory: {}", e))?;
    let search_dir = app_dir.join("search");
    
    if !search_dir.exists() {
        std::fs::create_dir_all(&search_dir)
            .context("Failed to create search directory")?;
    }
    
    Ok(search_dir)
}

/// 保存搜索索引
fn save_search_index(index: &[SearchIndexItem]) -> Result<()> {
    let data_dir = get_search_data_dir()?;
    let index_file = data_dir.join("search_index.json");
    
    let json_data = serde_json::to_string_pretty(index)?;
    fs::write(index_file, json_data)?;
    
    Ok(())
}

/// 保存已保存的搜索
fn save_saved_search(search: &SavedSearch) -> Result<()> {
    let mut searches = load_saved_searches().unwrap_or_default();
    searches.push(search.clone());
    save_saved_searches(&searches)
}

/// 保存已保存的搜索列表
fn save_saved_searches(searches: &[SavedSearch]) -> Result<()> {
    let data_dir = get_search_data_dir()?;
    let searches_file = data_dir.join("saved_searches.json");
    
    let json_data = serde_json::to_string_pretty(searches)?;
    fs::write(searches_file, json_data)?;
    
    Ok(())
}

/// 加载已保存的搜索
fn load_saved_searches() -> Result<Vec<SavedSearch>> {
    let data_dir = get_search_data_dir()?;
    let searches_file = data_dir.join("saved_searches.json");
    
    if !searches_file.exists() {
        return Ok(Vec::new());
    }
    
    let json_data = fs::read_to_string(searches_file)?;
    let searches: Vec<SavedSearch> = serde_json::from_str(&json_data)?;
    
    Ok(searches)
}

/// 保存搜索历史
fn save_search_history(history: &[SearchHistory]) -> Result<()> {
    let data_dir = get_search_data_dir()?;
    let history_file = data_dir.join("search_history.json");
    
    let json_data = serde_json::to_string_pretty(history)?;
    fs::write(history_file, json_data)?;
    
    Ok(())
}

/// 加载搜索历史
fn load_search_history() -> Result<Vec<SearchHistory>> {
    let data_dir = get_search_data_dir()?;
    let history_file = data_dir.join("search_history.json");
    
    if !history_file.exists() {
        return Ok(Vec::new());
    }
    
    let json_data = fs::read_to_string(history_file)?;
    let history: Vec<SearchHistory> = serde_json::from_str(&json_data)?;
    
    Ok(history)
}
