import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import type { AiGenerationPreview } from "@/lib/aiAssessmentStudio";
import { analyzeAssessment } from "@/lib/aiAssessmentStudio/assessmentAnalyzer";
import { AiInsightsPanel } from "./AiInsightsPanel";
import { AiQualityPanel } from "./AiQualityPanel";
import { AiVersionPanel } from "./AiVersionPanel";
import { AiBulkToolbar } from "./AiBulkToolbar";
import { AiQuestionCard } from "./AiQuestionCard";

interface AiReviewStepProps {
  preview: AiGenerationPreview;
  onToggle: (id: string, selected: boolean) => void;
  onUpdate: (id: string, patch: Partial<import("@/lib/aiAssessmentStudio").AiGeneratedQuestion>) => void;
  onDelete: (id: string) => void;
}

export function AiReviewStep({ preview, onToggle, onUpdate, onDelete }: AiReviewStepProps) {
  const insights = useMemo(() => analyzeAssessment(preview), [preview]);
  const selected = preview.questions.filter((q) => q.selected).length;

  const issuesByQuestion = useMemo(() => {
    const map = new Map<string, Array<{ message: string; severity: string }>>();
    for (const v of insights.validationIssues) {
      const list = map.get(v.questionId) || [];
      list.push({ message: v.message, severity: v.severity });
      map.set(v.questionId, list);
    }
    return map;
  }, [insights.validationIssues]);

  return (
    <div className="space-y-6">
      {preview.modelNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-primary">{preview.modelNotice.title}</p>
            <p className="text-xs text-white/60">{preview.modelNotice.message}</p>
          </div>
        </div>
      )}
      {preview.demoMode && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-200">
              {preview.aiNotice?.title === "Development Mode" ? "Development Mode" : "Demo Mode"}
            </p>
            <p className="text-xs text-amber-200/70">
              {preview.aiNotice?.message ||
                "Sample questions generated locally — edit and test the studio workflow."}
            </p>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Questions" value={preview.questions.length} />
        <StatCard label="Quality score" value={`${insights.quality.overall}/100`} highlight />
        <StatCard label="Est. duration" value={`${insights.estimatedMinutes} min`} />
        <StatCard label="Selected" value={selected} />
      </div>

      <AiQualityPanel quality={insights.quality} />
      <AiInsightsPanel insights={insights} />
      <AiVersionPanel />
      <AiBulkToolbar />

      <div className="space-y-4">
        {preview.questions.map((q, idx) => (
          <AiQuestionCard
            key={q.id}
            q={q}
            index={idx}
            issues={issuesByQuestion.get(q.id)}
            onToggle={onToggle}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${highlight ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/5"}`}
    >
      <p className={`text-2xl font-bold ${highlight ? "text-primary" : "text-white"}`}>{value}</p>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  );
}
