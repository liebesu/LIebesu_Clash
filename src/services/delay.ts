import { cmdGetProxyDelay } from "./cmds";

const hashKey = (name: string, group: string) => `${group ?? ""}::${name}`;

class DelayManager {
  private cache = new Map<string, [number, number]>();
  private urlMap = new Map<string, string>();

  // 每个item的监听
  private listenerMap = new Map<string, (time: number) => void>();

  // 每个分组的监听
  private groupListenerMap = new Map<string, () => void>();

  setUrl(group: string, url: string) {
    console.log(`[DelayManager] 设置测试URL，组: ${group}, URL: ${url}`);
    this.urlMap.set(group, url);
  }

  getUrl(group: string) {
    const url = this.urlMap.get(group);
    console.log(
      `[DelayManager] 获取测试URL，组: ${group}, URL: ${url || "未设置"}`,
    );
    // 如果未设置URL，返回默认URL
    return url || "https://cp.cloudflare.com/generate_204";
  }

  setListener(name: string, group: string, listener: (time: number) => void) {
    const key = hashKey(name, group);
    this.listenerMap.set(key, listener);
  }

  removeListener(name: string, group: string) {
    const key = hashKey(name, group);
    this.listenerMap.delete(key);
  }

  setGroupListener(group: string, listener: () => void) {
    this.groupListenerMap.set(group, listener);
  }

  removeGroupListener(group: string) {
    this.groupListenerMap.delete(group);
  }

  setDelay(name: string, group: string, delay: number) {
    const key = hashKey(name, group);
    console.log(
      `[DelayManager] 设置延迟，代理: ${name}, 组: ${group}, 延迟: ${delay}`,
    );

    this.cache.set(key, [delay, Date.now()]);
    const listener = this.listenerMap.get(key);
    if (listener) listener(delay);
  }

  getDelay(name: string, group: string) {
    const key = hashKey(name, group);
    const val = this.cache.get(key);
    if (!val) return -1;

    // 缓存30分钟
    if (Date.now() - val[1] > 30 * 60 * 1000) {
      return -1;
    }
    return val[0];
  }

  /// 暂时修复provider的节点延迟排序的问题
  getDelayFix(proxy: IProxyItem, group: string) {
    if (!proxy.provider) {
      const delay = this.getDelay(proxy.name, group);
      if (delay >= 0 || delay === -2) return delay;
    }

    // 添加 history 属性的安全检查
    if (proxy.history && proxy.history.length > 0) {
      // 0ms以error显示
      return proxy.history[proxy.history.length - 1].delay || 1e6;
    }
    return -1;
  }

  async checkDelay(name: string, group: string, timeout: number) {
    console.log(
      `[DelayManager] 开始测试延迟，代理: ${name}, 组: ${group}, 超时: ${timeout}ms`,
    );

    // 先将状态设置为测试中
    this.setDelay(name, group, -2);

    let delay = -1;

    try {
      const url = this.getUrl(group);
      console.log(`[DelayManager] 调用API测试延迟，代理: ${name}, URL: ${url}`);

      // 记录开始时间，用于计算实际延迟
      const startTime = Date.now();

      // 设置超时处理
      const timeoutPromise = new Promise<{ delay: number }>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout")), timeout);
      });

      // 使用Promise.race来实现超时控制
      const result = await Promise.race([
        cmdGetProxyDelay(name, timeout, url),
        timeoutPromise,
      ]);

      // 确保至少显示500ms的加载动画
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < 500) {
        await new Promise((resolve) => setTimeout(resolve, 500 - elapsedTime));
      }

      // 检查延迟结果是否为undefined
      if (result && typeof result.delay === "number") {
        delay = result.delay;
        console.log(
          `[DelayManager] 延迟测试完成，代理: ${name}, 结果: ${delay}ms`,
        );
      } else {
        console.error(
          `[DelayManager] 延迟测试返回无效结果，代理: ${name}, 结果:`,
          result,
        );
        delay = 1e6; // 错误情况
      }
    } catch (error) {
      // 确保至少显示500ms的加载动画
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.error(`[DelayManager] 延迟测试出错，代理: ${name}`, error);
      if (error instanceof Error && error.message === "Timeout") {
        console.log(`[DelayManager] 延迟测试超时，代理: ${name}`);
      }
      delay = 1e6; // error
    }

    this.setDelay(name, group, delay);
    return delay;
  }

  async checkListDelay(
    nameList: string[],
    group: string,
    timeout: number,
    concurrency = 36,
  ) {
    console.log(
      `[DelayManager] 批量测试延迟开始，组: ${group}, 数量: ${nameList.length}, 并发数: ${concurrency}`,
    );
    const names = nameList.filter(Boolean);
    
    if (names.length === 0) {
      console.log(`[DelayManager] 没有需要测试的节点`);
      return;
    }

    // 性能优化：根据节点数量动态调整并发数和策略
    let optimizedConcurrency = concurrency;
    let batchSize = names.length;
    let useProgressiveLoading = false;

    if (names.length > 500) {
      // 超大量节点：分批处理，减少内存占用
      optimizedConcurrency = Math.min(15, concurrency);
      batchSize = 100;
      useProgressiveLoading = true;
      console.log(`[DelayManager] 超大量节点模式：批量大小=${batchSize}, 并发数=${optimizedConcurrency}`);
    } else if (names.length > 100) {
      // 大量节点：适度减少并发
      optimizedConcurrency = Math.min(25, concurrency);
      console.log(`[DelayManager] 大量节点模式：并发数=${optimizedConcurrency}`);
    } else {
      // 正常数量：使用原有逻辑
      optimizedConcurrency = Math.min(concurrency, names.length, 36);
    }

    const startTime = Date.now();
    const listener = this.groupListenerMap.get(group);
    let completedCount = 0;

    if (useProgressiveLoading) {
      // 分批处理模式
      await this.processInBatches(names, group, timeout, batchSize, optimizedConcurrency, listener);
    } else {
      // 原有并发处理模式（优化版）
      await this.processConcurrently(names, group, timeout, optimizedConcurrency, listener);
    }

    const totalTime = Date.now() - startTime;
    console.log(
      `[DelayManager] 批量测试延迟完成，组: ${group}, 总耗时: ${totalTime}ms, 平均: ${(totalTime / names.length).toFixed(1)}ms/节点`,
    );
  }

  // 分批处理模式 - 用于超大量节点
  private async processInBatches(
    names: string[],
    group: string,
    timeout: number,
    batchSize: number,
    concurrency: number,
    listener?: () => void,
  ) {
    const batches = [];
    for (let i = 0; i < names.length; i += batchSize) {
      batches.push(names.slice(i, i + batchSize));
    }

    console.log(`[DelayManager] 分批处理：${batches.length} 个批次，每批 ${batchSize} 个节点`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`[DelayManager] 处理批次 ${batchIndex + 1}/${batches.length}，包含 ${batch.length} 个节点`);

      // 设置批次中所有节点为测试中状态
      batch.forEach((name) => this.setDelay(name, group, -2));

      // 并发处理当前批次
      await this.processConcurrently(batch, group, timeout, concurrency);

      // 批次完成后触发UI更新
      if (listener) {
        listener();
      }

      // 批次间添加短暂延迟，避免过度占用资源
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  // 并发处理模式 - 优化版
  private async processConcurrently(
    names: string[],
    group: string,
    timeout: number,
    concurrency: number,
    listener?: () => void,
  ) {
    // 设置正在延迟测试中
    names.forEach((name) => this.setDelay(name, group, -2));

    let index = 0;
    let completedCount = 0;
    const totalCount = names.length;

    const processNext = async (): Promise<void> => {
      const currName = names[index++];
      if (!currName) return;

      try {
        // 确保API调用前状态为测试中
        this.setDelay(currName, group, -2);

        // 性能优化：减少随机延迟，使用更精确的间隔控制
        if (index > 1 && totalCount > 50) {
          // 只有在大量节点时才添加延迟，避免请求风暴
          const delayMs = Math.min(50 + Math.random() * 100, 200);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        await this.checkDelay(currName, group, timeout);
        
        completedCount++;
        
        // 性能优化：减少UI更新频率
        if (listener && (completedCount % Math.max(1, Math.floor(totalCount / 20)) === 0 || completedCount === totalCount)) {
          listener();
        }
      } catch (error) {
        console.error(
          `[DelayManager] 批量测试单个代理出错，代理: ${currName}`,
          error,
        );
        // 设置为错误状态
        this.setDelay(currName, group, 1e6);
        completedCount++;
      }

      return processNext();
    };

    // 性能优化：动态调整实际并发数
    const actualConcurrency = Math.min(concurrency, names.length, this.getOptimalConcurrency(names.length));
    console.log(`[DelayManager] 实际并发数: ${actualConcurrency}`);

    const promiseList: Promise<void>[] = [];
    for (let i = 0; i < actualConcurrency; i++) {
      promiseList.push(processNext());
    }

    await Promise.all(promiseList);
  }

  // 根据节点数量获取最优并发数
  private getOptimalConcurrency(nodeCount: number): number {
    if (nodeCount <= 10) return nodeCount;
    if (nodeCount <= 50) return 15;
    if (nodeCount <= 200) return 25;
    if (nodeCount <= 500) return 20;
    return 15; // 超大量节点时降低并发，避免资源竞争
  }

  formatDelay(delay: number, timeout = 10000) {
    if (delay === -1) return "-";
    if (delay === -2) return "testing";
    if (delay >= timeout) return "timeout";
    return `${delay}`;
  }

  formatDelayColor(delay: number, timeout = 10000) {
    if (delay < 0) return "";
    if (delay >= timeout) return "error.main";
    if (delay >= 10000) return "error.main";
    if (delay >= 400) return "warning.main";
    if (delay >= 250) return "primary.main";
    return "success.main";
  }
}

export default new DelayManager();
