import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AiGenerationPreview } from "@/lib/aiAssessmentStudio/types";
import { cn } from "@/lib/utils";

interface GenerationCoverageReviewProps {
  preview: AiGenerationPreview;
  requestedCount: number;
  composition?: Record<string, number>;
  difficultyMix?: { easy: number; medium: number; hard: number };
  filling?: boolean;
  onFillRemaining?: () => void;
  onRetry?: () => void;
  onEditConfig?: () => void;
}

function formatTypeLabel(type: string) {
  return type.replace(/_/g, " ");
}

export function GenerationCoverageReview({
  preview,
  requestedCount,
  composition,
  difficultyMix,
  filling,
  onFillRemaining,
  onRetry,
  onEditConfig,
}: GenerationCoverageReviewProps) {
  const summary = preview.summary;
  const generated = summary.generatedQuestions ?? summary.totalQuestions;
  const requested = summary.requestedQuestions ?? requestedCount;
  const coverage = summary.coveragePercent ?? (requested > 0 ? Math.round((generated / requested) * 100) : 0);
  const isComplete = summary.isComplete ?? generated === requested;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Requested" value={String(requested)} />
        <Stat label="Generated" value={String(generated)} highlight={!isComplete} />
        <Stat label="Coverage" value={`${coverage}%`} highlight={!isComplete} />
      </div>

      {!isComplete && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              AI generated {generated} of the requested {requested} questions. The quiz cannot be saved until the count matches.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onFillRemaining && (
              <Button size="sm" variant="secondary" disabled={filling} onClick={onFillRemaining}>
                <RefreshCw className={cn("mr-2 h-3.5 w-3.5", filling && "animate-spin")} />
                Generate Remaining
              </Button>
            )}
            {onRetry && (
              <Button size="sm" variant="outline" className="border-white/20 bg-transparent text-white" disabled={filling} onClick={onRetry}>
                Retry Entire Quiz
              </Button>
            )}
            {onEditConfig && (
              <Button size="sm" variant="ghost" className="text-white/70" disabled={filling} onClick={onEditConfig}>
                Edit Configuration
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <DistributionBlock
          title="Question types"
          requested={composition || summary.byTypeRequested}
          generated={summary.byType}
        />
        {difficultyMix && (
          <DistributionBlock
            title="Difficulty"
            requested={{
              easy: `${difficultyMix.easy}%`,
              medium: `${difficultyMix.medium}%`,
              hard: `${difficultyMix.hard}%`,
            }}
            generated={Object.fromEntries(
              Object.entries(summary.byDifficulty).map(([k, v]) => [k, String(v)])
            )}
            isPercent
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center", highlight && "border-amber-500/40")}>
      <p className="text-xs text-white/50">{label}</p>
      <p className={cn("text-xl font-bold", highlight ? "text-amber-400" : "text-white")}>{value}</p>
    </div>
  );
}

function DistributionBlock({
  title,
  requested,
  generated,
  isPercent,
}: {
  title: string;
  requested?: Record<string, number | string>;
  generated?: Record<string, number | string>;
  isPercent?: boolean;
}) {
  const keys = new Set([...Object.keys(requested || {}), ...Object.keys(generated || {})]);
  if (!keys.size) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">{title}</p>
      <div className="space-y-1.5 text-sm">
        {[...keys].map((key) => (
          <div key={key} className="flex justify-between gap-2 text-white/80">
            <span className="capitalize">{formatTypeLabel(key)}</span>
            <span className="text-white/50">
              {requested?.[key] ?? "—"} → {generated?.[key] ?? 0}
              {!isPercent && requested?.[key] != null ? "" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function isGenerationComplete(preview: AiGenerationPreview, requestedCount: number): boolean {
  const generated = preview.summary.generatedQuestions ?? preview.summary.totalQuestions;
  const requested = preview.summary.requestedQuestions ?? requestedCount;
  return preview.summary.isComplete ?? generated === requested;
}
