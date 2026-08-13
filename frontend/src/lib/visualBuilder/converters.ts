import type { LearningUniverseStructured, LuLesson } from "@/lib/learningUniverseSchema";
import { createEmptyLesson } from "@/lib/learningUniverseSchema";
import { COURSE_TEMPLATES } from "@/lib/visualBuilder/templates";

/** UI layer: same as structured + stable ids for DnD */
export interface VisualLesson extends LuLesson {
  id: string;
}

export interface VisualModule {
  id: string;
  title: string;
  description: string;
  prerequisites: string;
  learningOutcomes: string;
  estimatedHours: number;
  lessons: VisualLesson[];
  expanded: boolean;
}

export interface VisualTrack {
  id: string;
  title: string;
  description: string;
  learningOutcomes: string;
  careerOutcomes: string;
  estimatedHours: number;
  difficulty: string;
  modules: VisualModule[];
  expanded: boolean;
}

export interface VisualEditorState {
  editUniverseId?: string;
  projectId?: string;
  universe: LearningUniverseStructured["universe"];
  tracks: VisualTrack[];
}

export function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function structuredToVisual(data: LearningUniverseStructured, editUniverseId?: string): VisualEditorState {
  return {
    editUniverseId,
    universe: { ...data.universe },
    tracks: data.tracks.map((t) => ({
      id: uid(),
      title: t.title,
      description: t.description || "",
      learningOutcomes: t.learningOutcomes || "",
      careerOutcomes: t.careerOutcomes || "",
      estimatedHours: 0,
      difficulty: t.difficulty || "Beginner",
      expanded: true,
      modules: t.modules.map((m) => ({
        id: uid(),
        title: m.title,
        description: m.description || "",
        prerequisites: m.prerequisites || "",
        learningOutcomes: m.learningOutcomes || "",
        estimatedHours: m.estimatedHours || 0,
        expanded: true,
        lessons: m.lessons.map((l) => ({
          id: uid(),
          ...JSON.parse(JSON.stringify(l)) as LuLesson,
        })),
      })),
    })),
  };
}

export function visualToStructured(state: VisualEditorState): LearningUniverseStructured {
  return {
    universe: state.universe,
    authoringMode: "visual",
    tracks: state.tracks.map((t) => ({
      title: t.title,
      description: t.description,
      learningOutcomes: t.learningOutcomes,
      careerOutcomes: t.careerOutcomes,
      difficulty: t.difficulty,
      modules: t.modules.map((m) => ({
        title: m.title,
        description: m.description,
        prerequisites: m.prerequisites,
        learningOutcomes: m.learningOutcomes,
        estimatedHours: m.estimatedHours,
        lessons: m.lessons.map(({ id: _id, ...lesson }) => lesson),
      })),
    })),
  };
}

export function createEmptyVisualState(title = "New Learning Universe"): VisualEditorState {
  return structuredToVisual({
    universe: { title, description: "", difficulty: "Beginner", estimatedHours: 10, skills: [] },
    tracks: [{
      title: "Track 1", description: "", modules: [{
        title: "Module 1", description: "", lessons: [createEmptyLesson("Lesson 1")],
      }],
    }],
    authoringMode: "visual",
  });
}

export function loadStructuredFromApi(data: {
  id: string;
  title: string;
  description?: string;
  difficulty?: string;
  price?: number;
  structuredData?: LearningUniverseStructured;
  tracks?: Array<{
    title: string;
    description?: string;
    modules?: Array<{
      title: string;
      description?: string;
      lessons?: LuLesson[];
    }>;
  }>;
}): { state: VisualEditorState; completionRules: string[] } {
  if (data.structuredData?.tracks?.length) {
    return {
      state: structuredToVisual({
        ...data.structuredData,
        universe: {
          ...data.structuredData.universe,
          title: data.title,
          ...(data.price != null ? { price: data.price } as { price: number } : {}),
        },
      }, data.id),
      completionRules: data.structuredData.completionRules || [
        "Complete all lessons",
        "Pass all quizzes",
        "Submit all projects",
      ],
    };
  }

  if (data.tracks?.length) {
    const structured: LearningUniverseStructured = {
      universe: {
        title: data.title,
        description: data.description || "",
        difficulty: data.difficulty || "Beginner",
      },
      tracks: data.tracks.map((t) => ({
        title: t.title,
        description: t.description || "",
        modules: (t.modules || []).map((m) => ({
          title: m.title,
          description: m.description || "",
          lessons: m.lessons || [],
        })),
      })),
      authoringMode: "visual",
    };
    return {
      state: structuredToVisual(structured, data.id),
      completionRules: ["Complete all lessons", "Pass all quizzes", "Submit all projects"],
    };
  }

  return {
    state: createEmptyVisualState(data.title),
    completionRules: ["Complete all lessons", "Pass all quizzes", "Submit all projects"],
  };
}

export type LuDifficulty = "Beginner" | "Intermediate" | "Advanced" | "Expert";

/** Page-specific LearningUniverse shape (includes DnD ids + UI-only fields) */
export interface PageLearningUniverse {
  id: string;
  editUniverseId?: string;
  title: string;
  description: string;
  difficulty: string;
  estimatedHours: number;
  skills: string;
  price?: number;
  completionRules: string[];
  tracks: Array<VisualTrack & { projectsIncluded: number; difficulty: LuDifficulty }>;
}

export function normalizeLesson(lesson: Partial<VisualLesson> & { id: string; title: string }): VisualLesson {
  const base = createEmptyLesson(lesson.title);
  return {
    ...base,
    ...lesson,
    id: lesson.id,
    contentBlocks: lesson.contentBlocks ?? base.contentBlocks,
    videos: lesson.videos ?? base.videos,
    resources: lesson.resources ?? base.resources,
  };
}

/** Ensure explorer tree items always have stable ids (fixes broken localStorage drafts). */
export function normalizePageUniverse(u: PageLearningUniverse): PageLearningUniverse {
  return {
    ...u,
    completionRules: u.completionRules?.length ? u.completionRules : [
      "Complete all lessons",
      "Pass all quizzes",
      "Submit all projects",
    ],
    tracks: (u.tracks || []).map((t) => ({
      ...t,
      id: t.id || uid(),
      expanded: t.expanded ?? true,
      modules: (t.modules || []).map((m) => ({
        ...m,
        id: m.id || uid(),
        expanded: m.expanded ?? true,
        lessons: (m.lessons || []).map((l) =>
          normalizeLesson({ ...l, id: l.id || uid(), title: l.title || "Lesson" })
        ),
      })),
    })),
  };
}

export type ExplorerSelection =
  | { kind: "track"; trackId: string }
  | { kind: "module"; trackId: string; moduleId: string }
  | { kind: "lesson"; trackId: string; moduleId: string; lessonId: string };

export type ResolvedSelection =
  | { type: "track"; data: VisualTrack & { projectsIncluded: number; difficulty: LuDifficulty }; trackId: string }
  | { type: "module"; data: VisualModule; trackId: string; moduleId: string }
  | { type: "lesson"; data: VisualLesson; trackId: string; moduleId: string };

export function resolveExplorerSelection(
  selection: ExplorerSelection | null,
  universe: PageLearningUniverse,
): ResolvedSelection | null {
  if (!selection) return null;
  const track = universe.tracks.find((t) => t.id === selection.trackId);
  if (!track) return null;

  if (selection.kind === "track") {
    return { type: "track", data: track, trackId: track.id };
  }

  const module = track.modules.find((m) => m.id === selection.moduleId);
  if (!module) return null;

  if (selection.kind === "module") {
    return { type: "module", data: module, trackId: track.id, moduleId: module.id };
  }

  const lesson = module.lessons.find((l) => l.id === selection.lessonId);
  if (!lesson) return null;

  return {
    type: "lesson",
    data: normalizeLesson(lesson),
    trackId: track.id,
    moduleId: module.id,
  };
}

export function countProjectBlocks(u: PageLearningUniverse): number {
  let count = 0;
  for (const track of u.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        count += lesson.contentBlocks.filter((b) => b.type === "project").length;
      }
    }
  }
  return count;
}

export function visualToPageUniverse(state: VisualEditorState, completionRules?: string[]): PageLearningUniverse {
  return {
    id: state.editUniverseId || "new",
    editUniverseId: state.editUniverseId,
    title: state.universe.title,
    description: state.universe.description,
    difficulty: state.universe.difficulty || "Beginner",
    estimatedHours: state.universe.estimatedHours ?? 0,
    skills: (state.universe.skills || []).join(", "),
    price: (state.universe as { price?: number }).price,
    completionRules: completionRules || [
      "Complete all lessons",
      "Pass all quizzes",
      "Submit all projects",
    ],
    tracks: state.tracks.map((t) => ({
      ...t,
      projectsIncluded: 0,
      difficulty: (t.difficulty || "Beginner") as LuDifficulty,
      modules: t.modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => normalizeLesson(l)),
      })),
    })),
  };
}

export function pageUniverseToStructured(u: PageLearningUniverse): LearningUniverseStructured {
  return {
    universe: {
      title: u.title,
      description: u.description || "",
      difficulty: u.difficulty || "Beginner",
      estimatedHours: u.estimatedHours || 0,
      skills: u.skills ? u.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
    },
    authoringMode: "visual",
    completionRules: u.completionRules,
    tracks: u.tracks.map((t) => ({
      title: t.title,
      description: t.description,
      learningOutcomes: t.learningOutcomes,
      careerOutcomes: t.careerOutcomes,
      difficulty: t.difficulty,
      modules: t.modules.map((m) => ({
        title: m.title,
        description: m.description,
        prerequisites: m.prerequisites,
        learningOutcomes: m.learningOutcomes,
        estimatedHours: m.estimatedHours,
        lessons: m.lessons.map((l) => {
          const { id: _id, ...lesson } = normalizeLesson(l);
          return lesson;
        }),
      })),
    })),
  };
}

export function templateToPageUniverse(templateKey: string): PageLearningUniverse | null {
  const tpl = COURSE_TEMPLATES[templateKey];
  if (!tpl) return null;
  return visualToPageUniverse(structuredToVisual(tpl.data), [
    "Complete all lessons",
    "Pass all quizzes",
    "Submit all projects",
  ]);
}
