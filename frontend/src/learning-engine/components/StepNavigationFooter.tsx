import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FooterAssistantAction } from "@/assistant/FooterAssistantAction";
import { stepLabel, stepPedagogyRole } from "../hooks/useLessonProgressTree";
import type { LearnerExperienceStep } from "../types";

interface StepNavigationFooterProps {
  steps: LearnerExperienceStep[];
  activeStepId: string | null;
  onPrevious: () => void;
  onNext: () => void;
}

export function StepNavigationFooter({ steps, activeStepId, onPrevious, onNext }: StepNavigationFooterProps) {
  const activeIndex = steps.findIndex((s) => s.id === activeStepId);
  const activeStep = activeIndex >= 0 ? steps[activeIndex] : null;
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < steps.length - 1;
  const role = activeStep ? stepPedagogyRole(activeStep) : "default";
  const nextStep = hasNext ? steps[activeIndex + 1] : null;

  if (!activeStep) {
    return (
      <footer className="app-shell-grid__footer z-20 border-t bg-background/95 backdrop-blur">
        <div className="app-workspace py-3 flex items-center justify-end">
          <FooterAssistantAction compact />
        </div>
      </footer>
    );
  }

  return (
    <footer
      className="app-shell-grid__footer z-20 border-t bg-background/95 backdrop-blur"
      data-floating-obstacle="bottom-nav"
      aria-label="Lesson step navigation"
    >
      <div className="app-workspace py-3 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          disabled={!hasPrevious}
          onClick={onPrevious}
          aria-label="Go to previous step"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>

        <div className="text-center min-w-0 flex-1 px-2">
          <p className="text-xs text-muted-foreground">
            Step {activeIndex + 1} of {steps.length}
            {role === "checkpoint" ? " · Checkpoint" : role === "takeaways" ? " · Takeaways" : ""}
          </p>
          <p className="text-sm font-medium truncate">{stepLabel(activeStep)}</p>
          {nextStep && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
              Next: {stepLabel(nextStep)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <FooterAssistantAction compact />
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!hasNext}
            onClick={onNext}
            aria-label={nextStep ? `Go to next step: ${stepLabel(nextStep)}` : "No next step"}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </footer>
  );
}
