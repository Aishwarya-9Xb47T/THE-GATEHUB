import { useCallback, useEffect } from "react";
import { ExternalLink, Loader2, Play, RotateCcw, Save, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LearnerExperienceStep } from "../types";
import { WorkspaceShell } from "./WorkspaceShell";
import { GoogleConnectPanel } from "./GoogleConnectPanel";
import { useWorkspacePersistence } from "./hooks/useWorkspacePersistence";
import { useGoogleIntegration } from "./hooks/useGoogleIntegration";
import { useCompanionWorkspace, useResumeCompanionLaunch } from "./hooks/useCompanionWorkspace";
import { NotebookEngineView } from "./notebook-engine/NotebookEngineView";
import { useNotebookEngine } from "./notebook-engine/useNotebookEngine";

function companionEnabled(payload: Record<string, unknown>, key: string): boolean {
  const v = payload[key] ?? payload[`${key}Button`];
  if (v === false || v === "false" || v === 0) return false;
  return true;
}

interface NotebookWorkspaceProps {
  step: LearnerExperienceStep;
  universeId: string;
  lessonId: string;
  onExit: () => void;
  onProgress?: (stepId: string, event: string) => void;
}

export function NotebookWorkspace({ step, universeId, lessonId, onExit, onProgress }: NotebookWorkspaceProps) {
  const { status: googleStatus } = useGoogleIntegration();
  const { openColab, launchingColab, connecting } = useCompanionWorkspace();
  const enableColab = companionEnabled(step.payload, "enableColab");
  const instructorColabUrl = String(step.payload.colabUrl ?? step.payload.colaburl ?? "");

  const engine = useNotebookEngine({ step });

  const { save } = useWorkspacePersistence({
    universeId,
    lessonId,
    stepId: step.id,
    workspaceKind: step.kind === "coding-lab" ? "coding-lab" : "notebook",
    initialPayload: engine.actions.getSerialized(),
    onLoaded: (payload) => {
      engine.actions.loadFromSnapshot(payload);
    },
    autosaveMs: 5000,
  });

  const onSave = useCallback(
    async (payload: Record<string, unknown>) => {
      await save(payload, { syncDrive: googleStatus.connected, label: "Autosave" });
    },
    [save, googleStatus.connected]
  );

  useEffect(() => {
    engine.setOnSave(onSave);
  }, [engine, onSave]);

  const launchColab = useCallback(() => {
    const doc = engine.actions.getSerialized();
    void openColab({
      universeId,
      lessonId,
      stepId: step.id,
      title: step.title,
      cells: (doc.cells as Array<{ type?: string; cellType?: string; source: string }>).map((c) => ({
        id: "",
        type: (c.type ?? c.cellType ?? "code") as "code" | "markdown",
        source: c.source,
      })),
      language: String(doc.language ?? "python"),
      colabUrl: instructorColabUrl || undefined,
      colabDriveFileId: doc.colabDriveFileId ? String(doc.colabDriveFileId) : undefined,
      enableColab,
    }).catch(() => {});
  }, [openColab, universeId, lessonId, step.id, step.title, engine.actions, instructorColabUrl, enableColab]);

  useResumeCompanionLaunch(googleStatus.connected, launchColab);

  const handleRunAll = useCallback(async () => {
    await engine.actions.runAll();
    onProgress?.(step.id, "submit");
  }, [engine.actions, onProgress, step.id]);

  const workspaceBody = (
    <WorkspaceShell
      title={step.title}
      kindLabel={step.kind === "coding-lab" ? "Coding Lab" : "Notebook"}
      onExit={onExit}
      toolbar={
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => void engine.actions.manualSave()}>
            <Save className="w-3.5 h-3.5 mr-1" />
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => engine.actions.reset()}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Reset
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={!engine.canUndo} onClick={() => engine.actions.undo()}>
            Undo
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={!engine.canRedo} onClick={() => engine.actions.redo()}>
            Redo
          </Button>
          <Button type="button" size="sm" className="h-8 text-xs" disabled={engine.runningAll} onClick={() => void handleRunAll()}>
            {engine.runningAll ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Run All
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => engine.actions.interrupt()}>
            <Square className="w-3.5 h-3.5 mr-1" />
            Interrupt
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => engine.actions.restartRuntime()}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Restart
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => engine.actions.clearAllOutputs()}>
            Clear outputs
          </Button>
          {enableColab && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs border-[#f9ab00]/40 text-[#f9ab00] hover:bg-[#f9ab00]/10"
              disabled={launchingColab || connecting}
              onClick={launchColab}
            >
              {launchingColab || connecting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
              Open in Google Colab
            </Button>
          )}
        </div>
      }
      editor={
        <NotebookEngineView
          doc={engine.doc}
          activeCellId={engine.activeCellId}
          store={engine.store}
          updateSourceLive={engine.updateSourceLive}
          commitSource={engine.commitSource}
          actions={engine.actions}
          onSave={() => void engine.actions.manualSave()}
        />
      }
      statusLeft={
        <>
          <span>Runtime: {engine.doc.runtime.status}</span>
          <span>{engine.doc.runtime.kernelLanguage}</span>
          <span>{engine.doc.cells.length} cells</span>
          {engine.lastSaved && <span>Saved {engine.lastSaved.toLocaleTimeString()}</span>}
        </>
      }
      statusRight={googleStatus.connected ? <span>{googleStatus.email ?? "Google Drive synced"}</span> : <span>Local autosave</span>}
    />
  );

  return (
    <GoogleConnectPanel requireGoogle={false} returnTo={window.location.href}>
      {workspaceBody}
    </GoogleConnectPanel>
  );
}
