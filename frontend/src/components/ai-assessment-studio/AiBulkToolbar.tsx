import { motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiAssessmentStore } from "@/lib/aiAssessmentStudio/store";
import { useAiCopilot } from "@/lib/aiAssessmentStudio/useAiCopilot";
import type { CopilotIntent } from "@/lib/aiAssessmentStudio/copilotTypes";

const BULK_ACTIONS: Array<{ intent: CopilotIntent; label: string }> = [
  { intent: "harder", label: "Harder" },
  { intent: "easier", label: "Easier" },
  { intent: "improve_grammar", label: "Grammar" },
  { intent: "generate_explanations_all", label: "Explanations" },
  { intent: "generate_hints_all", label: "Hints" },
  { intent: "improve_distractors", label: "Distractors" },
  { intent: "increase_bloom", label: "Bloom +" },
  { intent: "remove_duplicates", label: "Dedupe" },
  { intent: "shuffle", label: "Shuffle" },
];

export function AiBulkToolbar() {
  const bulkSelected = useAiAssessmentStore((s) => s.bulkSelected);
  const clearBulkSelected = useAiAssessmentStore((s) => s.clearBulkSelected);
  const { runAction, isBusy } = useAiCopilot();

  if (!bulkSelected.size) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-slate-900/95 px-3 py-2 shadow-lg backdrop-blur-md"
    >
      <Sparkles className="h-4 w-4 text-primary" />
      <span className="text-xs font-medium text-white">{bulkSelected.size} selected</span>
      {BULK_ACTIONS.map((a) => (
        <Button
          key={a.intent}
          variant="outline"
          size="sm"
          className="h-7 border-white/15 text-xs"
          disabled={isBusy}
          onClick={() => runAction(a.intent, [...bulkSelected])}
        >
          {a.label}
        </Button>
      ))}
      <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={clearBulkSelected}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </motion.div>
  );
}
