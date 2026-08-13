import { History, RotateCcw } from "lucide-react";
import { useAiAssessmentStore } from "@/lib/aiAssessmentStudio/store";
import { Button } from "@/components/ui/button";

export function AiVersionPanel() {
  const versions = useAiAssessmentStore((s) => s.versions);
  const restoreVersion = useAiAssessmentStore((s) => s.restoreVersion);
  const undo = useAiAssessmentStore((s) => s.undo);
  const redo = useAiAssessmentStore((s) => s.redo);
  const undoStack = useAiAssessmentStore((s) => s.undoStack);
  const redoStack = useAiAssessmentStore((s) => s.redoStack);

  if (versions.length <= 1) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <History className="h-3.5 w-3.5" />
          Version history
        </h4>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!undoStack.length} onClick={undo}>
            Undo
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!redoStack.length} onClick={redo}>
            Redo
          </Button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {versions.map((v, i) => (
          <button
            key={v.id}
            type="button"
            onClick={() => restoreVersion(v.id)}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:border-primary/40"
          >
            <p className="text-xs font-medium text-white">v{i + 1}</p>
            <p className="max-w-[120px] truncate text-[10px] text-white/45">{v.action}</p>
            <p className="text-[10px] text-white/30">{new Date(v.createdAt).toLocaleTimeString()}</p>
          </button>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10px] text-white/35">
        <RotateCcw className="h-3 w-3" />
        Every AI edit is reversible via Undo or version restore.
      </p>
    </div>
  );
}
