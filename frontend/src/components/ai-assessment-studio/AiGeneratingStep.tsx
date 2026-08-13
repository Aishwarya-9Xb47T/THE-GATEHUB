import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { GENERATION_STAGES } from "@/lib/aiAssessmentStudio/constants";

interface AiGeneratingStepProps {
  progress: { stage: string; percent: number; message: string } | null;
}

export function AiGeneratingStep({ progress }: AiGeneratingStepProps) {
  const pct = progress?.percent ?? 0;
  const msg = progress?.message ?? "Initializing AI…";

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center py-12">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-amber-500/20 shadow-xl shadow-primary/20"
      >
        <Sparkles className="h-10 w-10 text-primary" />
      </motion.div>

      <h2 className="text-2xl font-bold text-white">AI is crafting your assessment</h2>
      <p className="mt-2 text-sm text-white/50">{msg}</p>

      <div className="mt-8 w-full max-w-md">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-white/40">{pct}% · Est. {Math.max(1, Math.ceil((100 - pct) / 25))} min remaining</p>
      </div>

      <div className="mt-10 w-full max-w-lg space-y-2">
        {GENERATION_STAGES.map((label, i) => {
          const stagePct = ((i + 1) / GENERATION_STAGES.length) * 100;
          const done = pct >= stagePct - 5;
          const active = !done && pct >= stagePct - 15;
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                done ? "text-emerald-400/90" : active ? "text-white" : "text-white/30"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${done ? "bg-emerald-400" : active ? "animate-pulse bg-primary" : "bg-white/20"}`} />
              {label}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
