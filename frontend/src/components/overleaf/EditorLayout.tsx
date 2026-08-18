import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { FileTree, FileNode } from "./FileTree";
import { LatexMonaco, notifyFileSaved } from "./LatexMonaco";
import { PdfPreview } from "./PdfPreview";
import {
  Play,
  Share2,
  Settings,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  ArrowLeft,
  BookOpen,
  FileImage,
  Save,
  Undo2,
  Redo2,
  Video,
  Image as ImageIcon,
  History,
  Upload as UploadIcon,
  Search,
  RefreshCw,
  Activity,
  Sparkles,
  Eye,
} from "lucide-react";
import { LuModeToggle } from "@/components/lu-authoring/LuModeToggle";
import { LuLatexGuideDialog } from "@/components/lu-authoring/LuLatexGuideDialog";
import { LuProjectAssetsDialog } from "@/components/overleaf/LuProjectAssetsDialog";
import { VideoAuthoringModal, type VideoAuthoringData } from "@/components/lu-authoring/VideoAuthoringModal";
import { defaultImageUploadFolder } from "@/lib/latexEditor/useLatexProjectUpload";
import { isTextEditorFocused, isTextEditorEventTarget } from "@/lib/latexEditor/editorFocus";
import { LESSON_SECTION_PATTERNS } from "@/lib/luAuthoring/lessonSections";
import { findNthPatternMatch, findComponentMarkerLine, type LuFocusComponentDetail, type LuFocusSectionDetail } from "@/lib/luAuthoring/componentNavigation";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";
import { api, publishLearningUniverse, publishAcademicCourse } from "@/lib/api";
import { withUploadAuth } from "@/lib/courseMediaUrls";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateCourseContentCaches } from "@/lib/courseContentCache";
import { BrandHomeButton } from "@/components/common/Logo";
import { AppAssistantFooter } from "@/assistant/AppAssistantFooter";
import { buildInstructorLuPreviewPath } from "@/lib/instructorPreview";
import { sanitizeColabUrlsInDsl } from "@/lib/colabUrlValidator";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { useLatexCompile } from "./hooks/useLatexCompile";
import { useEditorSettings } from "./hooks/useEditorSettings";
import { EditorSettingsDialog } from "./EditorSettingsDialog";
import type { EditorMode, LatexCompileError } from "./types";
import { ACADEMIC_COURSE_SAMPLE_TEX } from "@/components/academic-studio/sampleTemplates";
import { LuAuthoringPanel } from "@/components/lu-authoring/LuAuthoringPanel";
import { useLuAuthoringState } from "@/hooks/useLuAuthoringState";
import {
  loadLuDeveloperMode,
  saveLuDeveloperMode,
  loadLuActiveFilePath,
  saveLuActiveFilePath,
} from "@/lib/luAuthoring/storage";
import type { LuExplorerNode, StructureAction } from "@/lib/luAuthoring/types";
import { LuComponentBuilderPanel } from "@/components/lu-authoring/LuComponentBuilderPanel";
import {
  dispatchComponentSelected,
  type LuComponentSelection,
} from "@/lib/luAuthoring/componentSelection";
import { isLearningModeVisualEditor } from "@/lib/luAuthoring/componentRegistry";
import { isOwnedComponentPath } from "@/lib/luAuthoring/componentFilePaths";
import {
  findFirstLessonNode,
  findLessonContainingNode,
  findLessonForFilePath,
  isEducationalTexPath,
  isTechnicalTexPath,
} from "@/lib/luAuthoring/explorerNavigation";
import { ExperienceStudentPreview } from "@/components/experience-studio/ExperienceStudentPreview";
import { findParentQuizNode } from "@/lib/luAuthoring/explorerUtils";
import { isFileDirty, getFileSaveState, listDirtyCachedFiles, syncCachedModelsFromServer, forceSyncCachedModelsFromServer, markAllModelsSaved, disposeAllModels } from "@/lib/luAuthoring/monacoModelCache";
import { sanitizeProjectFileContent, isTextLikeProjectPath } from "@/lib/latexEditor/contentSanitizer";
import { LuAutosaveManager } from "@/lib/luAuthoring/autosaveManager";
import { buildFullTextFileOverlay, fetchServerSnapshotHash } from "@/lib/luAuthoring/projectSnapshot";
import { PRODUCT_TYPES, type ProductType } from "@/lib/productTypes";

interface EditorLayoutProps {
  projectId: string;
  mode?: EditorMode;
  universeId?: string;
  courseId?: string;
  lectureId?: string;
  productType?: ProductType;
  extraLeftPanel?: React.ReactNode;
  showExtraLeftPanel?: boolean;
  onToggleExtraLeftPanel?: () => void;
  forceDeveloperMode?: boolean;
  onBackToExperienceStudio?: () => void;
  /** Called after autosave flush so asset preview URLs stay in sync. */
  onProjectFilesSynced?: (
    files: Array<{ name: string; path: string; s3Url?: string | null; isFolder?: boolean }>
  ) => void;
}

export function EditorLayout({
  projectId,
  mode = "resources",
  universeId,
  courseId,
  lectureId,
  productType = PRODUCT_TYPES.LEARNING_UNIVERSE,
  extraLeftPanel,
  showExtraLeftPanel = true,
  onToggleExtraLeftPanel,
  forceDeveloperMode = false,
  onBackToExperienceStudio,
  onProjectFilesSynced,
}: EditorLayoutProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const monacoEditorRef = useRef<any>(null);
  const activeFilePathRef = useRef<string | null>(null);
  const filesRef = useRef<FileNode[]>([]);
  const syncFilesAfterMutationRef = useRef<() => Promise<FileNode[]>>(async () => []);
  const syncEditorFromServerRef = useRef<(options?: { force?: boolean }) => Promise<FileNode[]>>(async () => []);
  const activeFileRef = useRef<FileNode | null>(null);
  const autosaveRef = useRef<LuAutosaveManager | null>(null);
  const luValidateTimerRef = useRef<number | null>(null);
  const suppressAutoCompileRef = useRef(false);
  const isPublishingRef = useRef(false);
  const [showFileTree, setShowFileTree] = useState(true);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isPublishingToLU, setIsPublishingToLU] = useState(false);
  const [isPublishingToCourse, setIsPublishingToCourse] = useState(false);
  const [isPublishingResources, setIsPublishingResources] = useState(false);

  useEffect(() => {
    isPublishingRef.current = isPublishingToLU || isPublishingToCourse || isPublishingResources;
  }, [isPublishingToLU, isPublishingToCourse, isPublishingResources]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [luDeveloperMode, setLuDeveloperMode] = useState(() =>
    mode === "learning-universe" ? forceDeveloperMode || loadLuDeveloperMode(projectId) : false
  );
  const [isLuV2, setIsLuV2] = useState(false);
  const [builderSelection, setBuilderSelection] = useState<LuComponentSelection | null>(null);
  const [editorTexContent, setEditorTexContent] = useState("");
  const [fileSaveState, setFileSaveState] = useState<"clean" | "dirty" | "saving" | "saved" | "conflict">("clean");
  const [dirtyFileCount, setDirtyFileCount] = useState(0);
  const [showLatexGuide, setShowLatexGuide] = useState(false);
  const [showAssetsDialog, setShowAssetsDialog] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoTargetNode, setVideoTargetNode] = useState<LuExplorerNode | null>(null);
  const [isAutoRepairing, setIsAutoRepairing] = useState(false);

  const isLuAuthoringMode = mode === "learning-universe";
  const publishLabel =
    productType === PRODUCT_TYPES.PREMIUM_COURSE
      ? "Publish Course"
      : productType === PRODUCT_TYPES.FREE_COURSE
        ? "Publish Free Course"
        : productType === PRODUCT_TYPES.FREE_RESOURCE
          ? "Publish Resource"
          : "Publish to LU";
  const publishSuccessTitle =
    productType === PRODUCT_TYPES.PREMIUM_COURSE
      ? "Course published!"
      : productType === PRODUCT_TYPES.FREE_COURSE
        ? "Free course published!"
        : productType === PRODUCT_TYPES.FREE_RESOURCE
          ? "Resource published!"
          : "Published to Learning Universe!";
  const {
    state: luState,
    loading: luLoading,
    error: luError,
    refresh: refreshLuState,
    mutate: mutateLu,
    undo: undoLu,
    redo: redoLu,
    canUndo: luCanUndo,
    canRedo: luCanRedo,
  } = useLuAuthoringState(projectId, isLuAuthoringMode);

  const { settings, updateSettings } = useEditorSettings();
  const addToast = useToastStore((s) => s.add);

  /** Learning mode: always autosave all files and autocompile so publish matches the editor. */
  const effectiveSettings = useMemo(() => {
    if (isLuAuthoringMode && !luDeveloperMode) {
      return {
        ...settings,
        autoSave: true,
        autoCompile: true,
        autoSaveDelayMs: Math.min(settings.autoSaveDelayMs, 2500),
        autoCompileDelayMs: Math.min(settings.autoCompileDelayMs, 2500),
      };
    }
    return { ...settings, autoSave: true };
  }, [settings, isLuAuthoringMode, luDeveloperMode]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  const useCentralizedAutosave = isLuAuthoringMode && !luDeveloperMode;

  useEffect(() => {
    if (!useCentralizedAutosave) return;
    const manager = new LuAutosaveManager({
      projectId,
      getFiles: () => filesRef.current,
      getActiveFile: () => activeFileRef.current,
      getActiveEditorValue: () => monacoEditorRef.current?.getValue(),
      onFilesSaved: (updates) => {
        setFiles((prev) => {
          const next = prev.map((f) => {
            const hit = updates.find((u) => u.fileId === f.id);
            return hit ? { ...f, content: hit.content } : f;
          });
          filesRef.current = next;
          onProjectFilesSynced?.(next);
          return next;
        });
      },
      onDirtyCountChange: (count) => {
        setDirtyFileCount(count);
        if (activeFileRef.current?.id) {
          setFileSaveState(count > 0 ? "dirty" : getFileSaveState(activeFileRef.current.id));
        }
        if (count === 0) setLastSavedAt(Date.now());
      },
      onAfterFlush: () => {
        void syncFilesAfterMutationRef.current();
      },
      debounceMs: effectiveSettings.autoSaveDelayMs,
      intervalMs: effectiveSettings.autoSaveDelayMs,
    });
    manager.startInterval();
    const cleanupLifecycle = manager.registerLifecycle();
    autosaveRef.current = manager;
    return () => {
      cleanupLifecycle();
      manager.dispose();
      autosaveRef.current = null;
    };
  }, [projectId, useCentralizedAutosave, effectiveSettings.autoSaveDelayMs]);

  const authStoreStr = localStorage.getItem("lms-auth");
  const token = authStoreStr ? JSON.parse(authStoreStr)?.state?.token : null;
  const username = authStoreStr ? JSON.parse(authStoreStr)?.state?.user?.firstName : "Guest";

  const fallbackTex =
    mode === "learning-universe"
      ? ""
      : mode === "academic-course"
        ? ACADEMIC_COURSE_SAMPLE_TEX
        : "\\documentclass{article}\n\\begin{document}\n\\end{document}\n";

  const fetchProjectFiles = useCallback(async (): Promise<FileNode[]> => {
    const res = await api<{ success: boolean; project: { files: FileNode[] } }>(
      `/latex-projects/${projectId}`
    );
    const nextFiles = res.data?.project?.files || [];
    if (nextFiles.length) setFiles(nextFiles);
    return nextFiles;
  }, [projectId]);

  useEffect(() => {
    if (forceDeveloperMode) setLuDeveloperMode(true);
  }, [forceDeveloperMode]);

  useEffect(() => {
    const apply = () => setIsCompactViewport(window.innerWidth < 1400);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const setLuDeveloperModePersisted = useCallback((enabled: boolean) => {
    setLuDeveloperMode(enabled);
    saveLuDeveloperMode(projectId, enabled);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    api<{ success: boolean; project: { files: FileNode[] }; error?: string }>(
      `/latex-projects/${projectId}`
    )
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          console.error("[EditorLayout] Failed to load project files:", res.error);
          return;
        }
        if (!res.data?.project?.files?.length) return;

        const projectFiles = res.data.project.files;
        setFiles(projectFiles);
        syncCachedModelsFromServer(projectFiles);

        if (mode !== "learning-universe") {
          const mainFile =
            projectFiles.find((f) => f.path === "/main.tex" || f.name === "main.tex") ||
            projectFiles.find((f) => f.path.endsWith(".tex")) ||
            projectFiles[0];
          setActiveFile(mainFile);
          return;
        }

        const storedPath = loadLuActiveFilePath(projectId);
        const storedFile =
          storedPath && isEducationalTexPath(storedPath)
            ? projectFiles.find((f) => f.path === storedPath)
            : null;
        const firstLessonFile = projectFiles.find(
          (f) => !f.isFolder && /\/lesson-\d+\.tex$/i.test(f.path)
        );
        const pick = storedFile || firstLessonFile;
        if (pick) setActiveFile(pick);
      })
      .finally(() => {
        if (!cancelled) setIsInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, mode]);

  useEffect(() => {
    if (!isLuAuthoringMode) return;
    api<{ success: boolean; data: { isV2: boolean } }>(`/latex-projects/${projectId}/lu/meta`).then((res) => {
      if (res.data?.data) setIsLuV2(res.data.data.isV2);
    });
  }, [projectId, isLuAuthoringMode]);

  useEffect(() => {
    if (luState?.isV2) setIsLuV2(true);
  }, [luState?.isV2]);

  useEffect(() => {
    if (luDeveloperMode) setBuilderSelection(null);
  }, [luDeveloperMode]);

  useEffect(() => {
    if (luDeveloperMode || !isLuAuthoringMode || !activeFile?.path || !luState?.explorer.length) return;
    if (!isOwnedComponentPath(activeFile.path)) {
      return;
    }
    const findByPath = (nodes: LuExplorerNode[]): LuExplorerNode | null => {
      for (const n of nodes) {
        if (n.filePath === activeFile.path && isLearningModeVisualEditor(n.kind)) return n;
        if (n.children) {
          const hit = findByPath(n.children);
          if (hit) return hit;
        }
      }
      return null;
    };
    const match = findByPath(luState.explorer);
    if (match) {
      if (match.kind === "question") {
        const quizNode = findParentQuizNode(luState.explorer, match);
        if (quizNode) {
          dispatchComponentSelected(quizNode, quizNode.config, match.componentId);
          return;
        }
      }
      dispatchComponentSelected(match, match.config);
    }
  }, [activeFile?.path, luState?.explorer, luDeveloperMode, isLuAuthoringMode]);

  useEffect(() => {
    const onSelected = (e: Event) => {
      const detail = (e as CustomEvent<LuComponentSelection>).detail;
      if (detail?.node) setBuilderSelection(detail);
    };
    window.addEventListener("lu-component-selected", onSelected);
    return () => window.removeEventListener("lu-component-selected", onSelected);
  }, []);

  useEffect(() => {
    if (!builderSelection?.node?.id || !luState?.explorer.length) return;
    const find = (nodes: import("@/lib/luAuthoring/types").LuExplorerNode[]): import("@/lib/luAuthoring/types").LuExplorerNode | null => {
      for (const n of nodes) {
        if (n.id === builderSelection.node.id) return n;
        if (n.children) {
          const hit = find(n.children);
          if (hit) return hit;
        }
      }
      return null;
    };
    const updated = find(luState.explorer);
    if (updated) {
      setBuilderSelection((prev) =>
        prev && prev.node.id === updated.id
          ? {
              node: updated,
              config: updated.config ?? prev.config,
              selectedQuestionId: prev.selectedQuestionId,
            }
          : prev
      );
    }
  }, [luState?.explorer, builderSelection?.node?.id]);

  const previewLessonNode = useMemo(() => {
    if (!luState?.explorer?.length) return null;
    if (activeFile?.path) {
      const fromFile = findLessonForFilePath(luState.explorer, activeFile.path);
      if (fromFile) return fromFile;
    }
    if (builderSelection?.node) {
      const fromNode = findLessonContainingNode(luState.explorer, builderSelection.node.id);
      if (fromNode) return fromNode;
    }
    return findFirstLessonNode(luState.explorer);
  }, [luState?.explorer, activeFile?.path, builderSelection?.node?.id]);

  const previewSelectedComponent = useMemo(() => {
    if (!builderSelection?.node || builderSelection.node.kind === "lesson") return null;
    return builderSelection.node;
  }, [builderSelection?.node]);

  const openFullCoursePreview = useCallback(async () => {
    if (!universeId) {
      addToast({
        title: "Publish first",
        description: "Save and publish to LU to preview the full student course.",
        variant: "destructive",
      });
      return;
    }
    try {
      if (useCentralizedAutosave && autosaveRef.current) {
        await autosaveRef.current.flushBefore("preview");
      } else {
        await persistAllPendingRef.current();
      }
      queryClient.invalidateQueries({ queryKey: ["learner-experience", universeId] });
      const url = `${buildInstructorLuPreviewPath(universeId)}?t=${Date.now()}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      addToast({
        title: "Preview blocked",
        description: err instanceof Error ? err.message : "Save all files before preview",
        variant: "destructive",
      });
    }
  }, [universeId, addToast, useCentralizedAutosave, queryClient]);

  const persistAllPendingRef = useRef<() => Promise<void>>(async () => {});

  const openFileByPath = useCallback(
    async (filePath: string) => {
      if (isLuAuthoringMode) {
        if (useCentralizedAutosave && autosaveRef.current) {
          await autosaveRef.current.flush("file-switch");
        } else if (
          activeFile?.id &&
          isEducationalTexPath(activeFile.path) &&
          isFileDirty(activeFile.id)
        ) {
          await persistAllPendingRef.current();
        }
      }

      const normalized = filePath.startsWith("/") ? filePath : `/${filePath}`;
      let file = files.find((f) => f.path === normalized);
      if (!file) {
        const refreshed = await fetchProjectFiles();
        file = refreshed.find((f) => f.path === normalized);
        if (file) setFiles(refreshed);
      }
      if (file) {
        setActiveFile(file);
        saveLuActiveFilePath(projectId, file.path);
      }
    },
    [files, fetchProjectFiles, projectId, isLuAuthoringMode, activeFile, useCentralizedAutosave]
  );

  const syncFilesAfterMutation = useCallback(async () => {
    const refreshed = await fetchProjectFiles();
    syncCachedModelsFromServer(refreshed);
    setFiles(refreshed);
    onProjectFilesSynced?.(refreshed);
    return refreshed;
  }, [fetchProjectFiles, onProjectFilesSynced]);

  /** Reload all project files from DB into React state + Monaco (after compile/publish repair). */
  const syncEditorFromServer = useCallback(
    async (options?: { force?: boolean }) => {
      suppressAutoCompileRef.current = true;
      try {
        const refreshed = await fetchProjectFiles();
        if (options?.force) {
          forceSyncCachedModelsFromServer(refreshed);
          markAllModelsSaved(
            refreshed
              .filter((f) => !f.isFolder)
              .map((f) => ({ fileId: f.id, content: f.content || "" }))
          );
        } else {
          syncCachedModelsFromServer(refreshed);
        }
        setFiles(refreshed);
        onProjectFilesSynced?.(refreshed);

        const pathToShow = activeFile?.path;
        if (pathToShow) {
          const file = refreshed.find((f) => f.path === pathToShow);
          if (file) {
            setActiveFile(file);
            if (monacoEditorRef.current && isEducationalTexPath(file.path)) {
              const editor = monacoEditorRef.current;
              const model = editor.getModel();
              const content = file.content || "";
              if (model && model.getValue() !== content) {
                editor.executeEdits("server-sync", [
                  { range: model.getFullModelRange(), text: content },
                ]);
                notifyFileSaved(file.id, content);
              }
            }
          }
        }

        if (isLuAuthoringMode) {
          void refreshLuState();
        }
        return refreshed;
      } finally {
        window.setTimeout(() => {
          suppressAutoCompileRef.current = false;
        }, 500);
      }
    },
    [fetchProjectFiles, onProjectFilesSynced, activeFile?.path, isLuAuthoringMode, refreshLuState]
  );

  useEffect(() => {
    syncFilesAfterMutationRef.current = syncFilesAfterMutation;
  }, [syncFilesAfterMutation]);

  useEffect(() => {
    syncEditorFromServerRef.current = syncEditorFromServer;
  }, [syncEditorFromServer]);

  useEffect(() => {
    disposeAllModels();
    return () => disposeAllModels();
  }, [projectId]);

  const reloadActiveFileFromServer = useCallback(async () => {
    if (!activeFile?.path) return;
    const refreshed = await syncFilesAfterMutation();
    const file = refreshed.find((f) => f.path === activeFile.path);
    if (!file) return;
    setActiveFile(file);
    if (monacoEditorRef.current && isEducationalTexPath(file.path)) {
      const editor = monacoEditorRef.current;
      const model = editor.getModel();
      if (model) {
        editor.executeEdits("undo-redo-reload", [
          { range: model.getFullModelRange(), text: file.content || "" },
        ]);
        notifyFileSaved(file.id, file.content || "");
      }
    }
  }, [activeFile?.path, syncFilesAfterMutation]);

  const handleLuUndo = useCallback(async () => {
    await undoLu();
    await reloadActiveFileFromServer();
    addToast({ title: "Undone", variant: "success" });
  }, [undoLu, reloadActiveFileFromServer, addToast]);

  const handleLuRedo = useCallback(async () => {
    await redoLu();
    await reloadActiveFileFromServer();
    addToast({ title: "Redone", variant: "success" });
  }, [redoLu, reloadActiveFileFromServer, addToast]);

  const handleLuMutate = useCallback(
    async (action: StructureAction) => {
      const result = await mutateLu(action);
      const refreshed = await syncFilesAfterMutation();
      const skipAutoOpen =
        action.action === "addQuizQuestion" || action.action === "appendQuizQuestion";
      if (result?.createdFilePath && !skipAutoOpen) {
        const path = result.createdFilePath.startsWith("/")
          ? result.createdFilePath
          : `/${result.createdFilePath}`;
        const file = refreshed.find((f) => f.path === path);
        if (file) {
          setActiveFile(file);
          saveLuActiveFilePath(projectId, file.path);
        }
      }
      return result;
    },
    [mutateLu, syncFilesAfterMutation, projectId]
  );

  useEffect(() => {
    if (!isLuAuthoringMode || luDeveloperMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isTextEditorFocused() || isTextEditorEventTarget(e.target)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (luCanUndo) void handleLuUndo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        if (luCanRedo) void handleLuRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLuAuthoringMode, luDeveloperMode, luCanUndo, luCanRedo, handleLuUndo, handleLuRedo]);

  useEffect(() => {
    if (!isLuAuthoringMode || luDeveloperMode || !luState?.isV2 || !luState.explorer.length) return;
    if (activeFile?.path && isEducationalTexPath(activeFile.path)) return;
    const firstLesson = findFirstLessonNode(luState.explorer);
    if (firstLesson?.filePath) void openFileByPath(firstLesson.filePath);
  }, [
    isLuAuthoringMode,
    luDeveloperMode,
    luState?.isV2,
    luState?.explorer,
    activeFile?.path,
    openFileByPath,
  ]);

  useEffect(() => {
    if (!isLuAuthoringMode || luDeveloperMode || !activeFile?.path) return;
    if (!isTechnicalTexPath(activeFile.path)) return;
    const firstLesson = luState?.explorer?.length ? findFirstLessonNode(luState.explorer) : null;
    if (firstLesson?.filePath) void openFileByPath(firstLesson.filePath);
  }, [isLuAuthoringMode, luDeveloperMode, activeFile?.path, luState?.explorer, openFileByPath]);

  useEffect(() => {
    const onOpenPath = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (path) void openFileByPath(path.startsWith("/") ? path : `/${path}`);
    };
    window.addEventListener("lu-open-file-path", onOpenPath);
    return () => window.removeEventListener("lu-open-file-path", onOpenPath);
  }, [openFileByPath]);

  const showVisualEditor =
    isLuAuthoringMode &&
    !luDeveloperMode &&
    builderSelection != null &&
    isLearningModeVisualEditor(builderSelection.node.kind);

  useEffect(() => {
    if (activeFile?.path) saveLuActiveFilePath(projectId, activeFile.path);
  }, [activeFile?.path, projectId]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isLuAuthoringMode) return;
      const dirty = listDirtyCachedFiles();
      if (dirty.length > 0) {
        void persistAllPendingRef.current();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isLuAuthoringMode]);

  const persistActiveFile = useCallback(async () => {
    if (!activeFile || !monacoEditorRef.current || !isTextLikeProjectPath(activeFile.path)) return;
    const raw = monacoEditorRef.current.getValue();
    const content = sanitizeProjectFileContent(activeFile.path, raw);
    if (content !== raw && monacoEditorRef.current) {
      monacoEditorRef.current.setValue(content);
    }
    setFileSaveState("saving");
    await api(`/latex-projects/${projectId}/files/content`, {
      method: "PUT",
      body: { fileId: activeFile.id, content },
    });
    notifyFileSaved(activeFile.id, content);
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFile.id ? { ...f, content } : f))
    );
    setFileSaveState("saved");
    setLastSavedAt(Date.now());
    window.setTimeout(() => setFileSaveState("clean"), 1500);
  }, [activeFile, projectId]);

  const applyGuideFileContent = useCallback(
    async (filePath: string, content: string) => {
      const normalized = filePath.startsWith("/") ? filePath : `/${filePath}`;
      let file = files.find((f) => f.path === normalized);
      if (!file) {
        await fetchProjectFiles();
        file = filesRef.current.find((f) => f.path === normalized);
      }
      if (!file?.id) throw new Error(`File not found: ${normalized}`);

      const sanitized = sanitizeProjectFileContent(normalized, content);
      if (useCentralizedAutosave && autosaveRef.current) {
        await autosaveRef.current.flush("edit");
      }
      await api(`/latex-projects/${projectId}/files/content`, {
        method: "PUT",
        body: { fileId: file.id, content: sanitized },
      });
      notifyFileSaved(file.id, sanitized);
      setFiles((prev) => prev.map((f) => (f.id === file!.id ? { ...f, content: sanitized } : f)));
      if (activeFile?.id === file.id && monacoEditorRef.current) {
        monacoEditorRef.current.setValue(sanitized);
        setEditorTexContent(sanitized);
      }
      if (isLuAuthoringMode) {
        await refreshLuState();
      }
    },
    [
      files,
      fetchProjectFiles,
      projectId,
      useCentralizedAutosave,
      activeFile?.id,
      isLuAuthoringMode,
      refreshLuState,
    ]
  );

  const persistAllDirtyFiles = useCallback(async () => {
    if (useCentralizedAutosave && autosaveRef.current) {
      await autosaveRef.current.flush("manual");
      return;
    }
    const dirty = listDirtyCachedFiles();
    if (dirty.length === 0) return;
    const fileById = new Map(files.map((f) => [f.id, f]));
    const savedUpdates: Array<{ fileId: string; content: string }> = [];
    for (const { fileId, content: raw } of dirty) {
      const file = fileById.get(fileId);
      if (!file || !isTextLikeProjectPath(file.path)) continue;
      const content = sanitizeProjectFileContent(file.path, raw);
      await api(`/latex-projects/${projectId}/files/content`, {
        method: "PUT",
        body: { fileId, content },
      });
      notifyFileSaved(fileId, content);
      savedUpdates.push({ fileId, content });
    }
    if (savedUpdates.length) {
      setFiles((prev) =>
        prev.map((f) => {
          const hit = savedUpdates.find((d) => d.fileId === f.id);
          return hit ? { ...f, content: hit.content } : f;
        })
      );
    }
  }, [files, projectId, useCentralizedAutosave]);

  const scheduleLuValidation = useCallback(() => {
    if (!isLuAuthoringMode || !luDeveloperMode) return;
    if (luValidateTimerRef.current) window.clearTimeout(luValidateTimerRef.current);
    luValidateTimerRef.current = window.setTimeout(() => void refreshLuState(), 2500);
  }, [isLuAuthoringMode, luDeveloperMode, refreshLuState]);

  const persistAllPendingChanges = useCallback(async () => {
    if (useCentralizedAutosave && autosaveRef.current) {
      await autosaveRef.current.flush("manual");
      return;
    }
    await persistAllDirtyFiles();
    await persistActiveFile();
  }, [persistAllDirtyFiles, persistActiveFile, useCentralizedAutosave]);

  persistAllPendingRef.current = persistAllPendingChanges;

  useEffect(() => {
    const flushPending = () => {
      void persistAllPendingRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushPending();
    };
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushPending);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushPending);
    };
  }, []);

  const saveBeforeCompile = useCallback(async () => {
    if (useCentralizedAutosave && autosaveRef.current) {
      const result = await autosaveRef.current.flushBefore("compile");
      if (!result.success) {
        throw new Error(result.error || "Failed to save before compile");
      }
      return;
    }
    await persistAllPendingChanges();
  }, [persistAllPendingChanges, useCentralizedAutosave]);

  const getCompileFilesSnapshot = useCallback(async (): Promise<Array<{ name: string; content: string }>> => {
    // saveBeforeCompile already flushed — DB is canonical; omit files to keep payload small.
    if (useCentralizedAutosave) return [];
    const dirtyMap = new Map(listDirtyCachedFiles().map((d) => [d.fileId, d.content]));
    const byId = new Map(files.map((f) => [f.id, f]));
    const includeIds = new Set<string>(dirtyMap.keys());

    if (activeFile?.id) includeIds.add(activeFile.id);
    const mainFile = files.find((f) => f.path === "/main.tex" || f.name === "main.tex");
    if (mainFile?.id) includeIds.add(mainFile.id);

    const snapshot: Array<{ name: string; content: string }> = [];
    for (const fileId of includeIds) {
      const file = byId.get(fileId);
      if (!file || file.isFolder || !isTextLikeProjectPath(file.path)) continue;
      let content = dirtyMap.get(file.id) ?? (file.content || "");
      if (activeFile?.id === file.id && monacoEditorRef.current) {
        content = monacoEditorRef.current.getValue();
      }
      snapshot.push({
        name: file.path.replace(/^\//, ""),
        content: sanitizeProjectFileContent(file.path, content),
      });
    }

    return snapshot.filter((f) => f.name.trim().length > 0);
  }, [files, activeFile?.id, useCentralizedAutosave]);

  const getMainTexContent = useCallback(async (): Promise<string> => {
    const mainFile = files.find((f) => f.path === "/main.tex" || f.name === "main.tex") || activeFile;
    if (!mainFile) throw new Error("main.tex not found");

    if (mainFile.id === activeFile?.id && monacoEditorRef.current) {
      const editorContent = monacoEditorRef.current.getValue();
      if (editorContent.trim()) return editorContent;
    }

    const res = await api<{ success: boolean; file: FileNode }>(
      `/latex-projects/${projectId}/files/content?fileId=${mainFile.id}`
    );
    const serverContent = res.data?.file?.content || "";
    if (serverContent.trim() && mainFile.id === activeFile?.id && monacoEditorRef.current) {
      monacoEditorRef.current.setValue(serverContent);
      setFiles((prev) => prev.map((f) => (f.id === mainFile.id ? { ...f, content: serverContent } : f)));
    }
    return serverContent;
  }, [activeFile, files, projectId]);

  const getServerSnapshotHash = useCallback(async (): Promise<string | undefined> => {
    return fetchServerSnapshotHash(projectId);
  }, [projectId]);

  const {
    pdfUrl,
    pdfCacheBust,
    logs,
    errors,
    status,
    isCompiling,
    generatedTex,
    compileCommands,
    outputDirectory,
    compileReport,
    includeOrder,
    failedAtFile,
    compilationTime,
    lastCompiledAt,
    lessonPreview,
    runCompile,
    scheduleAutoCompile,
  } = useLatexCompile({
    projectId,
    settings: effectiveSettings,
    onSaveBeforeCompile: saveBeforeCompile,
    getCompileCode: getMainTexContent,
    getCompileFiles: getCompileFilesSnapshot,
    getSnapshotHash: useCentralizedAutosave ? getServerSnapshotHash : undefined,
    getMainFileName: () => "main.tex",
    getActiveFilePath: () => {
      if (isLuAuthoringMode && !luDeveloperMode && previewLessonNode?.filePath) {
        return previewLessonNode.filePath;
      }
      return activeFile?.path;
    },
  });

  const [compiledPreviewStale, setCompiledPreviewStale] = useState(true);
  useEffect(() => {
    setCompiledPreviewStale(true);
  }, [editorTexContent, activeFile?.path]);
  useEffect(() => {
    if (status === "success" && lastCompiledAt) {
      setCompiledPreviewStale(false);
    }
  }, [status, lastCompiledAt, lessonPreview]);

  const saveCurrentFile = useCallback(async () => {
    if (!activeFile) return;
    setIsSaving(true);
    try {
      if (useCentralizedAutosave && autosaveRef.current) {
        await autosaveRef.current.flush("manual");
      } else if (monacoEditorRef.current) {
        await persistActiveFile();
      }
      addToast({ title: "Saved", description: activeFile.name, variant: "success" });
    } catch (err: any) {
      setFileSaveState("dirty");
      addToast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [activeFile, persistActiveFile, addToast, useCentralizedAutosave]);

  const handleVisualTexSave = useCallback(
    async (newTex: string) => {
      if (!activeFile || !monacoEditorRef.current) return;
      const editor = monacoEditorRef.current;
      const model = editor.getModel();
      if (model) {
        editor.executeEdits("visual-panel-patch", [
          { range: model.getFullModelRange(), text: newTex },
        ]);
      }
      setEditorTexContent(newTex);
      setCompiledPreviewStale(true);
      setFileSaveState("saving");
      try {
        if (useCentralizedAutosave && autosaveRef.current) {
          await autosaveRef.current.flush("manual");
        } else {
          await api(`/latex-projects/${projectId}/files/content`, {
            method: "PUT",
            body: { fileId: activeFile.id, content: newTex },
          });
          notifyFileSaved(activeFile.id, newTex);
          setFiles((prev) =>
            prev.map((f) => (f.id === activeFile.id ? { ...f, content: newTex } : f))
          );
        }
        setFileSaveState("saved");
        setLastSavedAt(Date.now());
        window.setTimeout(() => setFileSaveState("clean"), 1500);
      } catch (err: any) {
        setFileSaveState("dirty");
        throw err;
      }
    },
    [activeFile, projectId, useCentralizedAutosave]
  );

  const autoSaveTimerRef = useRef<number | null>(null);
  const scheduleAutoSave = useCallback(() => {
    if (!effectiveSettings.autoSave) return;
    if (useCentralizedAutosave && autosaveRef.current) {
      autosaveRef.current.markDirty();
      return;
    }
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      void persistAllPendingChanges();
    }, effectiveSettings.autoSaveDelayMs);
  }, [effectiveSettings.autoSave, effectiveSettings.autoSaveDelayMs, persistAllPendingChanges, useCentralizedAutosave]);

  useEffect(() => {
    if (!effectiveSettings.autoSave || useCentralizedAutosave) return;
    const timer = setInterval(() => {
      void persistAllPendingChanges();
    }, effectiveSettings.autoSaveDelayMs);
    return () => clearInterval(timer);
  }, [persistAllPendingChanges, effectiveSettings.autoSave, effectiveSettings.autoSaveDelayMs, useCentralizedAutosave]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const triggerCompile = useCallback(async () => {
    if (isPublishingRef.current) return;
    const result = await runCompile();
    if (!result) return;
    if (result.success) {
      addToast({ title: "Compiled successfully", variant: "success" });
      const fileUrl = result.data.fileUrl || result.data.pdfUrl;
      if (mode === "course" && lectureId && fileUrl) {
        const attachRes = await api(`/lectures/${lectureId}/attach-notes`, {
          method: "POST",
          body: { pdfUrl: fileUrl },
        }).catch(() => null);
        if (attachRes && !attachRes.error) {
          invalidateCourseContentCaches(queryClient, courseId);
        }
      }
    } else {
      const first = result.errors[0];
      const loc = first?.file
        ? `${first.file.replace(/^\//, "")}${first.line != null ? `:${first.line}` : ""}`
        : first?.line != null
          ? `Line ${first.line}`
          : "";
      addToast({
        title: first?.type || "Compilation failed",
        description: loc
          ? `${loc} — ${first?.message || "Check the Errors tab."}`
          : first?.message || "Check the Errors tab for line numbers and suggested fixes.",
        variant: "destructive",
      });
    }
  }, [runCompile, addToast, mode, lectureId, courseId, queryClient]);

  const initialCompileRef = useRef(false);
  const safeScheduleAutoCompile = useCallback(() => {
    if (isPublishingRef.current || suppressAutoCompileRef.current) return;
    scheduleAutoCompile();
  }, [scheduleAutoCompile]);

  useEffect(() => {
    if (!isLuAuthoringMode || !luState?.isV2 || !activeFile?.path || luDeveloperMode) return;
    if (initialCompileRef.current) return;
    if (!isEducationalTexPath(activeFile.path)) return;
    if (isPublishingRef.current) return;
    initialCompileRef.current = true;
    const timer = window.setTimeout(() => void triggerCompile(), 1200);
    return () => window.clearTimeout(timer);
  }, [isLuAuthoringMode, luState?.isV2, activeFile?.path, luDeveloperMode, triggerCompile]);

  const usePersistedModels =
    isLuAuthoringMode && !luDeveloperMode && !!activeFile && isEducationalTexPath(activeFile.path);

  const renderLatexMonaco = () => (
    <LatexMonaco
      projectId={projectId}
      fileId={activeFile!.id}
      filePath={activeFile!.path}
      persistModels={usePersistedModels}
      fallbackContent={
        activeFile!.path === "/main.tex" || activeFile!.name === "main.tex"
          ? fallbackTex
          : undefined
      }
      token={token}
      username={username}
      onSave={saveCurrentFile}
      onContentChange={() => {
        if (activeFile?.id) {
          setFileSaveState(getFileSaveState(activeFile.id));
          if (monacoEditorRef.current) {
            setEditorTexContent(monacoEditorRef.current.getValue());
          }
        }
        scheduleAutoSave();
        if (!isLuAuthoringMode || luDeveloperMode) {
          safeScheduleAutoCompile();
          scheduleLuValidation();
        } else {
          safeScheduleAutoCompile();
        }
      }}
      onModelReady={() => {
        if (monacoEditorRef.current) {
          setEditorTexContent(monacoEditorRef.current.getValue());
        }
      }}
      onEditorMount={(editor) => {
        monacoEditorRef.current = editor;
      }}
    />
  );

  const renderCenterPanel = () => {
    if (!activeFile) {
      return <p className="text-slate-600">Select a file to edit</p>;
    }
    if (activeFile.path.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
      return (
        <img
          src={activeFile.s3Url ? withUploadAuth(activeFile.s3Url) : ""}
          alt={activeFile.name}
          className="max-w-full max-h-full object-contain p-4"
        />
      );
    }
    if (activeFile.path.match(/\.pdf$/i)) {
      return (
        <iframe
          src={activeFile.s3Url ? withUploadAuth(activeFile.s3Url) : ""}
          className="w-full h-full border-none"
          title={activeFile.name}
        />
      );
    }
    if (activeFile.path.match(/\.tex$/i)) {
      const useEducationalSplit =
        isLuAuthoringMode && !luDeveloperMode && isLuV2 && showVisualEditor && builderSelection;

      if (useEducationalSplit) {
        return (
          <div className="absolute inset-0">
            <PanelGroup orientation="horizontal">
              <Panel defaultSize={58} minSize={30}>
                <div className="h-full">{renderLatexMonaco()}</div>
              </Panel>
              <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-blue-500 transition-colors cursor-col-resize" />
              <Panel defaultSize={42} minSize={22}>
                <div className="h-full border-l border-slate-800 bg-[#1e1e1e]">
                  <LuComponentBuilderPanel
                    node={builderSelection.node}
                    texContent={editorTexContent}
                    selectedQuestionId={builderSelection.selectedQuestionId}
                    sourceOfTruth="tex"
                    onMutate={handleLuMutate}
                    onTexSave={handleVisualTexSave}
                    onRefresh={() => {
                      void refreshLuState();
                      void fetchProjectFiles();
                    }}
                  />
                </div>
              </Panel>
            </PanelGroup>
          </div>
        );
      }

      return <div className="absolute inset-0">{renderLatexMonaco()}</div>;
    }
    return (
      <div className="text-slate-500 text-center space-y-4">
        <FileImage className="w-12 h-12 mx-auto text-slate-700" />
        <p>Preview not available</p>
      </div>
    );
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (path) {
        void openFileByPath(path).then(() => void triggerCompile());
      }
    };
    const onQuizPreview = (e: Event) => {
      const node = (e as CustomEvent<LuExplorerNode>).detail;
      if (node) dispatchComponentSelected(node, node.config);
    };
    const onAddVideoContent = (e: Event) => {
      const targetNode = (e as CustomEvent<LuExplorerNode>).detail;
      setVideoTargetNode(targetNode || null);
      setShowVideoModal(true);
    };
    window.addEventListener("lu-preview-lesson", handler);
    window.addEventListener("lu-preview-quiz", onQuizPreview);
    window.addEventListener("lu-add-video-content", onAddVideoContent);
    return () => {
      window.removeEventListener("lu-preview-lesson", handler);
      window.removeEventListener("lu-preview-quiz", onQuizPreview);
      window.removeEventListener("lu-add-video-content", onAddVideoContent);
    };
  }, [openFileByPath, triggerCompile]);

  useEffect(() => {
    activeFilePathRef.current = activeFile?.path ?? null;
  }, [activeFile?.path]);

  useEffect(() => {
    const scrollToLine = (line: number) => {
      const editor = monacoEditorRef.current;
      if (!editor || line < 1) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    };

    const applyComponentFocus = (detail: LuFocusComponentDetail, attemptsLeft: number) => {
      const editor = monacoEditorRef.current;
      if (!editor) return;
      if (detail.filePath && activeFilePathRef.current !== detail.filePath) {
        if (attemptsLeft > 0) window.setTimeout(() => applyComponentFocus(detail, attemptsLeft - 1), 100);
        return;
      }
      const line = findComponentMarkerLine(editor.getValue() as string, detail.componentId);
      if (line) scrollToLine(line);
      else if (attemptsLeft > 0) window.setTimeout(() => applyComponentFocus(detail, attemptsLeft - 1), 100);
    };

    const applySectionFocus = (detail: LuFocusSectionDetail, attemptsLeft: number) => {
      const editor = monacoEditorRef.current;
      if (!editor) return;
      if (detail.filePath && activeFilePathRef.current !== detail.filePath) {
        if (attemptsLeft > 0) window.setTimeout(() => applySectionFocus(detail, attemptsLeft - 1), 100);
        return;
      }
      const pattern = LESSON_SECTION_PATTERNS[detail.section];
      const content = editor.getValue() as string;
      const match = findNthPatternMatch(content, pattern, detail.occurrence ?? 0);
      if (match?.index != null) {
        const line = content.slice(0, match.index).split("\n").length;
        scrollToLine(line);
      }
    };

    const onComponent = (e: Event) => {
      const detail = (e as CustomEvent<LuFocusComponentDetail>).detail;
      if (!detail?.componentId) return;
      applyComponentFocus(detail, 15);
    };
    const onSection = (e: Event) => {
      const detail = (e as CustomEvent<LuFocusSectionDetail>).detail;
      if (!detail?.section) return;
      applySectionFocus(detail, 15);
    };

    window.addEventListener("lu-focus-component", onComponent);
    window.addEventListener("lu-focus-section", onSection);
    return () => {
      window.removeEventListener("lu-focus-component", onComponent);
      window.removeEventListener("lu-focus-section", onSection);
    };
  }, []);

  const triggerEditorSearch = useCallback(() => {
    const editor = monacoEditorRef.current;
    if (!editor) return;
    editor.getAction("actions.find")?.run();
  }, []);

  const publishToResources = async () => {
    setIsPublishingResources(true);
    try {
      await persistAllPendingChanges();
      const targetCode = await getMainTexContent();
      if (!targetCode.trim()) throw new Error("main.tex is empty");

      const assets = files.filter((f) => f.s3Url).map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        url: f.s3Url,
      }));

      const res = await api(`/resources/content/save`, {
        method: "POST",
        body: {
          courseId: projectId,
          latexContent: targetCode,
          projectFiles: files,
          assets,
          pdfUrl,
        },
      });
      if (res.error) throw new Error(res.error);
      addToast({ title: "Published to Student View!", variant: "success" });
    } catch (err: any) {
      addToast({ title: "Publish failed", description: err.message, variant: "destructive" });
    } finally {
      setIsPublishingResources(false);
    }
  };

  const publishToLearningUniverse = async () => {
    setIsPublishingToLU(true);
    isPublishingRef.current = true;
    const publishStartedAt = Date.now();
    try {
      let publishSnapshotHash: string | undefined;
      let publishFileOverlay: Array<{ name: string; content: string }> | undefined;
      let flushSavedCount = 0;

      if (useCentralizedAutosave && autosaveRef.current) {
        const flush = await autosaveRef.current.flushBefore("publish");
        if (!flush.success) {
          throw new Error(flush.error || "Save all files before publishing");
        }
        flushSavedCount = flush.savedCount;
        publishSnapshotHash =
          flush.syncState?.lastSnapshotHash ??
          flush.snapshot?.snapshotHash ??
          autosaveRef.current.getLastSnapshotHash();
        publishFileOverlay = flush.snapshot?.files;
      } else {
        const snapshot = buildFullTextFileOverlay(projectId, filesRef.current, {
          mainFileName: "main.tex",
          activeFileId: activeFile?.id,
          getActiveEditorValue: () => monacoEditorRef.current?.getValue(),
        });
        publishSnapshotHash = snapshot.snapshotHash;
        publishFileOverlay = snapshot.files;
      }

      let targetCode = await getMainTexContent();
      if (!targetCode.trim()) throw new Error("main.tex is empty");

      const colabSanitized = sanitizeColabUrlsInDsl(targetCode);
      if (colabSanitized.strippedCount > 0) {
        console.warn(
          `[Publish] Removed ${colabSanitized.strippedCount} placeholder Colab URL(s) before publish`
        );
        targetCode = colabSanitized.latex;
      }

      console.info("[Publish] starting", {
        projectId,
        universeId,
        snapshotHash: publishSnapshotHash,
        editorVersion: autosaveRef.current?.getEditorVersion(),
        flushSavedCount,
      });

      const res = await publishLearningUniverse(targetCode, projectId, universeId, {
        snapshotHash: publishSnapshotHash,
        fileOverlay: publishFileOverlay,
        editorVersion: autosaveRef.current?.getEditorVersion(),
      });
      if (res.error) throw new Error(res.error);

      const publishedPayload = res.data as
        | { data?: { id?: string }; id?: string }
        | undefined;
      const publishedUniverse = publishedPayload?.data ?? publishedPayload;
      const publishedId =
        (publishedUniverse && typeof publishedUniverse === "object" && "id" in publishedUniverse
          ? (publishedUniverse as { id?: string }).id
          : undefined) ?? universeId;

      queryClient.invalidateQueries({ queryKey: ["learner-experience"] });
      queryClient.invalidateQueries({ queryKey: ["learning-universe"] });
      if (publishedId) {
        queryClient.invalidateQueries({ queryKey: ["learner-experience", publishedId] });
        queryClient.invalidateQueries({ queryKey: ["learning-universe", publishedId] });
      }
      queryClient.invalidateQueries({ queryKey: ["lu-state", projectId] });

      console.info("[Publish] complete", {
        projectId,
        universeId: publishedId,
        snapshotHash: publishSnapshotHash,
        durationMs: Date.now() - publishStartedAt,
      });

      addToast({ title: publishSuccessTitle, variant: "success" });
      if (publishedId) {
        navigate(`/instructor/preview/learning-universe/${publishedId}/learn`);
      }

      if (isLuAuthoringMode) {
        try {
          await syncEditorFromServer({ force: true });
        } catch (syncErr: any) {
          console.warn("[Publish] post-publish editor sync failed", syncErr);
        }
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Publish failed";
      console.error("[Publish] failed", { projectId, message });
      addToast({
        title: "Publish failed",
        description:
          message.length > 280 ? `${message.slice(0, 280)}…` : message,
        variant: "destructive",
      });
    } finally {
      isPublishingRef.current = false;
      autosaveRef.current?.releaseFreeze();
      setIsPublishingToLU(false);
    }
  };

  const publishToAcademicCourse = async () => {
    setIsPublishingToCourse(true);
    try {
      await persistAllPendingChanges();
      const targetCode = await getMainTexContent();
      if (!targetCode.trim()) throw new Error("main.tex is empty");

      const res = await publishAcademicCourse(targetCode, projectId, courseId);
      if (res.error) throw new Error(res.error);

      addToast({ title: "Course published!", variant: "success" });
      const publishedCourse = (res.data as any)?.course || (res.data as any)?.data?.course;
      if (publishedCourse?.id) {
        navigate(`/instructor/course/${publishedCourse.id}/edit`);
      }
    } catch (err: any) {
      addToast({ title: "Publish course failed", description: err.message, variant: "destructive" });
    } finally {
      setIsPublishingToCourse(false);
    }
  };

  useEffect(() => {
    if (!isLuAuthoringMode) return;
    const onShortcut = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const inTextEditor = isTextEditorFocused() || isTextEditorEventTarget(e.target);

      // Compile: Cmd/Ctrl + Enter (allowed even while editor has focus)
      if (e.key === "Enter") {
        e.preventDefault();
        void triggerCompile();
        return;
      }

      // Prevent remaining global shortcuts while typing in editor/input fields.
      if (inTextEditor) return;

      // Publish: Cmd/Ctrl + Shift + P
      if (e.shiftKey && key === "p") {
        e.preventDefault();
        if (mode === "learning-universe") void publishToLearningUniverse();
        else if (mode === "academic-course") void publishToAcademicCourse();
        else if (mode === "resources") void publishToResources();
        return;
      }

      // Open image assets manager: Cmd/Ctrl + Shift + I
      if (e.shiftKey && key === "i") {
        if (activeFile?.path.endsWith(".tex")) {
          e.preventDefault();
          setShowAssetsDialog(true);
        }
        return;
      }

      // Editor search: Cmd/Ctrl + Shift + F
      if (e.shiftKey && key === "f") {
        e.preventDefault();
        triggerEditorSearch();
        return;
      }

      // Toggle file tree: Cmd/Ctrl + B
      if (!e.shiftKey && key === "b") {
        e.preventDefault();
        setShowFileTree((v) => !v);
        return;
      }

      // AI Guide: Cmd/Ctrl + Shift + G
      if (e.shiftKey && key === "g") {
        e.preventDefault();
        setShowLatexGuide(true);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [
    isLuAuthoringMode,
    mode,
    activeFile?.path,
    triggerCompile,
    triggerEditorSearch,
    publishToLearningUniverse,
    publishToAcademicCourse,
    publishToResources,
  ]);

  function insertSnippet(snippet: string) {
    const editor = monacoEditorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const monacoApi = (window as any).monaco;
    if (!monacoApi?.Range) return;
    const range = new monacoApi.Range(
      selection.startLineNumber,
      selection.startColumn,
      selection.endLineNumber,
      selection.endColumn
    );
    editor.executeEdits("snippet-insert", [{ range, text: snippet, forceMoveMarkers: true }]);
    editor.focus();
    if (isLuAuthoringMode && !luDeveloperMode) {
      void triggerCompile();
    } else {
      safeScheduleAutoCompile();
    }
  }

  const handleSaveVideoFromModal = useCallback(async (data: VideoAuthoringData) => {
    const targetLesson =
      videoTargetNode ||
      previewLessonNode ||
      (activeFile?.path ? findLessonForFilePath(luState?.explorer ?? [], activeFile.path) : null);

    if (!targetLesson || !targetLesson.trackId || !targetLesson.moduleId || !targetLesson.lessonId) {
      addToast({ title: "Cannot attach video", description: "No active lesson node found.", variant: "destructive" });
      return;
    }

    try {
      const res = (await handleLuMutate({
        action: "appendLessonBlock",
        trackId: targetLesson.trackId,
        moduleId: targetLesson.moduleId,
        lessonId: targetLesson.lessonId,
        block: "video",
      })) as { createdComponentId?: string; createdFilePath?: string } | null;

      const createdId = res?.createdComponentId;
      const compPath = res?.createdFilePath;

      if (createdId) {
        if (data.title?.trim()) {
          await handleLuMutate({
            action: "renameComponent",
            trackId: targetLesson.trackId,
            moduleId: targetLesson.moduleId,
            lessonId: targetLesson.lessonId,
            componentId: createdId,
            title: data.title.trim(),
          });
        }

        await handleLuMutate({
          action: "updateComponentConfig",
          trackId: targetLesson.trackId,
          moduleId: targetLesson.moduleId,
          lessonId: targetLesson.lessonId,
          componentId: createdId,
          config: {
            type: data.type,
            sourceType: data.type,
            url: data.url,
            file: data.file,
            title: data.title,
          },
        });
      }

      await syncFilesAfterMutation();

      if (compPath) {
        await openFileByPath(compPath);
      }

      if (createdId) {
        const childNode: LuExplorerNode = {
          id: `${targetLesson.trackId}-${targetLesson.moduleId}-${targetLesson.lessonId}-${createdId}`,
          kind: "video",
          title: data.title,
          trackId: targetLesson.trackId,
          moduleId: targetLesson.moduleId,
          lessonId: targetLesson.lessonId,
          componentId: createdId,
          filePath: compPath,
          status: "empty",
          issues: [],
          config: {
            type: data.type,
            sourceType: data.type,
            url: data.url,
            file: data.file,
            title: data.title,
          },
        };
        dispatchComponentSelected(childNode, childNode.config);
      }

      addToast({ title: "Video component created", description: `Added "${data.title}" as a video component.`, variant: "success" });
      void triggerCompile();
    } catch (err: any) {
      addToast({ title: "Failed to create video component", description: err.message || "An error occurred", variant: "destructive" });
    }
  }, [videoTargetNode, previewLessonNode, activeFile?.path, luState?.explorer, handleLuMutate, syncFilesAfterMutation, openFileByPath, addToast, triggerCompile]);

  const defaultImageSnippet = `\\includegraphics[width=0.7\\linewidth]{${defaultImageUploadFolder(isLuAuthoringMode).replace(/^\//, "")}/your-image.png}`;

  const goToErrorLine = (line: number) => {
    const editor = monacoEditorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  };


  const runAutoRepair = useCallback(
    async (_error: LatexCompileError) => {
      if (!isLuAuthoringMode) return;
      setIsAutoRepairing(true);
      try {
        const { error } = await api(`/latex-projects/${projectId}/lu/prepare-build`, {
          method: "POST",
          body: { mode: "repair" },
        });
        if (error) {
          addToast({ title: "Auto repair failed", description: error, variant: "destructive" });
          return;
        }
        addToast({ title: "Repairs applied", description: "Recompiling…", variant: "success" });
        await triggerCompile();
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : "Auto repair failed";
        addToast({ title: "Auto repair failed", description: msg, variant: "destructive" });
      } finally {
        setIsAutoRepairing(false);
      }
    },
    [isLuAuthoringMode, projectId, addToast, triggerCompile]
  );

  const goToCompileError = useCallback(
    async (error: LatexCompileError) => {
      const line = error.line ?? undefined;
      if (error.file) {
        await openFileByPath(error.file);
        window.setTimeout(() => {
          if (line != null) goToErrorLine(line);
        }, 150);
      } else if (line != null) {
        goToErrorLine(line);
      }
    },
    [openFileByPath]
  );

  const editorTitle =
    mode === "learning-universe"
      ? forceDeveloperMode
        ? "Developer Studio"
        : "Academic Authoring Studio"
      : mode === "academic-course"
        ? "Academic Course Studio"
      : mode === "course"
        ? "Course Notes Editor"
        : "GATEHUB Editor";

  const operationStatus = useMemo(() => {
    if (isPublishingToLU) {
      return { tone: "progress" as const, text: "Publishing to Learning Universe... syncing, validating, and saving." };
    }
    if (isPublishingToCourse) {
      return { tone: "progress" as const, text: "Publishing Academic Course... finalizing content." };
    }
    if (isPublishingResources) {
      return { tone: "progress" as const, text: "Publishing resources... packaging latest files." };
    }
    if (isCompiling) {
      return { tone: "progress" as const, text: "Compiling preview PDF... this can take a few seconds." };
    }
    if (status === "queued") {
      return { tone: "info" as const, text: "Compile queued. Waiting for current tasks to finish." };
    }
    if (status === "error") {
      return { tone: "error" as const, text: "Last compile failed. Check Errors and jump to line-level fixes." };
    }
    if (status === "success") {
      return { tone: "success" as const, text: "Compile successful. Preview reflects latest saved content." };
    }
    return null;
  }, [isPublishingToLU, isPublishingToCourse, isPublishingResources, isCompiling, status]);
  const panelWidths = useMemo(
    () =>
      isCompactViewport
        ? {
            extraMin: 220,
            extraMax: 290,
            historyMin: 240,
            historyMax: 310,
            treeMin: 220,
            treeMax: 290,
          }
        : {
            extraMin: 280,
            extraMax: 350,
            historyMin: 300,
            historyMax: 380,
            treeMin: 260,
            treeMax: 340,
          },
    [isCompactViewport]
  );

  const autosaveStatus = useMemo(() => {
    if (isSaving || fileSaveState === "saving") {
      return {
        tone: "progress" as const,
        text: dirtyFileCount > 1 ? `Saving ${dirtyFileCount} files...` : "Saving...",
      };
    }
    if (fileSaveState === "dirty" || dirtyFileCount > 0) {
      return {
        tone: "warning" as const,
        text: dirtyFileCount > 1 ? `${dirtyFileCount} unsaved changes` : "Unsaved changes",
      };
    }
    if (fileSaveState === "conflict") {
      return { tone: "error" as const, text: "Save conflict detected. Refresh file to resolve." };
    }
    if (lastSavedAt) {
      const elapsedSec = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000));
      const label =
        elapsedSec < 5
          ? "just now"
          : elapsedSec < 60
            ? `${elapsedSec}s ago`
            : `${Math.round(elapsedSec / 60)}m ago`;
      return { tone: "success" as const, text: `All changes saved (${label})` };
    }
    return { tone: "info" as const, text: "Autosave active" };
  }, [isSaving, fileSaveState, dirtyFileCount, lastSavedAt]);

  if (isInitializing) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#1e1e1e]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#1e1e1e] text-slate-200">
      <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-[#252526] shrink-0 overflow-hidden">
        <div className="flex items-center gap-2 md:gap-4">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-slate-700 hidden md:block mx-1" />
          {onToggleExtraLeftPanel && extraLeftPanel && (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={onToggleExtraLeftPanel}>
                {showExtraLeftPanel ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
              </Button>
              <div className="w-px h-6 bg-slate-700 hidden md:block mx-1" />
            </>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => setShowFileTree(!showFileTree)}>
            {showFileTree ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={`h-8 w-8 ${showVersionHistory ? "text-primary" : "text-slate-400"}`}
            onClick={() => setShowVersionHistory(!showVersionHistory)}
          >
            <History className="w-5 h-5" />
          </Button>
          <h1 className="font-bold text-sm tracking-tight text-white hidden md:flex items-center gap-2">
            <BrandHomeButton className="text-white" />
            <span className="text-slate-400">/</span>
            {editorTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={cn(
              "hidden 2xl:flex items-center gap-1.5 text-xs rounded px-2 py-1 border",
              autosaveStatus.tone === "progress" && "text-amber-300 border-amber-500/40 bg-amber-500/10",
              autosaveStatus.tone === "warning" && "text-amber-300 border-amber-500/40 bg-amber-500/10",
              autosaveStatus.tone === "error" && "text-red-300 border-red-500/40 bg-red-500/10",
              autosaveStatus.tone === "success" && "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
              autosaveStatus.tone === "info" && "text-slate-300 border-slate-600 bg-slate-700/30"
            )}
            role="status"
            aria-live="polite"
            title={autosaveStatus.text}
          >
            {(autosaveStatus.tone === "progress" || isSaving || fileSaveState === "saving") ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Save className="w-3 h-3" />
            )}
            <span>{autosaveStatus.text}</span>
          </div>
          {activeFile?.path.endsWith(".tex") && (
            <div className="flex items-center gap-1 mr-1 hidden md:flex">
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-white gap-2 h-8 px-2"
                title="Add Video Content (YouTube or Local Upload)"
                onClick={() => setShowVideoModal(true)}
              >
                <Video className="w-3.5 h-3.5 text-amber-400" /> Video
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-white gap-2 h-8 px-2"
                title="Upload images and insert into LaTeX"
                onClick={() => setShowAssetsDialog(true)}
              >
                <ImageIcon className="w-3.5 h-3.5" /> Images
              </Button>
            </div>
          )}

          {isLuAuthoringMode && !luDeveloperMode && luState && (
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-white gap-1.5 h-8 px-2 hidden md:flex"
              title={`Project health: ${luState.health.score}%`}
              onClick={() => setShowFileTree(true)}
            >
              <Activity className={cn("w-3.5 h-3.5", luState.health.score >= 80 ? "text-emerald-400" : "text-amber-400")} />
              <span className="text-xs">{luState.health.score}%</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "gap-2 h-8",
              fileSaveState === "dirty" ? "text-amber-400 hover:text-amber-300" : "text-slate-400 hover:text-white"
            )}
            onClick={saveCurrentFile}
            disabled={isSaving || !activeFile?.path.endsWith(".tex")}
            title="Save current file (Ctrl+S)"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {fileSaveState === "dirty" || dirtyFileCount > 0
              ? dirtyFileCount > 1
                ? `Save (${dirtyFileCount})*`
                : "Save*"
              : fileSaveState === "saved"
                ? "Saved"
                : "Save"}
          </Button>
          {isLuAuthoringMode && (
            <Button
              size="sm"
              variant="ghost"
              className="text-amber-400/90 hover:text-amber-300 gap-1.5 h-8"
              onClick={() => setShowLatexGuide(true)}
              title="AI LaTeX guide — paste your prompt to generate file codes"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden lg:inline text-xs">AI Guide</span>
            </Button>
          )}
          {isLuAuthoringMode && !luDeveloperMode && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-white gap-1 h-8"
                onClick={() => void handleLuUndo()}
                disabled={!luCanUndo}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-white gap-1 h-8"
                onClick={() => void handleLuRedo()}
                disabled={!luCanRedo}
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
            </>
          )}
          {isLuAuthoringMode && !luDeveloperMode && (
            <Button
              size="sm"
              variant="outline"
              className="text-slate-300 border-slate-600 hover:bg-slate-700 gap-2 h-8"
              onClick={openFullCoursePreview}
              title="Open full student course preview (W3Schools-style)"
            >
              <Eye className="w-4 h-4" />
              Preview
            </Button>
          )}
          <Button
            size="sm"
            variant="default"
            className="bg-slate-700 hover:bg-slate-600 text-white gap-2 font-semibold h-8 border border-slate-600"
            onClick={triggerCompile}
            disabled={isCompiling}
            title="Compile project to PDF"
          >
            {isCompiling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {status === "queued" ? "Queued" : "Compile"}
          </Button>

          {isLuAuthoringMode && (
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-white gap-2 h-8 hidden sm:flex"
              onClick={triggerEditorSearch}
              disabled={!activeFile?.path.endsWith(".tex")}
              title="Search in editor (Ctrl+F)"
            >
              <Search className="w-4 h-4" />
            </Button>
          )}

          {mode === "resources" && (
            <Button
              size="sm"
              variant="default"
              className="bg-emerald-700 hover:bg-emerald-600 text-white gap-2 font-bold h-8"
              onClick={publishToResources}
              disabled={isPublishingResources}
            >
              {isPublishingResources ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
              Publish
            </Button>
          )}

          {mode === "learning-universe" && (
            <Button
              size="sm"
              variant="default"
              className="bg-primary hover:opacity-90 text-primary-foreground gap-2 font-bold h-8"
              onClick={publishToLearningUniverse}
              disabled={isPublishingToLU}
            >
              {isPublishingToLU ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              {publishLabel}
            </Button>
          )}

          {mode === "academic-course" && (
            <Button
              size="sm"
              variant="default"
              className="bg-amber-600 hover:bg-amber-500 text-white gap-2 font-bold h-8"
              onClick={publishToAcademicCourse}
              disabled={isPublishingToCourse}
            >
              {isPublishingToCourse ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              Publish Course
            </Button>
          )}

          {onBackToExperienceStudio && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-slate-300 border-slate-600 hidden sm:flex"
              onClick={onBackToExperienceStudio}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Experience Studio
            </Button>
          )}

          {mode === "learning-universe" && (isLuV2 || luState?.isV2) && !forceDeveloperMode && (
            <div className="hidden lg:block w-[160px] xl:w-[200px] shrink-0 px-1">
              <LuModeToggle
                developerMode={luDeveloperMode}
                onSetDeveloperMode={setLuDeveloperModePersisted}
                compact
                inline
              />
            </div>
          )}

          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-slate-700" onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4 text-slate-400" />
          </Button>
        </div>
      </div>
      {operationStatus && (
        <div
          className={cn(
            "h-8 shrink-0 px-4 border-b border-slate-800 flex items-center gap-2 text-xs",
            operationStatus.tone === "error" && "bg-red-500/10 text-red-300",
            operationStatus.tone === "success" && "bg-emerald-500/10 text-emerald-300",
            operationStatus.tone === "info" && "bg-blue-500/10 text-blue-300",
            operationStatus.tone === "progress" && "bg-amber-500/10 text-amber-300"
          )}
          role="status"
          aria-live="polite"
        >
          {(operationStatus.tone === "progress" || isCompiling || isPublishingToLU || isPublishingToCourse || isPublishingResources) ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : null}
          <span className="truncate">{operationStatus.text}</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {showExtraLeftPanel && extraLeftPanel && (
          <div
            className="flex-shrink-0 h-full border-r border-slate-800 bg-[#181818]"
            style={{ minWidth: panelWidths.extraMin, maxWidth: panelWidths.extraMax }}
          >
            {extraLeftPanel}
          </div>
        )}

        {showVersionHistory && (
          <div
            className="flex-shrink-0 h-full border-r border-slate-800 bg-[#181818]"
            style={{ minWidth: panelWidths.historyMin, maxWidth: panelWidths.historyMax }}
          >
            <VersionHistoryPanel projectId={projectId} onRestored={fetchProjectFiles} onClose={() => setShowVersionHistory(false)} />
          </div>
        )}

        {showFileTree && (
          <div
            className="flex-shrink-0 h-full border-r border-slate-800 bg-[#181818]"
            style={{ minWidth: panelWidths.treeMin, maxWidth: panelWidths.treeMax }}
          >
            {isLuAuthoringMode && !luDeveloperMode && !forceDeveloperMode ? (
              <LuAuthoringPanel
                projectId={projectId}
                state={luState}
                loading={luLoading}
                error={luError}
                developerMode={luDeveloperMode}
                onSetDeveloperMode={setLuDeveloperModePersisted}
                onRefresh={refreshLuState}
                onMutate={handleLuMutate}
                onOpenFile={openFileByPath}
                activeFilePath={activeFile?.path}
              />
            ) : (
              <FileTree
                projectId={projectId}
                files={files}
                activeFileId={activeFile?.id || null}
                onSelectFile={(file) => {
                  setActiveFile(file);
                  saveLuActiveFilePath(projectId, file.path);
                }}
                onRefresh={() => void fetchProjectFiles()}
                luDeveloperMode={isLuAuthoringMode && luDeveloperMode}
                onSetLuDeveloperMode={isLuAuthoringMode ? setLuDeveloperModePersisted : undefined}
              />
            )}
          </div>
        )}

        <div className="flex-1 overflow-hidden h-full">
          <PanelGroup orientation="horizontal">
            <Panel defaultSize={50} minSize={20}>
              <div className="h-full flex flex-col">
                <div className="h-9 border-b border-slate-800 flex items-center px-4 bg-[#252526]">
                  <div className="text-xs font-mono text-slate-400 bg-[#1e1e1e] h-full px-4 border-t-2 border-t-blue-500 flex items-center gap-2">
                    {showVisualEditor && builderSelection
                      ? `${activeFile?.name || builderSelection.node.title} — ${builderSelection.node.title}`
                      : activeFile?.name || activeFile?.path || "No file selected"}
                    {showVisualEditor && (
                      <button
                        type="button"
                        className="text-[10px] text-blue-400 hover:text-blue-300 ml-2"
                        onClick={() => setBuilderSelection(null)}
                      >
                        Hide editor
                      </button>
                    )}
                    {luDeveloperMode && activeFile?.path === "/main.tex" && (
                      <span className="ml-2 text-amber-500 text-[10px]">(read-only)</span>
                    )}
                    {!isLuAuthoringMode && activeFile?.path.endsWith(".tex") && activeFile.path !== "/main.tex" && (
                      <span className="ml-2 text-amber-500 text-[10px]">(compile uses main.tex)</span>
                    )}
                  </div>
                </div>
                <div className="flex-1 bg-[#1e1e1e] relative flex items-center justify-center">
                  {renderCenterPanel()}
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-blue-500 transition-colors cursor-col-resize" />

            <Panel defaultSize={50} minSize={20}>
              <PdfPreview
                pdfUrl={pdfUrl}
                pdfCacheBust={pdfCacheBust}
                logs={logs}
                errors={errors}
                isCompiling={isCompiling}
                compileStatus={status}
                onRefresh={triggerCompile}
                generatedTex={generatedTex}
                compileCommands={compileCommands}
                outputDirectory={outputDirectory}
                compileReport={compileReport}
                includeOrder={includeOrder}
                failedAtFile={failedAtFile}
                compilationTime={compilationTime ?? undefined}
                settings={effectiveSettings}
                onSettingsChange={updateSettings}
                onGoToError={goToCompileError}
                onGoToErrorLine={goToErrorLine}
                onAutoRepair={isLuAuthoringMode ? runAutoRepair : undefined}
                repairing={isAutoRepairing}
                studentPreview={
                  isLuAuthoringMode && !luDeveloperMode ? (
                    <ExperienceStudentPreview
                      lessonNode={previewLessonNode}
                      selectedComponent={previewSelectedComponent}
                      activeFilePath={activeFile?.path}
                      courseTitle={luState?.project?.universe?.title ?? luState?.project?.metadata?.title}
                      editorTexContent={editorTexContent}
                      projectFiles={files.map((f) => ({
                        name: f.name,
                        path: f.path,
                        s3Url: f.s3Url,
                        isFolder: f.isFolder,
                        content: f.content,
                      }))}
                      compiledLessonPreview={lessonPreview}
                      previewStale={compiledPreviewStale}
                    />
                  ) : undefined
                }
                defaultTab={isLuAuthoringMode && !luDeveloperMode ? "student" : "pdf"}
              />
            </Panel>
          </PanelGroup>
        </div>
      </div>

      <AppAssistantFooter
        className="shrink-0 border-t border-slate-800 bg-[#252526]"
        innerClassName="px-4 py-2"
        compact
      />

      <EditorSettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        settings={effectiveSettings}
        onChange={updateSettings}
      />
      <LuLatexGuideDialog
        open={showLatexGuide}
        onOpenChange={setShowLatexGuide}
        projectId={projectId}
        activeFilePath={activeFile?.path}
        onApplyFile={applyGuideFileContent}
        onOpenFile={(path) => void openFileByPath(path.startsWith("/") ? path : `/${path}`)}
      />
      <LuProjectAssetsDialog
        open={showAssetsDialog}
        onOpenChange={setShowAssetsDialog}
        projectId={projectId}
        isLuProject={isLuAuthoringMode}
        files={files}
        onRefresh={() => void syncFilesAfterMutation()}
        onInsert={insertSnippet}
      />
      <VideoAuthoringModal
        open={showVideoModal}
        onClose={() => setShowVideoModal(false)}
        onSave={handleSaveVideoFromModal}
        projectId={projectId}
      />
    </div>
  );
}
