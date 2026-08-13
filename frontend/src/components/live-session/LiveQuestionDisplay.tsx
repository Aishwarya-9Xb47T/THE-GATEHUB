import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { QuestionForClient } from "@/lib/liveSession/types";
import {
  QuestionPlayerBody,
  toPlayerQuestion,
  hasQuestionAnswer,
  initialAnswerForType,
} from "@/components/media";

interface LiveQuestionDisplayProps {
  question: QuestionForClient;
  questionIndex: number;
  questionCount: number;
  timerSeconds: number;
  questionStartedAt: string | null;
  optionsDisabled?: boolean;
  submitDisabled?: boolean;
  connected?: boolean;
  submitting?: boolean;
  onSelectionChange?: (answer: unknown, hasSelection: boolean) => void;
  onSubmit: () => void;
}

function resolveTimerAnchor(questionStartedAt: string | null): number {
  if (questionStartedAt) {
    const serverStart = new Date(questionStartedAt).getTime();
    if (!Number.isNaN(serverStart)) return serverStart;
  }
  return Date.now();
}

export function LiveQuestionDisplay({
  question,
  questionIndex,
  questionCount,
  timerSeconds,
  questionStartedAt,
  optionsDisabled,
  submitDisabled,
  connected = true,
  submitting,
  onSelectionChange,
  onSubmit,
}: LiveQuestionDisplayProps) {
  const [selected, setSelected] = useState<unknown>(() => initialAnswerForType(question.type));
  const effectiveTimer = Math.max(5, timerSeconds || 30);
  const [timeLeft, setTimeLeft] = useState(effectiveTimer);
  const [timerAnchor, setTimerAnchor] = useState(() => resolveTimerAnchor(questionStartedAt));
  const [hiddenOptionIds, setHiddenOptionIds] = useState<string[]>([]);

  const hasSelection = hasQuestionAnswer(question.type, selected, question.options.length);

  useEffect(() => {
    setHiddenOptionIds([]); // Reset for new question
    const initial = initialAnswerForType(question.type);
    setSelected(initial);
    const anchor = resolveTimerAnchor(questionStartedAt);
    setTimerAnchor(anchor);
    const elapsed = Math.floor((Date.now() - anchor) / 1000);
    setTimeLeft(Math.max(0, effectiveTimer - elapsed));
    onSelectionChange?.(initial, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, question.type, effectiveTimer, questionStartedAt]);

  useEffect(() => {
    const tick = () => {
      const elapsed = Math.floor((Date.now() - timerAnchor) / 1000);
      setTimeLeft(Math.max(0, effectiveTimer - elapsed));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [timerAnchor, effectiveTimer]);

  useEffect(() => {
    const handleTimerAdjust = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.seconds) {
        setTimeLeft((prev) => prev + detail.seconds);
      }
    };
    const handlePowerupResult = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.powerup === "extra_time" && detail.questionId === question.id) {
        setTimeLeft((prev) => prev + 15);
      } else if (detail.powerup === "50-50" && detail.questionId === question.id) {
        setHiddenOptionIds(detail.hiddenOptionIds);
      }
    };
    window.addEventListener("live-session:timer-adjust", handleTimerAdjust);
    window.addEventListener("live-session:powerup-result", handlePowerupResult);
    return () => {
      window.removeEventListener("live-session:timer-adjust", handleTimerAdjust);
      window.removeEventListener("live-session:powerup-result", handlePowerupResult);
    };
  }, [question.id]);

  const updateSelection = (next: unknown) => {
    setSelected(next);
    onSelectionChange?.(next, hasQuestionAnswer(question.type, next, question.options.length));
  };

  const handleSubmit = useCallback(() => {
    if (submitDisabled || submitting || !hasSelection) return;
    onSubmit();
  }, [submitDisabled, submitting, hasSelection, onSubmit]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !optionsDisabled &&
        !submitDisabled &&
        !submitting &&
        hasSelection
      ) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [optionsDisabled, submitDisabled, submitting, hasSelection, handleSubmit]);

  const timerPercent = effectiveTimer > 0 ? (timeLeft / effectiveTimer) * 100 : 0;
  const timerUrgent = timeLeft <= 5 && timeLeft > 0;
  const timerExpired = timeLeft <= 0;

  const filteredOptions = question.options.filter((o) => !hiddenOptionIds.includes(o.id));

  const playerQuestion = toPlayerQuestion({
    id: question.id,
    text: question.text,
    type: question.type,
    options: filteredOptions,
    metadata: question.metadata as Record<string, unknown> | null | undefined,
  });

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto w-full max-w-3xl space-y-4"
      role="form"
      aria-label={`Question ${questionIndex + 1} of ${questionCount}`}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 font-mono text-lg font-bold tabular-nums shadow-inner",
            timerUrgent
              ? "animate-pulse bg-red-500/15 text-red-600"
              : timerExpired
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary"
          )}
          aria-live="polite"
        >
          <Clock className="h-5 w-5" />
          {timeLeft}s
        </div>
        <div className="ml-4 h-2 max-w-xs flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-200 ease-linear",
              timerUrgent ? "bg-red-500" : "bg-gradient-to-r from-primary to-amber-500"
            )}
            style={{ width: `${timerPercent}%` }}
          />
        </div>
      </div>

      <Card className="overflow-hidden border-0 shadow-lg ring-1 ring-border/60">
        <CardContent className="space-y-5 p-5 sm:p-8">
          <QuestionPlayerBody
            question={playerQuestion}
            value={selected}
            onChange={updateSelection}
            disabled={optionsDisabled || submitting}
          />

          <Button
            type="button"
            size="lg"
            className="h-14 w-full text-base font-bold shadow-md transition-all sm:text-lg"
            onClick={handleSubmit}
            disabled={submitDisabled || submitting || !hasSelection || timerExpired}
            aria-busy={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Submitting…
              </>
            ) : !connected ? (
              "Submit via backup connection…"
            ) : timerExpired ? (
              "Time is up"
            ) : hasSelection ? (
              "Submit"
            ) : (
              "Complete your answer"
            )}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
