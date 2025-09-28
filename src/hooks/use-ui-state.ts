import { useState, useCallback, useRef, useEffect } from "react";
import { useNotification } from "@/components/base/enhanced-notification";
import { useErrorHandler } from "@/components/base/enhanced-error";

// UI状态类型
export type UIState = "idle" | "loading" | "success" | "error";

// 操作状态接口
export interface OperationState {
  id: string;
  state: UIState;
  message?: string;
  progress?: number;
  error?: Error | string;
  startTime?: number;
  retryCount?: number;
}

// UI状态管理选项
export interface UseUIStateOptions {
  // 加载状态配置
  showLoadingAfter?: number; // 延迟显示加载状态的时间（毫秒）
  minLoadingDuration?: number; // 最小加载时间（毫秒）
  
  // 成功状态配置
  showSuccessNotification?: boolean;
  successDuration?: number;
  
  // 错误处理配置
  showErrorNotification?: boolean;
  autoRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  
  // 通知配置
  notificationPosition?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
  
  // 调试模式
  debug?: boolean;
}

// 操作执行选项
export interface ExecuteOperationOptions {
  loadingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  silent?: boolean; // 静默模式，不显示通知
  showProgress?: boolean;
  timeout?: number; // 超时时间（毫秒）
  retryable?: boolean;
}

export const useUIState = (options: UseUIStateOptions = {}) => {
  const {
    showLoadingAfter = 500,
    minLoadingDuration = 300,
    showSuccessNotification = true,
    successDuration = 3000,
    showErrorNotification = true,
    autoRetry = false,
    maxRetries = 3,
    retryDelay = 1000,
    notificationPosition = "top-right",
    debug = false,
  } = options;

  // 状态管理
  const [operations, setOperations] = useState<Map<string, OperationState>>(new Map());
  const [globalState, setGlobalState] = useState<UIState>("idle");
  
  // 引用
  const timeoutRefs = useRef<Map<string, number>>(new Map());
  const loadingStartTimes = useRef<Map<string, number>>(new Map());

  // 通知和错误处理
  const notification = useNotification({ position: notificationPosition });
  const errorHandler = useErrorHandler({ 
    maxRetries, 
    autoReport: false,
    showSnackbar: showErrorNotification 
  });

  // 生成操作ID
  const generateOperationId = useCallback(() => {
    return `operation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // 调试日志
  const debugLog = useCallback((message: string, data?: any) => {
    if (debug) {
      console.log(`[UIState] ${message}`, data);
    }
  }, [debug]);

  // 更新操作状态
  const updateOperation = useCallback((id: string, updates: Partial<OperationState>) => {
    setOperations(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(id) || { id, state: "idle" };
      newMap.set(id, { ...existing, ...updates });
      return newMap;
    });

    debugLog(`Operation ${id} updated`, updates);
  }, [debugLog]);

  // 移除操作
  const removeOperation = useCallback((id: string) => {
    setOperations(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });

    // 清理定时器
    const timeout = timeoutRefs.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(id);
    }
    
    loadingStartTimes.current.delete(id);
    debugLog(`Operation ${id} removed`);
  }, [debugLog]);

  // 获取全局状态
  useEffect(() => {
    const allOperations = Array.from(operations.values());
    
    if (allOperations.some(op => op.state === "error")) {
      setGlobalState("error");
    } else if (allOperations.some(op => op.state === "loading")) {
      setGlobalState("loading");
    } else if (allOperations.some(op => op.state === "success")) {
      setGlobalState("success");
    } else {
      setGlobalState("idle");
    }
  }, [operations]);

  // 开始加载
  const startLoading = useCallback((id: string, message?: string) => {
    const startTime = Date.now();
    loadingStartTimes.current.set(id, startTime);

    updateOperation(id, {
      state: "loading",
      message,
      startTime,
      retryCount: 0,
    });

    // 延迟显示加载状态
    if (showLoadingAfter > 0) {
      const timeout = setTimeout(() => {
        if (!notification.loading(message || "Loading...", { 
          id: `loading-${id}`,
          persistent: true,
          closable: false 
        })) {
          debugLog(`Failed to show loading notification for ${id}`);
        }
      }, showLoadingAfter) as unknown as number;
      
      timeoutRefs.current.set(id, timeout);
    } else {
      notification.loading(message || "Loading...", { 
        id: `loading-${id}`,
        persistent: true,
        closable: false 
      });
    }

    debugLog(`Loading started for ${id}`, { message });
  }, [showLoadingAfter, notification, updateOperation, debugLog]);

  // 更新进度
  const updateProgress = useCallback((id: string, progress: number, message?: string) => {
    updateOperation(id, { progress, message });
    
    notification.updateNotification(`loading-${id}`, {
      type: "progress",
      progress,
      message: message || `Progress: ${Math.round(progress)}%`,
    });

    debugLog(`Progress updated for ${id}`, { progress, message });
  }, [notification, updateOperation, debugLog]);

  // 完成成功
  const completeSuccess = useCallback(async (id: string, message?: string) => {
    const startTime = loadingStartTimes.current.get(id);
    const elapsedTime = startTime ? Date.now() - startTime : 0;
    
    // 确保最小加载时间
    if (elapsedTime < minLoadingDuration) {
      await new Promise(resolve => setTimeout(resolve, minLoadingDuration - elapsedTime));
    }

    updateOperation(id, { state: "success", message });
    
    // 移除加载通知
    notification.removeNotification(`loading-${id}`);
    
    // 显示成功通知
    if (showSuccessNotification && message) {
      notification.success(message, { duration: successDuration });
    }

    debugLog(`Success completed for ${id}`, { message, elapsedTime });

    // 清理操作
    setTimeout(() => removeOperation(id), 1000);
  }, [minLoadingDuration, showSuccessNotification, successDuration, notification, updateOperation, removeOperation, debugLog]);

  // 完成错误
  const completeError = useCallback((id: string, error: Error | string, options: { retryable?: boolean } = {}) => {
    const operation = operations.get(id);
    const retryCount = (operation?.retryCount || 0) + 1;
    
    updateOperation(id, { 
      state: "error", 
      error, 
      retryCount 
    });

    // 移除加载通知
    notification.removeNotification(`loading-${id}`);

    // 处理错误
    if (showErrorNotification) {
      const canRetry = options.retryable && retryCount < maxRetries;
      
      notification.error(
        typeof error === "string" ? error : error.message,
        {
          duration: 0, // 错误通知不自动消失
          actions: canRetry ? [{
            label: `Retry (${retryCount}/${maxRetries})`,
            action: () => {
              // TODO: 实现重试逻辑
              debugLog(`Retry requested for ${id}`, { retryCount });
            },
            color: "primary" as const,
          }] : undefined,
        }
      );
    }

    debugLog(`Error completed for ${id}`, { error, retryCount });

    // 自动重试
    if (autoRetry && options.retryable && retryCount < maxRetries) {
      setTimeout(() => {
        // TODO: 实现自动重试逻辑
        debugLog(`Auto retry for ${id}`, { retryCount });
      }, retryDelay);
    } else {
      // 清理操作（延迟移除，便于查看错误信息）
      setTimeout(() => removeOperation(id), 5000);
    }
  }, [autoRetry, maxRetries, retryDelay, showErrorNotification, notification, operations, updateOperation, removeOperation, debugLog]);

  // 执行异步操作
  const executeOperation = useCallback(async <T>(
    operation: () => Promise<T>,
    options: ExecuteOperationOptions = {}
  ): Promise<T> => {
    const {
      loadingMessage = "Processing...",
      successMessage,
      errorMessage,
      silent = false,
      showProgress = false,
      timeout = 30000,
      retryable = true,
    } = options;

    const operationId = generateOperationId();
    
    try {
      // 开始加载
      if (!silent) {
        startLoading(operationId, loadingMessage);
      }

      // 设置超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Operation timeout")), timeout);
      });

      // 执行操作
      let result: T;
      if (showProgress) {
        // TODO: 如果操作支持进度报告，可以在这里处理
        result = await Promise.race([operation(), timeoutPromise]);
      } else {
        result = await Promise.race([operation(), timeoutPromise]);
      }

      // 完成成功
      if (!silent) {
        await completeSuccess(operationId, successMessage || "Operation completed successfully");
      }

      return result;
    } catch (error) {
      // 完成错误
      if (!silent) {
        const errorMsg = errorMessage || (error instanceof Error ? error.message : "Operation failed");
        completeError(operationId, errorMsg, { retryable });
      }
      throw error;
    }
  }, [generateOperationId, startLoading, completeSuccess, completeError]);

  // 批量执行操作
  const executeBatch = useCallback(async <T>(
    operations: (() => Promise<T>)[],
    options: ExecuteOperationOptions & { 
      concurrency?: number;
      failFast?: boolean;
    } = {}
  ): Promise<T[]> => {
    const {
      concurrency = 3,
      failFast = false,
      loadingMessage = "Processing batch operations...",
      ...restOptions
    } = options;

    const batchId = generateOperationId();
    
    try {
      startLoading(batchId, loadingMessage);
      
      const results: T[] = [];
      const errors: Error[] = [];
      
      // 分批执行
      for (let i = 0; i < operations.length; i += concurrency) {
        const batch = operations.slice(i, i + concurrency);
        const progress = (i / operations.length) * 100;
        
        updateProgress(batchId, progress, `Processing ${i + 1}-${Math.min(i + concurrency, operations.length)} of ${operations.length}`);
        
        const batchPromises = batch.map(async (op, index) => {
          try {
            return await executeOperation(op, { ...restOptions, silent: true });
          } catch (error) {
            if (failFast) {
              throw error;
            }
            errors.push(error instanceof Error ? error : new Error(String(error)));
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(r => r !== null) as T[]);
      }
      
      updateProgress(batchId, 100, "Batch processing completed");
      
      if (errors.length > 0 && failFast) {
        throw new Error(`Batch failed with ${errors.length} errors`);
      }
      
      await completeSuccess(batchId, `Batch completed. ${results.length} succeeded, ${errors.length} failed.`);
      
      return results;
    } catch (error) {
      completeError(batchId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }, [generateOperationId, startLoading, updateProgress, completeSuccess, completeError, executeOperation]);

  // 获取操作状态
  const getOperationState = useCallback((id: string): OperationState | undefined => {
    return operations.get(id);
  }, [operations]);

  // 获取所有操作
  const getAllOperations = useCallback((): OperationState[] => {
    return Array.from(operations.values());
  }, [operations]);

  // 清理所有操作
  const clearAll = useCallback(() => {
    // 清理所有定时器
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current.clear();
    loadingStartTimes.current.clear();
    
    // 清理状态
    setOperations(new Map());
    notification.clearAll();
    
    debugLog("All operations cleared");
  }, [notification, debugLog]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      clearAll();
    };
  }, [clearAll]);

  return {
    // 状态
    globalState,
    operations: getAllOperations(),
    
    // 核心方法
    executeOperation,
    executeBatch,
    
    // 手动控制方法
    startLoading,
    updateProgress,
    completeSuccess,
    completeError,
    
    // 查询方法
    getOperationState,
    getAllOperations,
    
    // 管理方法
    removeOperation,
    clearAll,
    
    // 便捷方法
    isLoading: globalState === "loading",
    hasError: globalState === "error",
    isSuccess: globalState === "success",
    isIdle: globalState === "idle",
    
    // 通知组件
    NotificationContainer: notification.NotificationContainer,
  };
};

export type UIStateManager = ReturnType<typeof useUIState>;

export default useUIState;
