import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Full-viewport focus shell — covers dashboard sidebar/chrome while editing. */
export function QuizAuthoringStudioShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex min-h-0 flex-col bg-background",
        className
      )}
    >
      {children}
    </div>
  );
}
