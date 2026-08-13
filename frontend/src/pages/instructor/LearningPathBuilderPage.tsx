import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  GripVertical,
  ArrowLeft,
  Layout,
  Map,
  Sparkles,
  Target,
  TrendingUp,
  Clock,
  Bookmark,
  BookOpen,
  Copy,
  Eye,
  Loader2,
  FileText,
  Layers,
} from "lucide-react";
import { Link } from "react-router-dom";
import { LessonBlockEditor } from "@/components/visual-authoring/LessonBlockEditor";
import { StudentPreviewPane } from "@/components/visual-authoring/StudentPreviewPane";
import { createEmptyLesson, type LuLesson } from "@/lib/learningUniverseSchema";
import { COURSE_TEMPLATES } from "@/lib/visualBuilder/templates";
import { visualToPageUniverse, pageUniverseToStructured, loadStructuredFromApi, templateToPageUniverse, normalizeLesson, createEmptyVisualState, countProjectBlocks, normalizePageUniverse, resolveExplorerSelection, uid, type ExplorerSelection, type VisualLesson, type PageLearningUniverse } from "@/lib/visualBuilder/converters";
import { getLearningUniverseById, publishVisualLearningUniverse } from "@/lib/api";
import { loadBrandingSession } from "@/lib/courseBranding/types";
import { getProductDashboardPath, parseProductType, PRODUCT_TYPES, type ProductType } from "@/lib/productTypes";
import { VisualAssetProvider, useVisualAssets } from "@/components/visual-authoring/VisualAssetContext";
import { useToastStore } from "@/store/toastStore";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// --- Types ---

type Difficulty = "Beginner" | "Intermediate" | "Advanced" | "Expert";

interface Lesson extends LuLesson {
  id: string;
}

interface Module {
  id: string;
  title: string;
  description: string;
  prerequisites: string;
  learningOutcomes: string;
  estimatedHours: number;
  lessons: Lesson[];
  expanded: boolean;
}

interface Track {
  id: string;
  title: string;
  description: string;
  learningOutcomes: string;
  careerOutcomes: string;
  estimatedHours: number;
  difficulty: Difficulty;
  projectsIncluded: number;
  modules: Module[];
  expanded: boolean;
}

type LearningUniverse = PageLearningUniverse;

type ViewMode = "structure" | "roadmap";

function isTrackSelected(selection: ExplorerSelection | null, trackId: string) {
  return selection?.kind === "track" && selection.trackId === trackId;
}
function isModuleSelected(selection: ExplorerSelection | null, trackId: string, moduleId: string) {
  return selection?.kind === "module" && selection.trackId === trackId && selection.moduleId === moduleId;
}
function isLessonSelected(selection: ExplorerSelection | null, trackId: string, moduleId: string, lessonId: string) {
  return selection?.kind === "lesson" && selection.trackId === trackId && selection.moduleId === moduleId && selection.lessonId === lessonId;
}

function dndId(kind: "track" | "module" | "lesson", trackId: string, moduleId?: string, lessonId?: string) {
  if (kind === "track") return `track:${trackId}`;
  if (kind === "module") return `module:${trackId}:${moduleId}`;
  return `lesson:${trackId}:${moduleId}:${lessonId}`;
}

// --- Sortable Components ---

function SortableTrack({
  track,
  selection,
  onSelectTrack,
  setUniverse,
  addModule,
  toggleExpand,
  deleteTrack,
  duplicateTrack,
}: {
  track: Track;
  selection: ExplorerSelection | null;
  onSelectTrack: (trackId: string) => void;
  setUniverse: React.Dispatch<React.SetStateAction<LearningUniverse>>;
  addModule: (trackId: string) => void;
  toggleExpand: (id: string, type: "track" | "module") => void;
  deleteTrack: (trackId: string) => void;
  duplicateTrack: (track: Track) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dndId("track", track.id) });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style} className="space-y-1 group">
      {/* Track Row */}
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isTrackSelected(selection, track.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
        }`}
        onClick={() => onSelectTrack(track.id)}
      >
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); toggleExpand(track.id, "track"); }}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {track.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <Input
          value={track.title}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setUniverse(prev => ({
            ...prev,
            tracks: prev.tracks.map(t => t.id === track.id ? { ...t, title: e.target.value } : t),
          }))}
          className="flex-1 text-sm font-medium border-none focus-visible:ring-0 p-0 bg-transparent"
        />
        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => { e.stopPropagation(); addModule(track.id); }}
          >
            <Plus className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => { e.stopPropagation(); duplicateTrack(track); }}
          >
            <Copy className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive"
            onClick={(e) => { e.stopPropagation(); deleteTrack(track.id); }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {/* Modules will be rendered inside here */}
    </div>
  );
}

function SortableModule({
  trackId,
  module,
  selection,
  onSelectModule,
  setUniverse,
  addLesson,
  toggleExpand,
  deleteModule,
  duplicateModule,
}: {
  trackId: string;
  module: Module;
  selection: ExplorerSelection | null;
  onSelectModule: (trackId: string, moduleId: string) => void;
  setUniverse: React.Dispatch<React.SetStateAction<LearningUniverse>>;
  addLesson: (trackId: string, moduleId: string) => void;
  toggleExpand: (id: string, type: "track" | "module") => void;
  deleteModule: (trackId: string, moduleId: string) => void;
  duplicateModule: (trackId: string, module: Module) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dndId("module", trackId, module.id) });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style} className="space-y-1 group">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isModuleSelected(selection, trackId, module.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
        }`}
        onClick={() => onSelectModule(trackId, module.id)}
      >
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); toggleExpand(module.id, "module"); }}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {module.expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <Input
          value={module.title}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setUniverse(prev => ({
            ...prev,
            tracks: prev.tracks.map(t => t.id === trackId ? {
              ...t,
              modules: t.modules.map(m => m.id === module.id ? { ...m, title: e.target.value } : m),
            } : t),
          }))}
          className="flex-1 text-xs border-none focus-visible:ring-0 p-0 bg-transparent"
        />
        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => { e.stopPropagation(); addLesson(trackId, module.id); }}
          >
            <Plus className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => { e.stopPropagation(); duplicateModule(trackId, module); }}
          >
            <Copy className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-destructive"
            onClick={(e) => { e.stopPropagation(); deleteModule(trackId, module.id); }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortableLesson({
  trackId,
  moduleId,
  lesson,
  selection,
  onSelectLesson,
  setUniverse,
  deleteLesson,
  duplicateLesson,
}: {
  trackId: string;
  moduleId: string;
  lesson: Lesson;
  selection: ExplorerSelection | null;
  onSelectLesson: (trackId: string, moduleId: string, lessonId: string) => void;
  setUniverse: React.Dispatch<React.SetStateAction<LearningUniverse>>;
  deleteLesson: (trackId: string, moduleId: string, lessonId: string) => void;
  duplicateLesson: (trackId: string, moduleId: string, lesson: Lesson) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dndId("lesson", trackId, moduleId, lesson.id) });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors group ${
        isLessonSelected(selection, trackId, moduleId, lesson.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelectLesson(trackId, moduleId, lesson.id);
      }}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
      </div>
      <Input
        value={lesson.title}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          setUniverse(prev => ({
            ...prev,
            tracks: prev.tracks.map(t => t.id === trackId ? {
              ...t,
              modules: t.modules.map(m => m.id === moduleId ? {
                ...m,
                lessons: m.lessons.map(l => l.id === lesson.id ? { ...l, title: e.target.value } : l),
              } : m),
            } : t),
          }));
        }}
        className="flex-1 text-xs border-none focus-visible:ring-0 p-0 bg-transparent"
      />
      {(lesson.contentBlocks?.length ?? 0) > 0 && (
        <span className="text-[10px] text-muted-foreground shrink-0">{lesson.contentBlocks!.length} blocks</span>
      )}
      <div className="opacity-0 group-hover:opacity-100 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => { e.stopPropagation(); duplicateLesson(trackId, moduleId, lesson); }}
        >
          <Copy className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-destructive"
          onClick={(e) => { e.stopPropagation(); deleteLesson(trackId, moduleId, lesson.id); }}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

const DRAFT_KEY = "lu-visual-draft";

function visualBrandingPath(productType: ProductType): string {
  switch (productType) {
    case PRODUCT_TYPES.PREMIUM_COURSE:
      return `/instructor/courses/new/branding?studio=visual&productType=${PRODUCT_TYPES.PREMIUM_COURSE}`;
    case PRODUCT_TYPES.FREE_COURSE:
      return `/manage-courses/new/branding?studio=visual&productType=${PRODUCT_TYPES.FREE_COURSE}`;
    case PRODUCT_TYPES.FREE_RESOURCE:
      return `/manage-courses/new/branding?studio=visual&productType=${PRODUCT_TYPES.FREE_RESOURCE}`;
    default:
      return "/instructor/learning-universe/new/branding?studio=visual";
  }
}

function creationChooserPath(productType: ProductType): string {
  switch (productType) {
    case PRODUCT_TYPES.PREMIUM_COURSE:
      return "/instructor/courses/new";
    case PRODUCT_TYPES.FREE_COURSE:
    case PRODUCT_TYPES.FREE_RESOURCE:
      return "/manage-courses/new";
    default:
      return "/instructor/learning-universe/new";
  }
}

const DEFAULT_RULES = ["Complete all lessons", "Pass all quizzes", "Submit all projects"];

const INITIAL_UNIVERSE: LearningUniverse = normalizePageUniverse({
  ...visualToPageUniverse(createEmptyVisualState()),
  completionRules: [...DEFAULT_RULES],
});

export function LearningPathBuilderPage() {
  return (
    <VisualAssetProvider>
      <LearningPathBuilderInner />
    </VisualAssetProvider>
  );
}

function LearningPathBuilderInner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const draftUniverseId = searchParams.get("universe");
  const branding = loadBrandingSession();
  const productType =
    branding?.productType || parseProductType(searchParams.get("productType"));
  const brandingPath = useMemo(() => visualBrandingPath(productType), [productType]);
  const backPath = useMemo(() => creationChooserPath(productType), [productType]);
  const toast = useToastStore((s) => s.add);
  const { setUniverseContext, getPendingFiles, clearAssets } = useVisualAssets();

  const [universe, setUniverse] = useState<LearningUniverse>(INITIAL_UNIVERSE);
  const [viewMode, setViewMode] = useState<ViewMode>("structure");
  const [selection, setSelection] = useState<ExplorerSelection | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<"author" | "split" | "preview">("split");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!editId);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!editId && !draftUniverseId && !branding?.universeId) {
      navigate(brandingPath, { replace: true });
    }
  }, [editId, draftUniverseId, branding?.universeId, navigate, brandingPath]);

  useEffect(() => {
    if (editId) {
      setIsLoading(true);
      getLearningUniverseById<{ data: Parameters<typeof loadStructuredFromApi>[0] & { assets?: { filename: string; storedFilename: string }[]; price?: number } }>(editId)
        .then((res) => {
          const data = (res.data as { data?: Parameters<typeof loadStructuredFromApi>[0] & { assets?: { filename: string; storedFilename: string }[]; price?: number } })?.data;
          if (data) {
            const { state, completionRules } = loadStructuredFromApi(data);
            setUniverse(normalizePageUniverse({
              ...visualToPageUniverse(state, completionRules),
              price: data.price,
            }));
            setUniverseContext(data.id, data.assets || []);
            const firstTrack = state.tracks[0];
            if (firstTrack) {
              setSelection({ kind: "track", trackId: firstTrack.id });
            }
          } else {
            toast({ title: "Failed to load course", variant: "destructive" });
          }
        })
        .finally(() => setIsLoading(false));
      return;
    }

    const universeId = draftUniverseId || branding?.universeId;
    if (universeId && branding) {
      setUniverse((prev) =>
        normalizePageUniverse({
          ...prev,
          title: branding.title,
          description: branding.description || branding.subtitle || prev.description,
          difficulty: branding.difficulty || prev.difficulty,
          price: typeof branding.price === "number" ? branding.price : prev.price,
          editUniverseId: universeId,
        })
      );
    }

    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        setUniverse(normalizePageUniverse(JSON.parse(draft) as LearningUniverse));
      } catch {
        /* ignore */
      }
    }
  }, [editId, draftUniverseId, branding, toast, setUniverseContext]);

  const selectTrack = useCallback((trackId: string) => {
    setSelection({ kind: "track", trackId });
  }, []);

  const selectModule = useCallback((trackId: string, moduleId: string) => {
    setSelection({ kind: "module", trackId, moduleId });
  }, []);

  const selectLesson = useCallback((trackId: string, moduleId: string, lessonId: string) => {
    setSelection({ kind: "lesson", trackId, moduleId, lessonId });
  }, []);

  // Clear selection if the selected item was deleted
  useEffect(() => {
    if (selection && !resolveExplorerSelection(selection, universe)) {
      setSelection(null);
    }
  }, [universe, selection]);

  // Sensors for dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const parseDndId = (id: string) => {
    if (id.startsWith("track:")) return { type: "track" as const, trackId: id.slice(6) };
    if (id.startsWith("module:")) {
      const [, trackId, moduleId] = id.split(":");
      return { type: "module" as const, trackId, moduleId };
    }
    if (id.startsWith("lesson:")) {
      const [, trackId, moduleId, lessonId] = id.split(":");
      return { type: "lesson" as const, trackId, moduleId, lessonId };
    }
    return null;
  };

  // Handle drag end event
  const handleDragEnd = (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const activeItem = parseDndId(String(active.id));
      const overItem = parseDndId(String(over.id));

      if (activeItem && overItem && activeItem.type === overItem.type) {
        if (activeItem.type === "track") {
          const oldIndex = universe.tracks.findIndex(t => t.id === activeItem.trackId);
          const newIndex = universe.tracks.findIndex(t => t.id === overItem.trackId);
          setUniverse(prev => ({
            ...prev,
            tracks: arrayMove(prev.tracks, oldIndex, newIndex)
          }));
        } else if (activeItem.type === "module" && activeItem.trackId === overItem.trackId) {
          setUniverse(prev => ({
            ...prev,
            tracks: prev.tracks.map(t => t.id === activeItem.trackId ? {
              ...t,
              modules: arrayMove(
                t.modules,
                t.modules.findIndex(m => m.id === activeItem.moduleId),
                t.modules.findIndex(m => m.id === overItem.moduleId),
              ),
            } : t)
          }));
        } else if (
          activeItem.type === "lesson" &&
          activeItem.trackId === overItem.trackId &&
          activeItem.moduleId === overItem.moduleId
        ) {
          setUniverse(prev => ({
            ...prev,
            tracks: prev.tracks.map(t => t.id === activeItem.trackId ? {
              ...t,
              modules: t.modules.map(m => m.id === activeItem.moduleId ? {
                ...m,
                lessons: arrayMove(
                  m.lessons,
                  m.lessons.findIndex(l => l.id === activeItem.lessonId),
                  m.lessons.findIndex(l => l.id === overItem.lessonId),
                ),
              } : m)
            } : t)
          }));
        }
      }
    }
    setActiveId(null);
  };

  // --- Actions ---

  const selectedItem = resolveExplorerSelection(selection, universe);

  const addTrack = () => {
    const newTrack: Track = {
      id: uid(),
      title: "New Track",
      description: "",
      learningOutcomes: "",
      careerOutcomes: "",
      estimatedHours: 0,
      difficulty: "Beginner",
      projectsIncluded: 0,
      modules: [],
      expanded: true,
    };
    setUniverse(prev => ({ ...prev, tracks: [...prev.tracks, newTrack] }));
  };

  const addModule = (trackId: string) => {
    const newModule: Module = {
      id: uid(),
      title: "New Module",
      description: "",
      prerequisites: "",
      learningOutcomes: "",
      estimatedHours: 0,
      lessons: [],
      expanded: true,
    };
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? { ...t, modules: [...t.modules, newModule] } : t),
    }));
  };

  const addLesson = (trackId: string, moduleId: string) => {
    const newLesson: Lesson = { id: uid(), ...createEmptyLesson("New Lesson") };
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? {
        ...t,
        modules: t.modules.map(m => m.id === moduleId ? { ...m, lessons: [...m.lessons, newLesson] } : m),
      } : t),
    }));
    setSelection({ kind: "lesson", trackId, moduleId, lessonId: newLesson.id });
  };

  const toggleExpand = (id: string, type: "track" | "module") => {
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === id && type === "track") return { ...t, expanded: !t.expanded };
        return {
          ...t,
          modules: t.modules.map(m => m.id === id && type === "module" ? { ...m, expanded: !m.expanded } : m),
        };
      }),
    }));
  };

  const deleteTrack = (trackId: string) => {
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.filter(t => t.id !== trackId),
    }));
    if (selection?.trackId === trackId) setSelection(null);
  };

  const deleteModule = (trackId: string, moduleId: string) => {
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? { ...t, modules: t.modules.filter(m => m.id !== moduleId) } : t),
    }));
    if (selection?.trackId === trackId && selection?.kind !== "track" && selection.moduleId === moduleId) {
      setSelection(null);
    }
  };

  const deleteLesson = (trackId: string, moduleId: string, lessonId: string) => {
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? {
        ...t,
        modules: t.modules.map(m => m.id === moduleId ? { ...m, lessons: m.lessons.filter(l => l.id !== lessonId) } : m),
      } : t),
    }));
    if (
      selection?.kind === "lesson" &&
      selection.trackId === trackId &&
      selection.moduleId === moduleId &&
      selection.lessonId === lessonId
    ) {
      setSelection(null);
    }
  };

  const duplicateTrack = (track: Track) => {
    const newTrack: Track = {
      ...JSON.parse(JSON.stringify(track)) as Track,
      id: uid(),
      title: `${track.title} (Copy)`,
      modules: track.modules.map(m => ({
        ...JSON.parse(JSON.stringify(m)) as Module,
        id: uid(),
        lessons: m.lessons.map(l => ({
          ...JSON.parse(JSON.stringify(l)) as Lesson,
          id: uid(),
        })),
      })),
    };
    setUniverse(prev => ({ ...prev, tracks: [...prev.tracks, newTrack] }));
  };

  const duplicateModule = (trackId: string, module: Module) => {
    const newModule: Module = {
      ...JSON.parse(JSON.stringify(module)) as Module,
      id: uid(),
      title: `${module.title} (Copy)`,
      lessons: module.lessons.map(l => ({
        ...JSON.parse(JSON.stringify(l)) as Lesson,
        id: uid(),
      })),
    };
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? { ...t, modules: [...t.modules, newModule] } : t),
    }));
  };

  const duplicateLesson = (trackId: string, moduleId: string, lesson: Lesson) => {
    const newLesson: Lesson = {
      ...JSON.parse(JSON.stringify(lesson)) as Lesson,
      id: uid(),
      title: `${lesson.title} (Copy)`,
    };
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? {
        ...t,
        modules: t.modules.map(m => m.id === moduleId ? { ...m, lessons: [...m.lessons, newLesson] } : m),
      } : t),
    }));
  };

  const updateTrack = (trackId: string, patch: Partial<Track>) => {
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? { ...t, ...patch } : t),
    }));
  };

  const updateModule = (trackId: string, moduleId: string, patch: Partial<Module>) => {
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? {
        ...t,
        modules: t.modules.map(m => m.id === moduleId ? { ...m, ...patch } : m),
      } : t),
    }));
  };

  const updateLesson = (trackId: string, moduleId: string, lesson: VisualLesson) => {
    setUniverse(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? {
        ...t,
        modules: t.modules.map(m => m.id === moduleId ? {
          ...m,
          lessons: m.lessons.map(l => l.id === lesson.id ? normalizeLesson(lesson) : l),
        } : m),
      } : t),
    }));
  };

  const handleSaveDraft = useCallback(() => {
    setIsSaving(true);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(normalizePageUniverse(universe)));
      toast({ title: "Draft saved locally" });
    } finally {
      setIsSaving(false);
    }
  }, [universe, toast]);

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const structured = pageUniverseToStructured(universe);
      const res = await publishVisualLearningUniverse(structured, {
        universeId: universe.editUniverseId || editId || draftUniverseId || branding?.universeId || undefined,
        price: universe.price,
        assets: getPendingFiles(),
      });
      if (res.error) {
        toast({ title: "Publish failed", description: res.error, variant: "destructive" });
        return;
      }
      const published = (res.data as { data?: { id: string } })?.data || res.data as { id?: string };
      const id = published?.id;
      if (id) {
        localStorage.removeItem(DRAFT_KEY);
        clearAssets();
        toast({ title: "Published successfully" });
        if (
          productType === PRODUCT_TYPES.PREMIUM_COURSE ||
          productType === PRODUCT_TYPES.FREE_COURSE ||
          productType === PRODUCT_TYPES.FREE_RESOURCE
        ) {
          navigate(getProductDashboardPath(productType));
        } else {
          navigate(`/instructor/preview/learning-universe/${id}/learn`);
        }
      } else {
        toast({ title: "Published", description: "Course is live." });
        navigate(getProductDashboardPath(productType));
      }
    } catch (e: any) {
      toast({ title: "Publish failed", description: String(e), variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const applyTemplate = (key: string) => {
    const next = templateToPageUniverse(key);
    if (next) {
      setUniverse({ ...next, completionRules: next.completionRules || [...DEFAULT_RULES] });
      const firstTrack = next.tracks[0];
      if (firstTrack) {
        setSelection({ kind: "track", trackId: firstTrack.id });
      }
      toast({ title: `Loaded ${COURSE_TEMPLATES[key]?.label || "template"}` });
    }
  };

  const projectCount = countProjectBlocks(universe);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  // --- Main Render ---

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-border flex items-center justify-between px-6 py-3 shrink-0">
        <div className="flex items-center gap-4">
          <Link to={backPath}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="space-y-1">
            <Input
              value={universe.title}
              onChange={(e) => setUniverse(prev => ({ ...prev, title: e.target.value }))}
              className="text-lg font-bold border-none focus-visible:ring-0 p-0 w-96 bg-transparent"
            />
            <Input
              value={universe.description}
              onChange={(e) => setUniverse(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Course description..."
              className="text-sm text-muted-foreground border-none focus-visible:ring-0 p-0 w-96 bg-transparent"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Select onValueChange={applyTemplate}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Load template" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(COURSE_TEMPLATES).map(([key, tpl]) => (
                <SelectItem key={key} value={key}>{tpl.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === "structure" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("structure")}
              className="gap-1"
            >
              <Layout className="w-4 h-4" />
              Structure
            </Button>
            <Button
              variant={viewMode === "roadmap" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("roadmap")}
              className="gap-1"
            >
              <Map className="w-4 h-4" />
              Roadmap
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" className="gap-2" onClick={handleSaveDraft} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </Button>
          <Button
            className="gap-2 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-600"
            onClick={handlePublish}
            disabled={isPublishing}
          >
            {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Publish
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Explorer */}
        <aside className="w-80 border-r border-border flex flex-col bg-muted/30 shrink-0">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold">Learning Universe Explorer</h3>
            <Button variant="ghost" size="sm" onClick={addTrack}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4">
            {viewMode === "structure" ? (
              // STRUCTURE VIEW
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={(event) => setActiveId(String(event.active.id))}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={universe.tracks.map(t => dndId("track", t.id))}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {universe.tracks.map(track => (
                      <div key={track.id}>
                        <SortableTrack
                          track={track}
                          selection={selection}
                          onSelectTrack={selectTrack}
                          setUniverse={setUniverse}
                          addModule={addModule}
                          toggleExpand={toggleExpand}
                          deleteTrack={deleteTrack}
                          duplicateTrack={duplicateTrack}
                        />
                        {/* Modules */}
                        {track.expanded && (
                          <div className="pl-8">
                            <SortableContext
                              items={track.modules.map(m => dndId("module", track.id, m.id))}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="space-y-1">
                                {track.modules.map(module => (
                                  <div key={module.id}>
                                    <SortableModule
                                      trackId={track.id}
                                      module={module}
                                      selection={selection}
                                      onSelectModule={selectModule}
                                      setUniverse={setUniverse}
                                      addLesson={addLesson}
                                      toggleExpand={toggleExpand}
                                      deleteModule={deleteModule}
                                      duplicateModule={duplicateModule}
                                    />
                                    {/* Lessons */}
                                    {module.expanded && (
                                      <div className="pl-8">
                                        <SortableContext
                                          items={module.lessons.map(l => dndId("lesson", track.id, module.id, l.id))}
                                          strategy={verticalListSortingStrategy}
                                        >
                                          <div className="space-y-1">
                                            {module.lessons.map(lesson => (
                                              <SortableLesson
                                                key={lesson.id}
                                                trackId={track.id}
                                                moduleId={module.id}
                                                lesson={lesson}
                                                selection={selection}
                                                onSelectLesson={selectLesson}
                                                setUniverse={setUniverse}
                                                deleteLesson={deleteLesson}
                                                duplicateLesson={duplicateLesson}
                                              />
                                            ))}
                                          </div>
                                        </SortableContext>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </SortableContext>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="p-4 rounded-lg bg-background border-2 border-primary shadow-lg opacity-90">
                      Dragging...
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : (
              // ROADMAP VIEW
              <div className="h-full overflow-auto">
                <div className="space-y-8 p-4">
                  {universe.tracks.map((track) => (
                    <div key={track.id} className="space-y-4">
                      {/* Track Node */}
                      <div className="flex items-center gap-4">
                        <div
                          className={`p-4 rounded-xl border-2 w-64 cursor-pointer transition-all ${
                            isTrackSelected(selection, track.id)
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card hover:border-primary/50"
                          }`}
                          onClick={() => selectTrack(track.id)}
                        >
                          <div className="font-semibold text-lg">{track.title}</div>
                          <div className="text-xs text-muted-foreground mt-1">{track.description}</div>
                        </div>
                      </div>

                      {/* Modules */}
                      <div className="pl-8 space-y-4">
                        {track.modules.map((module) => (
                          <div key={module.id} className="flex items-start gap-4">
                            {/* Vertical Line */}
                            <div className="w-6 flex flex-col items-center pt-2">
                              <div className="w-0.5 h-full bg-border"></div>
                            </div>

                            <div className="space-y-4 flex-1">
                              {/* Module Node */}
                              <div
                                className={`p-3 rounded-lg border-2 w-56 cursor-pointer transition-all ${
                                  isModuleSelected(selection, track.id, module.id)
                                    ? "border-primary bg-primary/10"
                                    : "border-border bg-card hover:border-primary/50"
                                }`}
                                onClick={() => selectModule(track.id, module.id)}
                              >
                                <div className="font-medium">{module.title}</div>
                                <div className="text-xs text-muted-foreground mt-1">{module.description}</div>
                              </div>

                              {/* Lessons */}
                              <div className="pl-8 space-y-2">
                                {module.lessons.map((lesson) => (
                                  <div key={lesson.id} className="flex items-start gap-3">
                                    {/* Vertical Line */}
                                    <div className="w-4 flex flex-col items-center pt-2">
                                      <div className="w-0.5 h-full bg-border"></div>
                                    </div>

                                    <div
                                      className={`p-2 rounded-md border w-48 cursor-pointer transition-all ${
                                        isLessonSelected(selection, track.id, module.id, lesson.id)
                                          ? "border-primary bg-primary/10"
                                          : "border-border bg-card hover:border-primary/50"
                                      }`}
                                      onClick={() => selectLesson(track.id, module.id, lesson.id)}
                                    >
                                      <div className="text-sm">{lesson.title}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center: Workspace */}
        <main className="flex-1 overflow-hidden border-r border-border flex flex-col">
          {selectedItem ? (
            selectedItem.type === "track" ? (
              <TrackView track={selectedItem.data} onChange={(patch) => updateTrack(selectedItem.data.id, patch)} />
            ) : selectedItem.type === "module" ? (
              <ModuleView
                module={selectedItem.data}
                onChange={(patch) => updateModule(selectedItem.trackId!, selectedItem.data.id, patch)}
              />
            ) : selectedItem.type === "lesson" ? (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                  <Input
                    value={selectedItem.data.title}
                    onChange={(e) => updateLesson(selectedItem.trackId!, selectedItem.moduleId!, { ...selectedItem.data, title: e.target.value })}
                    className="text-lg font-semibold border-none focus-visible:ring-0 p-0 max-w-md bg-transparent"
                  />
                  <div className="flex gap-1 bg-muted rounded-lg p-1">
                    <Button variant={workspaceMode === "author" ? "default" : "ghost"} size="sm" onClick={() => setWorkspaceMode("author")}>
                      Author
                    </Button>
                    <Button variant={workspaceMode === "split" ? "default" : "ghost"} size="sm" onClick={() => setWorkspaceMode("split")}>
                      Split
                    </Button>
                    <Button variant={workspaceMode === "preview" ? "default" : "ghost"} size="sm" onClick={() => setWorkspaceMode("preview")} className="gap-1">
                      <Eye className="w-4 h-4" /> Preview
                    </Button>
                  </div>
                </div>
                <div className={`flex-1 overflow-hidden ${workspaceMode === "split" ? "grid grid-cols-2" : ""}`}>
                  {(workspaceMode === "author" || workspaceMode === "split") && (
                    <div className="overflow-auto p-4 h-full">
                      <LessonBlockEditor
                        lesson={normalizeLesson(selectedItem.data)}
                        onChange={(lesson) => updateLesson(selectedItem.trackId!, selectedItem.moduleId!, lesson)}
                      />
                    </div>
                  )}
                  {(workspaceMode === "preview" || workspaceMode === "split") && (
                    <div className="overflow-hidden h-full border-l border-border">
                      <StudentPreviewPane lesson={normalizeLesson(selectedItem.data)} />
                    </div>
                  )}
                </div>
              </div>
            ) : null
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BookOpen className="w-20 h-20 mx-auto mb-6 opacity-50" />
                <h2 className="text-xl font-semibold mb-2">Welcome to your Learning Universe</h2>
                <p className="text-sm">Select a Track, Module, or Lesson from the left explorer to begin building</p>
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar: Progress Summary */}
        <aside className="w-72 flex flex-col bg-muted/20 shrink-0">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Progress Summary
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <StatCard
              title="Tracks"
              value={universe.tracks.length}
              icon={<Bookmark className="w-4 h-4" />}
            />
            <StatCard
              title="Modules"
              value={universe.tracks.reduce((sum, t) => sum + t.modules.length, 0)}
              icon={<BookOpen className="w-4 h-4" />}
            />
            <StatCard
              title="Lessons"
              value={universe.tracks.reduce((sum, t) => sum + t.modules.reduce((s, m) => s + m.lessons.length, 0), 0)}
              icon={<FileText className="w-4 h-4" />}
            />
            <StatCard
              title="Projects"
              value={projectCount}
              icon={<Layers className="w-4 h-4" />}
            />
            <StatCard
              title="Estimated Hours"
              value={universe.tracks.reduce((sum, t) => sum + t.estimatedHours, 0)}
              icon={<Clock className="w-4 h-4" />}
              suffix="hrs"
            />

            <UniverseSettingsPanel universe={universe} onChange={setUniverse} />

            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-medium mb-2">Completion Rules</h4>
              <CompletionRulesEditor
                rules={universe.completionRules}
                onChange={(rules) => setUniverse((prev) => ({ ...prev, completionRules: rules }))}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// --- Sub-Components ---

function StatCard({ title, value, icon, suffix = "" }: { title: string, value: number, icon: React.ReactNode, suffix?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="p-2 bg-primary/10 rounded-lg text-primary">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold">{value}{suffix}</p>
          <p className="text-xs text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TrackView({ track, onChange }: { track: Track; onChange: (patch: Partial<Track>) => void }) {
  return (
    <div className="p-8 w-full min-w-0 overflow-auto h-full">
      <div className="mb-8">
        <Input
          value={track.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="text-3xl font-bold border-none focus-visible:ring-0 p-0 mb-2"
        />
        <Textarea
          value={track.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Track description..."
          className="text-muted-foreground border-none focus-visible:ring-0 p-0 resize-none"
        />
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Learning Outcomes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={track.learningOutcomes}
              onChange={(e) => onChange({ learningOutcomes: e.target.value })}
              placeholder="What will students learn from this track?"
              className="min-h-24"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Career Outcomes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={track.careerOutcomes}
              onChange={(e) => onChange({ careerOutcomes: e.target.value })}
              placeholder="How will this track help students' careers?"
              className="min-h-24"
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Estimated Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="number"
                value={track.estimatedHours}
                onChange={(e) => onChange({ estimatedHours: Number(e.target.value) || 0 })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Difficulty</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={track.difficulty} onValueChange={(v) => onChange({ difficulty: v as Difficulty })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                  <SelectItem value="Expert">Expert</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Projects Included</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="number"
                value={track.projectsIncluded}
                onChange={(e) => onChange({ projectsIncluded: Number(e.target.value) || 0 })}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CompletionRulesEditor({ rules, onChange }: { rules: string[]; onChange: (rules: string[]) => void }) {
  return (
    <div className="space-y-2">
      {rules.map((rule, i) => (
        <div key={i} className="flex gap-1">
          <Input
            value={rule}
            onChange={(e) => {
              const next = [...rules];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="text-xs h-8"
          />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onChange(rules.filter((_, idx) => idx !== i))}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={() => onChange([...rules, "New rule"])}>
        <Plus className="w-3 h-3 mr-1" /> Add rule
      </Button>
    </div>
  );
}

function UniverseSettingsPanel({ universe, onChange }: { universe: LearningUniverse; onChange: React.Dispatch<React.SetStateAction<LearningUniverse>> }) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Course Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Difficulty</label>
          <Select value={universe.difficulty} onValueChange={(v) => onChange((prev) => ({ ...prev, difficulty: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Beginner">Beginner</SelectItem>
              <SelectItem value="Intermediate">Intermediate</SelectItem>
              <SelectItem value="Advanced">Advanced</SelectItem>
              <SelectItem value="Expert">Expert</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Estimated Hours</label>
          <Input type="number" className="h-8 text-xs" value={universe.estimatedHours} onChange={(e) => onChange((prev) => ({ ...prev, estimatedHours: Number(e.target.value) || 0 }))} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Skills (comma-separated)</label>
          <Input className="h-8 text-xs" value={universe.skills} onChange={(e) => onChange((prev) => ({ ...prev, skills: e.target.value }))} placeholder="Python, ML, ..." />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Price (INR, 0 = free)</label>
          <Input type="number" className="h-8 text-xs" value={universe.price ?? 0} onChange={(e) => onChange((prev) => ({ ...prev, price: Number(e.target.value) || 0 }))} />
        </div>
      </CardContent>
    </Card>
  );
}

function ModuleView({ module, onChange }: { module: Module; onChange: (patch: Partial<Module>) => void }) {
  return (
    <div className="p-8 w-full min-w-0 overflow-auto h-full">
      <div className="mb-8">
        <Input
          value={module.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="text-3xl font-bold border-none focus-visible:ring-0 p-0 mb-2"
        />
        <Textarea
          value={module.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Module description..."
          className="text-muted-foreground border-none focus-visible:ring-0 p-0 resize-none"
        />
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={module.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Describe this module..."
              className="min-h-24"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Prerequisites</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={module.prerequisites}
              onChange={(e) => onChange({ prerequisites: e.target.value })}
              placeholder="What should students know before this module?"
              className="min-h-20"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Learning Outcomes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={module.learningOutcomes}
              onChange={(e) => onChange({ learningOutcomes: e.target.value })}
              placeholder="What will students learn?"
              className="min-h-24"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Estimated Time</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={module.estimatedHours}
              onChange={(e) => onChange({ estimatedHours: Number(e.target.value) || 0 })}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground mt-2">In hours</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
