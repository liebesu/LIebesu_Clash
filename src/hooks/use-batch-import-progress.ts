import { useCallback, useEffect, useMemo, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";

export interface BatchImportProgressPayload {
  task_id: number;
  stage: string;
  completed: number;
  total: number;
  message?: string | null;
}

export interface BatchImportProgressState {
  payload: BatchImportProgressPayload | null;
  percent: number;
  isCompleted: boolean;
  isActive: boolean;
  displayMessage: string | null;
  stageLabel: string;
  reset: () => void;
}

const fallbacks: Partial<Record<string, string>> = {
  preparing: "Preparing",
  importing: "Importing",
  finalizing: "Finalizing",
  completed: "Completed",
};

const clampPercent = (value: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

export function useBatchImportProgress(
  enabled: boolean,
): BatchImportProgressState {
  const [payload, setPayload] = useState<BatchImportProgressPayload | null>(
    null,
  );
  const { t } = useTranslation();

  useEffect(() => {
    if (!enabled) {
      setPayload(null);
      return undefined;
    }

    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    (async () => {
      try {
        unlisten = await listen<BatchImportProgressPayload>(
          "batch-import-progress",
          (event) => {
            if (!disposed) {
              setPayload(event.payload);
            }
          },
        );
      } catch (error) {
        console.error("Failed to listen batch-import-progress", error);
      }
    })();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
      setPayload(null);
    };
  }, [enabled]);

  const percent = useMemo(() => {
    if (!payload || !payload.total) {
      return payload?.stage === "completed" ? 100 : 0;
    }

    const ratio = (payload.completed / payload.total) * 100;
    const base = clampPercent(ratio);

    if (payload.stage === "completed") {
      return 100;
    }

    return clampPercent(base);
  }, [payload]);

  const stageLabel = useMemo(() => {
    if (!payload) return "";
    const stageName = payload.stage.replace(/^[a-z]/, (s) => s.toUpperCase());
    const key = `BatchImport.Progress.${stageName}`;
    const fallback = fallbacks[payload.stage] || payload.stage;
    return t(key, fallback);
  }, [payload, t]);

  const reset = useCallback(() => {
    setPayload(null);
  }, []);

  return {
    payload,
    percent,
    isCompleted: payload?.stage === "completed",
    isActive: Boolean(payload && payload.stage !== "completed"),
    stageLabel,
    displayMessage: payload?.message || null,
    reset,
  };
}
