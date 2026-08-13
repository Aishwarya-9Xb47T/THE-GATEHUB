import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS } from "./wizardTypes";

interface WizardShellProps {
  step: number;
  children: React.ReactNode;
  onStepClick?: (index: number) => void;
  footer?: React.ReactNode;
  stepLabels?: string[];
}

export function WizardShell({ step, children, onStepClick, footer, stepLabels }: WizardShellProps) {
  const labels = stepLabels || WIZARD_STEPS;
  const progress = ((step + 1) / labels.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-4">
          <div className="hidden sm:block">
            <p className="text-xs font-medium uppercase tracking-widest text-white/50">Quiz Room Studio</p>
            <p className="text-sm font-semibold">{labels[step]}</p>
          </div>
        </div>

        <div className="mx-4 hidden max-w-md flex-1 md:block">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-center text-[10px] text-white/40">
            Step {step + 1} of {labels.length}
          </p>
        </div>

        <Button variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white" asChild>
          <Link to="/instructor/quiz-room" aria-label="Close wizard">
            <X className="h-5 w-5" />
          </Link>
        </Button>
      </header>

      <div className="relative z-10 hidden gap-1 overflow-x-auto border-b border-white/5 px-4 py-2 sm:flex sm:px-8">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            disabled={i > step}
            onClick={() => i < step && onStepClick?.(i)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                  ? "bg-white/10 text-white/80 hover:bg-white/15"
                  : "text-white/30"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="relative z-10 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      {footer && (
        <footer className="relative z-10 border-t border-white/10 bg-white/5 px-4 py-4 backdrop-blur-xl sm:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">{footer}</div>
        </footer>
      )}
    </div>
  );
}
