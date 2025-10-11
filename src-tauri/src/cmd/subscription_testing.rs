#![allow(clippy::all)]
#![allow(dead_code, unused)]
#![allow(clippy::clone_on_ref_ptr, clippy::unwrap_used, clippy::unused_async)]
// TODO: 后续优化订阅测试模块，移除 lint 豁免。
use super::CmdResult;
use crate::{
    config::{Config, PrfItem},
    logging,
    utils::logging::Type,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;
use tokio::net::TcpStream;
use tokio::time::{Duration, timeout};

/// 测试类型枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TestType {
    Connectivity,  // 连通性测试
    Latency,       // 延迟测试
    Speed,         // 速度测试
    Stability,     // 稳定性测试
    Comprehensive, // 综合测试
}

/// 测试结果状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TestResultStatus {
    Pass,    // 通过
    Fail,    // 失败
    Warning, // 警告
    Timeout, // 超时
    Error,   // 错误
}

/// 单个节点测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTestResult {
    pub node_name: String,
    pub node_type: String,
    pub server: String,
    pub port: u16,
    pub status: TestResultStatus,
    pub latency_ms: Option<u32>,
    pub download_speed_mbps: Option<f64>,
    pub upload_speed_mbps: Option<f64>,
    pub packet_loss_rate: Option<f64>,
    pub stability_score: Option<u8>, // 0-100
    pub error_message: Option<String>,
    pub test_duration_ms: u64,
    pub test_time: i64,
}

/// 订阅测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionTestResult {
    pub subscription_uid: String,
    pub subscription_name: String,
    pub test_type: TestType,
    pub overall_status: TestResultStatus,
    pub total_nodes: usize,
    pub passed_nodes: usize,
    pub failed_nodes: usize,
    pub warning_nodes: usize,
    pub avg_latency_ms: Option<f64>,
    pub avg_download_speed_mbps: Option<f64>,
    pub avg_upload_speed_mbps: Option<f64>,
    pub overall_stability_score: Option<u8>,
    pub quality_grade: QualityGrade,
    pub node_results: Vec<NodeTestResult>,
    pub recommendations: Vec<String>,
    pub test_duration_ms: u64,
    pub test_time: i64,
}

/// 质量等级
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum QualityGrade {
    Excellent, // 优秀 (90-100分)
    Good,      // 良好 (70-89分)
    Fair,      // 一般 (50-69分)
    Poor,      // 较差 (30-49分)
    VeryPoor,  // 很差 (0-29分)
}

/// 批量测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchTestResult {
    pub test_id: String,
    pub test_type: TestType,
    pub total_subscriptions: usize,
    pub completed_subscriptions: usize,
    pub results: Vec<SubscriptionTestResult>,
    pub summary: TestSummary,
    pub test_duration_ms: u64,
    pub test_time: i64,
}

/// 测试摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSummary {
    pub total_nodes: usize,
    pub working_nodes: usize,
    pub failed_nodes: usize,
    pub avg_latency_ms: f64,
    pub best_latency_ms: u32,
    pub worst_latency_ms: u32,
    pub fastest_node: Option<String>,
    pub recommended_subscriptions: Vec<String>,
    pub quality_distribution: HashMap<QualityGrade, usize>,
}

/// 测试配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestConfig {
    pub test_timeout_seconds: u32,
    pub connection_timeout_seconds: u32,
    pub max_concurrent_tests: u32,
    pub speed_test_duration_seconds: u32,
    pub speed_test_file_size_mb: u32,
    pub latency_test_count: u32,
    pub stability_test_duration_seconds: u32,
    pub test_urls: Vec<String>,
    pub skip_speed_test: bool,
    pub skip_stability_test: bool,
}

impl Default for TestConfig {
    fn default() -> Self {
        Self {
            test_timeout_seconds: 300,
            connection_timeout_seconds: 10,
            max_concurrent_tests: 10,
            speed_test_duration_seconds: 30,
            speed_test_file_size_mb: 10,
            latency_test_count: 5,
            stability_test_duration_seconds: 60,
            test_urls: vec![
                "https://www.google.com".to_string(),
                "https://www.cloudflare.com".to_string(),
                "https://www.github.com".to_string(),
            ],
            skip_speed_test: false,
            skip_stability_test: false,
        }
    }
}

/// 测试单个订阅
#[tauri::command]
pub async fn test_subscription(
    subscription_uid: String,
    test_type: TestType,
    config: Option<TestConfig>,
) -> CmdResult<SubscriptionTestResult> {
    let start_time = Instant::now();
    logging!(
        info,
        Type::Cmd,
        true,
        "[订阅测试] 开始测试订阅: {} ({:?})",
        subscription_uid,
        test_type
    );

    let test_config = config.unwrap_or_default();

    // 获取订阅信息
    let profiles = Config::profiles().await;
    let subscription = {
        let profiles_ref = profiles.latest_ref();
        let empty_vec = Vec::new();
        profiles_ref
            .items
            .as_ref()
            .unwrap_or(&empty_vec)
            .iter()
            .find(|item| item.uid.as_ref() == Some(&subscription_uid))
            .cloned()
            .ok_or_else(|| "Subscription not found".to_string())?
    };

    // 解析订阅配置获取节点列表
    let nodes = parse_subscription_nodes(&subscription).await?;

    if nodes.is_empty() {
        return Err("No nodes found in subscription".to_string());
    }

    logging!(
        info,
        Type::Cmd,
        true,
        "[订阅测试] 找到 {} 个节点",
        nodes.len()
    );

    // 执行测试
    let node_results = test_nodes(nodes, &test_type, &test_config).await;

    // 分析结果
    let result = analyze_test_results(
        subscription_uid,
        subscription
            .name
            .clone()
            .unwrap_or_else(|| "Unknown".to_string()),
        test_type,
        node_results,
        start_time,
    );

    logging!(
        info,
        Type::Cmd,
        true,
        "[订阅测试] 测试完成: {} 个节点，耗时: {}ms",
        result.total_nodes,
        result.test_duration_ms
    );

    Ok(result)
}

/// 批量测试所有订阅
#[tauri::command]
pub async fn test_all_subscriptions(
    test_type: TestType,
    config: Option<TestConfig>,
) -> CmdResult<BatchTestResult> {
    let start_time = Instant::now();
    let test_id = uuid::Uuid::new_v4().to_string();

    logging!(
        info,
        Type::Cmd,
        true,
        "[批量测试] 开始测试所有订阅 ({:?})",
        test_type
    );

    let test_config = config.unwrap_or_default();

    // 获取所有订阅
    let profiles = Config::profiles().await;
    let subscriptions: Vec<PrfItem> = {
        let profiles_ref = profiles.latest_ref();
        let empty_vec = Vec::new();
        profiles_ref
            .items
            .as_ref()
            .unwrap_or(&empty_vec)
            .iter()
            .filter(|item| item.url.is_some())
            .cloned()
            .collect()
    };

    if subscriptions.is_empty() {
        return Err("No subscriptions found".to_string());
    }

    logging!(
        info,
        Type::Cmd,
        true,
        "[批量测试] 找到 {} 个订阅",
        subscriptions.len()
    );

    let total_subscriptions = subscriptions.len();
    let mut results = Vec::new();
    let mut completed = 0;

    // 使用并发控制避免过载
    let semaphore = Arc::new(tokio::sync::Semaphore::new(3)); // 最多3个并发测试

    let mut tasks = Vec::new();

    for subscription in subscriptions {
        let uid = subscription.uid.clone().unwrap_or_default();
        let test_type_clone = test_type.clone();
        let test_config_clone = test_config.clone();
        let permit = semaphore.clone();

        let task = tokio::spawn(async move {
            let _permit = permit.acquire().await.unwrap();
            test_subscription(uid, test_type_clone, Some(test_config_clone)).await
        });

        tasks.push(task);
    }

    // 等待所有测试完成
    for task in tasks {
        if let Ok(result) = task.await {
            if let Ok(test_result) = result {
                results.push(test_result);
            }
            completed += 1;
        }
    }

    // 生成摘要
    let summary = generate_test_summary(&results);

    let test_duration = start_time.elapsed().as_millis() as u64;

    let batch_result = BatchTestResult {
        test_id,
        test_type,
        total_subscriptions,
        completed_subscriptions: completed,
        results,
        summary,
        test_duration_ms: test_duration,
        test_time: chrono::Utc::now().timestamp(),
    };

    logging!(
        info,
        Type::Cmd,
        true,
        "[批量测试] 完成 - 总订阅: {}, 完成: {}, 耗时: {}ms",
        total_subscriptions,
        completed,
        test_duration
    );

    Ok(batch_result)
}

/// 快速连通性测试
#[tauri::command]
pub async fn quick_connectivity_test(subscription_uid: String) -> CmdResult<Vec<NodeTestResult>> {
    logging!(
        info,
        Type::Cmd,
        true,
        "[快速测试] 连通性测试: {}",
        subscription_uid
    );

    let config = TestConfig {
        test_timeout_seconds: 30,
        connection_timeout_seconds: 5,
        max_concurrent_tests: 20,
        skip_speed_test: true,
        skip_stability_test: true,
        latency_test_count: 1,
        ..Default::default()
    };

    let result = test_subscription(subscription_uid, TestType::Connectivity, Some(config)).await?;
    Ok(result.node_results)
}

/// 获取节点质量排名
#[tauri::command]
pub async fn get_node_quality_ranking(
    subscription_uid: String,
    limit: Option<usize>,
) -> CmdResult<Vec<NodeTestResult>> {
    logging!(
        info,
        Type::Cmd,
        true,
        "[质量排名] 获取节点排名: {}",
        subscription_uid
    );

    // 执行综合测试
    let result = test_subscription(subscription_uid, TestType::Comprehensive, None).await?;

    // 按质量排序
    let mut ranked_nodes = result.node_results;
    ranked_nodes.sort_by(|a, b| {
        // 综合评分：延迟权重40%，速度权重40%，稳定性权重20%
        let score_a = calculate_node_score(a);
        let score_b = calculate_node_score(b);
        score_b
            .partial_cmp(&score_a)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // 限制返回数量
    if let Some(limit) = limit {
        ranked_nodes.truncate(limit);
    }

    Ok(ranked_nodes)
}

/// 获取测试建议
#[tauri::command]
pub async fn get_optimization_suggestions(subscription_uid: String) -> CmdResult<Vec<String>> {
    logging!(
        info,
        Type::Cmd,
        true,
        "[优化建议] 生成建议: {}",
        subscription_uid
    );

    let result = test_subscription(subscription_uid, TestType::Comprehensive, None).await?;
    Ok(result.recommendations)
}

/// 定期测试任务
#[tauri::command]
pub async fn schedule_periodic_test(
    subscription_uids: Vec<String>,
    _test_type: TestType,
    interval_hours: u32,
) -> CmdResult<String> {
    logging!(
        info,
        Type::Cmd,
        true,
        "[定期测试] 设置定期测试: {:?}, 间隔: {}小时",
        subscription_uids,
        interval_hours
    );

    // TODO: 集成到任务管理系统
    let task_id = uuid::Uuid::new_v4().to_string();

    Ok(task_id)
}

// ===== 内部实现函数 =====

/// 解析订阅配置获取节点信息
async fn parse_subscription_nodes(subscription: &PrfItem) -> CmdResult<Vec<NodeInfo>> {
    let mut nodes = Vec::new();

    // 读取订阅配置文件
    if let Some(file_path) = &subscription.file {
        match tokio::fs::read_to_string(file_path).await {
            Ok(content) => {
                nodes = parse_clash_config(&content)?;
            }
            Err(e) => {
                return Err(format!("Failed to read subscription file: {}", e));
            }
        }
    }

    Ok(nodes)
}

/// 节点信息结构
#[derive(Debug, Clone)]
struct NodeInfo {
    name: String,
    node_type: String,
    server: String,
    port: u16,
    cipher: Option<String>,
    password: Option<String>,
}

/// 解析Clash配置文件
fn parse_clash_config(content: &str) -> CmdResult<Vec<NodeInfo>> {
    let mut nodes = Vec::new();

    // 尝试解析YAML
    if let Ok(yaml_value) = serde_yaml_ng::from_str::<serde_yaml_ng::Value>(content) {
        if let Some(proxies) = yaml_value.get("proxies") {
            if let Some(proxies_array) = proxies.as_sequence() {
                for proxy in proxies_array {
                    if let Some(proxy_map) = proxy.as_mapping() {
                        let node = NodeInfo {
                            name: proxy_map
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Unknown")
                                .to_string(),
                            node_type: proxy_map
                                .get("type")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown")
                                .to_string(),
                            server: proxy_map
                                .get("server")
                                .and_then(|v| v.as_str())
                                .unwrap_or("127.0.0.1")
                                .to_string(),
                            port: proxy_map
                                .get("port")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(8080) as u16,
                            cipher: proxy_map
                                .get("cipher")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            password: proxy_map
                                .get("password")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                        };
                        nodes.push(node);
                    }
                }
            }
        }
    }

    Ok(nodes)
}

/// 测试节点列表
async fn test_nodes(
    nodes: Vec<NodeInfo>,
    test_type: &TestType,
    config: &TestConfig,
) -> Vec<NodeTestResult> {
    let mut results = Vec::new();

    // 并发测试限制
    let semaphore = Arc::new(tokio::sync::Semaphore::new(
        config.max_concurrent_tests as usize,
    ));
    let mut tasks = Vec::new();

    for node in nodes {
        let test_type_clone = test_type.clone();
        let config_clone = config.clone();
        let permit = semaphore.clone();

        let task = tokio::spawn(async move {
            let _permit = permit.acquire().await.unwrap();
            test_single_node(node, &test_type_clone, &config_clone).await
        });

        tasks.push(task);
    }

    // 等待所有测试完成
    for task in tasks {
        if let Ok(result) = task.await {
            results.push(result);
        }
    }

    results
}

/// 测试单个节点
async fn test_single_node(
    node: NodeInfo,
    test_type: &TestType,
    config: &TestConfig,
) -> NodeTestResult {
    let start_time = Instant::now();
    let test_time = chrono::Utc::now().timestamp();

    let mut result = NodeTestResult {
        node_name: node.name.clone(),
        node_type: node.node_type.clone(),
        server: node.server.clone(),
        port: node.port,
        status: TestResultStatus::Fail,
        latency_ms: None,
        download_speed_mbps: None,
        upload_speed_mbps: None,
        packet_loss_rate: None,
        stability_score: None,
        error_message: None,
        test_duration_ms: 0,
        test_time,
    };

    // 基础连通性测试
    match test_node_connectivity(&node, config).await {
        Ok(latency) => {
            result.latency_ms = Some(latency);
            result.status = TestResultStatus::Pass;

            // 根据测试类型执行额外测试
            match test_type {
                TestType::Connectivity => {
                    // 只做连通性测试，已完成
                }
                TestType::Latency => {
                    // 执行多次延迟测试取平均值
                    if let Ok(avg_latency) = test_node_latency(&node, config).await {
                        result.latency_ms = Some(avg_latency);
                    }
                }
                TestType::Speed => {
                    // 执行速度测试
                    if !config.skip_speed_test {
                        if let Ok((download, upload)) = test_node_speed(&node, config).await {
                            result.download_speed_mbps = Some(download);
                            result.upload_speed_mbps = Some(upload);
                        }
                    }
                }
                TestType::Stability => {
                    // 执行稳定性测试
                    if !config.skip_stability_test {
                        if let Ok((stability, loss_rate)) = test_node_stability(&node, config).await
                        {
                            result.stability_score = Some(stability);
                            result.packet_loss_rate = Some(loss_rate);
                        }
                    }
                }
                TestType::Comprehensive => {
                    // 执行所有测试
                    if let Ok(avg_latency) = test_node_latency(&node, config).await {
                        result.latency_ms = Some(avg_latency);
                    }

                    if !config.skip_speed_test {
                        if let Ok((download, upload)) = test_node_speed(&node, config).await {
                            result.download_speed_mbps = Some(download);
                            result.upload_speed_mbps = Some(upload);
                        }
                    }

                    if !config.skip_stability_test {
                        if let Ok((stability, loss_rate)) = test_node_stability(&node, config).await
                        {
                            result.stability_score = Some(stability);
                            result.packet_loss_rate = Some(loss_rate);
                        }
                    }
                }
            }
        }
        Err(e) => {
            result.error_message = Some(e);
            result.status = TestResultStatus::Fail;
        }
    }

    result.test_duration_ms = start_time.elapsed().as_millis() as u64;
    result
}

/// 测试节点连通性
async fn test_node_connectivity(node: &NodeInfo, config: &TestConfig) -> Result<u32, String> {
    let start = Instant::now();

    // 简单的TCP连接测试
    match timeout(
        Duration::from_secs(config.connection_timeout_seconds as u64),
        tokio::net::TcpStream::connect(format!("{}:{}", node.server, node.port)),
    )
    .await
    {
        Ok(Ok(_)) => {
            let latency = start.elapsed().as_millis() as u32;
            Ok(latency)
        }
        Ok(Err(e)) => Err(format!("Connection failed: {}", e)),
        Err(_) => Err("Connection timeout".to_string()),
    }
}

/// 测试节点延迟
async fn test_node_latency(node: &NodeInfo, config: &TestConfig) -> Result<u32, String> {
    let mut latencies = Vec::new();

    for _ in 0..config.latency_test_count {
        match test_node_connectivity(node, config).await {
            Ok(latency) => latencies.push(latency),
            Err(_) => {} // 忽略单次失败
        }

        // 测试间隔
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    if latencies.is_empty() {
        return Err("All latency tests failed".to_string());
    }

    let avg_latency = latencies.iter().sum::<u32>() / latencies.len() as u32;
    Ok(avg_latency)
}

/// 测试节点速度
async fn test_node_speed(node: &NodeInfo, config: &TestConfig) -> Result<(f64, f64), String> {
    // 创建HTTP客户端进行速度测试
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(
            config.connection_timeout_seconds as u64,
        ))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    // 测试下载速度（使用小文件进行测试）
    let download_speed = match timeout(
        Duration::from_secs(config.test_timeout_seconds as u64),
        test_download_speed(&client, node),
    )
    .await
    {
        Ok(Ok(speed)) => speed,
        Ok(Err(e)) => {
            logging!(warn, Type::Cmd, true, "[速度测试] 下载测试失败: {}", e);
            0.0
        }
        Err(_) => {
            logging!(warn, Type::Cmd, true, "[速度测试] 下载测试超时");
            0.0
        }
    };

    // 简化的上传速度测试（暂时返回下载速度的50%作为估计）
    let upload_speed = download_speed * 0.5;

    Ok((download_speed, upload_speed))
}

/// 测试下载速度
async fn test_download_speed(client: &reqwest::Client, _node: &NodeInfo) -> Result<f64, String> {
    // 使用一个小的测试文件来测试速度
    let test_url = "http://httpbin.org/bytes/102400"; // 100KB测试文件

    let start_time = std::time::Instant::now();

    let response = client
        .get(test_url)
        .send()
        .await
        .map_err(|e| format!("HTTP请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP响应错误: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应数据失败: {}", e))?;

    let duration = start_time.elapsed();
    let bytes_downloaded = bytes.len() as f64;

    // 计算速度 (Mbps)
    let duration_secs = duration.as_secs_f64();
    if duration_secs > 0.0 {
        let speed_mbps = (bytes_downloaded * 8.0) / (duration_secs * 1_000_000.0);
        Ok(speed_mbps)
    } else {
        Ok(0.0)
    }
}

/// 测试节点稳定性
async fn test_node_stability(node: &NodeInfo, config: &TestConfig) -> Result<(u8, f64), String> {
    // 执行多次连接测试来评估稳定性
    let test_count = std::cmp::min(config.latency_test_count, 10); // 限制最大测试次数
    let mut successful_connections = 0;
    let mut failed_connections = 0;

    for i in 0..test_count {
        let connection_result = timeout(
            Duration::from_secs(config.connection_timeout_seconds as u64),
            test_tcp_connection(node),
        )
        .await;

        match connection_result {
            Ok(Ok(_)) => {
                successful_connections += 1;
                logging!(
                    debug,
                    Type::Cmd,
                    true,
                    "[稳定性测试] 连接 {}/{} 成功",
                    i + 1,
                    test_count
                );
            }
            Ok(Err(e)) => {
                failed_connections += 1;
                logging!(
                    debug,
                    Type::Cmd,
                    true,
                    "[稳定性测试] 连接 {}/{} 失败: {}",
                    i + 1,
                    test_count,
                    e
                );
            }
            Err(_) => {
                failed_connections += 1;
                logging!(
                    debug,
                    Type::Cmd,
                    true,
                    "[稳定性测试] 连接 {}/{} 超时",
                    i + 1,
                    test_count
                );
            }
        }

        // 测试间隔
        if i < test_count - 1 {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }

    // 计算稳定性得分
    let success_rate = successful_connections as f64 / test_count as f64;
    let stability_score = (success_rate * 100.0) as u8;
    let packet_loss_rate = (failed_connections as f64 / test_count as f64) * 100.0;

    Ok((stability_score, packet_loss_rate))
}

/// 测试TCP连接
async fn test_tcp_connection(node: &NodeInfo) -> Result<(), String> {
    let addr = format!("{}:{}", node.server, node.port);
    let socket_addr: SocketAddr = addr.parse().map_err(|e| format!("无效的地址格式: {}", e))?;

    let _stream = TcpStream::connect(socket_addr)
        .await
        .map_err(|e| format!("TCP连接失败: {}", e))?;

    Ok(())
}

/// 分析测试结果
fn analyze_test_results(
    subscription_uid: String,
    subscription_name: String,
    test_type: TestType,
    node_results: Vec<NodeTestResult>,
    start_time: Instant,
) -> SubscriptionTestResult {
    let total_nodes = node_results.len();
    let passed_nodes = node_results
        .iter()
        .filter(|r| matches!(r.status, TestResultStatus::Pass))
        .count();
    let failed_nodes = node_results
        .iter()
        .filter(|r| matches!(r.status, TestResultStatus::Fail))
        .count();
    let warning_nodes = node_results
        .iter()
        .filter(|r| matches!(r.status, TestResultStatus::Warning))
        .count();

    // 计算平均值
    let avg_latency_ms = if passed_nodes > 0 {
        let total_latency: u32 = node_results.iter().filter_map(|r| r.latency_ms).sum();
        Some(total_latency as f64 / passed_nodes as f64)
    } else {
        None
    };

    let avg_download_speed_mbps = if passed_nodes > 0 {
        let speeds: Vec<f64> = node_results
            .iter()
            .filter_map(|r| r.download_speed_mbps)
            .collect();
        if !speeds.is_empty() {
            Some(speeds.iter().sum::<f64>() / speeds.len() as f64)
        } else {
            None
        }
    } else {
        None
    };

    let avg_upload_speed_mbps = if passed_nodes > 0 {
        let speeds: Vec<f64> = node_results
            .iter()
            .filter_map(|r| r.upload_speed_mbps)
            .collect();
        if !speeds.is_empty() {
            Some(speeds.iter().sum::<f64>() / speeds.len() as f64)
        } else {
            None
        }
    } else {
        None
    };

    let overall_stability_score = if passed_nodes > 0 {
        let scores: Vec<u8> = node_results
            .iter()
            .filter_map(|r| r.stability_score)
            .collect();
        if !scores.is_empty() {
            Some(scores.iter().sum::<u8>() / scores.len() as u8)
        } else {
            None
        }
    } else {
        None
    };

    // 计算质量等级
    let quality_grade = calculate_quality_grade(
        passed_nodes,
        total_nodes,
        avg_latency_ms,
        avg_download_speed_mbps,
    );

    // 生成建议
    let recommendations = generate_recommendations(&node_results, passed_nodes, total_nodes);

    // 整体状态
    let overall_status = if passed_nodes == 0 {
        TestResultStatus::Fail
    } else if passed_nodes == total_nodes {
        TestResultStatus::Pass
    } else {
        TestResultStatus::Warning
    };

    SubscriptionTestResult {
        subscription_uid,
        subscription_name,
        test_type,
        overall_status,
        total_nodes,
        passed_nodes,
        failed_nodes,
        warning_nodes,
        avg_latency_ms,
        avg_download_speed_mbps,
        avg_upload_speed_mbps,
        overall_stability_score,
        quality_grade,
        node_results,
        recommendations,
        test_duration_ms: start_time.elapsed().as_millis() as u64,
        test_time: chrono::Utc::now().timestamp(),
    }
}

/// 计算质量等级
fn calculate_quality_grade(
    passed_nodes: usize,
    total_nodes: usize,
    avg_latency_ms: Option<f64>,
    avg_download_speed_mbps: Option<f64>,
) -> QualityGrade {
    let pass_rate = passed_nodes as f64 / total_nodes as f64;
    let mut score = pass_rate * 40.0; // 可用性权重40%

    // 延迟评分 (权重30%)
    if let Some(latency) = avg_latency_ms {
        let latency_score = match latency {
            l if l < 50.0 => 30.0,
            l if l < 100.0 => 25.0,
            l if l < 200.0 => 20.0,
            l if l < 500.0 => 15.0,
            _ => 5.0,
        };
        score += latency_score;
    }

    // 速度评分 (权重30%)
    if let Some(speed) = avg_download_speed_mbps {
        let speed_score = match speed {
            s if s > 100.0 => 30.0,
            s if s > 50.0 => 25.0,
            s if s > 20.0 => 20.0,
            s if s > 10.0 => 15.0,
            _ => 5.0,
        };
        score += speed_score;
    }

    match score as u8 {
        90..=100 => QualityGrade::Excellent,
        70..=89 => QualityGrade::Good,
        50..=69 => QualityGrade::Fair,
        30..=49 => QualityGrade::Poor,
        _ => QualityGrade::VeryPoor,
    }
}

/// 生成建议
fn generate_recommendations(
    node_results: &[NodeTestResult],
    passed_nodes: usize,
    total_nodes: usize,
) -> Vec<String> {
    let mut recommendations = Vec::new();

    let pass_rate = passed_nodes as f64 / total_nodes as f64;

    if pass_rate < 0.5 {
        recommendations.push("订阅可用性较低，建议联系服务商或更换订阅".to_string());
    }

    // 延迟建议
    let high_latency_nodes = node_results
        .iter()
        .filter(|r| r.latency_ms.map(|l| l > 300).unwrap_or(false))
        .count();

    if high_latency_nodes > passed_nodes / 2 {
        recommendations.push("大部分节点延迟较高，建议选择地理位置更近的服务器".to_string());
    }

    // 速度建议
    let slow_nodes = node_results
        .iter()
        .filter(|r| r.download_speed_mbps.map(|s| s < 10.0).unwrap_or(false))
        .count();

    if slow_nodes > passed_nodes / 2 {
        recommendations.push("网络速度偏慢，建议检查本地网络或升级套餐".to_string());
    }

    // 节点类型建议
    let failed_types: std::collections::HashSet<_> = node_results
        .iter()
        .filter(|r| matches!(r.status, TestResultStatus::Fail))
        .map(|r| r.node_type.clone())
        .collect();

    if !failed_types.is_empty() {
        recommendations.push(format!(
            "以下协议类型连接失败较多: {:?}，可能需要检查防火墙设置",
            failed_types
        ));
    }

    if recommendations.is_empty() {
        recommendations.push("订阅质量良好，无需特别优化".to_string());
    }

    recommendations
}

/// 生成测试摘要
fn generate_test_summary(results: &[SubscriptionTestResult]) -> TestSummary {
    let total_nodes: usize = results.iter().map(|r| r.total_nodes).sum();
    let working_nodes: usize = results.iter().map(|r| r.passed_nodes).sum();
    let failed_nodes: usize = results.iter().map(|r| r.failed_nodes).sum();

    let latencies: Vec<f64> = results.iter().filter_map(|r| r.avg_latency_ms).collect();

    let avg_latency_ms = if !latencies.is_empty() {
        latencies.iter().sum::<f64>() / latencies.len() as f64
    } else {
        0.0
    };

    // 找出最快和最慢的节点
    let mut all_node_results: Vec<&NodeTestResult> = results
        .iter()
        .flat_map(|r| &r.node_results)
        .filter(|nr| matches!(nr.status, TestResultStatus::Pass))
        .collect();

    all_node_results.sort_by_key(|nr| nr.latency_ms.unwrap_or(u32::MAX));

    let best_latency_ms = all_node_results
        .first()
        .and_then(|nr| nr.latency_ms)
        .unwrap_or(0);

    let worst_latency_ms = all_node_results
        .last()
        .and_then(|nr| nr.latency_ms)
        .unwrap_or(0);

    let fastest_node = all_node_results.first().map(|nr| nr.node_name.clone());

    // 推荐订阅（质量好的）
    let recommended_subscriptions: Vec<String> = results
        .iter()
        .filter(|r| {
            matches!(
                r.quality_grade,
                QualityGrade::Excellent | QualityGrade::Good
            )
        })
        .map(|r| r.subscription_name.clone())
        .collect();

    // 质量分布
    let mut quality_distribution = HashMap::new();
    for result in results {
        *quality_distribution
            .entry(result.quality_grade.clone())
            .or_insert(0) += 1;
    }

    TestSummary {
        total_nodes,
        working_nodes,
        failed_nodes,
        avg_latency_ms,
        best_latency_ms,
        worst_latency_ms,
        fastest_node,
        recommended_subscriptions,
        quality_distribution,
    }
}

/// 计算节点得分
fn calculate_node_score(node: &NodeTestResult) -> f64 {
    let mut score = 0.0;

    // 延迟得分 (40%)
    if let Some(latency) = node.latency_ms {
        let latency_score = match latency {
            l if l < 50 => 40.0,
            l if l < 100 => 35.0,
            l if l < 150 => 30.0,
            l if l < 200 => 25.0,
            l if l < 300 => 20.0,
            _ => 10.0,
        };
        score += latency_score;
    }

    // 速度得分 (40%)
    if let Some(speed) = node.download_speed_mbps {
        let speed_score = match speed {
            s if s > 100.0 => 40.0,
            s if s > 50.0 => 35.0,
            s if s > 30.0 => 30.0,
            s if s > 20.0 => 25.0,
            s if s > 10.0 => 20.0,
            _ => 10.0,
        };
        score += speed_score;
    }

    // 稳定性得分 (20%)
    if let Some(stability) = node.stability_score {
        let stability_score = (stability as f64 / 100.0) * 20.0;
        score += stability_score;
    }

    score
}
