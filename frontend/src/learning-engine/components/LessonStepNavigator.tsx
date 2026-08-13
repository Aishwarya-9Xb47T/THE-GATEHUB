import { CheckCircle2, Circle, Flag, ListChecks, Lock, RotateCcw } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { LearnerExperienceStep } from "../types";
import { stepLabel, stepPedagogyRole, type NodeProgress } from "../hooks/useLessonProgressTree";

interface LessonStepNavigatorProps {
  steps: LearnerExperienceStep[];
  activeStepId: string | null;
  getStepProgress: (stepId: string) => NodeProgress;
  onSelectStep: (stepId: string) => void;
}

export const LessonStepNavigator = memo(function LessonStepNavigator({
  steps,
  activeStepId,
  getStepProgress: getProgress,
  onSelectStep,
}: LessonStepNavigatorProps) {
  return (
    <nav className="ml-5 mt-0.5 mb-2 space-y-0.5 border-l border-border pl-2" aria-label="Lesson steps">
      {steps.map((step) => {
        const prog = getProgress(step.id);
        const isActive = activeStepId === step.id;
        const isLocked = prog.locked && !prog.visited && !isActive;
        const required = step.progressRule.requiredForCompletion;
        const role = stepPedagogyRole(step);
        const label = stepLabel(step);

        return (
          <button
            key={step.id}
            type="button"
            disabled={isLocked}
            onClick={() => onSelectStep(step.id)}
            aria-current={isActive ? "step" : undefined}
            aria-label={`${label}${prog.completed ? ", completed" : prog.visited ? ", in progress" : ""}${isLocked ? ", locked" : ""}`}
            className={cn(
              "w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "surface-primary bg-primary font-medium"
                : isLocked
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              role === "takeaways" && !isActive && "text-sky-700 dark:text-sky-300",
              role === "checkpoint" && !isActive && "text-amber-700 dark:text-amber-300",
              role === "revision" && !isActive && "text-violet-700 dark:text-violet-300"
            )}
          >
            {prog.completed ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
            ) : isLocked ? (
              <Lock className="w-3 h-3 shrink-0 opacity-50" />
            ) : role === "takeaways" ? (
              <ListChecks className="w-3.5 h-3.5 shrink-0 opacity-80" />
            ) : role === "checkpoint" ? (
              <Flag className="w-3 h-3 shrink-0 opacity-80" />
            ) : role === "revision" ? (
              <RotateCcw className="w-3 h-3 shrink-0 opacity-80" />
            ) : prog.visited && required ? (
              <Circle className="w-3 h-3 shrink-0 fill-amber-400/40 stroke-amber-500" />
            ) : prog.visited ? (
              <Circle className="w-3 h-3 shrink-0 fill-primary/30 stroke-primary" />
            ) : (
              <Circle className="w-3 h-3 shrink-0 opacity-40" />
            )}
            <span className="truncate flex-1">{label}</span>
            {required && !prog.completed && prog.progress > 0 && (
              <span className="text-[10px] opacity-60">{prog.progress}%</span>
            )}
          </button>
        );
      })}
    </nav>
  );
});
