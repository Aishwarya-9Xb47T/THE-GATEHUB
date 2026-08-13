import {
  BarChart3,
  Clock,
  Target,
  Brain,
  Layers,
  Percent,
} from "lucide-react";
import type { QuizRoomPreview } from "@/lib/liveSession/types";
import { QuizCoverBanner } from "@/components/quiz-branding/QuizCoverBanner";

interface PreviewStepProps {
  preview: QuizRoomPreview | null;
  loading?: boolean;
  roomTitle: string;
}

const BLOOM_LEVELS = ["L1 Remember", "L2 Understand", "L3 Apply", "L4 Analyze"];

export function PreviewStep({ preview, loading, roomTitle }: PreviewStepProps) {
  if (loading) {
    return <p className="text-center text-white/50">Building preview…</p>;
  }

  if (!preview) {
    return (
      <div className="rounded-2xl border border-dashed border-white/20 py-16 text-center text-white/50">
        Preview unavailable — check your quiz selection.
      </div>
    );
  }

  const coverage = Math.min(100, Math.round((preview.questionCount / Math.max(preview.questionCount, 1)) * 92));

  return (
    <div className="space-y-6">
      <QuizCoverBanner
        id={preview.quizId}
        bannerUrl={preview.bannerUrl}
        thumbnailUrl={preview.thumbnailUrl}
        coverImageUrl={preview.coverImageUrl}
        coverGradient={preview.coverGradient}
        theme={preview.theme}
        alt={preview.title}
        className="h-40 w-full rounded-2xl"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <h2 className="text-2xl font-bold text-white">{roomTitle || preview.title}</h2>
          {preview.description && (
            <p className="mt-1 line-clamp-2 text-sm text-white/80">{preview.description}</p>
          )}
        </div>
      </QuizCoverBanner>

      <div>
        <h2 className="text-2xl font-bold">Quiz room preview</h2>
        <p className="mt-1 text-white/60">Review content and stats before launch</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Layers, label: "Questions", value: preview.questionCount },
          { icon: Clock, label: "Duration", value: `~${preview.estimatedMinutes} min` },
          { icon: Target, label: "Difficulty", value: preview.avgDifficulty },
          { icon: Percent, label: "Coverage", value: `${coverage}%` },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-5 backdrop-blur-sm"
          >
            <Icon className="mb-2 h-5 w-5 text-primary" />
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-white/50">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Question breakdown
          </h3>
          <div className="space-y-3">
            {Object.entries(preview.typeCounts).map(([type, count]) => {
              const pct = Math.round((count / preview.questionCount) * 100);
              return (
                <div key={type}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="capitalize text-white/80">{type.replace(/_/g, " ")}</span>
                    <span className="text-white/50">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <Brain className="h-4 w-4 text-primary" />
              Bloom&apos;s taxonomy
            </h3>
            <div className="flex flex-wrap gap-2">
              {BLOOM_LEVELS.map((level) => (
                <span
                  key={level}
                  className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary"
                >
                  {level}
                </span>
              ))}
            </div>
          </div>

          {preview.topics.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="mb-3 font-semibold">Topics</h3>
              <div className="flex flex-wrap gap-2">
                {preview.topics.map((t) => (
                  <span key={t} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white/70">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-white/50">Total marks</p>
            <p className="text-3xl font-bold">{preview.totalMarks}</p>
            <p className="mt-1 text-xs text-white/40">Passing ~{preview.passingPercent}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
