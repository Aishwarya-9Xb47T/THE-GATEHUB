import { motion } from "framer-motion";
import type { AiQualityBreakdown } from "@/lib/aiAssessmentStudio/copilotTypes";

const LABELS: Array<{ key: keyof AiQualityBreakdown; label: string }> = [
  { key: "questionQuality", label: "Question quality" },
  { key: "difficultyBalance", label: "Difficulty balance" },
  { key: "coverage", label: "Coverage" },
  { key: "readability", label: "Readability" },
  { key: "grammar", label: "Grammar" },
  { key: "learningObjectives", label: "Learning objectives" },
  { key: "distractorQuality", label: "Distractor quality" },
  { key: "timeBalance", label: "Time balance" },
];

interface AiQualityPanelProps {
  quality: AiQualityBreakdown;
}

export function AiQualityPanel({ quality }: AiQualityPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-amber-500/5 p-5 backdrop-blur-sm"
    >
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">Assessment quality</p>
          <p className="text-4xl font-bold text-primary">{quality.overall}<span className="text-lg text-white/40">/100</span></p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {LABELS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-white/60">{label}</span>
              <span className="text-white/80">{quality[key]}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${quality[key]}%` }}
                transition={{ duration: 0.6, delay: 0.05 }}
                className="h-full rounded-full bg-primary/80"
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
