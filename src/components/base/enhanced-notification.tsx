import React from "react";
import {
  Alert,
  AlertTitle,
  Snackbar,
  Stack,
  IconButton,
  Slide,
  Grow,
  Fade,
  Box,
  Typography,
  LinearProgress,
  Button,
  Chip,
} from "@mui/material";
import {
  Close,
  CheckCircle,
  Error,
  Warning,
  Info,
  Refresh,
  Download,
  Settings,
} from "@mui/icons-material";
import { styled, keyframes } from "@mui/material/styles";
import { TransitionProps } from "@mui/material/transitions";

// 通知类型
export type NotificationType = 
  | "success" 
  | "error" 
  | "warning" 
  | "info" 
  | "loading"
  | "progress";

// 通知优先级
export type NotificationPriority = "low" | "normal" | "high" | "critical";

// 通知位置
export type NotificationPosition = 
  | "top-left" 
  | "top-center" 
  | "top-right"
  | "bottom-left" 
  | "bottom-center" 
  | "bottom-right";

// 动画类型
export type AnimationType = "slide" | "grow" | "fade";

// 通知接口
export interface NotificationData {
  id?: string;
  type: NotificationType;
  title?: string;
  message: string;
  priority?: NotificationPriority;
  duration?: number; // 自动隐藏时间（毫秒），0表示不自动隐藏
  persistent?: boolean; // 是否持久显示
  closable?: boolean; // 是否可手动关闭
  progress?: number; // 进度值 0-100
  actions?: NotificationAction[]; // 操作按钮
  metadata?: Record<string, any>; // 额外数据
  timestamp?: Date;
}

export interface NotificationAction {
  label: string;
  action: () => void;
  color?: "primary" | "secondary" | "error" | "warning" | "info" | "success";
  variant?: "text" | "outlined" | "contained";
  icon?: React.ReactNode;
}

// 通知组件属性
export interface EnhancedNotificationProps {
  notification: NotificationData;
  position?: NotificationPosition;
  animation?: AnimationType;
  maxWidth?: number;
  elevation?: number;
  onClose?: (id: string) => void;
  onAction?: (id: string, actionIndex: number) => void;
}

// 通知图标映射
const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case "success":
      return <CheckCircle />;
    case "error":
      return <Error />;
    case "warning":
      return <Warning />;
    case "info":
      return <Info />;
    case "loading":
    case "progress":
      return null; // 使用进度条
    default:
      return <Info />;
  }
};

// 脉冲动画
const pulseAnimation = keyframes`
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.02);
    opacity: 0.9;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
`;

// 样式化通知容器
const NotificationContainer = styled(Box)<{ 
  priority: NotificationPriority;
  type: NotificationType;
}>(({ theme, priority, type }) => ({
  minWidth: 300,
  maxWidth: 500,
  borderRadius: theme.spacing(1),
  boxShadow: theme.shadows[8],
  overflow: "hidden",
  
  // 根据优先级添加不同的边框
  ...(priority === "critical" && {
    border: `2px solid ${theme.palette.error.main}`,
    animation: `${pulseAnimation} 2s infinite`,
  }),
  
  ...(priority === "high" && {
    border: `1px solid ${theme.palette.warning.main}`,
  }),
  
  // 根据类型添加特殊样式
  ...(type === "loading" && {
    backgroundColor: theme.palette.action.hover,
  }),
}));

// 单个通知组件
export const EnhancedNotification: React.FC<EnhancedNotificationProps> = ({
  notification,
  onClose,
  onAction,
}) => {
  const {
    id = "",
    type,
    title,
    message,
    priority = "normal",
    closable = true,
    progress,
    actions = [],
    timestamp,
  } = notification;

  const handleClose = () => {
    if (onClose) {
      onClose(id);
    }
  };

  const handleAction = (actionIndex: number) => {
    if (onAction) {
      onAction(id, actionIndex);
    }
  };

  const showProgress = type === "progress" || type === "loading";
  const isIndeterminate = type === "loading" || progress === undefined;

  return (
    <NotificationContainer priority={priority} type={type}>
      <Alert
        severity={type === "loading" || type === "progress" ? "info" : type}
        variant="filled"
        icon={getNotificationIcon(type)}
        action={
          closable ? (
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={handleClose}
            >
              <Close fontSize="small" />
            </IconButton>
          ) : null
        }
        sx={{
          width: "100%",
          "& .MuiAlert-message": {
            width: "100%",
          },
        }}
      >
        {title && <AlertTitle>{title}</AlertTitle>}
        
        <Typography variant="body2" sx={{ mb: showProgress ? 1 : 0 }}>
          {message}
        </Typography>

        {/* 进度条 */}
        {showProgress && (
          <Box sx={{ width: "100%", mt: 1 }}>
            <LinearProgress
              variant={isIndeterminate ? "indeterminate" : "determinate"}
              value={progress}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: "rgba(255, 255, 255, 0.3)",
                "& .MuiLinearProgress-bar": {
                  borderRadius: 3,
                },
              }}
            />
            {!isIndeterminate && progress !== undefined && (
              <Typography
                variant="caption"
                sx={{ 
                  display: "block", 
                  textAlign: "right", 
                  mt: 0.5,
                  opacity: 0.8 
                }}
              >
                {Math.round(progress)}%
              </Typography>
            )}
          </Box>
        )}

        {/* 时间戳 */}
        {timestamp && (
          <Chip
            label={timestamp.toLocaleTimeString()}
            size="small"
            variant="outlined"
            sx={{ 
              mt: 1, 
              height: 20, 
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              color: "inherit",
              borderColor: "rgba(255, 255, 255, 0.3)",
            }}
          />
        )}

        {/* 操作按钮 */}
        {actions.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {actions.map((action, index) => (
              <Button
                key={index}
                size="small"
                variant={action.variant || "outlined"}
                color={action.color || "inherit"}
                startIcon={action.icon}
                onClick={() => handleAction(index)}
                sx={{
                  color: "inherit",
                  borderColor: "rgba(255, 255, 255, 0.5)",
                  "&:hover": {
                    borderColor: "rgba(255, 255, 255, 0.8)",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                  },
                }}
              >
                {action.label}
              </Button>
            ))}
          </Stack>
        )}
      </Alert>
    </NotificationContainer>
  );
};

// 动画过渡组件
const SlideTransition = React.forwardRef<
  unknown,
  TransitionProps & { children: React.ReactElement; direction?: "up" | "down" | "left" | "right" }
>(function Transition(props, ref) {
  const { direction = "down", ...other } = props;
  return <Slide direction={direction} ref={ref} {...other} />;
});

const GrowTransition = React.forwardRef<unknown, TransitionProps & { children: React.ReactElement }>(
  function Transition(props, ref) {
    return <Grow ref={ref} {...props} />;
  }
);

const FadeTransition = React.forwardRef<unknown, TransitionProps & { children: React.ReactElement }>(
  function Transition(props, ref) {
    return <Fade ref={ref} {...props} />;
  }
);

// 通知容器组件
export interface NotificationContainerProps {
  notifications: NotificationData[];
  position?: NotificationPosition;
  animation?: AnimationType;
  maxNotifications?: number;
  onClose?: (id: string) => void;
  onAction?: (id: string, actionIndex: number) => void;
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({
  notifications,
  position = "top-right",
  animation = "slide",
  maxNotifications = 5,
  onClose,
  onAction,
}) => {
  // 根据位置计算锚点
  const getAnchorOrigin = (): { vertical: "top" | "bottom"; horizontal: "left" | "center" | "right" } => {
    const [vertical, horizontal] = position.split("-") as ["top" | "bottom", "left" | "center" | "right"];
    return { vertical, horizontal };
  };

  // 获取过渡组件
  const getTransitionComponent = () => {
    switch (animation) {
      case "slide":
        return SlideTransition;
      case "grow":
        return GrowTransition;
      case "fade":
        return FadeTransition;
      default:
        return SlideTransition;
    }
  };

  const TransitionComponent = getTransitionComponent();
  const anchorOrigin = getAnchorOrigin();

  // 限制显示的通知数量
  const displayedNotifications = notifications
    .slice(0, maxNotifications)
    .sort((a, b) => {
      // 按优先级排序
      const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
      const aPriority = priorityOrder[a.priority || "normal"];
      const bPriority = priorityOrder[b.priority || "normal"];
      return bPriority - aPriority;
    });

  return (
    <Box
      sx={{
        position: "fixed",
        zIndex: 9999,
        pointerEvents: "none",
        ...(anchorOrigin.vertical === "top" && { top: 16 }),
        ...(anchorOrigin.vertical === "bottom" && { bottom: 16 }),
        ...(anchorOrigin.horizontal === "left" && { left: 16 }),
        ...(anchorOrigin.horizontal === "center" && { 
          left: "50%", 
          transform: "translateX(-50%)" 
        }),
        ...(anchorOrigin.horizontal === "right" && { right: 16 }),
      }}
    >
      <Stack spacing={1}>
        {displayedNotifications.map((notification) => (
          <Box key={notification.id} sx={{ pointerEvents: "auto" }}>
            <TransitionComponent>
              <div>
                <EnhancedNotification
                  notification={notification}
                  position={position}
                  animation={animation}
                  onClose={onClose}
                  onAction={onAction}
                />
              </div>
            </TransitionComponent>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

// 通知管理Hook
export interface UseNotificationOptions {
  position?: NotificationPosition;
  animation?: AnimationType;
  maxNotifications?: number;
  defaultDuration?: number;
}

export const useNotification = (options: UseNotificationOptions = {}) => {
  const {
    position = "top-right",
    animation = "slide",
    maxNotifications = 5,
    defaultDuration = 5000,
  } = options;

  const [notifications, setNotifications] = React.useState<NotificationData[]>([]);

  // 生成唯一ID
  const generateId = () => `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // 添加通知
  const addNotification = React.useCallback((
    notificationData: Omit<NotificationData, "id" | "timestamp">
  ) => {
    const notification: NotificationData = {
      ...notificationData,
      id: generateId(),
      timestamp: new Date(),
      duration: notificationData.duration ?? defaultDuration,
    };

    setNotifications(prev => [...prev, notification]);

    // 自动移除
    if (notification.duration && notification.duration > 0 && !notification.persistent) {
      setTimeout(() => {
        removeNotification(notification.id!);
      }, notification.duration);
    }

    return notification.id!;
  }, [defaultDuration]);

  // 移除通知
  const removeNotification = React.useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // 清除所有通知
  const clearAll = React.useCallback(() => {
    setNotifications([]);
  }, []);

  // 更新通知
  const updateNotification = React.useCallback((
    id: string,
    updates: Partial<NotificationData>
  ) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, ...updates } : n))
    );
  }, []);

  // 便捷方法
  const success = React.useCallback((message: string, options: Partial<NotificationData> = {}) => {
    return addNotification({ ...options, type: "success", message });
  }, [addNotification]);

  const error = React.useCallback((message: string, options: Partial<NotificationData> = {}) => {
    return addNotification({ ...options, type: "error", message, duration: 0 });
  }, [addNotification]);

  const warning = React.useCallback((message: string, options: Partial<NotificationData> = {}) => {
    return addNotification({ ...options, type: "warning", message });
  }, [addNotification]);

  const info = React.useCallback((message: string, options: Partial<NotificationData> = {}) => {
    return addNotification({ ...options, type: "info", message });
  }, [addNotification]);

  const loading = React.useCallback((message: string, options: Partial<NotificationData> = {}) => {
    return addNotification({ 
      ...options, 
      type: "loading", 
      message, 
      duration: 0, 
      persistent: true, 
      closable: false 
    });
  }, [addNotification]);

  const progress = React.useCallback((
    message: string, 
    progressValue: number, 
    options: Partial<NotificationData> = {}
  ) => {
    return addNotification({ 
      ...options, 
      type: "progress", 
      message, 
      progress: progressValue,
      duration: 0, 
      persistent: true 
    });
  }, [addNotification]);

  return {
    notifications,
    addNotification,
    removeNotification,
    updateNotification,
    clearAll,
    success,
    error,
    warning,
    info,
    loading,
    progress,
    NotificationContainer: () => (
      <NotificationContainer
        notifications={notifications}
        position={position}
        animation={animation}
        maxNotifications={maxNotifications}
        onClose={removeNotification}
        onAction={(id, actionIndex) => {
          const notification = notifications.find(n => n.id === id);
          if (notification?.actions?.[actionIndex]) {
            notification.actions[actionIndex].action();
          }
        }}
      />
    ),
  };
};

export default EnhancedNotification;
