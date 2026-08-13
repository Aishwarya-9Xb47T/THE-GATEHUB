import { useCallback, useEffect } from "react";
import { LuComponentBuilderPanel } from "@/components/lu-authoring/LuComponentBuilderPanel";
import type { LuExplorerNode, StructureAction } from "@/lib/luAuthoring/types";
import { buildUpdateConfigAction } from "@/lib/luAuthoring/componentSelection";
import { useAutosave, useUndoRedo } from "@/hooks/useUndoRedo";
import { Button } from "@/components/ui/button";
import { Loader2, Redo2, Undo2 } from "lucide-react";
import { isLearningModeVisualEditor } from "@/lib/luAuthoring/componentRegistry";

interface ExperienceComponentEditorProps {
  node: LuExplorerNode | null;
  config: Record<string, unknown> | null;
  onMutate: (action: StructureAction) => Promise<unknown>;
  onRefresh: () => void;
}

export function ExperienceComponentEditor({
  node,
  config,
  onMutate,
  onRefresh,
}: ExperienceComponentEditorProps) {
  const { present: draft, set: setDraft, reset, undo, redo, canUndo, canRedo } = useUndoRedo<Record<string, unknown>>(
    config ?? {}
  );

  useEffect(() => {
    reset(config ?? {});
  }, [node?.id, config, reset]);

  const saveConfig = useCallback(
    async (value: Record<string, unknown>) => {
      if (!node) return;
      const action = buildUpdateConfigAction(node, value);
      if (!action) return;
      await onMutate(action);
      onRefresh();
    },
    [node, onMutate, onRefresh]
  );

  const { saving, lastSaved, error } = useAutosave(draft, saveConfig, 900, Boolean(node?.componentId));

  if (!node?.componentId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-8 text-center">
        Select a learning block to edit its content.
      </div>
    );
  }

  if (!isLearningModeVisualEditor(node.kind)) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-8 text-center">
        This block type is not yet available in the visual editor.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-muted/30">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {node.kind.replace(/-/g, " ")}
          </p>
          <p className="font-medium truncate">{node.title}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={!canUndo} onClick={undo}>
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={!canRedo} onClick={redo}>
            <Redo2 className="w-4 h-4" />
          </Button>
          <span className="text-[10px] text-muted-foreground w-16 text-right">
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin inline" />
            ) : error ? (
              "Error"
            ) : lastSaved ? (
              "Saved"
            ) : (
              "…"
            )}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 [&>div]:h-full [&>div]:bg-background [&>div]:text-foreground">
        <LuComponentBuilderPanel
          node={node}
          config={draft}
          onMutate={async (action) => {
            await onMutate(action);
            onRefresh();
          }}
          onRefresh={onRefresh}
          variant="experience"
          onDraftChange={setDraft}
          hideSaveBar
        />
      </div>
    </div>
  );
}
