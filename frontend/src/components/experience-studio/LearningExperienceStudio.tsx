import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import {
  ArrowLeft,
  Code2,
  Loader2,
  PanelLeft,
  PanelLeftClose,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLuAuthoringState } from "@/hooks/useLuAuthoringState";
import { LuAuthoringPanel } from "@/components/lu-authoring/LuAuthoringPanel";
import type { LuExplorerNode, StructureAction } from "@/lib/luAuthoring/types";
import { saveLuSelectedNodeId } from "@/lib/luAuthoring/storage";
import { LessonExperienceCanvas } from "./LessonExperienceCanvas";
import { ExperienceComponentEditor } from "./ExperienceComponentEditor";
import { ExperienceStudentPreview } from "./ExperienceStudentPreview";
import { StudioMockPreview } from "./StudioMockPreview";
import {
  StudioOnboarding,
  resolveOnboardingStep,
  countCourseStructure,
  type OnboardingStep,
} from "./StudioOnboarding";
import { StudioPickLesson, collectAllLessons, findFirstLesson } from "./StudioPickLesson";
import { publishLearningUniverse } from "@/lib/api";
import { useToastStore } from "@/store/toastStore";

function findNodeById(nodes: LuExplorerNode[], id: string): LuExplorerNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findLessonForComponent(nodes: LuExplorerNode[], componentId: string): LuExplorerNode | null {
  const walk = (list: LuExplorerNode[]): LuExplorerNode | null => {
    for (const n of list) {
      if (n.kind === "lesson" && n.children?.some((c) => c.componentId === componentId)) return n;
      if (n.children) {
        const found = walk(n.children);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(nodes);
}

function firstTrack(nodes: LuExplorerNode[]) {
  return nodes[0]?.children?.find((c) => c.kind === "track");
}

function firstModule(track: LuExplorerNode | undefined) {
  return track?.children?.find((c) => c.kind === "module");
}

interface LearningExperienceStudioProps {
  projectId: string;
  universeId?: string;
  onOpenDeveloperStudio: () => void;
}

export function LearningExperienceStudio({
  projectId,
  universeId,
  onOpenDeveloperStudio,
}: LearningExperienceStudioProps) {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.add);
  const { state, loading, error, refresh, mutate } = useLuAuthoringState(projectId, true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showExplorer, setShowExplorer] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [canvasMode, setCanvasMode] = useState<"blocks" | "editor">("blocks");
  const [actionLoading, setActionLoading] = useState(false);

  const selectedNode = useMemo(() => {
    if (!state?.explorer.length) return null;
    if (selectedNodeId) return findNodeById(state.explorer, selectedNodeId);
    return null;
  }, [state?.explorer, selectedNodeId]);

  const lessonNode = useMemo(() => {
    if (!state?.explorer.length) return null;
    if (selectedNode?.kind === "lesson") return selectedNode;
    if (selectedNode?.lessonId && selectedNode.componentId) {
      return findLessonForComponent(state.explorer, selectedNode.componentId);
    }
    return null;
  }, [selectedNode, state?.explorer]);

  const selectedComponent = useMemo(() => {
    if (!selectedNode?.componentId) return null;
    return selectedNode;
  }, [selectedNode]);

  const structure = useMemo(() => countCourseStructure(state), [state]);
  const onboardingStep = useMemo(() => resolveOnboardingStep(state), [state]);
  const allLessons = useMemo(() => (state ? collectAllLessons(state.explorer) : []), [state]);

  const needsOnboarding =
    structure.tracks === 0 || structure.modules === 0 || structure.lessons === 0;

  const handleSelectNode = useCallback(
    (node: LuExplorerNode) => {
      setSelectedNodeId(node.id);
      saveLuSelectedNodeId(projectId, node.id);
      if (node.kind === "lesson") setCanvasMode("blocks");
      else if (node.componentId) setCanvasMode("editor");
    },
    [projectId]
  );

  const handleMutate = useCallback(
    async (action: StructureAction) => {
      const result = await mutate(action);
      await refresh();
      return result;
    },
    [mutate, refresh]
  );

  // Auto-select first lesson when course has content
  useEffect(() => {
    if (!state?.explorer.length || selectedNodeId || needsOnboarding) return;
    const first = findFirstLesson(state.explorer);
    if (first) handleSelectNode(first);
  }, [state?.explorer, selectedNodeId, needsOnboarding, handleSelectNode]);

  useEffect(() => {
    const onSelect = (e: Event) => {
      const detail = (e as CustomEvent<{ node: LuExplorerNode }>).detail;
      if (detail?.node) handleSelectNode(detail.node);
    };
    window.addEventListener("lu-component-selected", onSelect);
    return () => window.removeEventListener("lu-component-selected", onSelect);
  }, [handleSelectNode]);

  const runAction = async (fn: () => Promise<void>) => {
    setActionLoading(true);
    try {
      await fn();
    } finally {
      setActionLoading(false);
    }
  };

  const createTrack = () =>
    runAction(async () => {
      await handleMutate({
        action: "createTrack",
        title: "Getting Started",
        description: "Your first learning path",
      });
    });

  const createModule = () =>
    runAction(async () => {
      const track = firstTrack(state?.explorer ?? []);
      if (!track?.trackId) return;
      await handleMutate({
        action: "createModule",
        trackId: track.trackId,
        title: "Module 1",
        description: "Introduction module",
      });
    });

  const createLesson = () =>
    runAction(async () => {
      const track = firstTrack(state?.explorer ?? []);
      const mod = firstModule(track);
      if (!track?.trackId || !mod?.moduleId) return;
      const result = await handleMutate({
        action: "createLesson",
        trackId: track.trackId,
        moduleId: mod.moduleId,
        title: "Lesson 1",
      });
      const lessonId = (result as { createdFilePath?: string })?.createdFilePath?.replace(/.*\//, "").replace(/\.tex$/i, "");
      if (lessonId && track.trackId && mod.moduleId) {
        handleSelectNode({
          id: `${track.trackId}-${mod.moduleId}-${lessonId}`,
          kind: "lesson",
          title: "Lesson 1",
          trackId: track.trackId,
          moduleId: mod.moduleId,
          lessonId,
          status: "empty",
          issues: [],
        });
      }
    });

  const addOverview = () =>
    runAction(async () => {
      const lesson = lessonNode ?? findFirstLesson(state?.explorer ?? []);
      if (!lesson?.trackId || !lesson.moduleId || !lesson.lessonId) return;
      const result = await handleMutate({
        action: "appendLessonBlock",
        trackId: lesson.trackId,
        moduleId: lesson.moduleId,
        lessonId: lesson.lessonId,
        block: "overview",
      });
      handleSelectNode(lesson);
      const createdId = (result as { createdComponentId?: string })?.createdComponentId;
      if (createdId) setCanvasMode("editor");
    });

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const res = await publishLearningUniverse("", projectId, universeId);
      if (res.error) throw new Error(res.error);
      addToast({ title: "Published!", description: "Your course is live for students.", variant: "success" });
      const published = (res.data as { data?: { id?: string } })?.data ?? res.data;
      const id = (published as { id?: string })?.id;
      if (id) navigate(`/instructor/preview/learning-universe/${id}/learn`);
    } catch (err: any) {
      addToast({
        title: "Publish failed",
        description: err instanceof Error ? err.message : "Could not publish",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const title = state?.project?.metadata?.title || state?.project?.universe?.title || "Learning Universe";

  const renderCenter = () => {
    if (loading && !state) {
      return (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }

    if (error && !state) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-destructive font-medium">Could not load your course</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button type="button" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      );
    }

    if (needsOnboarding) {
      const step: OnboardingStep =
        structure.tracks === 0 ? "welcome" : structure.modules === 0 ? "module" : "lesson";
      return (
        <StudioOnboarding
          step={step}
          courseTitle={title}
          onCreateTrack={createTrack}
          onCreateModule={createModule}
          onCreateLesson={createLesson}
          onAddOverview={addOverview}
          loading={actionLoading}
        />
      );
    }

    if (canvasMode === "editor" && selectedComponent) {
      return (
        <ExperienceComponentEditor
          node={selectedComponent}
          config={selectedComponent.config ?? null}
          onMutate={handleMutate}
          onRefresh={() => void refresh()}
        />
      );
    }

    if (lessonNode) {
      return (
        <LessonExperienceCanvas
          lessonNode={lessonNode}
          selectedComponentId={selectedComponent?.componentId ?? null}
          onSelectComponent={(node) => {
            handleSelectNode(node);
            setCanvasMode("editor");
          }}
          onMutate={handleMutate}
        />
      );
    }

    if (allLessons.length > 0) {
      return <StudioPickLesson lessons={allLessons} onSelect={handleSelectNode} />;
    }

    return (
      <StudioOnboarding
        step="blocks"
        courseTitle={title}
        onCreateTrack={createTrack}
        onCreateModule={createModule}
        onCreateLesson={createLesson}
        onAddOverview={addOverview}
        loading={actionLoading}
      />
    );
  };

  return (
    <div className="h-full w-full flex flex-col bg-background text-foreground">
      <header className="h-14 border-b flex items-center justify-between px-4 shrink-0 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 md:hidden" onClick={() => setShowExplorer((v) => !v)}>
            {showExplorer ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </Button>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Learning Experience Studio</p>
            <p className="text-base font-semibold truncate">{title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button type="button" size="sm" variant="ghost" className="h-9 text-muted-foreground hidden lg:flex" onClick={onOpenDeveloperStudio}>
            <Code2 className="w-4 h-4 mr-1.5" />
            Advanced
          </Button>
          <Button type="button" size="sm" className="h-9 gap-1.5 px-4" onClick={() => void handlePublish()} disabled={isPublishing || needsOnboarding}>
            {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            Publish
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 relative">
        <PanelGroup orientation="horizontal" className="h-full">
          {showExplorer && (
            <>
              <Panel defaultSize={28} minSize={24} maxSize={40} className="min-w-[280px]">
                <LuAuthoringPanel
                  projectId={projectId}
                  state={state}
                  loading={loading}
                  error={error}
                  developerMode={false}
                  onSetDeveloperMode={() => onOpenDeveloperStudio()}
                  onRefresh={() => void refresh()}
                  onMutate={handleMutate}
                  onOpenFile={async () => {}}
                  experienceStudioMode
                  onSelectNode={handleSelectNode}
                />
              </Panel>
              <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/40 transition-colors" />
            </>
          )}

          <Panel defaultSize={showPreview ? 44 : 72} minSize={35}>
            <div className="h-full flex flex-col bg-background">
              {renderCenter()}
              {selectedComponent && lessonNode && (
                <div className="border-t px-4 py-2 flex gap-2 shrink-0 bg-card">
                  <Button
                    type="button"
                    size="sm"
                    variant={canvasMode === "blocks" ? "default" : "outline"}
                    onClick={() => setCanvasMode("blocks")}
                  >
                    Lesson blocks
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={canvasMode === "editor" ? "default" : "outline"}
                    onClick={() => setCanvasMode("editor")}
                  >
                    Edit: {selectedComponent.title}
                  </Button>
                </div>
              )}
            </div>
          </Panel>

          {showPreview && (
            <>
              <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/40 transition-colors" />
              <Panel defaultSize={28} minSize={22} maxSize={40} className="min-w-[240px]">
                {lessonNode ? (
                  <ExperienceStudentPreview lessonNode={lessonNode} selectedComponent={selectedComponent} />
                ) : (
                  <StudioMockPreview courseTitle={title} />
                )}
              </Panel>
            </>
          )}
        </PanelGroup>

        {!showPreview && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute bottom-4 right-4 shadow-lg z-20"
            onClick={() => setShowPreview(true)}
          >
            Show student preview
          </Button>
        )}
      </div>
    </div>
  );
}
