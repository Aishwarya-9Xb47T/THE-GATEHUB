import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveAnswerResult, LiveSessionState, QuestionForClient } from "@/lib/liveSession/types";
import type { SelfPacedPlayerPhase } from "@/lib/liveSession/playerStateMachine";
import { canSubmit, canSelectOption } from "@/lib/liveSession/playerStateMachine";
import { mapLiveSubmitError } from "@/lib/liveSession/liveErrorMessages";

export const SELF_PACED_AUTO_ADVANCE_DELAY_MS = 2000;

interface UseSelfPacedPlayerFlowOptions {
  sessionId: string;
  sessionState: LiveSessionState | null;
  onSubmit: (questionId: string, answer: unknown) => Promise<LiveAnswerResult>;
}

export function useSelfPacedPlayerFlow({
  sessionId,
  sessionState,
  onSubmit,
}: UseSelfPacedPlayerFlowOptions) {
  const [phase, setPhase] = useState<SelfPacedPlayerPhase>("WAITING_ROOM");
  const [selectedAnswer, setSelectedAnswer] = useState<unknown>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [feedback, setFeedback] = useState<LiveAnswerResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedbackQuestionId, setFeedbackQuestionId] = useState<string | null>(null);
  const [localCurrentQuestion, setLocalCurrentQuestion] = useState<QuestionForClient | null>(null);
  const [localQuestionIndex, setLocalQuestionIndex] = useState<number>(0);

  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();
  const submitInFlight = useRef(false);

  const clearTransitionTimer = () => {
    if (transitionTimer.current) {
      clearTimeout(transitionTimer.current);
      transitionTimer.current = undefined;
    }
  };

  // Initial Question setup when session becomes active
  useEffect(() => {
    if (!sessionState) {
      setPhase("WAITING_ROOM");
      return;
    }

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

    if (sessionState.status === "active" && localCurrentQuestion === null && sessionState.currentQuestion) {
      setLocalCurrentQuestion(sessionState.currentQuestion);
      setLocalQuestionIndex(sessionState.currentQuestionIndex ?? 0);
      setPhase("QUESTION_ACTIVE");
    }
  }, [sessionState, localCurrentQuestion]);

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
    if (!localCurrentQuestion || !canSubmit(phase) || !hasSelection || submitInFlight.current) {
      return;
    }

    submitInFlight.current = true;
    setPhase("SUBMITTING");
    setSubmitError(null);

    try {
      const questionId = localCurrentQuestion.id;
      const result = await onSubmit(questionId, selectedAnswer);

      // Extract next question payload if returned by backend
      const rawRes = result as unknown as Record<string, unknown>;
      const nextQ = (rawRes.nextQuestion as QuestionForClient | null) ?? result.nextQuestion ?? null;
      const nextIdx = (rawRes.nextQuestionIndex as number | null) ?? (result.participantQuestionIndex != null ? result.participantQuestionIndex : localQuestionIndex + 1);
      const isFinished = Boolean(rawRes.finished ?? result.isPersonalComplete ?? (!nextQ && nextIdx >= (sessionState?.questionCount ?? 0)));

      // 1. Immediately: Display Correct / Incorrect, XP, Score feedback
      setFeedback(result);
      setFeedbackQuestionId(questionId);
      setPhase("SHOW_FEEDBACK");

      clearTransitionTimer();
      // 2. Wait exactly 2 seconds (AUTO_ADVANCE_DELAY)
      transitionTimer.current = setTimeout(() => {
        if (isFinished || !nextQ) {
          submitInFlight.current = false;
          setPhase("QUIZ_FINISHED");
          return;
        }

        // 3. Sequence: Replace question, Increment index, Clear selections, Reset feedback, Render next question
        setLocalCurrentQuestion(nextQ);
        setLocalQuestionIndex(nextIdx);
        setSelectedAnswer(null);
        setHasSelection(false);
        setFeedback(null);
        setFeedbackQuestionId(null);
        setSubmitError(null);
        submitInFlight.current = false;

        // Transition directly to QUESTION_ACTIVE without READY_FOR_NEXT
        setPhase("QUESTION_ACTIVE");
      }, SELF_PACED_AUTO_ADVANCE_DELAY_MS);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Could not submit answer";
      if (message.includes("Session has ended") || message.includes("already completed")) {
        setPhase("QUIZ_FINISHED");
        return;
      }
      setPhase(hasSelection ? "ANSWER_SELECTED" : "QUESTION_ACTIVE");
      setSubmitError(mapLiveSubmitError(message));
      submitInFlight.current = false;
    }
  }, [localCurrentQuestion, phase, hasSelection, selectedAnswer, onSubmit, localQuestionIndex, sessionState?.questionCount]);

  useEffect(() => {
    return () => clearTransitionTimer();
  }, []);

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
    selfPaced: true as const,
    localCurrentQuestion,
    localQuestionIndex,
  };
}
