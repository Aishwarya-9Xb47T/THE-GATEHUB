import { useMemo, useState } from "react";
import { Check, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QuestionPlayerBody, toPlayerQuestion } from "@/components/media";

export type AttemptReviewStatus = "correct" | "incorrect" | "unanswered" | "partial" | "needs_review";

export type AttemptReviewQuestion = {
  questionId: string;
  questionNumber: number;
  questionText: string;
  questionType: string;
  options: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
  correctAnswer?: unknown;
  selectedAnswer?: unknown;
  selectedOptionIds?: string[];
  correctOptionIds?: string[];
  isCorrect?: boolean | null;
  status: AttemptReviewStatus | string;
  marksAwarded: number;
  maxMarks: number;
  explanation?: string | null;
  difficulty?: string | null;
  timeTakenMs?: number | null;
  metadata?: unknown;
};

export type AttemptReviewSummaryLike = {
  studentName?: string;
  quizTitle?: string;
  score: number;
  maxScore: number;
  percentage: number;
  accuracy: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  timeTakenMs?: number | null;
  rank?: number | null;
  livePoints?: number | null;
  attemptDate?: string;
};

type Props = {
  summary?: AttemptReviewSummaryLike | null;
  questions: AttemptReviewQuestion[];
  className?: string;
  showSummary?: boolean;
};

function statusTone(status: string) {
  if (status === "correct") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (status === "incorrect") return "bg-red-500/10 text-red-600 border-red-500/30";
  if (status === "partial") return "bg-amber-500/10 text-amber-700 border-amber-500/30";
  if (status === "needs_review") return "bg-sky-500/10 text-sky-700 border-sky-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "correct") return <Check className="h-3.5 w-3.5" />;
  if (status === "incorrect") return <X className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function formatAnswerLabel(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v && typeof v === "object" && "text" in (v as object)) return String((v as any).text);
        return formatAnswerLabel(v);
      })
      .join(", ");
  }
  if (typeof value === "object" && value && "text" in (value as object)) {
    return String((value as any).text);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function AttemptQuestionReview({ summary, questions, className, showSummary = true }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const safeQuestions = questions || [];
  const current = safeQuestions[Math.min(activeIndex, Math.max(0, safeQuestions.length - 1))];

  const navigator = useMemo(
    () =>
      safeQuestions.map((q, idx) => ({
        idx,
        status: String(q.status || "unanswered"),
        number: q.questionNumber || idx + 1,
      })),
    [safeQuestions]
  );

  if (safeQuestions.length === 0) {
    return (
      <div className={cn("rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground", className)}>
        No question-level answers are available for this attempt yet.
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {showSummary && summary && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <SummaryTile label="Score" value={`${summary.score} / ${summary.maxScore}`} />
          <SummaryTile label="Percentage" value={`${Math.round(summary.percentage)}%`} />
          <SummaryTile label="Accuracy" value={`${Math.round(summary.accuracy)}%`} />
          <SummaryTile
            label="C / I / U"
            value={`${summary.correctCount} / ${summary.incorrectCount} / ${summary.unansweredCount}`}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {navigator.map((n) => (
          <button
            key={n.idx}
            type="button"
            onClick={() => setActiveIndex(n.idx)}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-bold transition-colors",
              activeIndex === n.idx ? "ring-2 ring-primary/40" : "",
              statusTone(n.status)
            )}
            title={`Q${n.number}: ${n.status}`}
          >
            <StatusIcon status={n.status} />
            {n.number}
          </button>
        ))}
      </div>

      {current && (
        <div className="rounded-xl border bg-card p-4 md:p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  Question {current.questionNumber}
                </span>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {current.questionType}
                </Badge>
                <Badge className={cn("border text-[10px] uppercase", statusTone(String(current.status)))}>
                  {String(current.status).replace("_", " ")}
                </Badge>
              </div>
              <p className="text-sm font-semibold text-foreground">
                Marks: {current.marksAwarded} / {current.maxMarks}
                {current.timeTakenMs != null ? ` · ${(current.timeTakenMs / 1000).toFixed(1)}s` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={activeIndex <= 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={activeIndex >= safeQuestions.length - 1}
                onClick={() => setActiveIndex((i) => Math.min(safeQuestions.length - 1, i + 1))}
              >
                Next
              </Button>
            </div>
          </div>

          <QuestionPlayerBody
            question={toPlayerQuestion({
              id: current.questionId,
              text: current.questionText,
              type: current.questionType,
              options: current.options,
              metadata: (current.metadata as Record<string, unknown>) || null,
            })}
            value={
              current.selectedOptionIds && current.selectedOptionIds.length > 0
                ? current.questionType?.includes("multi") || current.questionType === "multiple_select"
                  ? current.selectedOptionIds
                  : current.selectedOptionIds[0]
                : current.selectedAnswer
            }
            disabled
          />

          <div className="grid gap-3 md:grid-cols-2 text-xs">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <p className="font-bold text-muted-foreground uppercase tracking-wide">Your answer</p>
              <p className="font-semibold text-foreground">
                {current.status === "unanswered"
                  ? "Not answered"
                  : formatAnswerLabel(current.selectedAnswer)}
              </p>
            </div>
            <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 space-y-1">
              <p className="font-bold text-emerald-700 uppercase tracking-wide">Correct answer</p>
              <p className="font-semibold text-foreground">{formatAnswerLabel(current.correctAnswer)}</p>
            </div>
          </div>

          <div className="rounded-lg border px-3 py-2 text-xs font-bold flex flex-wrap gap-3">
            <span>
              Status:{" "}
              <span className={cn("uppercase", statusTone(String(current.status)).split(" ")[0])}>
                {String(current.status).replace("_", " ")}
              </span>
            </span>
            <span>
              Marks: {current.marksAwarded} / {current.maxMarks}
            </span>
            {current.timeTakenMs != null && <span>Time: {(current.timeTakenMs / 1000).toFixed(1)}s</span>}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Options legend</p>
            <div className="space-y-1.5">
              {current.options.map((o) => {
                const selected = (current.selectedOptionIds || []).includes(o.id);
                return (
                  <div
                    key={o.id}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-2 text-xs font-medium",
                      o.isCorrect && "bg-emerald-500/10 border-emerald-500/30",
                      selected && !o.isCorrect && "bg-red-500/10 border-red-500/30",
                      selected && o.isCorrect && "ring-1 ring-emerald-500/40"
                    )}
                  >
                    <span>{o.text}</span>
                    <span className="flex items-center gap-2 text-[10px] font-bold uppercase">
                      {selected && <span className="text-foreground">Selected</span>}
                      {o.isCorrect && <span className="text-emerald-700">Correct</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {current.explanation && (
            <div className="rounded-lg border bg-muted/15 p-3 text-xs">
              <button
                type="button"
                className="font-bold text-foreground"
                onClick={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    [current.questionId]: !prev[current.questionId],
                  }))
                }
              >
                Explanation {expanded[current.questionId] ? "▾" : "▸"}
              </button>
              {(expanded[current.questionId] ?? true) && (
                <p className="mt-2 text-muted-foreground leading-relaxed">{current.explanation}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums text-foreground">{value}</p>
    </div>
  );
}
