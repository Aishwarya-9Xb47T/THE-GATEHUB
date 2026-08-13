import { BookOpen, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LuModeToggleProps {
  developerMode: boolean;
  onSetDeveloperMode: (enabled: boolean) => void;
  compact?: boolean;
  inline?: boolean;
}

/** Symmetric dual-button mode switch — both modes always visible */
export function LuModeToggle({ developerMode, onSetDeveloperMode, compact, inline }: LuModeToggleProps) {
  const toggle = (
    <div className="flex w-full rounded-md border border-slate-700 overflow-hidden">
        <button
          type="button"
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] uppercase tracking-wide font-semibold transition-colors",
            !developerMode
              ? "bg-primary text-primary-foreground"
              : "bg-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          )}
          onClick={() => onSetDeveloperMode(false)}
          title="Educational object explorer"
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
          <span>Learning</span>
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] uppercase tracking-wide font-semibold border-l border-slate-700 transition-colors",
            developerMode
              ? "bg-primary text-primary-foreground"
              : "bg-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          )}
          onClick={() => onSetDeveloperMode(true)}
          title="Raw project files and compile tools"
        >
          <Code2 className="w-3.5 h-3.5 shrink-0" />
          <span>Developer</span>
        </button>
      </div>
  );

  if (inline) return <div className="w-full">{toggle}</div>;

  return (
    <div
      className={cn(
        "flex shrink-0 border-b border-slate-800 bg-[#252526]",
        compact ? "px-2 py-1.5" : "px-3 py-2"
      )}
    >
      {toggle}
    </div>
  );
}
