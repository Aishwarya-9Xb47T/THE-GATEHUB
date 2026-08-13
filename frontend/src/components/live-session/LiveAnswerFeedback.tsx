import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Flame,
  Zap,
  Clock,
  Trophy,
  Target,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveAnswerResult, QuestionForClient } from "@/lib/liveSession/types";
import { AssessmentContentRenderer } from "@/components/assessment/AssessmentContentRenderer";
import { FEEDBACK_DURATION_MS } from "@/lib/liveSession/livePlayerTimings";

interface LiveAnswerFeedbackProps {
  result: LiveAnswerResult;
  question: QuestionForClient;
  showCorrectAnswer?: boolean;
  variant?: "full" | "compact";
  accuracy?: number;
  className?: string;
  selfPaced?: boolean;
}

function resolveCorrectLabels(question: QuestionForClient, correctOptions?: string[]) {
  if (!correctOptions?.length) return [];
  return correctOptions
    .map((id) => question.options.find((o) => o.id === id)?.text ?? id)
    .filter(Boolean);
}

export function LiveAnswerFeedback({
  result,
  question,
  showCorrectAnswer = true,
  variant = "full",
  accuracy,
  className,
  selfPaced = false,
}: LiveAnswerFeedbackProps) {
  const correctLabels = resolveCorrectLabels(question, result.correctOptions);
  const isFull = variant === "full";
  const [countdownProgress, setCountdownProgress] = useState(0);

  useEffect(() => {
    if (!isFull) return;
    const start = Date.now();
    const duration = selfPaced ? 2000 : FEEDBACK_DURATION_MS;
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      setCountdownProgress(Math.min(1, elapsed / duration));
    }, 40);
    return () => clearInterval(id);
  }, [isFull, result, selfPaced]);

  const responseSec =
    result.responseTimeMs != null ? (result.responseTimeMs / 1000).toFixed(1) : null;

  return (
    <motion.div
      layout
      initial={isFull ? { opacity: 0, scale: 0.92, y: 20 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      className={cn(
        "mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border-2 text-center shadow-xl",
        isFull ? "p-8 sm:p-10" : "p-4 sm:p-5",
        result.isCorrect
          ? "border-emerald-500/60 bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-background"
          : "border-red-500/60 bg-gradient-to-br from-red-500/20 via-red-500/5 to-background",
        className
      )}
    >
      <motion.div
        initial={isFull ? { scale: 0, rotate: -20 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 14, delay: 0.05 }}
        className="mx-auto mb-3 flex items-center justify-center"
      >
        {result.isCorrect ? (
          <CheckCircle2
            className={cn("text-emerald-500 drop-shadow-md", isFull ? "h-20 w-20 sm:h-24 sm:w-24" : "h-10 w-10")}
          />
        ) : (
          <XCircle
            className={cn("text-red-500 drop-shadow-md", isFull ? "h-20 w-20 sm:h-24 sm:w-24" : "h-10 w-10")}
          />
        )}
      </motion.div>

      <h2
        className={cn(
          "font-black tracking-tight",
          isFull ? "text-3xl sm:text-4xl" : "text-lg",
          result.isCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        )}
      >
        {result.isCorrect ? "Correct!" : "Incorrect"}
      </h2>

      {!result.isCorrect && showCorrectAnswer && correctLabels.length > 0 && (
        <div
          className={cn(
            "mt-4 rounded-xl bg-background/70 text-left",
            isFull ? "p-4" : "mt-2 p-3 text-sm"
          )}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Correct answer
          </p>
          <div className="mt-1 space-y-1 font-semibold text-emerald-700 dark:text-emerald-400">
            {correctLabels.map((label) => (
              <AssessmentContentRenderer key={label} content={label} variant="feedback" />
            ))}
          </div>
        </div>
      )}

      <div
        className={cn(
          "grid gap-2",
          isFull ? "mt-6 sm:grid-cols-2 lg:grid-cols-3" : "mt-3 grid-cols-2 sm:grid-cols-4"
        )}
      >
        <StatPill
          icon={Trophy}
          label={result.isCorrect ? "Marks" : "Total Marks"}
          value={
            result.isCorrect
              ? `+${result.pointsEarned}`
              : result.pointsEarned < 0
                ? `${result.pointsEarned}`
                : `${result.totalScore ?? 0}`
          }
          accent={result.isCorrect ? "text-emerald-600 dark:text-emerald-400" : (result.pointsEarned < 0 ? "text-red-500" : "text-foreground")}
          compact={!isFull}
        />
        {result.xpEarned != null && result.xpEarned > 0 && (
          <StatPill icon={Zap} label="XP" value={`+${result.xpEarned}`} accent="text-violet-600" compact={!isFull} />
        )}
        {(result.streak ?? 0) > 0 && (
          <StatPill
            icon={Flame}
            label="Streak"
            value={`${result.streak}`}
            accent="text-orange-600"
            compact={!isFull}
          />
        )}
        {result.rank != null && (
          <StatPill
            icon={TrendingUp}
            label="Rank"
            value={`#${result.rank}`}
            accent="text-sky-600"
            compact={!isFull}
          />
        )}
        {accuracy != null && (
          <StatPill icon={Target} label="Accuracy" value={`${accuracy}%`} accent="text-primary" compact={!isFull} />
        )}
        {responseSec != null && (
          <StatPill icon={Clock} label="Time" value={`${responseSec}s`} accent="text-muted-foreground" compact={!isFull} />
        )}
      </div>

      {result.explanation && isFull && (
        <div className="mt-5 rounded-xl bg-background/60 p-4 text-left text-sm text-muted-foreground">
          <AssessmentContentRenderer content={result.explanation} variant="explanation" />
        </div>
      )}

      {isFull && (
        <div className="mt-6 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">
            {selfPaced ? "Next question loading in 2 seconds..." : "Next question loading when instructor advances…"}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className={cn(
                "h-full rounded-full",
                result.isCorrect ? "bg-emerald-500" : "bg-red-400"
              )}
              style={{ width: `${countdownProgress * 100}%` }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  accent,
  compact,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  accent: string;
  compact?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className={cn(
        "flex items-center gap-2 rounded-xl bg-background/80 backdrop-blur-sm",
        compact ? "px-2 py-2" : "gap-3 px-4 py-3"
      )}
    >
      <Icon className={cn(compact ? "h-4 w-4" : "h-5 w-5", accent)} />
      <div className="text-left">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("font-bold tabular-nums", compact ? "text-sm" : "text-lg", accent)}>{value}</p>
      </div>
    </motion.div>
  );
}
