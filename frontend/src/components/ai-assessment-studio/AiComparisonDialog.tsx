import { motion } from "framer-motion";
import { Check, X, GitMerge } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAiAssessmentStore } from "@/lib/aiAssessmentStudio/store";
import { QUESTION_TYPE_LABELS } from "@/lib/assessmentStudio/types";

export function AiComparisonDialog() {
  const pending = useAiAssessmentStore((s) => s.pendingComparison);
  const acceptComparison = useAiAssessmentStore((s) => s.acceptComparison);
  const rejectComparison = useAiAssessmentStore((s) => s.rejectComparison);
  const updateQuestion = useAiAssessmentStore((s) => s.updateQuestion);
  const setPendingComparison = useAiAssessmentStore((s) => s.setPendingComparison);

  if (!pending) return null;

  const merge = () => {
    updateQuestion(pending.questionId, {
      stem: pending.improved.stem,
      explanation: pending.improved.explanation || pending.original.explanation,
      options: pending.improved.options || pending.original.options,
      difficulty: pending.improved.difficulty,
      bloomLevel: pending.improved.bloomLevel,
      hints: pending.improved.hints || pending.original.hints,
    });
    setPendingComparison(null);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && rejectComparison()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-white/10 bg-slate-950 text-white">
        <DialogHeader>
          <DialogTitle>AI improvement review</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <CompareCol title="Original" q={pending.original} variant="muted" />
          <CompareCol title="AI improved" q={pending.improved} variant="highlight" />
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={rejectComparison}>
            <X className="mr-2 h-4 w-4" />
            Reject
          </Button>
          <Button variant="outline" className="border-white/20" onClick={merge}>
            <GitMerge className="mr-2 h-4 w-4" />
            Merge
          </Button>
          <Button onClick={acceptComparison}>
            <Check className="mr-2 h-4 w-4" />
            Accept
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompareCol({
  title,
  q,
  variant,
}: {
  title: string;
  q: { stem: string; type: string; options?: Array<{ text: string; isCorrect: boolean }>; explanation?: string };
  variant: "muted" | "highlight";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 ${
        variant === "highlight" ? "border-primary/40 bg-primary/10 ring-1 ring-primary/20" : "border-white/10 bg-white/5"
      }`}
    >
      <p className="mb-2 text-xs font-semibold uppercase text-white/50">{title}</p>
      <p className="mb-1 text-[10px] text-primary">{QUESTION_TYPE_LABELS[q.type] || q.type}</p>
      <p className="text-sm text-white">{q.stem}</p>
      {q.options && (
        <ul className="mt-2 space-y-1 text-xs text-white/60">
          {q.options.map((o, i) => (
            <li key={i} className={o.isCorrect ? "text-emerald-400" : ""}>
              {o.isCorrect ? "✓ " : "○ "}{o.text}
            </li>
          ))}
        </ul>
      )}
      {q.explanation && <p className="mt-2 text-xs text-white/40">{q.explanation}</p>}
    </motion.div>
  );
}
