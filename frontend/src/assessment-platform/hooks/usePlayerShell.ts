import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttemptBootstrap, LearningResponseResult } from "../types";
import type { StandardRendererResponse } from "../types/response";
import { getModeConfig, mergeModeSettings } from "../types/modeConfig";
import { createThemeEngine } from "../services/themeEngine";
import { createAnimationService } from "../services/animationService";
import { createAudioService } from "../services/audioService";
import { createPlayerEventBus } from "../services/playerEventBus";
import {
  createEmptyOfflineState,
  loadOfflineState,
  queuePendingSubmission,
  saveOfflineState,
  type OfflinePlayerState,
} from "../services/offlineCache";
import type { RendererContext } from "../types/renderer";

export interface PlayerShellState {
  currentIndex: number;
  answers: Record<string, unknown>;
  responses: Record<string, StandardRendererResponse>;
  results: Record<string, LearningResponseResult>;
  reviewMode: boolean;
  isOffline: boolean;
  startedAt: number;
}

export function usePlayerShell(bootstrap: AttemptBootstrap) {
  const modeConfig = getModeConfig(bootstrap.mode);
  const settings = mergeModeSettings(bootstrap.mode, bootstrap.settings);

  const [state, setState] = useState<PlayerShellState>(() => {
    const offline = loadOfflineState(bootstrap.attemptId);
    return {
      currentIndex: offline?.currentIndex ?? 0,
      answers: Object.fromEntries(
        Object.entries(offline?.drafts ?? {}).map(([k, v]) => [k, v.answer])
      ),
      responses: offline?.drafts ?? {},
      results: {},
      reviewMode: false,
      isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
      startedAt: performance.now(),
    };
  });

  const offlineRef = useRef<OfflinePlayerState>(
    loadOfflineState(bootstrap.attemptId) ??
      createEmptyOfflineState(bootstrap.attemptId, bootstrap.deploymentId)
  );

  const services = useMemo(() => {
    const theme = createThemeEngine("light");
    const animation = createAnimationService();
    const audio = createAudioService();
    const eventBus = createPlayerEventBus();
    return { theme, animation, audio, eventBus };
  }, []);

  const rendererContext: RendererContext = useMemo(
    () => ({
      theme: services.theme,
      animation: services.animation,
      audio: services.audio,
      eventBus: services.eventBus,
      localization: { t: (key) => key },
      accessibility: {
        reducedMotion: false,
        highContrast: false,
        fontScale: 1,
        screenReaderActive: false,
      },
      media: {
        resolveUrl: (assetId) =>
          bootstrap.questions
            .flatMap((q) => q.media)
            .find((m) => m.assetId === assetId)?.url,
      },
      mode: bootstrap.mode,
      settings,
      timer: null,
    }),
    [bootstrap, settings, services]
  );

  const currentQuestion = bootstrap.questions[state.currentIndex] ?? null;

  useEffect(() => {
    const onOnline = () => setState((s) => ({ ...s, isOffline: false }));
    const onOffline = () => setState((s) => ({ ...s, isOffline: true }));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const persistOffline = useCallback(
    (patch: Partial<OfflinePlayerState>) => {
      if (!modeConfig.offlineCapable) return;
      offlineRef.current = { ...offlineRef.current, ...patch, cachedAt: new Date().toISOString() };
      saveOfflineState(offlineRef.current);
    },
    [modeConfig.offlineCapable]
  );

  const setAnswer = useCallback(
    (questionVersionId: string, value: unknown) => {
      setState((s) => ({
        ...s,
        answers: { ...s.answers, [questionVersionId]: value },
      }));
      persistOffline({
        currentQuestionVersionId: questionVersionId,
        drafts: {
          ...offlineRef.current.drafts,
          [questionVersionId]: {
            questionVersionId,
            rendererId: "draft",
            answer: value,
            responseTimeMs: Math.round(performance.now() - state.startedAt),
            collectedAt: new Date().toISOString(),
          },
        },
      });
    },
    [persistOffline, state.startedAt]
  );

  const recordResponse = useCallback(
    (response: StandardRendererResponse) => {
      setState((s) => ({
        ...s,
        responses: { ...s.responses, [response.questionVersionId]: response },
      }));
      offlineRef.current = queuePendingSubmission(offlineRef.current, response);
      saveOfflineState(offlineRef.current);
    },
    []
  );

  const goToQuestion = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, bootstrap.questions.length - 1));
      setState((s) => ({ ...s, currentIndex: clamped }));
      services.animation.emit("transition", { from: state.currentIndex, to: clamped });
      services.eventBus.emit("question_changed", { index: clamped });
      persistOffline({ currentIndex: clamped });
    },
    [bootstrap.questions.length, persistOffline, services.animation, services.eventBus, state.currentIndex]
  );

  const next = useCallback(() => goToQuestion(state.currentIndex + 1), [goToQuestion, state.currentIndex]);
  const prev = useCallback(() => goToQuestion(state.currentIndex - 1), [goToQuestion, state.currentIndex]);

  const toggleReview = useCallback(() => {
    if (!modeConfig.allowReview) return;
    setState((s) => ({ ...s, reviewMode: !s.reviewMode }));
  }, [modeConfig.allowReview]);

  return {
    modeConfig,
    settings,
    rendererContext,
    services,
    state,
    currentQuestion,
    setAnswer,
    recordResponse,
    goToQuestion,
    next,
    prev,
    toggleReview,
    progress: {
      current: state.currentIndex + 1,
      total: bootstrap.questions.length,
      percent: bootstrap.questions.length
        ? Math.round(((state.currentIndex + 1) / bootstrap.questions.length) * 100)
        : 0,
    },
  };
}
