import React, { createContext, useContext, ReactNode } from "react";
import { useUIState, UIStateManager, UseUIStateOptions } from "@/hooks/use-ui-state";

// UI状态上下文
const UIStateContext = createContext<UIStateManager | null>(null);

// UI状态提供者属性
export interface UIStateProviderProps {
  children: ReactNode;
  options?: UseUIStateOptions;
}

// UI状态提供者组件
export const UIStateProvider: React.FC<UIStateProviderProps> = ({ 
  children, 
  options = {} 
}) => {
  const defaultOptions: UseUIStateOptions = {
    showLoadingAfter: 300,
    minLoadingDuration: 500,
    showSuccessNotification: true,
    successDuration: 3000,
    showErrorNotification: true,
    autoRetry: false,
    maxRetries: 3,
    retryDelay: 1500,
    notificationPosition: "top-right",
    debug: typeof window !== 'undefined' && window.location.hostname === 'localhost',
    ...options,
  };

  const uiState = useUIState(defaultOptions);

  return (
    <UIStateContext.Provider value={uiState}>
      {children}
      {/* 渲染通知容器 */}
      <uiState.NotificationContainer />
    </UIStateContext.Provider>
  );
};

// 使用UI状态的Hook
export const useUIStateContext = (): UIStateManager => {
  const context = useContext(UIStateContext);
  
  if (!context) {
    throw new Error("useUIStateContext must be used within a UIStateProvider");
  }
  
  return context;
};

// 便捷的Hook，可以选择性地使用全局状态
export const useOptionalUIState = (): UIStateManager | null => {
  return useContext(UIStateContext);
};

export default UIStateProvider;
