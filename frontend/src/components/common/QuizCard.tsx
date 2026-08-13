import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Calendar, Target, Trophy } from "lucide-react";
import { QuizCoverBanner } from "@/components/quiz-branding/QuizCoverBanner";

interface QuizCardProps {
  quiz: {
    id: string;
    quizId?: string;
    title: string;
    courseName?: string;
    score?: number;
    totalMarks?: number;
    percentage?: number;
    accuracy?: number;
    attemptType?: "live" | "course";
    livePoints?: number | null;
    rank?: number | null;
    correctCount?: number | null;
    wrongCount?: number | null;
    unansweredCount?: number | null;
    createdAt?: string;
    bannerUrl?: string | null;
    thumbnailUrl?: string | null;
    coverImageUrl?: string | null;
    coverGradient?: string | null;
    theme?: string | null;
  };
  action?: ReactNode;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function QuizCard({ quiz, action }: QuizCardProps) {
  const percentage = clampPercent(
    quiz.percentage ??
      (quiz.totalMarks ? ((quiz.score ?? 0) / quiz.totalMarks) * 100 : 0)
  );
  const accuracy = clampPercent(quiz.accuracy ?? percentage);
  const isPass = percentage >= 70;
  const isLive = quiz.attemptType === "live";

  return (
    <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-card shadow-md transition-all hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10">
      <div className="flex gap-4 p-4">
        <QuizCoverBanner
          id={quiz.quizId || quiz.id}
          bannerUrl={quiz.bannerUrl}
          coverImageUrl={quiz.coverImageUrl}
          thumbnailUrl={quiz.thumbnailUrl}
          coverGradient={quiz.coverGradient}
          theme={quiz.theme}
          alt={quiz.title}
          className="h-20 w-20 shrink-0 rounded-2xl"
          imageClassName="h-full w-full object-cover object-center"
          overlay={false}
          showIconFallback
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h3 className="truncate text-lg font-semibold text-foreground">{quiz.title}</h3>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {quiz.courseName && <span>{quiz.courseName}</span>}
                {quiz.createdAt && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(quiz.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Target className="h-3.5 w-3.5" />
                  Accuracy {accuracy}%
                </span>
                {(quiz.correctCount != null || quiz.wrongCount != null) && (
                  <span>
                    {quiz.correctCount ?? 0}✓ / {quiz.wrongCount ?? 0}✗
                    {quiz.unansweredCount != null ? ` / ${quiz.unansweredCount}—` : ""}
                  </span>
                )}
                {isLive && quiz.livePoints != null && (
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="h-3.5 w-3.5" />
                    {quiz.livePoints} pts
                  </span>
                )}
                {quiz.rank != null && <span>Rank #{quiz.rank}</span>}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <div className="text-right">
                <div
                  className={cn(
                    "text-2xl font-bold tabular-nums leading-none",
                    isPass ? "text-green-500" : percentage >= 40 ? "text-amber-500" : "text-red-500"
                  )}
                >
                  {percentage}%
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  {quiz.score ?? 0} / {quiz.totalMarks ?? 0} Marks
                </div>
              </div>
              {action}
            </div>
          </div>

          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isPass
                  ? "bg-gradient-to-r from-green-500 to-emerald-500"
                  : percentage >= 40
                    ? "bg-gradient-to-r from-amber-500 to-yellow-500"
                    : "bg-gradient-to-r from-red-500 to-rose-500"
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
