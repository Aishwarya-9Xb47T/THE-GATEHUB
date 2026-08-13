import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface QuizSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Consistent section wrapper for all question-type editors in Quiz Room. */
export function QuizSection({ title, description, action, children, className }: QuizSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
