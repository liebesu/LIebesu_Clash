import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import AnalyticsRoundedIcon from "@mui/icons-material/AnalyticsRounded";
import { LoadingButton } from "@mui/lab";

import {
  fetchSubscriptionPreview,
  getRemoteSubscriptionConfig,
  saveRemoteSubscriptionConfig,
  syncSubscriptionFromRemote,
  type FetchPreviewResult,
  type RemoteSubscriptionConfig,
  type FetchSummary,
} from "@/services/cmds";
import { showNotice } from "@/services/noticeService";
import { DialogRef } from "@/components/base";
import { useBatchImportProgress } from "@/hooks/use-batch-import-progress";

type FetchMode = "manual" | "daily" | "custom";

export const SubscriptionFetchViewer = forwardRef<DialogRef>((_, ref) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [config, setConfig] = useState<RemoteSubscriptionConfig | null>(null);
  const [inputUrl, setInputUrl] = useState("");
  const [mode, setMode] = useState<FetchMode>("manual");
  const [customMinutes, setCustomMinutes] = useState<number | "">(1440);
  const [preview, setPreview] = useState<FetchPreviewResult | null>(null);
  const [showProgressBar, setShowProgressBar] = useState(false);

  const progressState = useBatchImportProgress(showProgressBar);
  const progressPercent = useMemo(() => {
    if (!showProgressBar) return 0;
    return progressState.percent > 0 ? progressState.percent : syncing ? 10 : 0;
  }, [progressState.percent, showProgressBar, syncing]);
  const progressMessage = useMemo(() => {
    if (!showProgressBar) return null;
    return (
      progressState.displayMessage ||
      progressState.stageLabel ||
      t("Processing...")
    );
  }, [
    progressState.displayMessage,
    progressState.stageLabel,
    showProgressBar,
    t,
  ]);

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true);
      void loadConfig();
    },
    close: () => {
      setOpen(false);
    },
  }));

  useEffect(() => {
    if (config) {
      setInputUrl(config.source_url ?? "");
      setMode(config.mode ?? "manual");
      setCustomMinutes(config.custom_interval_minutes ?? 1440);
    }
  }, [config]);

  const intervalLabel = useMemo(() => {
    switch (mode) {
      case "manual":
        return t("Manual Trigger Only");
      case "daily":
        return t("Every Day (24h)");
      case "custom":
        return t("Every {{minutes}} Minutes", {
          minutes: customMinutes || 0,
        });
      default:
        return t("Manual Trigger Only");
    }
  }, [mode, customMinutes, t]);

  const getErrorMessage = (reason: unknown) =>
    reason instanceof Error ? reason.message : String(reason);

  const loadConfig = async () => {
    try {
      const data = await getRemoteSubscriptionConfig();
      setConfig(data);
    } catch (error: unknown) {
      console.error("加载远程订阅配置失败", error);
      showNotice("error", getErrorMessage(error));
    }
  };

  const handleSave = async () => {
    if (!inputUrl.trim()) {
      showNotice("info", t("Please configure the subscription list URL first"));
      return;
    }

    setSaving(true);
    try {
      const payload: RemoteSubscriptionConfig = {
        enabled: true,
        source_url: inputUrl.trim(),
        mode,
        custom_interval_minutes:
          mode === "custom"
            ? Number(customMinutes) || 0
            : mode === "daily"
              ? 1440
              : null,
        last_sync_at: config?.last_sync_at ?? null,
        last_result: config?.last_result ?? null,
      };

      await saveRemoteSubscriptionConfig(payload);
      showNotice("success", t("Subscription fetch settings saved"));
      setConfig(payload);
    } catch (error: unknown) {
      console.error("保存远程订阅配置失败", error);
      showNotice("error", getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!inputUrl.trim()) {
      showNotice("info", t("Please configure the subscription list URL first"));
      return;
    }

    setPreviewLoading(true);
    try {
      const result = await fetchSubscriptionPreview(inputUrl.trim());
      setPreview(result);
      showNotice("success", t("Preview generated"));
    } catch (error: unknown) {
      console.error("预览订阅解析失败", error);
      showNotice("error", getErrorMessage(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSync = async () => {
    if (!inputUrl.trim()) {
      showNotice("info", t("Please configure the subscription list URL first"));
      return;
    }

    setSyncing(true);
    setShowProgressBar(true);
    progressState.reset();
    try {
      const summary: FetchSummary = await syncSubscriptionFromRemote(
        inputUrl.trim(),
      );
      showNotice(
        "success",
        t("Subscription list synced. Imported {{count}} new subscriptions", {
          count: summary.imported,
        }),
        3000,
      );
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              last_sync_at: Date.now() / 1000,
              last_result: summary,
            }
          : prev,
      );
      await loadConfig();
    } catch (error: unknown) {
      console.error("远程订阅同步失败", error);
      showNotice("error", getErrorMessage(error), 4000);
    } finally {
      setSyncing(false);
      setShowProgressBar(false);
    }
  };

  const renderLastResult = () => {
    if (!config?.last_result) return null;
    const { last_result: result, last_sync_at } = config;
    return (
      <Alert
        severity="info"
        sx={{ mb: 2 }}
        icon={<AnalyticsRoundedIcon fontSize="inherit" />}
      >
        <Box display="flex" flexDirection="column" gap={1}>
          <Typography variant="subtitle2">
            {t("Last Sync Summary")}:
            {last_sync_at
              ? ` ${new Date(last_sync_at * 1000).toLocaleString()}`
              : " -"}
          </Typography>
          <Box display="flex" gap={1} flexWrap="wrap">
            <Chip
              color="primary"
              label={`${t("Fetched")}: ${result.fetched_urls}`}
            />
            <Chip
              color="success"
              label={`${t("Imported")}: ${result.imported}`}
            />
            <Chip
              color="info"
              variant="outlined"
              label={`${t("Duplicates")}: ${result.duplicates}`}
            />
            <Chip
              color={result.failed > 0 ? "error" : "default"}
              label={`${t("Failed")}: ${result.failed}`}
            />
          </Box>
          {result.message && (
            <Typography variant="body2" color="text.secondary">
              {result.message}
            </Typography>
          )}
        </Box>
      </Alert>
    );
  };

  const renderPreviewList = () => {
    if (!preview) return null;
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          {t("Preview Result")}
        </Typography>
        <Alert severity="success" sx={{ mb: 2 }}>
          {t("Preview Statistics", {
            total: preview.total,
            valid: preview.valid,
            duplicate: preview.duplicate,
            invalid: preview.invalid,
          })}
        </Alert>
        <List sx={{ maxHeight: 280, overflow: "auto" }}>
          {preview.preview.map((item, index) => (
            <ListItem key={`${item.url}-${index}`} alignItems="flex-start">
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="subtitle2">
                      {item.name || item.url}
                    </Typography>
                    <Chip
                      size="small"
                      color={
                        item.status === "Success"
                          ? "success"
                          : item.status === "Duplicate"
                            ? "info"
                            : "error"
                      }
                      label={item.status}
                    />
                  </Box>
                }
                secondary={
                  <>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {item.url}
                    </Typography>
                    {item.error_message && (
                      <Typography variant="caption" color="error">
                        {item.error_message}
                      </Typography>
                    )}
                  </>
                }
              />
            </ListItem>
          ))}
        </List>
      </Box>
    );
  };

  const resolvedHelpText = useMemo(() => {
    switch (mode) {
      case "manual":
        return t("Manual mode will not auto-refresh, please trigger manually");
      case "daily":
        return t("Daily mode refreshes once every 24 hours");
      case "custom":
        return t("Custom mode refreshes at your specified interval");
      default:
        return "";
    }
  }, [mode, t]);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>{t("Remote Subscription Manager")}</DialogTitle>
      <DialogContent>
        {showProgressBar && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress
              variant={
                progressPercent > 0 && progressPercent < 100
                  ? "determinate"
                  : "indeterminate"
              }
              value={progressPercent}
            />
            <Typography variant="body2" align="center" sx={{ mt: 1 }}>
              {progressMessage}
            </Typography>
          </Box>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t(
            "Configure a remote list URL. Each line in the file should contain one subscription link.",
          )}
        </Typography>

        <TextField
          label={t("Subscription List URL")}
          placeholder="https://example.com/subscriptions.txt"
          value={inputUrl}
          onChange={(event) => setInputUrl(event.target.value)}
          fullWidth
          sx={{ mb: 2 }}
        />

        <Box display="flex" gap={2} flexWrap="wrap">
          <FormControl sx={{ minWidth: 220 }}>
            <InputLabel>{t("Update Mode")}</InputLabel>
            <Select
              label={t("Update Mode")}
              value={mode}
              onChange={(event) => setMode(event.target.value as FetchMode)}
            >
              <MenuItem value="manual">{t("Manual")}</MenuItem>
              <MenuItem value="daily">{t("Every 24 Hours")}</MenuItem>
              <MenuItem value="custom">{t("Custom Interval")}</MenuItem>
            </Select>
          </FormControl>

          {mode === "custom" && (
            <TextField
              sx={{ minWidth: 180 }}
              type="number"
              label={t("Interval (minutes)")}
              value={customMinutes}
              onChange={(event) =>
                setCustomMinutes(Number(event.target.value) || "")
              }
              inputProps={{ min: 5, step: 5 }}
            />
          )}

          <Tooltip title={resolvedHelpText} placement="right">
            <Chip color="default" variant="outlined" label={intervalLabel} />
          </Tooltip>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box display="flex" gap={2} flexWrap="wrap">
          <LoadingButton
            variant="contained"
            loading={saving}
            onClick={handleSave}
            startIcon={<RefreshRoundedIcon />}
          >
            {t("Save Settings")}
          </LoadingButton>

          <Button
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={handlePreview}
            disabled={previewLoading}
          >
            {previewLoading ? t("Previewing...") : t("Preview")}
          </Button>

          <LoadingButton
            variant="contained"
            color="success"
            loading={syncing}
            startIcon={<DownloadRoundedIcon />}
            onClick={handleSync}
          >
            {t("Sync Now")}
          </LoadingButton>
        </Box>

        <Box sx={{ mt: 3 }}>{renderLastResult()}</Box>
        {renderPreviewList()}
      </DialogContent>

      <DialogActions>
        <Button onClick={() => setOpen(false)}>{t("Close")}</Button>
      </DialogActions>
    </Dialog>
  );
});

SubscriptionFetchViewer.displayName = "SubscriptionFetchViewer";
