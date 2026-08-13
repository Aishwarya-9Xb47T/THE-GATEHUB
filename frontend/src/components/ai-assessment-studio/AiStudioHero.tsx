import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { QUICK_ACTIONS, type AiSourceType } from "@/lib/aiAssessmentStudio";

interface AiStudioHeroProps {
  onQuickAction?: (source: AiSourceType) => void;
}

export function AiStudioHero({ onQuickAction }: AiStudioHeroProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-10 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl sm:p-12"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-amber-500/10" />
      <div className="relative">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-amber-500/20 shadow-lg shadow-primary/20"
        >
          <Sparkles className="h-10 w-10 text-primary" />
        </motion.div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Create Intelligent Assessment
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/60 sm:text-base">
          Describe your topic or upload learning material. AI will generate professional, editable quizzes in seconds.
        </p>

        {onQuickAction && (
          <div className="mx-auto mt-8 max-w-4xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/40">Quick actions</p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => onQuickAction(action.id)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-white hover:shadow-md hover:shadow-primary/10"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
