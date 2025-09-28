import React from "react";
import {
  Box,
  CircularProgress,
  LinearProgress,
  Skeleton,
  Typography,
  Fade,
  Backdrop,
} from "@mui/material";
import { styled, keyframes } from "@mui/material/styles";

// 改进的加载动画
const pulseAnimation = keyframes`
  0% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
`;

const LoadingContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: theme.spacing(2),
  animation: `${pulseAnimation} 2s ease-in-out infinite`,
}));

// 加载状态类型
export type LoadingType = 
  | "circular"    // 圆形进度条
  | "linear"      // 线性进度条
  | "skeleton"    // 骨架屏
  | "dots"        // 点状加载
  | "overlay"     // 遮罩层
  | "inline";     // 内联加载

export interface EnhancedLoadingProps {
  type?: LoadingType;
  size?: "small" | "medium" | "large";
  message?: string;
  progress?: number; // 0-100
  color?: "primary" | "secondary" | "error" | "warning" | "info" | "success";
  fullScreen?: boolean;
  backdrop?: boolean;
  delay?: number; // 延迟显示时间（毫秒）
  minDuration?: number; // 最小显示时间（毫秒）
  showPercentage?: boolean;
  variant?: "determinate" | "indeterminate";
  skeletonVariant?: "text" | "rectangular" | "circular";
  skeletonLines?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const EnhancedLoading: React.FC<EnhancedLoadingProps> = ({
  type = "circular",
  size = "medium",
  message,
  progress,
  color = "primary",
  fullScreen = false,
  backdrop = false,
  delay = 0,
  minDuration = 0,
  showPercentage = false,
  variant = "indeterminate",
  skeletonVariant = "text",
  skeletonLines = 3,
  className,
  style,
}) => {
  const [show, setShow] = React.useState(delay === 0);
  const [startTime] = React.useState(Date.now());

  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (delay > 0) {
      timer = setTimeout(() => setShow(true), delay);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [delay]);

  // 处理最小显示时间
  const [canHide, setCanHide] = React.useState(minDuration === 0);
  
  React.useEffect(() => {
    if (minDuration > 0 && show) {
      const timer = setTimeout(() => {
        setCanHide(true);
      }, minDuration);
      
      return () => clearTimeout(timer);
    }
  }, [show, minDuration]);

  if (!show || !canHide) {
    return null;
  }

  const sizeMap = {
    small: 24,
    medium: 40,
    large: 56,
  };

  const progressSize = sizeMap[size];

  const renderContent = () => {
    switch (type) {
      case "circular":
        return (
          <LoadingContainer className={className} style={style}>
            <CircularProgress
              size={progressSize}
              color={color}
              variant={variant}
              value={progress}
            />
            {message && (
              <Typography variant="body2" color="text.secondary" textAlign="center">
                {message}
              </Typography>
            )}
            {showPercentage && progress !== undefined && (
              <Typography variant="caption" color="text.secondary">
                {Math.round(progress)}%
              </Typography>
            )}
          </LoadingContainer>
        );

      case "linear":
        return (
          <Box className={className} style={style} sx={{ width: "100%", ...style }}>
            {message && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {message}
              </Typography>
            )}
            <LinearProgress
              color={color}
              variant={variant}
              value={progress}
            />
            {showPercentage && progress !== undefined && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                {Math.round(progress)}%
              </Typography>
            )}
          </Box>
        );

      case "skeleton":
        return (
          <Box className={className} style={style}>
            {Array.from({ length: skeletonLines }, (_, index) => (
              <Skeleton
                key={index}
                variant={skeletonVariant}
                width={index === skeletonLines - 1 ? "60%" : "100%"}
                height={skeletonVariant === "text" ? 24 : progressSize}
                sx={{ mb: 1 }}
              />
            ))}
          </Box>
        );

      case "dots":
        return (
          <LoadingContainer className={className} style={style}>
            <DotsLoading size={size} color={color} />
            {message && (
              <Typography variant="body2" color="text.secondary" textAlign="center">
                {message}
              </Typography>
            )}
          </LoadingContainer>
        );

      case "inline":
        return (
          <Box 
            className={className} 
            style={style}
            sx={{ 
              display: "inline-flex", 
              alignItems: "center", 
              gap: 1,
              ...style 
            }}
          >
            <CircularProgress size={16} color={color} />
            {message && (
              <Typography variant="body2" color="text.secondary">
                {message}
              </Typography>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  const content = (
    <Fade in={show} timeout={300}>
      <div>{renderContent()}</div>
    </Fade>
  );

  if (fullScreen) {
    return (
      <Backdrop
        open={show}
        sx={{
          color: "#fff",
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: backdrop ? "rgba(0, 0, 0, 0.5)" : "transparent",
        }}
      >
        {content}
      </Backdrop>
    );
  }

  if (type === "overlay") {
    return (
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: backdrop ? "rgba(255, 255, 255, 0.8)" : "transparent",
          zIndex: 1000,
          borderRadius: "inherit",
        }}
      >
        {content}
      </Box>
    );
  }

  return content;
};

// 点状加载组件
const DotsContainer = styled(Box)<{ size: string }>(({ theme, size }) => {
  const sizeMap = {
    small: 4,
    medium: 6,
    large: 8,
  };
  
  const dotSize = sizeMap[size as keyof typeof sizeMap];
  
  return {
    display: "flex",
    gap: theme.spacing(0.5),
    
    "& .dot": {
      width: dotSize,
      height: dotSize,
      borderRadius: "50%",
      backgroundColor: theme.palette.primary.main,
      animation: "dotAnimation 1.4s infinite ease-in-out both",
    },
    
    "& .dot:nth-of-type(1)": {
      animationDelay: "-0.32s",
    },
    
    "& .dot:nth-of-type(2)": {
      animationDelay: "-0.16s",
    },
    
    "@keyframes dotAnimation": {
      "0%, 80%, 100%": {
        transform: "scale(0)",
      },
      "40%": {
        transform: "scale(1)",
      },
    },
  };
});

interface DotsLoadingProps {
  size: "small" | "medium" | "large";
  color?: "primary" | "secondary" | "error" | "warning" | "info" | "success";
}

const DotsLoading: React.FC<DotsLoadingProps> = ({ size, color = "primary" }) => {
  return (
    <DotsContainer size={size}>
      <div className="dot" />
      <div className="dot" />
      <div className="dot" />
    </DotsContainer>
  );
};

// Loading Hook for state management
export interface UseLoadingOptions {
  delay?: number;
  minDuration?: number;
  defaultMessage?: string;
}

export const useLoading = (options: UseLoadingOptions = {}) => {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState(options.defaultMessage || "");
  const [progress, setProgress] = React.useState<number | undefined>();

  const startLoading = React.useCallback((loadingMessage?: string) => {
    setLoading(true);
    setMessage(loadingMessage || options.defaultMessage || "");
    setProgress(undefined);
  }, [options.defaultMessage]);

  const stopLoading = React.useCallback(() => {
    setLoading(false);
    setMessage("");
    setProgress(undefined);
  }, []);

  const updateProgress = React.useCallback((value: number, progressMessage?: string) => {
    setProgress(value);
    if (progressMessage) {
      setMessage(progressMessage);
    }
  }, []);

  const updateMessage = React.useCallback((newMessage: string) => {
    setMessage(newMessage);
  }, []);

  return {
    loading,
    message,
    progress,
    startLoading,
    stopLoading,
    updateProgress,
    updateMessage,
  };
};

export default EnhancedLoading;
