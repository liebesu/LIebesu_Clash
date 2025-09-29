/**
 * 性能监控工具
 * 用于监控大量节点时的前端性能表现
 */

import React from "react";

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

interface PerformanceReport {
  totalMetrics: number;
  averageRenderTime: number;
  slowestOperations: PerformanceMetric[];
  memoryUsage?: {
    used: number;
    total: number;
    percentage: number;
  };
  recommendations: string[];
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private completed: PerformanceMetric[] = [];
  private isEnabled = true;
  private maxMetrics = 1000; // 防止内存泄漏

  constructor() {
    // 在开发环境下自动启用 (使用简单的检测方式)
    this.isEnabled = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  }

  enable() {
    this.isEnabled = true;
    console.log('[PerformanceMonitor] 性能监控已启用');
  }

  disable() {
    this.isEnabled = false;
    console.log('[PerformanceMonitor] 性能监控已禁用');
  }

  /**
   * 开始监控一个操作
   */
  startTimer(name: string, metadata?: Record<string, any>): void {
    if (!this.isEnabled) return;

    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata,
    };

    this.metrics.set(name, metric);
  }

  /**
   * 结束监控一个操作
   */
  endTimer(name: string): number | undefined {
    if (!this.isEnabled) return;

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`[PerformanceMonitor] 找不到计时器: ${name}`);
      return;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    const completedMetric: PerformanceMetric = {
      ...metric,
      endTime,
      duration,
    };

    this.completed.push(completedMetric);
    this.metrics.delete(name);

    // 防止内存泄漏
    if (this.completed.length > this.maxMetrics) {
      this.completed = this.completed.slice(-this.maxMetrics / 2);
    }

    // 如果操作耗时超过100ms，记录警告
    if (duration > 100) {
      console.warn(`[PerformanceMonitor] 慢操作检测: ${name} 耗时 ${duration.toFixed(2)}ms`, completedMetric.metadata);
    }

    return duration;
  }

  /**
   * 测量一个函数的执行时间
   */
  measure<T>(name: string, fn: () => T, metadata?: Record<string, any>): T {
    if (!this.isEnabled) return fn();

    this.startTimer(name, metadata);
    try {
      const result = fn();
      this.endTimer(name);
      return result;
    } catch (error) {
      this.endTimer(name);
      throw error;
    }
  }

  /**
   * 测量异步函数的执行时间
   */
  async measureAsync<T>(name: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
    if (!this.isEnabled) return fn();

    this.startTimer(name, metadata);
    try {
      const result = await fn();
      this.endTimer(name);
      return result;
    } catch (error) {
      this.endTimer(name);
      throw error;
    }
  }

  /**
   * 获取性能报告
   */
  getReport(): PerformanceReport {
    const totalMetrics = this.completed.length;
    const renderMetrics = this.completed.filter(m => m.name.includes('render') || m.name.includes('list'));
    const averageRenderTime = renderMetrics.length > 0 
      ? renderMetrics.reduce((sum, m) => sum + (m.duration || 0), 0) / renderMetrics.length 
      : 0;

    // 找出最慢的操作
    const slowestOperations = this.completed
      .filter(m => m.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);

    // 内存使用情况（如果可用）
    let memoryUsage;
    if ('memory' in performance) {
      const mem = (performance as any).memory;
      memoryUsage = {
        used: mem.usedJSHeapSize,
        total: mem.totalJSHeapSize,
        percentage: (mem.usedJSHeapSize / mem.totalJSHeapSize) * 100,
      };
    }

    // 生成优化建议
    const recommendations: string[] = [];
    
    if (averageRenderTime > 50) {
      recommendations.push('列表渲染时间过长，建议启用虚拟滚动或减少并发渲染');
    }
    
    if (slowestOperations.some(op => op.duration! > 500)) {
      recommendations.push('检测到超慢操作，建议使用Web Worker或分批处理');
    }

    if (memoryUsage && memoryUsage.percentage > 80) {
      recommendations.push('内存使用率过高，建议清理缓存或减少数据量');
    }

    const longRunningOps = slowestOperations.filter(op => op.duration! > 200);
    if (longRunningOps.length > 0) {
      recommendations.push(`发现 ${longRunningOps.length} 个长时间运行操作，建议优化`);
    }

    return {
      totalMetrics,
      averageRenderTime,
      slowestOperations,
      memoryUsage,
      recommendations,
    };
  }

  /**
   * 清除所有性能数据
   */
  clear(): void {
    this.metrics.clear();
    this.completed = [];
    console.log('[PerformanceMonitor] 性能数据已清除');
  }

  /**
   * 获取当前正在运行的操作
   */
  getRunningOperations(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * 监控React组件渲染
   */
  monitorComponentRender<P extends object>(
    Component: React.ComponentType<P>,
    componentName?: string
  ): React.ComponentType<P> {
    if (!this.isEnabled) return Component;

    const name = componentName || Component.displayName || Component.name || 'UnknownComponent';
    
    // 使用简单的高阶组件模式，避免复杂的forwardRef类型问题
    const WrappedComponent: React.ComponentType<P> = (props: P) => {
      this.startTimer(`${name}-render`, { propsKeys: Object.keys(props) });
      
      try {
        const result = React.createElement(Component, props);
        this.endTimer(`${name}-render`);
        return result;
      } catch (error) {
        this.endTimer(`${name}-render`);
        throw error;
      }
    };

    // 保持组件名称便于调试
    WrappedComponent.displayName = `PerformanceMonitor(${name})`;
    
    return WrappedComponent;
  }

  /**
   * 监控列表操作
   */
  monitorListOperation(operationName: string, itemCount: number) {
    const name = `list-${operationName}`;
    this.startTimer(name, { itemCount });
    
    return () => {
      const duration = this.endTimer(name);
      if (duration && itemCount > 0) {
        const avgPerItem = duration / itemCount;
        if (avgPerItem > 1) { // 每个项目超过1ms
          console.warn(`[PerformanceMonitor] 列表操作 ${operationName} 平均每项耗时 ${avgPerItem.toFixed(2)}ms`);
        }
      }
    };
  }

  /**
   * 自动监控大量节点场景
   */
  setupNodeMonitoring() {
    if (!this.isEnabled) return;

    // 监控DOM节点数量
    const observer = new MutationObserver((mutations) => {
      const nodeCount = document.querySelectorAll('[data-proxy-item]').length;
      if (nodeCount > 500) {
        console.info(`[PerformanceMonitor] 检测到大量代理节点: ${nodeCount} 个`);
        
        // 检查性能
        if ('memory' in performance) {
          const mem = (performance as any).memory;
          const memoryUsagePercent = (mem.usedJSHeapSize / mem.totalJSHeapSize) * 100;
          if (memoryUsagePercent > 70) {
            console.warn(`[PerformanceMonitor] 内存使用率过高: ${memoryUsagePercent.toFixed(1)}%`);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }
}

// 全局单例
export const performanceMonitor = new PerformanceMonitor();

// React Hook
export function usePerformanceMonitor() {
  return {
    startTimer: performanceMonitor.startTimer.bind(performanceMonitor),
    endTimer: performanceMonitor.endTimer.bind(performanceMonitor),
    measure: performanceMonitor.measure.bind(performanceMonitor),
    measureAsync: performanceMonitor.measureAsync.bind(performanceMonitor),
    getReport: performanceMonitor.getReport.bind(performanceMonitor),
    monitorListOperation: performanceMonitor.monitorListOperation.bind(performanceMonitor),
  };
}

// 装饰器用于自动监控
export function measurePerformance(name?: string) {
  return function <T extends (...args: any[]) => any>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value!;
    const methodName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = function (this: any, ...args: any[]) {
      return performanceMonitor.measure(methodName, () => originalMethod.apply(this, args));
    } as T;

    return descriptor;
  };
}

export default performanceMonitor;
