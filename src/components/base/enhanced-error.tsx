import React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Typography,
  Chip,
  Stack,
} from "@mui/material";
import {
  ErrorOutline,
  WarningAmber,
  InfoOutlined,
  CheckCircleOutline,
  Close,
  ExpandMore,
  ExpandLess,
  Refresh,
  ContentCopy,
  BugReport,
} from "@mui/icons-material";
import { styled } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

// 错误类型定义
export type ErrorSeverity = "error" | "warning" | "info" | "success";

export interface ErrorDetails {
  message: string;
  code?: string;
  stack?: string;
  timestamp?: Date;
  context?: Record<string, any>;
  suggestions?: string[];
  retryable?: boolean;
  reportable?: boolean;
}

export interface EnhancedErrorProps {
  error: ErrorDetails | Error | string;
  severity?: ErrorSeverity;
  title?: string;
  variant?: "standard" | "outlined" | "filled";
  showActions?: boolean;
  showDetails?: boolean;
  allowRetry?: boolean;
  allowReport?: boolean;
  allowDismiss?: boolean;
  maxRetries?: number;
  currentRetries?: number;
  onRetry?: () => void;
  onReport?: (error: ErrorDetails) => void;
  onDismiss?: () => void;
  className?: string;
}

// 错误信息格式化
const formatError = (error: ErrorDetails | Error | string): ErrorDetails => {
  if (typeof error === "string") {
    return {
      message: error,
      timestamp: new Date(),
      retryable: false,
      reportable: true,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      timestamp: new Date(),
      retryable: true,
      reportable: true,
    };
  }

  return {
    ...error,
    timestamp: error.timestamp || new Date(),
  };
};

// 错误图标映射
const getErrorIcon = (severity: ErrorSeverity) => {
  switch (severity) {
    case "error":
      return <ErrorOutline />;
    case "warning":
      return <WarningAmber />;
    case "info":
      return <InfoOutlined />;
    case "success":
      return <CheckCircleOutline />;
    default:
      return <ErrorOutline />;
  }
};

// 增强错误显示组件
export const EnhancedError: React.FC<EnhancedErrorProps> = ({
  error,
  severity = "error",
  title,
  variant = "standard",
  showActions = true,
  showDetails = false,
  allowRetry = false,
  allowReport = false,
  allowDismiss = true,
  maxRetries = 3,
  currentRetries = 0,
  onRetry,
  onReport,
  onDismiss,
  className,
}) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = React.useState(showDetails);
  const [copied, setCopied] = React.useState(false);

  const errorDetails = formatError(error);

  const handleCopyError = async () => {
    const errorText = `
Error: ${errorDetails.message}
Code: ${errorDetails.code || "N/A"}
Time: ${errorDetails.timestamp?.toISOString() || "N/A"}
Stack: ${errorDetails.stack || "N/A"}
Context: ${JSON.stringify(errorDetails.context || {}, null, 2)}
    `.trim();

    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy error details:", err);
    }
  };

  const handleReport = () => {
    if (onReport) {
      onReport(errorDetails);
    }
  };

  const canRetry = allowRetry && currentRetries < maxRetries && onRetry;

  return (
    <Alert
      severity={severity}
      variant={variant}
      className={className}
      icon={getErrorIcon(severity)}
      action={
        showActions && (
          <Stack direction="row" spacing={1}>
            {errorDetails.stack && (
              <IconButton
                size="small"
                onClick={() => setDetailsOpen(!detailsOpen)}
                title={t("Toggle Details")}
              >
                {detailsOpen ? <ExpandLess /> : <ExpandMore />}
              </IconButton>
            )}
            
            {canRetry && (
              <IconButton
                size="small"
                onClick={onRetry}
                title={t("Retry")}
                color="inherit"
              >
                <Refresh />
              </IconButton>
            )}

            {allowReport && (
              <IconButton
                size="small"
                onClick={handleReport}
                title={t("Report Error")}
                color="inherit"
              >
                <BugReport />
              </IconButton>
            )}

            <IconButton
              size="small"
              onClick={handleCopyError}
              title={copied ? t("Copied!") : t("Copy Error")}
              color="inherit"
            >
              <ContentCopy />
            </IconButton>

            {allowDismiss && onDismiss && (
              <IconButton
                size="small"
                onClick={onDismiss}
                title={t("Dismiss")}
                color="inherit"
              >
                <Close />
              </IconButton>
            )}
          </Stack>
        )
      }
    >
      {title && <AlertTitle>{title}</AlertTitle>}
      
      <Typography variant="body2">
        {errorDetails.message}
      </Typography>

      {errorDetails.code && (
        <Chip
          label={`Code: ${errorDetails.code}`}
          size="small"
          variant="outlined"
          sx={{ mt: 1, mr: 1 }}
        />
      )}

      {currentRetries > 0 && (
        <Chip
          label={`${t("Attempts")}: ${currentRetries}/${maxRetries}`}
          size="small"
          color={currentRetries >= maxRetries ? "error" : "warning"}
          sx={{ mt: 1 }}
        />
      )}

      {errorDetails.suggestions && errorDetails.suggestions.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" fontWeight="medium">
            {t("Suggestions")}:
          </Typography>
          <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
            {errorDetails.suggestions.map((suggestion, index) => (
              <li key={index}>
                <Typography variant="body2">{suggestion}</Typography>
              </li>
            ))}
          </ul>
        </Box>
      )}

      {errorDetails.stack && (
        <Collapse in={detailsOpen}>
          <Box
            sx={{
              mt: 2,
              p: 2,
              bgcolor: "rgba(0, 0, 0, 0.05)",
              borderRadius: 1,
              fontFamily: "monospace",
              fontSize: "0.875rem",
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            <Typography variant="body2" component="pre">
              {errorDetails.stack}
            </Typography>
          </Box>
        </Collapse>
      )}
    </Alert>
  );
};

// 错误对话框组件
export interface ErrorDialogProps {
  open: boolean;
  error: ErrorDetails | Error | string;
  title?: string;
  onClose: () => void;
  onRetry?: () => void;
  onReport?: (error: ErrorDetails) => void;
  allowRetry?: boolean;
  allowReport?: boolean;
  maxRetries?: number;
  currentRetries?: number;
}

export const ErrorDialog: React.FC<ErrorDialogProps> = ({
  open,
  error,
  title,
  onClose,
  onRetry,
  onReport,
  allowRetry = false,
  allowReport = false,
  maxRetries = 3,
  currentRetries = 0,
}) => {
  const { t } = useTranslation();
  const errorDetails = formatError(error);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ErrorOutline color="error" />
          {title || t("Error Occurred")}
        </Box>
      </DialogTitle>

      <DialogContent>
        <EnhancedError
          error={error}
          severity="error"
          showActions={false}
          showDetails={true}
          allowRetry={false}
          allowReport={false}
          allowDismiss={false}
        />
      </DialogContent>

      <DialogActions>
        {allowReport && (
          <Button
            startIcon={<BugReport />}
            onClick={() => onReport?.(errorDetails)}
          >
            {t("Report")}
          </Button>
        )}

        {allowRetry && currentRetries < maxRetries && onRetry && (
          <Button
            startIcon={<Refresh />}
            onClick={onRetry}
            color="primary"
          >
            {t("Retry")} ({currentRetries + 1}/{maxRetries})
          </Button>
        )}

        <Button onClick={onClose} variant="contained">
          {t("Close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// 错误提示条组件
export interface ErrorSnackbarProps {
  open: boolean;
  error: ErrorDetails | Error | string;
  severity?: ErrorSeverity;
  autoHideDuration?: number;
  onClose: () => void;
  onRetry?: () => void;
  allowRetry?: boolean;
}

export const ErrorSnackbar: React.FC<ErrorSnackbarProps> = ({
  open,
  error,
  severity = "error",
  autoHideDuration = 6000,
  onClose,
  onRetry,
  allowRetry = false,
}) => {
  const { t } = useTranslation();
  const errorDetails = formatError(error);

  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
    >
      <Alert
        onClose={onClose}
        severity={severity}
        sx={{ width: "100%" }}
        action={
          allowRetry && onRetry ? (
            <Button
              color="inherit"
              size="small"
              onClick={onRetry}
            >
              {t("Retry")}
            </Button>
          ) : undefined
        }
      >
        {errorDetails.message}
      </Alert>
    </Snackbar>
  );
};

// 错误处理Hook
export interface UseErrorHandlerOptions {
  maxRetries?: number;
  autoReport?: boolean;
  showSnackbar?: boolean;
  snackbarDuration?: number;
}

export const useErrorHandler = (options: UseErrorHandlerOptions = {}) => {
  const {
    maxRetries = 3,
    autoReport = false,
    showSnackbar = true,
    snackbarDuration = 6000,
  } = options;

  const [error, setError] = React.useState<ErrorDetails | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);
  const [showDialog, setShowDialog] = React.useState(false);
  const [showSnackbarState, setShowSnackbarState] = React.useState(false);

  const handleError = React.useCallback((
    err: ErrorDetails | Error | string,
    options: { 
      showDialog?: boolean; 
      severity?: ErrorSeverity;
      retryable?: boolean;
    } = {}
  ) => {
    const errorDetails = formatError(err);
    setError(errorDetails);

    if (options.showDialog) {
      setShowDialog(true);
    } else if (showSnackbar) {
      setShowSnackbarState(true);
    }

    if (autoReport && errorDetails.reportable) {
      // TODO: Implement automatic error reporting
      console.log("Auto-reporting error:", errorDetails);
    }
  }, [autoReport, showSnackbar]);

  const clearError = React.useCallback(() => {
    setError(null);
    setRetryCount(0);
    setShowDialog(false);
    setShowSnackbarState(false);
  }, []);

  const retry = React.useCallback((retryFn?: () => void) => {
    if (retryCount < maxRetries) {
      setRetryCount(prev => prev + 1);
      retryFn?.();
    }
  }, [retryCount, maxRetries]);

  const reportError = React.useCallback((errorDetails: ErrorDetails) => {
    // TODO: Implement error reporting to external service
    console.log("Reporting error:", errorDetails);
  }, []);

  return {
    error,
    retryCount,
    maxRetries,
    showDialog,
    showSnackbar: showSnackbarState,
    handleError,
    clearError,
    retry,
    reportError,
    setShowDialog,
    setShowSnackbar: setShowSnackbarState,
  };
};

export default EnhancedError;
