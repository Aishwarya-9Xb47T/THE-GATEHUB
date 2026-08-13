import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveAnswerResult, LiveSessionState } from "@/lib/liveSession/types";
import { getLivePlayerView } from "@/lib/liveSession/api";
import {
  type LivePlayerPhase,
  deriveInitialPhase,
  phaseAfterFeedback,
  phaseAfterLeaderboard,
  canSubmit,
  canSelectOption,
} from "@/lib/liveSession/playerStateMachine";
import { mapLiveSubmitError } from "@/lib/liveSession/liveErrorMessages";
import { FEEDBACK_DURATION_MS, LEADERBOARD_REVEAL_MS } from "@/lib/liveSession/livePlayerTimings";

interface UseInstructorPacedPlayerFlowOptions {
  sessionId: string;
  sessionState: LiveSessionState | null;
  setSessionState: (updater: (prev: LiveSessionState | null) => LiveSessionState | null) => void;
  wasRestored: boolean;
  onSubmit: (questionId: string, answer: unknown) => Promise<LiveAnswerResult>;
  clearWasRestored: () => void;
}

async function syncPlayerView(sessionId: string) {
  const res = await getLivePlayerView(sessionId);
  return res.data?.data ?? null;
}

export function useInstructorPacedPlayerFlow({
  sessionId,
  sessionState,
  wasRestored,
  onSubmit,
  clearWasRestored,
}: UseInstructorPacedPlayerFlowOptions) {
  const [phase, setPhase] = useState<LivePlayerPhase>("WAITING_ROOM");
  const [selectedAnswer, setSelectedAnswer] = useState<unknown>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [feedback, setFeedback] = useState<LiveAnswerResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [feedbackQuestionId, setFeedbackQuestionId] = useState<string | null>(null);

  const questionIndexRef = useRef(-1);
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();
  const submitInFlight = useRef(false);

  const clearTransitionTimer = () => {
    if (transitionTimer.current) {
      clearTimeout(transitionTimer.current);
      transitionTimer.current = undefined;
    }
  };

  const applySubmittedView = useCallback((result: LiveAnswerResult, questionId?: string) => {
    clearTransitionTimer();
    setFeedback(result);
    if (questionId) setFeedbackQuestionId(questionId);
    setPhase("READY_FOR_NEXT");
    setRestored(true);
  }, []);

  const resetForNewQuestion = useCallback(() => {
    clearTransitionTimer();
    submitInFlight.current = false;
    setSelectedAnswer(null);
    setHasSelection(false);
    setFeedback(null);
    setFeedbackQuestionId(null);
    setSubmitError(null);
    setPhase("QUESTION_ACTIVE");
  }, []);

  useEffect(() => {
    if (!sessionState) return;

    if (sessionState.status === "lobby") {
      setPhase("WAITING_ROOM");
      return;
    }
    if (sessionState.status === "finished") {
      submitInFlight.current = false;
      clearTransitionTimer();
      setPhase("QUIZ_FINISHED");
      return;
    }

    if (sessionState.status === "active" && sessionState.currentQuestion) {
      if (questionIndexRef.current !== sessionState.currentQuestionIndex) {
        questionIndexRef.current = sessionState.currentQuestionIndex;
        setRestored(false);
        resetForNewQuestion();
      }
    }
  }, [sessionState, resetForNewQuestion]);

  useEffect(() => {
    if (!sessionId || !sessionState || restored) return;
    if (sessionState.status !== "active") return;

    let cancelled = false;
    void (async () => {
      try {
        const view = await syncPlayerView(sessionId);
        if (cancelled || !view?.hasSubmittedCurrentQuestion || !view.currentAnswerResult) return;
        questionIndexRef.current = view.sessionState.currentQuestionIndex;
        applySubmittedView(
          view.currentAnswerResult,
          view.sessionState.currentQuestion?.id
        );
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionState?.status, sessionState?.currentQuestionIndex, restored, applySubmittedView]);

  useEffect(() => {
    if (!sessionState) {
      setPhase(deriveInitialPhase(null));
    }
  }, [sessionState]);

  useEffect(() => {
    if (!wasRestored || !sessionId || sessionState?.status !== "active") return;
    let cancelled = false;
    void (async () => {
      try {
        const view = await syncPlayerView(sessionId);
        if (cancelled || !view) return;
        if (view.hasSubmittedCurrentQuestion && view.currentAnswerResult) {
          applySubmittedView(
            view.currentAnswerResult,
            view.sessionState.currentQuestion?.id
          );
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wasRestored, sessionId, sessionState?.status, applySubmittedView]);

  const schedulePostFeedback = useCallback(
    (showLeaderboard: boolean) => {
      clearTransitionTimer();
      transitionTimer.current = setTimeout(() => {
        const next = phaseAfterFeedback(showLeaderboard, "instructor_paced");
        setPhase(next);
        if (next === "SHOW_LEADERBOARD") {
          transitionTimer.current = setTimeout(() => {
            const afterLb = phaseAfterLeaderboard("instructor_paced");
            setPhase(afterLb);
          }, LEADERBOARD_REVEAL_MS);
        }
      }, FEEDBACK_DURATION_MS);
    },
    []
  );

  const handleSelectionChange = useCallback(
    (answer: unknown, selected: boolean) => {
      if (!canSelectOption(phase)) return;
      setSelectedAnswer(answer);
      setHasSelection(selected);
      if (selected && phase === "QUESTION_ACTIVE") {
        setPhase("ANSWER_SELECTED");
      }
      if (!selected && phase === "ANSWER_SELECTED") {
        setPhase("QUESTION_ACTIVE");
      }
    },
    [phase]
  );

  const handleSubmit = useCallback(async () => {
    const currentQuestion = sessionState?.currentQuestion;
    if (!currentQuestion || !canSubmit(phase) || !hasSelection || submitInFlight.current) {
      return;
    }
    if (sessionState?.status === "finished") {
      setPhase("QUIZ_FINISHED");
      return;
    }

    submitInFlight.current = true;
    setPhase("SUBMITTING");
    setSubmitError(null);

    try {
      const questionId = currentQuestion.id;
      const result = await onSubmit(questionId, selectedAnswer);
      setFeedback(result);
      setFeedbackQuestionId(questionId);
      setPhase("SHOW_FEEDBACK");
      setRestored(true);

      schedulePostFeedback(sessionState?.settings.showLeaderboard ?? false);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Could not submit answer";
      if (message.includes("Session has ended")) {
        setPhase("QUIZ_FINISHED");
        return;
      }
      if (
        message.includes("already answered") ||
        message.includes("not currently active")
      ) {
        try {
          const view = await syncPlayerView(sessionId);
          if (view?.hasSubmittedCurrentQuestion && view.currentAnswerResult) {
            applySubmittedView(
              view.currentAnswerResult,
              view.sessionState.currentQuestion?.id
            );
            return;
          }
          if (view?.sessionState.status === "finished") {
            setPhase("QUIZ_FINISHED");
            return;
          }
        } catch {
          /* fall through */
        }
      }

      setPhase(hasSelection ? "ANSWER_SELECTED" : "QUESTION_ACTIVE");
      setSubmitError(mapLiveSubmitError(message));
      submitInFlight.current = false;
    }
  }, [
    sessionState,
    phase,
    hasSelection,
    selectedAnswer,
    onSubmit,
    schedulePostFeedback,
    sessionId,
    applySubmittedView,
  ]);

  useEffect(() => {
    return () => clearTransitionTimer();
  }, []);

  useEffect(() => {
    if (wasRestored) {
      clearWasRestored();
    }
  }, [wasRestored, clearWasRestored]);

  return {
    phase,
    feedback,
    feedbackQuestionId,
    hasSelection,
    submitError,
    handleSelectionChange,
    handleSubmit,
    isSubmitting: phase === "SUBMITTING",
    canSelectOptions: canSelectOption(phase) && !submitInFlight.current,
    canSubmitNow: canSubmit(phase) && hasSelection && !submitInFlight.current,
    selfPaced: false as const,
    localCurrentQuestion: sessionState?.currentQuestion ?? null,
    localQuestionIndex: sessionState?.currentQuestionIndex ?? 0,
  };
}
