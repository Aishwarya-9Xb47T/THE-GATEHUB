import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { LearnerExperienceStep } from "../types";

const NotebookWorkspace = lazy(() =>
  import("./NotebookWorkspace").then((m) => ({ default: m.NotebookWorkspace }))
);
const ResearchLatexWorkspace = lazy(() =>
  import("./ResearchLatexWorkspace").then((m) => ({ default: m.ResearchLatexWorkspace }))
);
const ProjectWorkspacePanel = lazy(() =>
  import("./ProjectWorkspacePanel").then((m) => ({ default: m.ProjectWorkspacePanel }))
);

export interface WorkspaceHostProps {
  step: LearnerExperienceStep;
  universeId: string;
  lessonId: string;
  publishVersionId?: string;
  onExit: () => void;
  onProgress?: (stepId: string, event: string) => void;
}

function WorkspaceFallback() {
  return (
    <div className="flex flex-1 items-center justify-center min-h-[240px] text-muted-foreground" role="status">
      <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden />
      <span className="sr-only">Loading workspace</span>
    </div>
  );
}

export function WorkspaceHost({ step, universeId, lessonId, publishVersionId, onExit, onProgress }: WorkspaceHostProps) {
  let panel = null;
  switch (step.kind) {
    case "coding-lab":
    case "notebook":
      panel = (
        <NotebookWorkspace
          step={step}
          universeId={universeId}
          lessonId={lessonId}
          onExit={onExit}
          onProgress={onProgress}
        />
      );
      break;
    case "research":
      panel = (
        <ResearchLatexWorkspace
          step={step}
          universeId={universeId}
          lessonId={lessonId}
          onExit={onExit}
          onProgress={onProgress}
        />
      );
      break;
    case "project":
      panel = (
        <ProjectWorkspacePanel
          step={step}
          universeId={universeId}
          lessonId={lessonId}
          onExit={onExit}
          onProgress={onProgress}
        />
      );
      break;
    default:
      return null;
  }

  return <Suspense fallback={<WorkspaceFallback />}>{panel}</Suspense>;
}
