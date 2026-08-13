import { useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AttemptBootstrap } from "../../types";
import { usePlayerShell } from "../../hooks/usePlayerShell";
import { QuestionHost } from "./QuestionHost";
import { PlayerProgress } from "./PlayerProgress";
import { PlayerTimer } from "./PlayerTimer";
import { PlayerNavigation } from "./PlayerNavigation";
import { OverlayManager } from "../../overlays/OverlayManager";

export interface AssessmentPlayerProps {
  bootstrap: AttemptBootstrap;
  className?: string;
  onSubmitResponse?: (response: import("../../types/response").StandardRendererResponse) => void;
  onComplete?: () => void;
}

/**
 * Universal Assessment Player Shell — renderer-agnostic.
 * Manages timer, progress, navigation, session, offline, accessibility.
 * Question-specific UI is delegated to renderer plugins via QuestionHost.
 */
export function AssessmentPlayer({
  bootstrap,
  className,
  onSubmitResponse,
  onComplete,
}: AssessmentPlayerProps) {
  const {
    modeConfig,
    settings,
    rendererContext,
    state,
    currentQuestion,
    setAnswer,
    recordResponse,
    next,
    prev,
    toggleReview,
    progress,
  } = usePlayerShell(bootstrap);

  const collectRef = useRef<(() => import("../../types/response").StandardRendererResponse | null) | null>(null);

  const handleSubmit = useCallback(async () => {
    const collect = collectRef.current;
    if (!collect || !currentQuestion) return;
    const response = collect();
    if (!response) return;
    recordResponse(response);
    onSubmitResponse?.(response);
    if (progress.current >= progress.total) {
      rendererContext.animation.emit("completion");
      rendererContext.audio.play("completion");
      onComplete?.();
    }
  }, [currentQuestion, onComplete, onSubmitResponse, progress, recordResponse, rendererContext]);

  if (!currentQuestion) {
    return (
      <Card className={cn("p-8 text-center text-muted-foreground", className)}>
        No questions in this assessment.
      </Card>
    );
  }

  const qvid = currentQuestion.questionVersionId;
  const value = state.answers[qvid];
  const showResult = state.results[qvid] ?? null;

  const timerSeconds =
    settings.timerPolicy === "per_question"
      ? settings.questionTimerSeconds ?? 60
      : settings.timerPolicy === "global" || settings.timerPolicy === "strict_lock"
        ? (settings.globalTimerMinutes ?? 60) * 60
        : 0;

  return (
    <div
      className={cn("assessment-player flex flex-col gap-4", className)}
      role="main"
      aria-label={`${modeConfig.label} assessment`}
      data-mode={bootstrap.mode}
      data-offline={state.isOffline}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{modeConfig.label}</Badge>
          {state.isOffline && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              Offline
            </Badge>
          )}
          {state.reviewMode && <Badge>Review</Badge>}
        </div>
        {modeConfig.showTimer && timerSeconds > 0 && (
          <PlayerTimer
            remainingSeconds={timerSeconds}
            strict={settings.timerPolicy === "strict_lock"}
            onExpire={() => rendererContext.eventBus.emit("timer_expired")}
          />
        )}
      </header>

      {modeConfig.showProgress && (
        <PlayerProgress
          current={progress.current}
          total={progress.total}
          percent={progress.percent}
        />
      )}

      <Card className="p-6 flex-1">
        <QuestionHost
          question={currentQuestion}
          value={value}
          onChange={(v) => setAnswer(qvid, v)}
          ctx={rendererContext}
          disabled={state.reviewMode}
          reviewMode={state.reviewMode}
          showResult={showResult}
          onResponseReady={(collect) => {
            collectRef.current = collect;
          }}
        />
      </Card>

      <OverlayManager
        mode={bootstrap.mode}
        question={currentQuestion}
        ctx={rendererContext}
        defaultOverlayIds={modeConfig.defaultOverlays}
      />

      {modeConfig.showNavigation && (
        <PlayerNavigation
          canPrev={state.currentIndex > 0}
          canNext={state.currentIndex < bootstrap.questions.length - 1}
          onPrev={prev}
          onNext={next}
          onSubmit={handleSubmit}
          showSubmit
        />
      )}

      {modeConfig.allowReview && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline self-end"
          onClick={toggleReview}
        >
          {state.reviewMode ? "Exit review" : "Review mode"}
        </button>
      )}
    </div>
  );
}
