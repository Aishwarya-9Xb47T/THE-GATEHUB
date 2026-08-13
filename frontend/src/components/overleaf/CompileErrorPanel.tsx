import { AlertCircle, FileCode2, Lightbulb, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LatexCompileError } from "./types";

interface CompileErrorPanelProps {
  errors: LatexCompileError[];
  onGoToError?: (error: LatexCompileError) => void;
  onAutoRepair?: (error: LatexCompileError) => void;
  repairing?: boolean;
  /** @deprecated use onGoToError */
  onGoToLine?: (line: number) => void;
}

function formatFileLabel(file: string): string {
  return file.replace(/^\//, "");
}

export function CompileErrorPanel({ errors, onGoToError, onAutoRepair, repairing, onGoToLine }: CompileErrorPanelProps) {
  if (!errors.length) return null;

  const handleNavigate = (err: LatexCompileError) => {
    if (onGoToError) {
      onGoToError(err);
      return;
    }
    if (err.line != null) onGoToLine?.(err.line);
  };

  return (
    <div className="border-t border-red-900/40 bg-[#1a0606] shrink-0 max-h-[40%] overflow-auto">
      <div className="px-4 py-2 border-b border-red-900/30 bg-[#250d0d] flex items-center gap-2 sticky top-0 z-10">
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-red-200">
          {errors.length}{" "}
          {errors[0]?.type === "VALIDATION_FAILED" || errors.some((e) => e.type?.startsWith("MISSING_"))
            ? "validation"
            : "compilation"}{" "}
          {errors.length === 1 ? "issue" : "issues"}
        </span>
      </div>
      <div className="divide-y divide-red-950/50">
        {errors.map((err, idx) => {
          const isPrimary = idx === 0;
          return (
            <div
              key={`${err.file}-${err.line}-${err.message}-${idx}`}
              className={`px-4 py-3 transition-colors ${isPrimary ? "bg-red-950/30" : "hover:bg-red-950/20"}`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  className="shrink-0 flex flex-col items-center gap-1"
                  onClick={() => handleNavigate(err)}
                  title="Open file at error line"
                  disabled={!err.file && err.line == null}
                >
                  {err.line != null && (
                    <span className="text-[10px] font-mono font-bold bg-red-900/40 text-red-200 px-2 py-0.5 rounded hover:bg-red-800/60">
                      L{err.line}
                    </span>
                  )}
                  {err.file && (
                    <FileCode2 className="w-3.5 h-3.5 text-red-300/80" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  {err.file && (
                    <button
                      type="button"
                      onClick={() => handleNavigate(err)}
                      className="text-[11px] font-mono text-red-200 mb-1 truncate block text-left hover:underline w-full"
                      title={err.file}
                    >
                      {formatFileLabel(err.file)}
                    </button>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {err.type && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-red-400/90">
                        {err.type}
                      </span>
                    )}
                    {err.category && (
                      <span className="text-[9px] font-mono text-red-400/50">{err.category}</span>
                    )}
                    {err.macro && (
                      <span className="text-[10px] font-mono text-amber-300/90 bg-amber-950/40 px-1.5 py-0.5 rounded">
                        {err.macro}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-red-100 font-medium leading-snug">{err.message}</p>
                  {err.suggestedFix && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-200/80">
                      <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                      <span>{err.suggestedFix}</span>
                    </div>
                  )}
                  {err.autoRepairAvailable && onAutoRepair && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 text-[10px] uppercase tracking-wide border-emerald-800 text-emerald-300 hover:bg-emerald-950/40"
                      disabled={repairing}
                      onClick={() => onAutoRepair(err)}
                    >
                      {repairing ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Wrench className="w-3 h-3 mr-1" />
                      )}
                      Auto repair &amp; recompile
                    </Button>
                  )}
                  {err.autoRepairAvailable && !onAutoRepair && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">
                      <Wrench className="w-3 h-3" />
                      Auto repair available
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
