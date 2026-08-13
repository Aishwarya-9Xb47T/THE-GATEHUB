import { useCallback, useEffect, useMemo } from "react";
import { ExternalLink, Loader2, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LearnerExperienceStep } from "../types";
import { WorkspaceShell } from "./WorkspaceShell";
import { GoogleConnectPanel } from "./GoogleConnectPanel";
import { useWorkspacePersistence } from "./hooks/useWorkspacePersistence";
import { useGoogleIntegration } from "./hooks/useGoogleIntegration";
import { useCompanionWorkspace } from "./hooks/useCompanionWorkspace";
import { ResearchEngineView } from "./research-engine/ResearchEngineView";
import { useResearchEngine } from "./research-engine/useResearchEngine";

function companionEnabled(payload: Record<string, unknown>, key: string): boolean {
  const v = payload[key] ?? payload[`${key}Button`];
  if (v === false || v === "false" || v === 0) return false;
  return true;
}

function colabCellsFromStep(step: LearnerExperienceStep) {
  const sections = (step.payload.sections as Array<{ title?: string; body?: string; content?: string }> | undefined) ?? [];
  const cells: Array<{ type: "code" | "markdown"; source: string }> = [
    {
      type: "markdown",
      source: `# ${step.title}\n\n${String(step.payload.abstract ?? step.payload.instructions ?? "Research paper workspace")}`,
    },
  ];
  for (const section of sections.slice(0, 6)) {
    const title = String(section.title ?? "Section").trim();
    const body = String(section.body ?? section.content ?? "").trim();
    cells.push({ type: "markdown", source: `## ${title}\n\n${body || "Add your analysis notes here."}` });
    cells.push({ type: "code", source: "# Optional: data analysis / experiments for this section\n" });
  }
  if (cells.length === 1) {
    cells.push({ type: "code", source: "# Optional: run experiments to support your research paper\nimport pandas as pd\n" });
  }
  return cells;
}

interface ResearchLatexWorkspaceProps {
  step: LearnerExperienceStep;
  universeId: string;
  lessonId: string;
  onExit: () => void;
  onProgress?: (stepId: string, event: string) => void;
}

export function ResearchLatexWorkspace({ step, universeId, lessonId, onExit, onProgress }: ResearchLatexWorkspaceProps) {
  const { status: googleStatus } = useGoogleIntegration();
  const { openOverleaf, openColab, launchingOverleaf, launchingColab } = useCompanionWorkspace();
  const enableOverleaf = companionEnabled(step.payload, "enableOverleaf");
  const enableColab = companionEnabled(step.payload, "enableColab");
  const instructorOverleafUrl = String(step.payload.overleafUrl ?? step.payload.overleafurl ?? "");
  const instructorColabUrl = String(step.payload.colabUrl ?? step.payload.colaburl ?? "");
  const projectId = useMemo(() => `lu-research-${universeId}-${lessonId}-${step.id}`, [universeId, lessonId, step.id]);

  const engine = useResearchEngine({
    step,
    projectId,
    onCompiled: () => onProgress?.(step.id, "submit"),
  });

  const { save } = useWorkspacePersistence({
    universeId,
    lessonId,
    stepId: step.id,
    workspaceKind: "research",
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

  const workspaceBody = (
    <WorkspaceShell
      title={step.title}
      kindLabel="Research Workspace"
      subtitle="GateHub-native LaTeX workspace · live PDF preview"
      onExit={onExit}
      toolbar={
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => void engine.actions.manualSave()}>
            <Save className="w-3.5 h-3.5 mr-1" />
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={!engine.canUndo} onClick={() => engine.actions.undo()}>
            Undo
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={!engine.canRedo} onClick={() => engine.actions.redo()}>
            Redo
          </Button>
          <Button type="button" size="sm" className="h-8 text-xs" disabled={engine.compiling} onClick={() => void engine.actions.compile()}>
            {engine.compiling ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Compile
          </Button>
          {enableOverleaf && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs border-[#47a248]/40 text-[#47a248] hover:bg-[#47a248]/10"
              disabled={launchingOverleaf}
              onClick={() =>
                void openOverleaf({
                  title: step.title,
                  files: engine.actions.getFilesForOverleaf(),
                  overleafUrl: instructorOverleafUrl || undefined,
                  enableOverleaf,
                })
              }
            >
              {launchingOverleaf ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
              Open in Overleaf
            </Button>
          )}
          {enableColab && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs border-[#f9ab00]/40 text-[#f9ab00] hover:bg-[#f9ab00]/10"
              disabled={launchingColab}
              onClick={() =>
                void openColab({
                  universeId,
                  lessonId,
                  stepId: step.id,
                  title: `${step.title} — Analysis Notebook`,
                  cells: colabCellsFromStep(step).map((c, i) => ({
                    id: `cell-${i}`,
                    type: c.type,
                    source: c.source,
                  })),
                  language: "python",
                  colabUrl: instructorColabUrl || undefined,
                  enableColab,
                })
              }
            >
              {launchingColab ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
              Open in Google Colab
            </Button>
          )}
        </div>
      }
      editor={
        <ResearchEngineView
          doc={engine.doc}
          activeFile={engine.activeFile}
          dirtyFileIds={engine.dirtyFileIds}
          searchQuery={engine.searchQuery}
          replaceQuery={engine.replaceQuery}
          showSearch={engine.showSearch}
          pdfEpoch={engine.pdfEpoch}
          setShowSearch={engine.setShowSearch}
          actions={engine.actions}
          onSave={() => void engine.actions.manualSave()}
        />
      }
      statusLeft={
        <>
          <span>{engine.activeFile?.name ?? "main.tex"}</span>
          <span>{engine.doc.files.length} files</span>
          {engine.lastSaved && <span>Saved {engine.lastSaved.toLocaleTimeString()}</span>}
        </>
      }
      statusRight={googleStatus.connected ? <span>{googleStatus.email}</span> : <span>Local autosave</span>}
    />
  );

  return (
    <GoogleConnectPanel
      requireGoogle={false}
      title="Connect Google for Research Sync"
      description="Optional: connect Google Drive to backup your LaTeX project and restore versions across devices."
      returnTo={window.location.href}
    >
      {workspaceBody}
    </GoogleConnectPanel>
  );
}
