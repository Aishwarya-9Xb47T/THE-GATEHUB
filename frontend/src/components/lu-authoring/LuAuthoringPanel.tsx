import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Loader2,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NODE_ICONS, STATUS_DOT, STATUS_CLASS } from "@/lib/luAuthoring/nodeMeta";
import type { LuExplorerNode, LuAuthoringState, StructureAction } from "@/lib/luAuthoring/types";
import {
  loadLuExplorerExpanded,
  saveLuExplorerExpanded,
  loadLuSelectedNodeId,
  saveLuSelectedNodeId,
} from "@/lib/luAuthoring/storage";
import type { LessonSection } from "@/lib/luAuthoring/lessonSections";
import { LESSON_SECTION_TO_BLOCK } from "@/lib/luAuthoring/lessonSections";
import {
  canDeleteExplorerNode,
  executeMenuItem,
  explorerDeleteMenuId,
  getAddMenuItems,
  type LuMenuHandlers,
} from "@/lib/luAuthoring/luExplorerMenu";
import { isComponentKind } from "@/lib/luAuthoring/componentNavigation";
import { dispatchComponentSelected } from "@/lib/luAuthoring/componentSelection";
import { dispatchFocusComponent } from "@/lib/luAuthoring/componentNavigation";
import { findParentQuizNode } from "@/lib/luAuthoring/explorerUtils";
import {
  collectExpandableNodeIds,
  copyExplorerNode,
  peekExplorerClipboard,
} from "@/lib/luAuthoring/luExplorerClipboard";
import { duplicateExplorerNode } from "@/lib/luAuthoring/luExplorerKeyboard";
import {
  isLuExplorerFocused,
  isTextEditorEventTarget,
  isTextEditorFocused,
} from "@/lib/latexEditor/editorFocus";
import {
  buildExplorerReorderActions,
  findExplorerNode,
  findExplorerParent,
  isExplorerDraggable,
  sortableNodeId,
} from "@/lib/luAuthoring/luExplorerDnD";
import { isLearningModeVisualEditor, COMPONENT_MENU_ITEMS } from "@/lib/luAuthoring/componentRegistry";
import { useToastStore } from "@/store/toastStore";
import { LuWizardDialog, type WizardType } from "./LuWizardDialog";
import { LuContextMenu } from "./LuContextMenu";
import { LuModeToggle } from "./LuModeToggle";
import { LuAddMenu } from "./LuAddMenu";
import { LuExplorerEmptyState } from "./LuExplorerEmptyState";
import { LuRenameDialog, LuPropertiesDialog } from "./LuDialogs";

interface LuAuthoringPanelProps {
  projectId: string;
  state: LuAuthoringState | null;
  loading: boolean;
  error?: string | null;
  developerMode: boolean;
  onSetDeveloperMode: (enabled: boolean) => void;
  onRefresh: () => void;
  onMutate: (action: StructureAction) => Promise<{ createdFilePath?: string; createdComponentId?: string } | void>;
  onOpenFile: (filePath: string) => void | Promise<void>;
  activeFilePath?: string | null;
  experienceStudioMode?: boolean;
  onSelectNode?: (node: LuExplorerNode) => void;
}

function ancestorExpandIds(node: LuExplorerNode): string[] {
  const ids = ["universe"];
  if (node.trackId) ids.push(node.trackId);
  if (node.trackId && node.moduleId) ids.push(`${node.trackId}-${node.moduleId}`);
  if (node.trackId && node.moduleId && node.lessonId) {
    ids.push(`${node.trackId}-${node.moduleId}-${node.lessonId}`);
  }
  return ids;
}

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

function findNodeByComponentId(nodes: LuExplorerNode[], componentId: string): LuExplorerNode | null {
  for (const n of nodes) {
    if (n.componentId === componentId) return n;
    if (n.children) {
      const found = findNodeByComponentId(n.children, componentId);
      if (found) return found;
    }
  }
  return null;
}

export function LuAuthoringPanel({
  projectId,
  state,
  loading,
  error,
  developerMode,
  onSetDeveloperMode,
  onRefresh,
  onMutate,
  onOpenFile,
  activeFilePath,
  experienceStudioMode = false,
  onSelectNode,
}: LuAuthoringPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => loadLuExplorerExpanded(projectId));
  const [selectedId, setSelectedId] = useState<string | null>(() => loadLuSelectedNodeId(projectId));
  const [wizard, setWizard] = useState<WizardType | null>(null);
  const [wizardCtx, setWizardCtx] = useState<Partial<LuExplorerNode>>({});
  const [contextNode, setContextNode] = useState<LuExplorerNode | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const [renameNode, setRenameNode] = useState<LuExplorerNode | null>(null);
  const [propertiesNode, setPropertiesNode] = useState<LuExplorerNode | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const explorerRootRef = useRef<HTMLDivElement>(null);
  const toast = useToastStore((s) => s.add);

  const selectedNode = useMemo(() => {
    if (!state?.explorer.length || !selectedId) return state?.explorer[0] || null;
    return findNodeById(state.explorer, selectedId) || state.explorer[0];
  }, [state?.explorer, selectedId]);

  const selectNode = useCallback(
    (node: LuExplorerNode) => {
      setSelectedId(node.id);
      saveLuSelectedNodeId(projectId, node.id);
      explorerRootRef.current?.focus({ preventScroll: true });
    },
    [projectId]
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveLuExplorerExpanded(projectId, next);
      return next;
    });
  };

  const expandNodes = (...ids: (string | undefined)[]) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (id) next.add(id);
      }
      next.add("universe");
      saveLuExplorerExpanded(projectId, next);
      return next;
    });
  };

  const runMutate = async (action: StructureAction) => {
    try {
      const result = await onMutate(action);
      onRefresh();
      return result;
    } catch (err: any) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Could not update project structure",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleOpenComponent = useCallback(
    async (node: LuExplorerNode) => {
      selectNode(node);
      expandNodes(...ancestorExpandIds(node));

      if (node.kind === "question" && state?.explorer?.length) {
        const quizNode = findParentQuizNode(state.explorer, node);
        if (quizNode) {
          if (!experienceStudioMode && node.filePath) await onOpenFile(node.filePath);
          dispatchComponentSelected(quizNode, quizNode.config, node.componentId);
          return;
        }
      }

      if (experienceStudioMode) {
        onSelectNode?.(node);
        if (isLearningModeVisualEditor(node.kind)) {
          dispatchComponentSelected(node, node.config);
        }
        return;
      }
      if (isLearningModeVisualEditor(node.kind)) {
        if (node.filePath) await onOpenFile(node.filePath);
        dispatchComponentSelected(node, node.config);
        if (node.componentId && !node.filePath?.includes(`/${node.componentId}.tex`) && !node.filePath?.endsWith(`/${node.kind}.tex`)) {
          dispatchFocusComponent(node.componentId, node.filePath);
        }
        return;
      }
      if (node.filePath) await onOpenFile(node.filePath);
    },
    [experienceStudioMode, onOpenFile, onSelectNode, selectNode, state?.explorer]
  );

  const openVisualNode = useCallback(
    (node: LuExplorerNode, componentId: string, path: string, kind: LuExplorerNode["kind"], title?: string) => {
      dispatchComponentSelected({
        id: `${node.trackId}-${node.moduleId}-${node.lessonId}-${componentId}`,
        kind,
        title: title ?? kind,
        trackId: node.trackId,
        moduleId: node.moduleId,
        lessonId: node.lessonId,
        componentId,
        filePath: path,
        status: "empty",
        issues: [],
      });
    },
    []
  );

  const handleAddComponent = useCallback(
    async (node: LuExplorerNode, section: LessonSection) => {
      if (!node.trackId || !node.moduleId || !node.lessonId) return;
      const block = LESSON_SECTION_TO_BLOCK[section] as import("@/lib/luAuthoring/types").LuLessonComponentKind;
      const result = await runMutate({
        action: "appendLessonBlock",
        trackId: node.trackId,
        moduleId: node.moduleId,
        lessonId: node.lessonId,
        block,
      });
      const path = result?.createdFilePath || node.filePath;
      if (!experienceStudioMode && path) await onOpenFile(path);
      if (result?.createdComponentId) {
        const label = COMPONENT_MENU_ITEMS.find((m) => m.block === block)?.label ?? block;
        const childNode: LuExplorerNode = {
          id: `${node.trackId}-${node.moduleId}-${node.lessonId}-${result.createdComponentId}`,
          kind: block,
          title: label,
          trackId: node.trackId,
          moduleId: node.moduleId,
          lessonId: node.lessonId,
          componentId: result.createdComponentId,
          filePath: result.createdFilePath,
          status: "empty",
          issues: [],
        };
        if (experienceStudioMode) {
          onSelectNode?.(childNode);
          dispatchComponentSelected(childNode);
        } else if (result.createdFilePath) {
          await onOpenFile(result.createdFilePath);
          dispatchComponentSelected(childNode);
        } else if (path) {
          openVisualNode(node, result.createdComponentId, path, block, label);
        }
      }
    },
    [experienceStudioMode, onOpenFile, onSelectNode, openVisualNode]
  );

  const openWizard = (type: WizardType, node?: LuExplorerNode) => {
    setWizard(type);
    setWizardCtx(node || selectedNode || {});
    setContextPos(null);
  };

  const menuHandlers: LuMenuHandlers = useMemo(
    () => ({
      onWizard: openWizard,
      onAction: async (action) => {
        const result = await runMutate(action);
        if (
          result?.createdComponentId &&
          (action.action === "appendQuizQuestion" ||
            action.action === "addQuizQuestion" ||
            action.action === "addResourceItem")
        ) {
          const path = result.createdFilePath || "";
          const kind: LuExplorerNode["kind"] =
            action.action === "addResourceItem" ? "resource-item" : "question";
          const quizId =
            action.action === "addQuizQuestion"
              ? action.quizId
              : action.action === "appendQuizQuestion"
                ? action.quizComponentId
                : undefined;
          if (quizId && (action.action === "addQuizQuestion" || action.action === "appendQuizQuestion")) {
            const quizNode = findNodeByComponentId(state?.explorer ?? [], quizId);
            if (quizNode) {
              dispatchComponentSelected(quizNode, quizNode.config, result.createdComponentId);
              if (result.createdFilePath) await onOpenFile(result.createdFilePath);
              return;
            }
          }
          const title = action.title ?? (kind === "question" ? "Question" : "Resource");
          openVisualNode(
            {
              id: `${action.trackId}-${action.moduleId}-${action.lessonId}`,
              kind: "lesson",
              title: "",
              trackId: action.trackId,
              moduleId: action.moduleId,
              lessonId: action.lessonId,
              filePath: path,
              status: "draft",
              issues: [],
            },
            result.createdComponentId,
            path,
            kind,
            title
          );
          if (path) await onOpenFile(path);
        }
      },
      onOpenFile,
      onOpenComponent: handleOpenComponent,
      onAddComponent: (node, section) => void handleAddComponent(node, section),
      onRename: setRenameNode,
      onProperties: setPropertiesNode,
      onImportTrack: () => importInputRef.current?.click(),
    }),
    [handleAddComponent, handleOpenComponent, onOpenFile, state?.explorer]
  );

  const expandAll = useCallback(() => {
    if (!state?.explorer?.length) return;
    const ids = collectExpandableNodeIds(state.explorer);
    const next = new Set(ids);
    setExpanded(next);
    saveLuExplorerExpanded(projectId, next);
  }, [state?.explorer, projectId]);

  const collapseAll = useCallback(() => {
    const next = new Set<string>();
    setExpanded(next);
    saveLuExplorerExpanded(projectId, next);
  }, [projectId]);

  const explorerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleExplorerDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!state?.explorer?.length) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeNode = findExplorerNode(state.explorer, String(active.id));
      const overNode = findExplorerNode(state.explorer, String(over.id));
      if (!activeNode || !overNode) return;

      const parent = findExplorerParent(state.explorer, activeNode.id);
      const overParent = findExplorerParent(state.explorer, overNode.id);
      if (!parent || parent.id !== overParent?.id) {
        toast({
          title: "Invalid drop target",
          description: "Items can be reordered only within the same section.",
          variant: "destructive",
        });
        return;
      }

      const actions = buildExplorerReorderActions(activeNode, overNode, parent);
      if (!actions.length) return;

      try {
        for (const action of actions) {
          await onMutate(action);
        }
        onRefresh();
      } catch (err: any) {
        toast({
          title: "Reorder failed",
          description: err instanceof Error ? err.message : "Could not reorder items",
          variant: "destructive",
        });
      }
    },
    [state?.explorer, onMutate, onRefresh, toast]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedNode || developerMode) return;
      // Never intercept typing or clipboard inside Monaco, inputs, or textareas
      if (isTextEditorFocused() || isTextEditorEventTarget(e.target)) return;
      // Structure shortcuts (copy/paste duplicate, delete, rename) only in the explorer sidebar
      if (!isLuExplorerFocused()) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copyExplorerNode(selectedNode);
        toast({ title: "Copied", description: selectedNode.title, variant: "success" });
        return;
      }

      if (mod && e.key.toLowerCase() === "v") {
        const clip = peekExplorerClipboard();
        if (!clip) return;
        e.preventDefault();
        duplicateExplorerNode(clip, menuHandlers);
        toast({ title: "Pasted duplicate", description: clip.title, variant: "success" });
        return;
      }

      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateExplorerNode(selectedNode, menuHandlers);
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        if (
          selectedNode.kind === "track" ||
          selectedNode.kind === "module" ||
          selectedNode.kind === "lesson" ||
          selectedNode.componentId
        ) {
          setRenameNode(selectedNode);
        }
        return;
      }

      if (e.key === "Delete") {
        e.preventDefault();
        if (selectedNode.kind === "track" || selectedNode.kind === "module" || selectedNode.kind === "lesson") {
          executeMenuItem("delete", selectedNode, menuHandlers);
        } else if (selectedNode.componentId) {
          executeMenuItem("delete-component", selectedNode, menuHandlers);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNode, developerMode, menuHandlers, toast]);

  const handleWizardSubmit = async (data: Record<string, string>) => {
    if (!wizard) return;
    let action: StructureAction | null = null;
    const ctx = wizardCtx;
    switch (wizard) {
      case "track":
        action = { action: "createTrack", title: data.title, description: data.description };
        break;
      case "module":
        action = {
          action: "createModule",
          trackId: ctx.trackId!,
          title: data.title,
          description: data.description,
        };
        break;
      case "lesson":
        action = {
          action: "createLesson",
          trackId: ctx.trackId!,
          moduleId: ctx.moduleId!,
          title: data.title,
        };
        break;
    }
    if (action) {
      const result = await runMutate(action);
      expandNodes(...ancestorExpandIds({ ...ctx, id: ctx.id || "universe", kind: ctx.kind || "universe", title: ctx.title || "", status: "draft", issues: [] }));
      if (wizard === "lesson" && result?.createdFilePath && ctx.trackId && ctx.moduleId) {
        const lessonId = result.createdFilePath.replace(/^.*\//, "").replace(/\.tex$/i, "");
        if (lessonId) {
          selectNode({
            id: `${ctx.trackId}-${ctx.moduleId}-${lessonId}`,
            kind: "lesson",
            title: data.title,
            trackId: ctx.trackId,
            moduleId: ctx.moduleId,
            lessonId,
            filePath: result.createdFilePath,
            status: "empty",
            issues: [],
          });
          if (result.createdFilePath) await onOpenFile(result.createdFilePath);
        }
      } else if (result?.createdFilePath && wizard !== "lesson") {
        onOpenFile(result.createdFilePath);
      }
    }
    setWizard(null);
  };

  const handleRename = async (title: string) => {
    if (!renameNode) return;
    let action: StructureAction | null = null;
    if (renameNode.kind === "track") {
      action = { action: "renameTrack", trackId: renameNode.trackId!, title };
    } else if (renameNode.kind === "module") {
      action = { action: "renameModule", trackId: renameNode.trackId!, moduleId: renameNode.moduleId!, title };
    } else if (renameNode.kind === "lesson") {
      action = { action: "renameLesson", trackId: renameNode.trackId!, moduleId: renameNode.moduleId!, lessonId: renameNode.lessonId!, title };
    } else if (renameNode.componentId && renameNode.trackId && renameNode.moduleId && renameNode.lessonId) {
      action = {
        action: "renameComponent",
        trackId: renameNode.trackId,
        moduleId: renameNode.moduleId,
        lessonId: renameNode.lessonId,
        componentId: renameNode.componentId,
        title,
      };
    }
    if (action) await runMutate(action);
    setRenameNode(null);
  };

  const handleImportTrack = async (file: File) => {
    const tex = await file.text();
    const result = await runMutate({ action: "importTrack", texContent: tex });
    if (result?.createdFilePath) onOpenFile(result.createdFilePath);
  };

  useEffect(() => {
    setExpanded(loadLuExplorerExpanded(projectId));
    const stored = loadLuSelectedNodeId(projectId);
    if (stored) setSelectedId(stored);
  }, [projectId]);

  useEffect(() => {
    if (!state?.explorer.length || !selectedId) return;
    if (!findNodeById(state.explorer, selectedId)) {
      setSelectedId(null);
      saveLuSelectedNodeId(projectId, null);
    }
  }, [state?.explorer, selectedId, projectId]);

  if (error && !state) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm font-medium text-slate-200">Failed to load Learning Universe Explorer</p>
        <p className="text-xs text-slate-400 max-w-[220px]">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
          Retry
        </Button>
      </div>
    );
  }

  if (loading && !state) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-xs">Loading explorer…</p>
      </div>
    );
  }

  if (!state?.isV2) {
    if (error) {
      return (
        <div className="h-full flex flex-col">
          {!experienceStudioMode && (
            <LuModeToggle developerMode={developerMode} onSetDeveloperMode={onSetDeveloperMode} compact />
          )}
          <div className="p-6 text-sm flex-1 flex flex-col items-center justify-center text-center gap-3">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="font-medium text-foreground">Learning Universe not ready</p>
            <p className="text-xs text-muted-foreground max-w-[240px]">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
              Retry setup
            </Button>
            {!experienceStudioMode && (
              <p className="text-xs text-muted-foreground">Or switch to Developer Mode to inspect main.tex</p>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col">
        {!experienceStudioMode && (
          <LuModeToggle developerMode={developerMode} onSetDeveloperMode={onSetDeveloperMode} compact />
        )}
        <div className="p-6 text-sm text-muted-foreground space-y-3 flex-1 text-center">
          <p className="font-medium text-foreground">Preparing your course…</p>
          <p className="text-xs">This usually takes a few seconds.</p>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
          {!experienceStudioMode && (
            <p className="text-xs">Or switch to Developer Mode for advanced access.</p>
          )}
        </div>
      </div>
    );
  }

  const p = state.progress;
  const h = state.health;
  const universe = state.explorer[0];
  const hasTracks = universe?.children && universe.children.length > 0;

  return (
    <div
      ref={explorerRootRef}
      data-lu-explorer
      tabIndex={-1}
      className={cn(
        "h-full flex flex-col text-sm overflow-hidden min-w-[260px] outline-none",
        experienceStudioMode ? "bg-card text-foreground border-r" : "bg-[#181818] text-slate-200"
      )}
    >
      {!experienceStudioMode && (
        <LuModeToggle developerMode={developerMode} onSetDeveloperMode={onSetDeveloperMode} compact />
      )}

      <input
        ref={importInputRef}
        type="file"
        accept=".tex"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportTrack(f);
          e.target.value = "";
        }}
      />

      {experienceStudioMode ? (
        <div className="p-4 border-b border-border bg-card shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Course outline</p>
          <p className="font-semibold text-foreground truncate text-sm">
            {state.project?.universe.title || state.project?.metadata.title}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {p.tracks} {p.tracks === 1 ? "track" : "tracks"} · {p.modules} {p.modules === 1 ? "module" : "modules"} · {p.lessons} {p.lessons === 1 ? "lesson" : "lessons"}
          </p>
        </div>
      ) : (
        <>
      <div className="p-3 border-b border-slate-800 bg-[#1f1f1f] space-y-2 shrink-0">
        <div className="font-semibold text-white truncate">
          {NODE_ICONS.universe} {state.project?.universe.title || state.project?.metadata.title}
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-400 uppercase tracking-wide">
          <span>v{state.version}</span>
          <span className="text-right capitalize">{state.publishStatus}</span>
          <span>{p.tracks} tracks</span>
          <span>{p.modules} modules</span>
          <span>{p.lessons} lessons</span>
          <span>{p.estimatedHours}h est.</span>
          <span>{p.quizzes} quizzes</span>
          <span>{p.projects} projects</span>
        </div>
      </div>

      <div className="p-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-300">Project Health</span>
          <span
            className={cn(
              "text-xs font-bold",
              h.score >= 80 ? "text-emerald-400" : h.score >= 50 ? "text-amber-400" : "text-red-400"
            )}
          >
            {h.readyToPublish ? <CheckCircle2 className="w-3.5 h-3.5 inline" /> : null}{" "}
            {h.score}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden mb-2">
          <div
            className={cn(
              "h-full transition-all",
              h.score >= 80 ? "bg-emerald-500" : h.score >= 50 ? "bg-amber-500" : "bg-red-500"
            )}
            style={{ width: `${h.score}%` }}
          />
        </div>
        <div className="text-[10px] text-slate-500 mb-1">
          Course progress: {p.completionPercent}% ({p.completeNodes}/{p.totalNodes} nodes)
        </div>
        {h.issues.slice(0, 4).map((issue, i) => (
          <button
            key={`${issue.code}-${i}`}
            type="button"
            className="w-full text-left text-[11px] text-amber-400/90 hover:text-amber-300 flex items-start gap-1 py-0.5"
            onClick={() => issue.file && onOpenFile(issue.file)}
          >
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{issue.message}</span>
          </button>
        ))}
      </div>
        </>
      )}

      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 border-b shrink-0",
          experienceStudioMode ? "border-border bg-muted/30" : "border-slate-800"
        )}
      >
        <span
          className={cn(
            "text-[10px] uppercase tracking-widest font-semibold truncate",
            experienceStudioMode ? "text-muted-foreground" : "text-slate-500"
          )}
        >
          {experienceStudioMode ? "Structure" : selectedNode ? selectedNode.title : "Learning Universe"}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-slate-200"
            title="Expand all"
            onClick={expandAll}
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-slate-200"
            title="Collapse all"
            onClick={collapseAll}
          >
            <ChevronsDownUp className="w-3.5 h-3.5" />
          </Button>
          <LuAddMenu selectedNode={selectedNode} handlers={menuHandlers} experienceStudioMode={experienceStudioMode} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1 min-h-0">
        {!hasTracks && !experienceStudioMode && (
          <div className="px-4 py-8 text-center text-slate-500 space-y-3">
            <p className="text-sm font-medium text-slate-200">No Tracks Yet</p>
            <p className="text-xs">Create your first track to start building your course.</p>
            <Button type="button" size="sm" variant="default" onClick={() => openWizard("track")}>
              Create your first track
            </Button>
          </div>
        )}
        <DndContext
          sensors={explorerSensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => void handleExplorerDragEnd(e)}
        >
          {state.explorer.map((node) => (
            <ExplorerBranch
              key={node.id}
              node={node}
              level={0}
              expanded={expanded}
              selectedId={selectedId}
              toggle={toggle}
              activeFilePath={activeFilePath}
              onSelect={(n) => {
                selectNode(n);
                if (experienceStudioMode) onSelectNode?.(n);
              }}
              experienceStudioMode={experienceStudioMode}
              onSelectNode={onSelectNode}
              onOpenFile={onOpenFile}
              onOpenComponent={handleOpenComponent}
              onEmptyAction={(action, n) => executeMenuItem(action, n, menuHandlers)}
              onQuickDelete={(n) => {
                const deleteId = explorerDeleteMenuId(n);
                if (deleteId) void executeMenuItem(deleteId, n, menuHandlers);
              }}
              onQuickAdd={(n, itemId) => void executeMenuItem(itemId, n, menuHandlers)}
              onContextMenu={(e, n) => {
                e.preventDefault();
                selectNode(n);
                setContextNode(n);
                setContextPos({ x: e.clientX, y: e.clientY });
              }}
            />
          ))}
        </DndContext>
      </div>

      {contextPos && contextNode && (
        <LuContextMenu
          node={contextNode}
          position={contextPos}
          onClose={() => setContextPos(null)}
          handlers={menuHandlers}
        />
      )}

      <LuWizardDialog open={!!wizard} type={wizard} onClose={() => setWizard(null)} onSubmit={handleWizardSubmit} />
      <LuRenameDialog node={renameNode} onClose={() => setRenameNode(null)} onSubmit={handleRename} />
      <LuPropertiesDialog node={propertiesNode} onClose={() => setPropertiesNode(null)} />
    </div>
  );
}

function ExplorerBranch({
  node,
  level,
  expanded,
  selectedId,
  toggle,
  activeFilePath,
  onSelect,
  onOpenFile,
  onOpenComponent,
  onEmptyAction,
  onQuickDelete,
  onQuickAdd,
  onContextMenu,
  experienceStudioMode,
  onSelectNode,
}: {
  node: LuExplorerNode;
  level: number;
  expanded: Set<string>;
  selectedId: string | null;
  toggle: (id: string) => void;
  activeFilePath?: string | null;
  onSelect: (node: LuExplorerNode) => void;
  onOpenFile: (path: string) => void;
  onOpenComponent: (node: LuExplorerNode) => void;
  onEmptyAction: (action: string, node: LuExplorerNode) => void;
  onQuickDelete: (node: LuExplorerNode) => void;
  onQuickAdd: (node: LuExplorerNode, itemId: string) => void;
  onContextMenu: (e: React.MouseEvent, node: LuExplorerNode) => void;
  experienceStudioMode?: boolean;
  onSelectNode?: (node: LuExplorerNode) => void;
}) {
  const hasChildren = (node.children && node.children.length > 0) || node.kind === "lesson";
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const warn = node.issues.length > 0;
  const showEmpty = isOpen && (node.kind === "track" || node.kind === "module");
  const isEducationalLeaf =
    isComponentKind(node.kind) || node.kind === "question" || node.kind === "resource-item";
  const draggable = isExplorerDraggable(node);
  const sortableId = sortableNodeId(node);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    disabled: !draggable,
  });
  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const childIds = (node.children ?? []).map(sortableNodeId);
  const showDelete = canDeleteExplorerNode(node);
  const quickAddItems = useMemo(
    () =>
      (node.kind === "universe" || node.kind === "track" || node.kind === "module" || node.kind === "lesson")
        ? getAddMenuItems(node)
        : [],
    [node]
  );

  const handleClick = () => {
    onSelect(node);
    if (node.kind === "universe") {
      return;
    }
    if (node.kind === "track" || node.kind === "module") {
      toggle(node.id);
      if (!experienceStudioMode && node.filePath) void onOpenFile(node.filePath);
      return;
    }
    if (node.kind === "lesson") {
      if (hasChildren) toggle(node.id);
      if (!experienceStudioMode && node.filePath) void onOpenFile(node.filePath);
      return;
    }
    if (isEducationalLeaf) {
      onOpenComponent(node);
      return;
    }
    if (hasChildren) toggle(node.id);
    if (!experienceStudioMode && node.filePath) onOpenFile(node.filePath);
  };

  return (
    <div ref={setNodeRef} style={rowStyle}>
      <div
        className={cn(
          "flex items-center gap-1 py-1.5 pr-2 cursor-pointer group select-none rounded-md mx-1",
          experienceStudioMode ? "hover:bg-muted" : "hover:bg-slate-800/70",
          isSelected &&
            (experienceStudioMode
              ? "bg-primary/15 text-primary font-medium"
              : "bg-[#094771] text-white")
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {draggable && (
          <button
            type="button"
            className={cn(
              "w-3 h-4 flex items-center justify-center shrink-0 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing transition-opacity",
              "opacity-70",
              "md:opacity-0 md:group-hover:opacity-100",
              isSelected && "md:opacity-100"
            )}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            title="Drag to reorder within this section"
            aria-label="Drag to reorder within this section"
          >
            <GripVertical className="w-3 h-3" />
          </button>
        )}
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {(hasChildren && node.kind !== "question" && node.kind !== "resource-item") ? (
            isOpen ? (
              <ChevronDown className="w-3 h-3 text-slate-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-slate-500" />
            )
          ) : null}
        </span>
        <span className="text-xs">{NODE_ICONS[node.kind]}</span>
        <span className="truncate flex-1 text-xs min-w-0">{node.title}</span>
        {quickAddItems.length > 0 && (
          <InlineQuickAdd
            node={node}
            items={quickAddItems}
            onPick={onQuickAdd}
            experienceStudioMode={experienceStudioMode}
          />
        )}
        {showDelete && (
          <button
            type="button"
            className={cn(
              "p-0.5 shrink-0 rounded transition-opacity",
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              experienceStudioMode
                ? "text-muted-foreground hover:text-destructive"
                : "text-slate-500 hover:text-red-400"
            )}
            title={`Delete ${node.title}`}
            aria-label={`Delete ${node.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onQuickDelete(node);
            }}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
        <span className={cn("text-[10px] shrink-0", STATUS_CLASS[node.status])} title={node.status}>
          {STATUS_DOT[node.status]}
        </span>
        {warn && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
      </div>
      {showEmpty && (
        <LuExplorerEmptyState
          node={node}
          onAction={(action) => onEmptyAction(action, node)}
        />
      )}
      {isOpen && childIds.length > 0 && (
        <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
          {node.children?.map((child) => (
            <ExplorerBranch
              key={child.id}
              node={child}
              level={level + 1}
              expanded={expanded}
              selectedId={selectedId}
              toggle={toggle}
              activeFilePath={activeFilePath}
              onSelect={onSelect}
              onOpenFile={onOpenFile}
              onOpenComponent={onOpenComponent}
              onEmptyAction={onEmptyAction}
              onQuickDelete={onQuickDelete}
              onQuickAdd={onQuickAdd}
              onContextMenu={onContextMenu}
              experienceStudioMode={experienceStudioMode}
              onSelectNode={onSelectNode}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

function InlineQuickAdd({
  node,
  items,
  onPick,
  experienceStudioMode,
}: {
  node: LuExplorerNode;
  items: Array<{ id: string; label: string }>;
  onPick: (node: LuExplorerNode, itemId: string) => void;
  experienceStudioMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (items.length === 1) {
    return (
      <button
        type="button"
        className={cn(
          "p-0.5 rounded shrink-0 transition-opacity",
          "opacity-100",
          experienceStudioMode
            ? "text-primary/80 hover:text-primary hover:bg-primary/10"
            : "text-slate-400 hover:text-slate-100 hover:bg-slate-700"
        )}
        title={items[0].label}
        aria-label={items[0].label}
        onClick={(e) => {
          e.stopPropagation();
          onPick(node, items[0].id);
        }}
      >
        +
      </button>
    );
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        className={cn(
          "p-0.5 rounded transition-opacity",
          "opacity-100",
          experienceStudioMode
            ? "text-primary/80 hover:text-primary hover:bg-primary/10"
            : "text-slate-400 hover:text-slate-100 hover:bg-slate-700"
        )}
        title="Quick add"
        aria-label="Quick add"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        +
      </button>
      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-md shadow-lg py-1 text-xs border",
            experienceStudioMode ? "bg-popover border-border" : "border-slate-700 bg-[#252526]"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "w-full text-left px-2.5 py-1.5",
                experienceStudioMode ? "hover:bg-muted text-foreground" : "hover:bg-slate-700 text-slate-200"
              )}
              onClick={() => {
                onPick(node, item.id);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
