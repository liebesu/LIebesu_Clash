use super::CmdResult;
use crate::{
    config::Config,
    utils::logging::Type,
    logging,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use once_cell::sync::Lazy;

/// 分组管理存储
static SUBSCRIPTION_GROUPS: Lazy<Arc<RwLock<GroupStorage>>> = 
    Lazy::new(|| Arc::new(RwLock::new(GroupStorage::new())));

/// 分组类型枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum GroupType {
    Region,     // 按地区分组
    Provider,   // 按服务商分组
    Usage,      // 按用途分组
    Speed,      // 按速度分组
    Custom,     // 自定义分组
}

/// 分组信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionGroup {
    pub id: String,
    pub name: String,
    pub description: String,
    pub group_type: GroupType,
    pub color: String,
    pub icon: String,
    pub subscription_uids: Vec<String>,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub sort_order: i32,
    pub auto_rules: Vec<AutoRule>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 自动分组规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoRule {
    pub rule_type: RuleType,
    pub condition: RuleCondition,
    pub value: String,
    pub is_enabled: bool,
}

/// 规则类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuleType {
    NameContains,       // 名称包含
    NameMatches,        // 名称匹配正则
    UrlContains,        // URL包含
    UrlMatches,         // URL匹配正则
    TagEquals,          // 标签等于
    SpeedRange,         // 速度范围
    LatencyRange,       // 延迟范围
}

/// 规则条件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuleCondition {
    Contains,
    NotContains,
    Equals,
    NotEquals,
    StartsWith,
    EndsWith,
    Matches,
    NotMatches,
    GreaterThan,
    LessThan,
    Between,
}

/// 分组统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupStatistics {
    pub group_id: String,
    pub group_name: String,
    pub total_subscriptions: usize,
    pub active_subscriptions: usize,
    pub total_nodes: usize,
    pub avg_latency_ms: f64,
    pub avg_speed_mbps: f64,
    pub health_score: f64,
    pub last_updated: i64,
}

/// 批量操作结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchOperationResult {
    pub total_items: usize,
    pub successful_items: usize,
    pub failed_items: usize,
    pub errors: Vec<String>,
    pub operation_duration_ms: u64,
}

/// 分组导入导出格式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupExportData {
    pub groups: Vec<SubscriptionGroup>,
    pub export_time: i64,
    pub version: String,
}

/// 智能分组建议
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupSuggestion {
    pub suggested_name: String,
    pub suggested_type: GroupType,
    pub suggested_subscriptions: Vec<String>,
    pub confidence_score: f64,
    pub reason: String,
}

/// 分组存储
struct GroupStorage {
    groups: HashMap<String, SubscriptionGroup>,
    subscription_to_groups: HashMap<String, HashSet<String>>,
}

impl GroupStorage {
    fn new() -> Self {
        Self {
            groups: HashMap::new(),
            subscription_to_groups: HashMap::new(),
        }
    }
}

/// 创建分组
#[tauri::command]
pub async fn create_subscription_group(group: SubscriptionGroup) -> CmdResult<String> {
    logging!(info, Type::Cmd, true, "[分组管理] 创建分组: {}", group.name);

    let mut storage = SUBSCRIPTION_GROUPS.write().await;
    
    let mut new_group = group;
    new_group.id = uuid::Uuid::new_v4().to_string();
    new_group.created_at = chrono::Utc::now().timestamp();
    new_group.updated_at = new_group.created_at;

    // 更新订阅到分组的映射
    for subscription_uid in &new_group.subscription_uids {
        storage.subscription_to_groups
            .entry(subscription_uid.clone())
            .or_insert_with(HashSet::new)
            .insert(new_group.id.clone());
    }

    let group_id = new_group.id.clone();
    storage.groups.insert(group_id.clone(), new_group);

    logging!(info, Type::Cmd, true, "[分组管理] 分组创建成功: {}", group_id);
    Ok(group_id)
}

/// 更新分组
#[tauri::command]
pub async fn update_subscription_group(group: SubscriptionGroup) -> CmdResult<()> {
    logging!(info, Type::Cmd, true, "[分组管理] 更新分组: {}", group.id);

    let mut storage = SUBSCRIPTION_GROUPS.write().await;
    
    // 获取旧的分组信息以清理映射
    let old_subscription_uids = storage.groups.get(&group.id)
        .map(|old_group| old_group.subscription_uids.clone())
        .unwrap_or_default();
    
    // 清理旧的映射
    for subscription_uid in &old_subscription_uids {
        if let Some(groups) = storage.subscription_to_groups.get_mut(subscription_uid) {
            groups.remove(&group.id);
            if groups.is_empty() {
                storage.subscription_to_groups.remove(subscription_uid);
            }
        }
    }

    let mut updated_group = group;
    updated_group.updated_at = chrono::Utc::now().timestamp();

    // 更新新的映射
    for subscription_uid in &updated_group.subscription_uids {
        storage.subscription_to_groups
            .entry(subscription_uid.clone())
            .or_insert_with(HashSet::new)
            .insert(updated_group.id.clone());
    }

    storage.groups.insert(updated_group.id.clone(), updated_group);
    Ok(())
}

/// 删除分组
#[tauri::command]
pub async fn delete_subscription_group(group_id: String) -> CmdResult<()> {
    logging!(info, Type::Cmd, true, "[分组管理] 删除分组: {}", group_id);

    let mut storage = SUBSCRIPTION_GROUPS.write().await;
    
    if let Some(group) = storage.groups.remove(&group_id) {
        // 清理映射
        for subscription_uid in &group.subscription_uids {
            if let Some(groups) = storage.subscription_to_groups.get_mut(subscription_uid) {
                groups.remove(&group_id);
                if groups.is_empty() {
                    storage.subscription_to_groups.remove(subscription_uid);
                }
            }
        }
    }

    Ok(())
}

/// 获取所有分组
#[tauri::command]
pub async fn get_all_subscription_groups() -> CmdResult<Vec<SubscriptionGroup>> {
    logging!(info, Type::Cmd, true, "[分组管理] 获取所有分组");

    let storage = SUBSCRIPTION_GROUPS.read().await;
    let mut groups: Vec<SubscriptionGroup> = storage.groups.values().cloned().collect();
    
    // 按排序顺序和创建时间排序
    groups.sort_by(|a, b| {
        a.sort_order.cmp(&b.sort_order)
            .then(a.created_at.cmp(&b.created_at))
    });

    Ok(groups)
}

/// 获取单个分组
#[tauri::command]
pub async fn get_subscription_group(group_id: String) -> CmdResult<SubscriptionGroup> {
    logging!(info, Type::Cmd, true, "[分组管理] 获取分组: {}", group_id);

    let storage = SUBSCRIPTION_GROUPS.read().await;
    
    storage.groups.get(&group_id)
        .cloned()
        .ok_or_else(|| "分组不存在".to_string())
}

/// 添加订阅到分组
#[tauri::command]
pub async fn add_subscription_to_group(
    group_id: String,
    subscription_uid: String,
) -> CmdResult<()> {
    logging!(info, Type::Cmd, true, "[分组管理] 添加订阅到分组: {} -> {}", subscription_uid, group_id);

    let mut storage = SUBSCRIPTION_GROUPS.write().await;
    
    if let Some(group) = storage.groups.get_mut(&group_id) {
        if !group.subscription_uids.contains(&subscription_uid) {
            group.subscription_uids.push(subscription_uid.clone());
            group.updated_at = chrono::Utc::now().timestamp();
            
            // 更新映射
            storage.subscription_to_groups
                .entry(subscription_uid)
                .or_insert_with(HashSet::new)
                .insert(group_id);
        }
    } else {
        return Err("分组不存在".to_string());
    }

    Ok(())
}

/// 从分组中移除订阅
#[tauri::command]
pub async fn remove_subscription_from_group(
    group_id: String,
    subscription_uid: String,
) -> CmdResult<()> {
    logging!(info, Type::Cmd, true, "[分组管理] 从分组移除订阅: {} <- {}", subscription_uid, group_id);

    let mut storage = SUBSCRIPTION_GROUPS.write().await;
    
    if let Some(group) = storage.groups.get_mut(&group_id) {
        group.subscription_uids.retain(|uid| uid != &subscription_uid);
        group.updated_at = chrono::Utc::now().timestamp();
        
        // 更新映射
        if let Some(groups) = storage.subscription_to_groups.get_mut(&subscription_uid) {
            groups.remove(&group_id);
            if groups.is_empty() {
                storage.subscription_to_groups.remove(&subscription_uid);
            }
        }
    }

    Ok(())
}

/// 获取订阅所属的分组
#[tauri::command]
pub async fn get_subscription_groups(subscription_uid: String) -> CmdResult<Vec<SubscriptionGroup>> {
    logging!(info, Type::Cmd, true, "[分组管理] 获取订阅所属分组: {}", subscription_uid);

    let storage = SUBSCRIPTION_GROUPS.read().await;
    let mut groups = Vec::new();
    
    if let Some(group_ids) = storage.subscription_to_groups.get(&subscription_uid) {
        for group_id in group_ids {
            if let Some(group) = storage.groups.get(group_id) {
                groups.push(group.clone());
            }
        }
    }

    Ok(groups)
}

/// 批量添加订阅到分组
#[tauri::command]
pub async fn batch_add_subscriptions_to_group(
    group_id: String,
    subscription_uids: Vec<String>,
) -> CmdResult<BatchOperationResult> {
    let start_time = std::time::Instant::now();
    logging!(info, Type::Cmd, true, "[分组管理] 批量添加订阅到分组: {} 个订阅 -> {}", subscription_uids.len(), group_id);

    let mut storage = SUBSCRIPTION_GROUPS.write().await;
    let mut successful = 0;
    let mut errors = Vec::new();

    if storage.groups.contains_key(&group_id) {
        let mut uids_to_add = Vec::new();
        
        // 首先确定哪些订阅需要添加
        if let Some(group) = storage.groups.get(&group_id) {
            for subscription_uid in &subscription_uids {
                if !group.subscription_uids.contains(subscription_uid) {
                    uids_to_add.push(subscription_uid.clone());
                    successful += 1;
                } else {
                    errors.push(format!("订阅 {} 已在分组中", subscription_uid));
                }
            }
        }
        
        // 然后添加订阅并更新映射
        if let Some(group) = storage.groups.get_mut(&group_id) {
            for uid in &uids_to_add {
                group.subscription_uids.push(uid.clone());
            }
            group.updated_at = chrono::Utc::now().timestamp();
        }
        
        // 更新映射
        for uid in &uids_to_add {
            storage.subscription_to_groups
                .entry(uid.clone())
                .or_insert_with(HashSet::new)
                .insert(group_id.clone());
        }
    } else {
        errors.push("分组不存在".to_string());
    }

    let duration = start_time.elapsed().as_millis() as u64;
    
    Ok(BatchOperationResult {
        total_items: subscription_uids.len(),
        successful_items: successful,
        failed_items: subscription_uids.len() - successful,
        errors,
        operation_duration_ms: duration,
    })
}

/// 批量移除订阅从分组
#[tauri::command]
pub async fn batch_remove_subscriptions_from_group(
    group_id: String,
    subscription_uids: Vec<String>,
) -> CmdResult<BatchOperationResult> {
    let start_time = std::time::Instant::now();
    logging!(info, Type::Cmd, true, "[分组管理] 批量移除订阅从分组: {} 个订阅 <- {}", subscription_uids.len(), group_id);

    let mut storage = SUBSCRIPTION_GROUPS.write().await;
    let mut successful = 0;
    let mut errors = Vec::new();

    if storage.groups.contains_key(&group_id) {
        let mut uids_to_remove = Vec::new();
        
        // 首先确定哪些订阅需要移除
        if let Some(group) = storage.groups.get(&group_id) {
            for subscription_uid in &subscription_uids {
                if group.subscription_uids.contains(subscription_uid) {
                    uids_to_remove.push(subscription_uid.clone());
                    successful += 1;
                } else {
                    errors.push(format!("订阅 {} 不在分组中", subscription_uid));
                }
            }
        }
        
        // 然后移除订阅并更新映射
        if let Some(group) = storage.groups.get_mut(&group_id) {
            for uid in &uids_to_remove {
                group.subscription_uids.retain(|existing_uid| existing_uid != uid);
            }
            group.updated_at = chrono::Utc::now().timestamp();
        }
        
        // 更新映射
        for uid in &uids_to_remove {
            if let Some(groups) = storage.subscription_to_groups.get_mut(uid) {
                groups.remove(&group_id);
                if groups.is_empty() {
                    storage.subscription_to_groups.remove(uid);
                }
            }
        }
    } else {
        errors.push("分组不存在".to_string());
    }

    let duration = start_time.elapsed().as_millis() as u64;
    
    Ok(BatchOperationResult {
        total_items: subscription_uids.len(),
        successful_items: successful,
        failed_items: subscription_uids.len() - successful,
        errors,
        operation_duration_ms: duration,
    })
}

/// 应用自动分组规则
#[tauri::command]
pub async fn apply_auto_grouping_rules() -> CmdResult<BatchOperationResult> {
    let start_time = std::time::Instant::now();
    logging!(info, Type::Cmd, true, "[分组管理] 应用自动分组规则");

    let mut storage = SUBSCRIPTION_GROUPS.write().await;
    let mut successful = 0;
    let mut errors = Vec::new();

    // 获取所有订阅
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    let empty_vec = Vec::new();
    let items = profiles_ref.items.as_ref().unwrap_or(&empty_vec);
    let subscriptions: Vec<_> = items.iter()
        .filter(|item| item.itype.as_ref().map(|t| t == "remote").unwrap_or(false))
        .collect();

    // 先收集所有需要添加的订阅和分组对应关系，避免在遍历时修改storage
    let mut additions = Vec::new();
    let mut group_updates = Vec::new();
    
    for group in storage.groups.values() {
        for rule in &group.auto_rules {
            if !rule.is_enabled {
                continue;
            }

            for subscription in &subscriptions {
                if let Some(uid) = &subscription.uid {
                    if group.subscription_uids.contains(uid) {
                        continue; // 已在分组中
                    }

                    let matches = match rule.rule_type {
                        RuleType::NameContains => {
                            subscription.name.as_ref()
                                .map(|name| apply_string_condition(name, &rule.condition, &rule.value))
                                .unwrap_or(false)
                        }
                        RuleType::UrlContains => {
                            subscription.url.as_ref()
                                .map(|url| apply_string_condition(url, &rule.condition, &rule.value))
                                .unwrap_or(false)
                        }
                        _ => false, // TODO: 实现其他规则类型
                    };

                    if matches {
                        additions.push((group.id.clone(), uid.clone()));
                    }
                }
            }
        }
        
        group_updates.push(group.id.clone());
    }
    
    // 应用所有添加操作
    for (group_id, uid) in additions {
        if let Some(group) = storage.groups.get_mut(&group_id) {
            group.subscription_uids.push(uid.clone());
        }
        
        // 更新映射
        storage.subscription_to_groups
            .entry(uid)
            .or_insert_with(HashSet::new)
            .insert(group_id);
        
        successful += 1;
    }
    
    // 更新所有分组的时间戳
    for group_id in group_updates {
        if let Some(group) = storage.groups.get_mut(&group_id) {
            group.updated_at = chrono::Utc::now().timestamp();
        }
    }

    let duration = start_time.elapsed().as_millis() as u64;
    
    Ok(BatchOperationResult {
        total_items: subscriptions.len(),
        successful_items: successful,
        failed_items: 0,
        errors,
        operation_duration_ms: duration,
    })
}

/// 获取分组统计信息
#[tauri::command]
pub async fn get_group_statistics(group_id: String) -> CmdResult<GroupStatistics> {
    logging!(info, Type::Cmd, true, "[分组管理] 获取分组统计: {}", group_id);

    let storage = SUBSCRIPTION_GROUPS.read().await;
    
    if let Some(group) = storage.groups.get(&group_id) {
        // TODO: 从健康检查和测试结果中获取实际统计数据
        let stats = GroupStatistics {
            group_id: group.id.clone(),
            group_name: group.name.clone(),
            total_subscriptions: group.subscription_uids.len(),
            active_subscriptions: group.subscription_uids.len(), // 简化实现
            total_nodes: 0, // TODO: 从订阅配置中计算节点数
            avg_latency_ms: 0.0, // TODO: 从测试结果中计算
            avg_speed_mbps: 0.0, // TODO: 从测试结果中计算
            health_score: 100.0, // TODO: 从健康检查结果中计算
            last_updated: group.updated_at,
        };
        
        Ok(stats)
    } else {
        Err("分组不存在".to_string())
    }
}

/// 获取所有分组统计信息
#[tauri::command]
pub async fn get_all_group_statistics() -> CmdResult<Vec<GroupStatistics>> {
    logging!(info, Type::Cmd, true, "[分组管理] 获取所有分组统计");

    let storage = SUBSCRIPTION_GROUPS.read().await;
    let mut statistics = Vec::new();

    for group in storage.groups.values() {
        let stats = GroupStatistics {
            group_id: group.id.clone(),
            group_name: group.name.clone(),
            total_subscriptions: group.subscription_uids.len(),
            active_subscriptions: group.subscription_uids.len(),
            total_nodes: 0,
            avg_latency_ms: 0.0,
            avg_speed_mbps: 0.0,
            health_score: 100.0,
            last_updated: group.updated_at,
        };
        
        statistics.push(stats);
    }

    Ok(statistics)
}

/// 导出分组配置
#[tauri::command]
pub async fn export_subscription_groups() -> CmdResult<String> {
    logging!(info, Type::Cmd, true, "[分组管理] 导出分组配置");

    let storage = SUBSCRIPTION_GROUPS.read().await;
    
    let export_data = GroupExportData {
        groups: storage.groups.values().cloned().collect(),
        export_time: chrono::Utc::now().timestamp(),
        version: "1.0".to_string(),
    };

    let json_data = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("导出数据序列化失败: {}", e))?;

    Ok(json_data)
}

/// 导入分组配置
#[tauri::command]
pub async fn import_subscription_groups(import_data: String) -> CmdResult<BatchOperationResult> {
    let start_time = std::time::Instant::now();
    logging!(info, Type::Cmd, true, "[分组管理] 导入分组配置");

    let export_data: GroupExportData = serde_json::from_str(&import_data)
        .map_err(|e| format!("导入数据解析失败: {}", e))?;

    let mut storage = SUBSCRIPTION_GROUPS.write().await;
    let mut successful = 0;
    let mut errors = Vec::new();

    let total_groups = export_data.groups.len();
    for mut group in export_data.groups {
        // 生成新的ID避免冲突
        let old_id = group.id.clone();
        group.id = uuid::Uuid::new_v4().to_string();
        group.updated_at = chrono::Utc::now().timestamp();

        // 更新映射
        for subscription_uid in &group.subscription_uids {
            storage.subscription_to_groups
                .entry(subscription_uid.clone())
                .or_insert_with(HashSet::new)
                .insert(group.id.clone());
        }

        let new_id = group.id.clone();
        storage.groups.insert(new_id.clone(), group);
        successful += 1;

        logging!(info, Type::Cmd, true, "[分组管理] 导入分组: {} -> {}", old_id, new_id);
    }

    let duration = start_time.elapsed().as_millis() as u64;
    
    Ok(BatchOperationResult {
        total_items: total_groups,
        successful_items: successful,
        failed_items: 0,
        errors,
        operation_duration_ms: duration,
    })
}

/// 获取智能分组建议
#[tauri::command]
pub async fn get_smart_grouping_suggestions() -> CmdResult<Vec<GroupSuggestion>> {
    logging!(info, Type::Cmd, true, "[分组管理] 获取智能分组建议");

    // 获取所有订阅
    let profiles = Config::profiles().await;
    let profiles_ref = profiles.latest_ref();
    let empty_vec = Vec::new();
    let items = profiles_ref.items.as_ref().unwrap_or(&empty_vec);
    let subscriptions: Vec<_> = items.iter()
        .filter(|item| item.itype.as_ref().map(|t| t == "remote").unwrap_or(false))
        .collect();

    let mut suggestions = Vec::new();

    // 根据域名分组建议
    let mut domain_groups: HashMap<String, Vec<String>> = HashMap::new();
    for subscription in &subscriptions {
        if let (Some(uid), Some(url)) = (&subscription.uid, &subscription.url) {
            if let Ok(parsed_url) = url::Url::parse(url) {
                if let Some(domain) = parsed_url.domain() {
                    domain_groups.entry(domain.to_string())
                        .or_insert_with(Vec::new)
                        .push(uid.clone());
                }
            }
        }
    }

    for (domain, uids) in domain_groups {
        if uids.len() >= 2 {
            suggestions.push(GroupSuggestion {
                suggested_name: format!("{} 订阅", domain),
                suggested_type: GroupType::Provider,
                suggested_subscriptions: uids,
                confidence_score: 0.8,
                reason: format!("基于相同域名 {} 的订阅", domain),
            });
        }
    }

    // 根据名称关键词分组建议
    let keywords = vec!["美国", "日本", "香港", "新加坡", "韩国", "台湾", "游戏", "视频", "流媒体"];
    for keyword in keywords {
        let matching_uids: Vec<String> = subscriptions.iter()
            .filter_map(|s| {
                if let (Some(uid), Some(name)) = (&s.uid, &s.name) {
                    if name.contains(keyword) {
                        Some(uid.clone())
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();

        if matching_uids.len() >= 2 {
            suggestions.push(GroupSuggestion {
                suggested_name: format!("{} 相关", keyword),
                suggested_type: if keyword.len() == 2 { GroupType::Region } else { GroupType::Usage },
                suggested_subscriptions: matching_uids,
                confidence_score: 0.7,
                reason: format!("基于名称包含关键词 \"{}\"", keyword),
            });
        }
    }

    Ok(suggestions)
}

/// 创建默认分组
#[tauri::command]
pub async fn create_default_groups() -> CmdResult<Vec<String>> {
    logging!(info, Type::Cmd, true, "[分组管理] 创建默认分组");

    let default_groups = vec![
        SubscriptionGroup {
            id: String::new(), // 将被重新生成
            name: "收藏夹".to_string(),
            description: "收藏的高质量订阅".to_string(),
            group_type: GroupType::Custom,
            color: "#FFD700".to_string(),
            icon: "star".to_string(),
            subscription_uids: Vec::new(),
            tags: vec!["favorite".to_string()],
            is_favorite: true,
            sort_order: 0,
            auto_rules: Vec::new(),
            created_at: 0,
            updated_at: 0,
        },
        SubscriptionGroup {
            id: String::new(),
            name: "高速节点".to_string(),
            description: "速度快的订阅".to_string(),
            group_type: GroupType::Speed,
            color: "#32CD32".to_string(),
            icon: "speed".to_string(),
            subscription_uids: Vec::new(),
            tags: vec!["fast".to_string()],
            is_favorite: false,
            sort_order: 1,
            auto_rules: vec![
                AutoRule {
                    rule_type: RuleType::SpeedRange,
                    condition: RuleCondition::GreaterThan,
                    value: "50".to_string(), // 50 Mbps
                    is_enabled: true,
                }
            ],
            created_at: 0,
            updated_at: 0,
        },
        SubscriptionGroup {
            id: String::new(),
            name: "游戏专用".to_string(),
            description: "适合游戏的低延迟订阅".to_string(),
            group_type: GroupType::Usage,
            color: "#FF6347".to_string(),
            icon: "games".to_string(),
            subscription_uids: Vec::new(),
            tags: vec!["gaming".to_string(), "low-latency".to_string()],
            is_favorite: false,
            sort_order: 2,
            auto_rules: vec![
                AutoRule {
                    rule_type: RuleType::NameContains,
                    condition: RuleCondition::Contains,
                    value: "游戏".to_string(),
                    is_enabled: true,
                },
                AutoRule {
                    rule_type: RuleType::LatencyRange,
                    condition: RuleCondition::LessThan,
                    value: "100".to_string(), // 100ms
                    is_enabled: true,
                }
            ],
            created_at: 0,
            updated_at: 0,
        },
    ];

    let mut group_ids = Vec::new();
    
    for group in default_groups {
        match create_subscription_group(group).await {
            Ok(id) => group_ids.push(id),
            Err(e) => {
                logging!(warn, Type::Cmd, true, "[分组管理] 创建默认分组失败: {}", e);
            }
        }
    }

    Ok(group_ids)
}

// ===== 内部辅助函数 =====

/// 应用字符串条件
fn apply_string_condition(text: &str, condition: &RuleCondition, value: &str) -> bool {
    match condition {
        RuleCondition::Contains => text.contains(value),
        RuleCondition::NotContains => !text.contains(value),
        RuleCondition::Equals => text == value,
        RuleCondition::NotEquals => text != value,
        RuleCondition::StartsWith => text.starts_with(value),
        RuleCondition::EndsWith => text.ends_with(value),
        RuleCondition::Matches => {
            // 简单的正则匹配实现
            if let Ok(regex) = regex::Regex::new(value) {
                regex.is_match(text)
            } else {
                false
            }
        }
        RuleCondition::NotMatches => {
            if let Ok(regex) = regex::Regex::new(value) {
                !regex.is_match(text)
            } else {
                true
            }
        }
        _ => false,
    }
}
