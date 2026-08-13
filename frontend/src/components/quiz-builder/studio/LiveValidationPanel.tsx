import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { LiveValidationIssue } from "@/lib/quizBuilder/questionLiveValidation";
import { cn } from "@/lib/utils";

interface LiveValidationPanelProps {
  issues: LiveValidationIssue[];
  className?: string;
}

export function LiveValidationPanel({ issues, className }: LiveValidationPanelProps) {
  if (!issues.length) {
    return (
      <div className={cn("rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400", className)}>
        All checks passed for this question
      </div>
    );
  }

  return (
    <ul className={cn("space-y-1.5", className)} role="list" aria-label="Validation issues">
      {issues.map((issue, i) => (
        <li
          key={`${issue.code}-${i}`}
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
            issue.level === "error" && "border border-destructive/30 bg-destructive/5 text-destructive",
            issue.level === "warning" && "border border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300",
            issue.level === "info" && "border border-border/60 bg-muted/40 text-muted-foreground"
          )}
        >
          {issue.level === "error" && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          {issue.level === "warning" && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          {issue.level === "info" && <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}
