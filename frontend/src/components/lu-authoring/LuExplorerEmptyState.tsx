import { Button } from "@/components/ui/button";
import type { LuExplorerNode } from "@/lib/luAuthoring/types";

interface LuExplorerEmptyStateProps {
  node: LuExplorerNode;
  onAction: (action: string) => void;
}

export function LuExplorerEmptyState({ node, onAction }: LuExplorerEmptyStateProps) {
  if (node.kind === "track" && (!node.children || node.children.length === 0)) {
    return (
      <div className="px-3 py-2 ml-6 text-xs text-slate-500 border-l border-slate-800">
        <p className="mb-2">No modules yet.</p>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction("new-module")}>
          Create your first module
        </Button>
      </div>
    );
  }

  if (node.kind === "module") {
    const lessons = node.children?.filter((c) => c.kind === "lesson") || [];
    if (lessons.length === 0) {
      return (
        <div className="px-3 py-2 ml-6 text-xs text-slate-500 border-l border-slate-800">
          <p className="mb-2">No lessons yet.</p>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAction("new-lesson")}>
            Create your first lesson
          </Button>
        </div>
      );
    }
  }

  return null;
}
