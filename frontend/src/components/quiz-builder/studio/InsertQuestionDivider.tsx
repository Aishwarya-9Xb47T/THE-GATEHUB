import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface InsertQuestionDividerProps {
  onInsert: () => void;
  className?: string;
}

/** Notion-style floating insert between questions */
export function InsertQuestionDivider({ onInsert, className }: InsertQuestionDividerProps) {
  return (
    <div className={cn("group relative flex h-8 items-center justify-center", className)}>
      <div className="absolute inset-x-0 top-1/2 h-px bg-border/0 transition-colors group-hover:bg-border/60" />
      <button
        type="button"
        onClick={onInsert}
        className="relative z-10 flex h-8 w-8 scale-90 items-center justify-center rounded-full border border-dashed border-border/60 bg-background text-muted-foreground opacity-0 shadow-sm transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground group-hover:scale-100 group-hover:opacity-100"
        title="Insert question here"
        aria-label="Insert question here"
      >
        <Plus className="h-4 w-4" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-0.5 text-[10px] text-background opacity-0 transition-opacity group-hover:opacity-100">
        Insert question here
      </span>
    </div>
  );
}
