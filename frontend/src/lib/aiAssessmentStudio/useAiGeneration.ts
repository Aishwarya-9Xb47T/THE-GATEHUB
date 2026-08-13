import { useCallback, useRef, useState } from "react";
import { useAiAssessmentStore } from "./store";
import { startAiGeneration, pollAiJob } from "./api";
import { generateOfflineDemoPreview } from "./aiOfflineGenerator";
import type { AiErrorPayload } from "./ApiError";
import type { AiGenerationPreview, AiSourceType } from "./types";

export function useAiGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<AiErrorPayload | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const [pendingDemoPreview, setPendingDemoPreview] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { source, config, url, text, file, setStep, setPreview, setProgress } = useAiAssessmentStore();

  const resetLoading = useCallback(() => {
    setIsGenerating(false);
    setProgress(null);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [setProgress]);

  const dismissError = useCallback(() => {
    setErrorOpen(false);
    setError(null);
    setPendingDemoPreview(false);
    resetLoading();
    setStep("config");
  }, [resetLoading, setStep]);

  const completeWithPreview = useCallback(
    (preview: AiGenerationPreview, notice?: AiErrorPayload) => {
      resetLoading();
      setPreview(preview);
      setStep("review");
      if (notice) {
        setError(notice);
        setErrorOpen(true);
        setPendingDemoPreview(true);
      }
    },
    [resetLoading, setPreview, setStep]
  );

  const runOfflineFallback = useCallback(
    (jobId: string, notice: AiErrorPayload) => {
      if (!source) return;
      const preview = generateOfflineDemoPreview(jobId, config, source as AiSourceType);
      preview.aiNotice = notice;
      completeWithPreview(preview, notice);
    },
    [source, config, completeWithPreview]
  );

  const generate = useCallback(async () => {
    if (!source) return;
    setError(null);
    setErrorOpen(false);
    setIsGenerating(true);
    setStep("generating");
    setProgress({ stage: "start", percent: 2, message: "Starting AI engine…" });

    abortRef.current = new AbortController();

    const start = await startAiGeneration({
      source: source as AiSourceType,
      config,
      file: file || undefined,
      url: url || undefined,
      text: text || undefined,
    });

    if (start.error || !start.jobId) {
      resetLoading();
      setError(
        start.error || {
          type: "NETWORK_ERROR",
          title: "Connection failed",
          message: "Could not start generation.",
          retryable: true,
        }
      );
      setErrorOpen(true);
      setStep("config");
      return;
    }

    const result = await pollAiJob(
      start.jobId,
      (p) => {
        if (p) setProgress(p);
      },
      abortRef.current.signal
    );

    if (!result.ok) {
      resetLoading();
      setError(result.error);
      setErrorOpen(true);
      setStep("config");
      return;
    }

    if (result.demoNotice || (result.preview.demoMode && result.preview.aiNotice?.title !== "Development Mode")) {
      completeWithPreview(result.preview, result.demoNotice || result.preview.aiNotice);
      return;
    }

    completeWithPreview(result.preview);
  }, [source, config, file, url, text, setStep, setProgress, resetLoading, completeWithPreview]);

  const retry = useCallback(() => {
    setErrorOpen(false);
    setError(null);
    void generate();
  }, [generate]);

  const continueOffline = useCallback(() => {
    if (!source) return;
    const notice = error || {
      type: "NETWORK_ERROR" as const,
      title: "Offline mode",
      message: "Continuing with locally generated sample questions.",
      retryable: false,
      offlineFallback: true,
    };
    const jobId = useAiAssessmentStore.getState().preview?.jobId || crypto.randomUUID();
    runOfflineFallback(jobId, notice);
    setErrorOpen(false);
  }, [source, error, runOfflineFallback]);

  const dismissToReview = useCallback(() => {
    if (pendingDemoPreview) {
      setErrorOpen(false);
      setError(null);
      setPendingDemoPreview(false);
      return;
    }
    dismissError();
  }, [pendingDemoPreview, dismissError]);

  return {
    isGenerating,
    error,
    errorOpen,
    pendingDemoPreview,
    generate,
    retry,
    dismissError: dismissToReview,
    continueOffline,
    resetLoading,
  };
}
