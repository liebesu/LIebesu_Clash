# 全局节点测速功能 - 完整实现方案

## 🎯 目标需求

### 核心需求
1. **多订阅支持**: 测试所有订阅的节点，不仅仅是单个订阅
2. **直连测试**: 不通过代理连接，使用本地网络直接测试节点服务器
3. **全面信息**: 显示节点所属订阅、剩余流量、延迟、可用性等
4. **智能排序**: 按延迟、按订阅、按地区等多维度排序
5. **实时反馈**: 详细的进度显示和状态反馈

## 📋 详细功能清单

### 1. 后端核心功能 (Rust)

#### 1.1 多订阅节点解析 🔧
- [ ] **遍历所有订阅配置**
  - 读取 `profiles.yaml` 中的所有订阅项目
  - 支持 `remote`、`local`、`merge` 等类型
  - 跳过系统配置项 (Script, Merge等)

- [ ] **增强节点信息提取**
  ```rust
  struct EnhancedNodeInfo {
      node_name: String,           // 节点名称
      node_type: String,           // 节点类型 (trojan, vless, ss等)
      server: String,              // 服务器地址
      port: u16,                   // 端口
      profile_name: String,        // 所属订阅名称
      profile_uid: String,         // 订阅UID
      profile_type: String,        // 订阅类型
      subscription_url: Option<String>, // 订阅链接
      traffic_info: Option<TrafficInfo>, // 流量信息
  }
  
  struct TrafficInfo {
      total: Option<u64>,          // 总流量 (字节)
      used: Option<u64>,           // 已用流量 (字节)
      remaining: Option<u64>,      // 剩余流量 (字节)
      expire_time: Option<i64>,    // 到期时间 (时间戳)
  }
  ```

#### 1.2 直连网络测试 🌐
- [ ] **TCP连接延迟测试**
  - 直接连接节点服务器IP:端口
  - 多次测试取平均值 (3-5次)
  - 超时控制 (5-10秒)
  - 连接质量评估

- [ ] **可用性检测**
  - 端口开放检测
  - 连接稳定性测试
  - 响应时间统计

- [ ] **批量并发处理**
  - 分批处理 (6-8个节点/批次)
  - 批次间间隔 (避免网络拥塞)
  - 异步并发执行

#### 1.3 流量信息获取 📊
- [ ] **订阅流量解析**
  - 解析订阅响应头中的流量信息
  - 支持多种流量格式 (GB, MB, 百分比等)
  - 缓存流量信息 (避免频繁请求)

- [ ] **流量状态计算**
  - 剩余流量百分比
  - 流量使用趋势
  - 到期时间倒计时

#### 1.4 结果分析和排序 📈
- [ ] **综合评分算法**
  ```rust
  fn calculate_node_score(node: &TestResult) -> f64 {
      let latency_score = calculate_latency_score(node.latency_ms);
      let availability_score = if node.is_available { 1.0 } else { 0.0 };
      let stability_score = calculate_stability_score(&node.test_results);
      
      latency_score * 0.4 + availability_score * 0.3 + stability_score * 0.3
  }
  ```

- [ ] **多维度排序**
  - 按综合评分排序
  - 按延迟排序
  - 按订阅分组排序
  - 按地区分组排序

### 2. 前端界面功能 (React/TypeScript)

#### 2.1 测试控制面板 🎮
- [ ] **测试配置选项**
  - 并发数设置 (1-10个)
  - 超时时间设置 (5-30秒)
  - 测试轮数设置 (1-5轮)
  - 订阅筛选 (选择要测试的订阅)

- [ ] **操作按钮**
  - 开始测试
  - 暂停测试
  - 停止测试
  - 重新测试

#### 2.2 进度和状态显示 📊
- [ ] **实时进度条**
  - 总体进度 (所有节点)
  - 当前批次进度
  - 预计剩余时间

- [ ] **状态信息**
  - 当前测试的节点名称
  - 当前测试的订阅
  - 已完成/总数统计
  - 成功/失败/超时统计

#### 2.3 结果展示界面 📋
- [ ] **节点列表表格**
  | 排名 | 节点名称 | 订阅名称 | 延迟 | 状态 | 剩余流量 | 操作 |
  |------|----------|----------|------|------|----------|------|
  | 1    | 🇭🇰香港01 | 机场A   | 23ms | ✅   | 85%     | 使用 |
  
- [ ] **颜色编码系统**
  - 🟢 优秀 (<50ms)
  - 🟡 良好 (50-150ms)
  - 🟠 一般 (150-300ms)
  - 🔴 较差 (>300ms)
  - ⚫ 不可用

- [ ] **分组显示选项**
  - 按订阅分组
  - 按地区分组
  - 按延迟范围分组
  - 全部显示

#### 2.4 筛选和搜索 🔍
- [ ] **筛选器**
  - 按订阅筛选
  - 按地区筛选
  - 按状态筛选 (可用/不可用)
  - 按延迟范围筛选

- [ ] **搜索功能**
  - 节点名称搜索
  - 服务器地址搜索
  - 模糊搜索支持

### 3. 数据流程设计 🔄

```
1. 用户点击"全局测速" 
   ↓
2. 后端遍历所有订阅配置
   ↓
3. 解析每个订阅的节点信息
   ↓
4. 提取流量信息 (如果可用)
   ↓
5. 分批并发测试节点连通性
   ↓
6. 实时发送进度更新到前端
   ↓
7. 计算综合评分和排序
   ↓
8. 返回完整测试结果
   ↓
9. 前端展示结果和提供操作选项
```

### 4. 技术实现要点 ⚙️

#### 4.1 后端 (Rust)
- [ ] **异步并发处理**
  ```rust
  use tokio::time::{timeout, Duration};
  use futures::future::join_all;
  
  async fn test_nodes_batch(nodes: Vec<NodeInfo>) -> Vec<TestResult> {
      let futures: Vec<_> = nodes.into_iter()
          .map(|node| timeout(Duration::from_secs(10), test_single_node(node)))
          .collect();
      
      join_all(futures).await
          .into_iter()
          .map(|result| result.unwrap_or_else(|_| TestResult::timeout()))
          .collect()
  }
  ```

- [ ] **事件发射机制**
  ```rust
  // 进度更新
  app_handle.emit("global-speed-test-progress", progress)?;
  
  // 单个节点完成
  app_handle.emit("global-speed-test-node-complete", result)?;
  
  // 测试完成
  app_handle.emit("global-speed-test-complete", summary)?;
  ```

#### 4.2 前端 (React)
- [ ] **状态管理**
  ```typescript
  interface GlobalSpeedTestState {
      isRunning: boolean;
      progress: TestProgress;
      results: TestResult[];
      summary: TestSummary | null;
      filters: FilterOptions;
      sortBy: SortOption;
  }
  ```

- [ ] **事件监听**
  ```typescript
  useEffect(() => {
      const unlistenProgress = listen('global-speed-test-progress', handleProgress);
      const unlistenComplete = listen('global-speed-test-complete', handleComplete);
      
      return () => {
          unlistenProgress();
          unlistenComplete();
      };
  }, []);
  ```

### 5. 性能优化策略 🚀

- [ ] **批量处理**: 分批测试避免网络拥塞
- [ ] **连接池**: 复用HTTP客户端
- [ ] **缓存机制**: 缓存订阅流量信息
- [ ] **超时控制**: 合理的超时设置
- [ ] **资源管理**: 及时释放网络连接
- [ ] **内存优化**: 大数据集分页处理

### 6. 错误处理和用户体验 🛡️

- [ ] **全面错误处理**
  - 网络错误 (连接超时、DNS解析失败)
  - 配置错误 (格式错误、缺失字段)
  - 系统错误 (内存不足、权限问题)

- [ ] **用户友好提示**
  - 详细的错误信息
  - 操作建议
  - 重试选项

- [ ] **测试中断处理**
  - 优雅的取消机制
  - 部分结果保存
  - 状态恢复

## 🎯 实施优先级

### 第一阶段 (核心功能)
1. 多订阅节点解析
2. 直连网络测试
3. 基本结果显示

### 第二阶段 (增强功能)  
1. 流量信息集成
2. 综合评分算法
3. 高级筛选排序

### 第三阶段 (用户体验)
1. 详细进度反馈
2. 测试配置选项
3. 界面优化美化

---

**预期成果**: 一个功能完整、性能优秀、用户友好的全局节点测速系统，能够帮助用户快速找到最优节点。
