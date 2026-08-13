import type { LuExplorerNode } from "@/lib/luAuthoring/types";
import { CanonicalContentPreview } from "@/components/visual-authoring/CanonicalContentPreview";
import { useOptionalVisualAssets } from "@/components/visual-authoring/VisualAssetContext";
import { StudioMockPreview } from "./StudioMockPreview";
import { WorkspacePreviewCard } from "./WorkspacePreviewCard";
import type { ProjectAssetFile } from "@/lib/latexEditor/projectAssetResolver";
import { isProjectMediaFile } from "@/lib/latexEditor/projectAssetResolver";
import type { LuContentBlock } from "@/lib/learningUniverseSchema";
import { useEffect, useMemo } from "react";

const WORKSPACE_KINDS = new Set(["coding-lab", "notebook", "project", "research-paper"]);

interface CompiledLessonPreview {
  lessonTitle: string;
  blocks: LuContentBlock[];
  focusComponentId?: string | null;
}

interface ExperienceStudentPreviewProps {
  lessonNode: LuExplorerNode | null;
  selectedComponent?: LuExplorerNode | null;
  activeFilePath?: string;
  courseTitle?: string;
  editorTexContent?: string;
  projectFiles?: ProjectAssetFile[];
  /** Blocks from last successful compile — matches publish/PDF exactly. */
  compiledLessonPreview?: CompiledLessonPreview | null;
  previewStale?: boolean;
}

export function ExperienceStudentPreview({
  lessonNode,
  courseTitle,
  projectFiles = [],
  compiledLessonPreview = null,
  previewStale = false,
}: ExperienceStudentPreviewProps) {
  const visualAssets = useOptionalVisualAssets();

  const setProjectAssets = visualAssets?.setProjectAssets;
  const projectMediaKey = useMemo(() => {
    return projectFiles.filter(isProjectMediaFile).map(f => `${f.path}:${f.s3Url ?? ''}`).join('|');
  }, [projectFiles]);

  useEffect(() => {
    if (!setProjectAssets) return;
    const media = projectFiles.filter(isProjectMediaFile);
    setProjectAssets(
      media.map((f) => ({
        name: f.name,
        path: f.path,
        s3Url: f.s3Url,
      }))
    );
  }, [projectMediaKey, setProjectAssets]);

  if (!lessonNode || lessonNode.kind !== "lesson") {
    return <StudioMockPreview courseTitle={courseTitle ?? "Your Course"} />;
  }

  const children = lessonNode.children ?? [];
  const previewNode = children[0] ?? null;

  if (previewNode && WORKSPACE_KINDS.has(previewNode.kind)) {
    return (
      <div className="h-full flex flex-col bg-gradient-to-b from-muted/30 to-background">
        <div className="px-4 py-3 border-b bg-background/80 backdrop-blur shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Compiled student preview
          </p>
          <h2 className="text-base font-semibold truncate">{lessonNode.title}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <WorkspacePreviewCard node={previewNode} />
        </div>
      </div>
    );
  }

  if (!compiledLessonPreview?.blocks?.length || previewStale) {
    return (
      <div className="h-full flex flex-col bg-gradient-to-b from-muted/30 to-background">
        <div className="px-4 py-3 border-b bg-background/80 backdrop-blur shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Student preview
          </p>
          <h2 className="text-base font-semibold truncate">{lessonNode.title}</h2>
          <p className="text-[10px] text-amber-600 mt-1">
            {previewStale ? "File changed — compile to refresh preview" : "Compile to preview — live TeX parsing is disabled"}
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <StudioMockPreview courseTitle={lessonNode.title} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-muted/30 to-background">
      <div className="px-4 py-3 border-b bg-background/80 backdrop-blur shrink-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Compiled student preview (DocumentRenderer)
        </p>
        <h2 className="text-base font-semibold truncate">
          {compiledLessonPreview.lessonTitle || lessonNode.title}
        </h2>
        <p className="text-[10px] text-muted-foreground mt-1">
          Matches compiled PDF and publish output
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {compiledLessonPreview.blocks.map((block, index) => (
          <div key={`compiled-${index}-${block.type}`} className="ring-2 ring-primary/40 rounded-lg">
            <CanonicalContentPreview block={block} index={index} previewMode />
          </div>
        ))}
      </div>
    </div>
  );
}
