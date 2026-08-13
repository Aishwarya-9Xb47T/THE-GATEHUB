/** Frontend mirror of backend luComponentRegistry — keep in sync */

export const LU_LESSON_COMPONENT_KINDS = [
  "overview",
  "objectives",
  "topics",
  "examples",
  "practice",
  "coding-lab",
  "notebook",
  "project",
  "research-paper",
  "assignment",
  "discussion",
  "resources",
  "quiz",
  "checkpoint",
  "reflection",
  "references",
  "video",
] as const;

/** Stabilized kinds exposed in Learning Mode menus (no experimental components). */
export type LuLessonComponentKind = (typeof LU_LESSON_COMPONENT_KINDS)[number];

/** LaTeX command name (no hyphens) — keep in sync with backend luComponentRegistry */
export const KIND_TO_TEX_CMD: Record<LuLessonComponentKind, string> = {
  overview: "overviewmarkdown",
  objectives: "theory",
  topics: "theory",
  examples: "theory",
  practice: "practice",
  "coding-lab": "codinglab",
  notebook: "notebook",
  project: "project",
  "research-paper": "researchpaper",
  assignment: "assignment",
  discussion: "discussion",
  resources: "resource",
  quiz: "quiz",
  checkpoint: "checkpoint",
  reflection: "reflection",
  references: "references",
  video: "video",
};

export const COMPONENT_MENU_ITEMS: { block: LuLessonComponentKind; label: string; section: string }[] = [
  { block: "video", label: "Video", section: "media" },
  { block: "overview", label: "Overview", section: "overview" },
  { block: "objectives", label: "Learning Objectives", section: "objectives" },
  { block: "topics", label: "Topics", section: "topics" },
  { block: "examples", label: "Examples", section: "examples" },
  { block: "practice", label: "Practice", section: "practice" },
  { block: "coding-lab", label: "Coding Lab", section: "coding-lab" },
  { block: "notebook", label: "Notebook", section: "notebook" },
  { block: "project", label: "Project", section: "project" },
  { block: "research-paper", label: "Research Paper", section: "research-paper" },
  { block: "assignment", label: "Assignment", section: "assignment" },
  { block: "discussion", label: "Discussion", section: "discussion" },
  { block: "resources", label: "Resources", section: "resources" },
  { block: "quiz", label: "Quiz", section: "quiz" },
  { block: "checkpoint", label: "Checkpoint", section: "checkpoint" },
  { block: "reflection", label: "Reflection", section: "reflection" },
  { block: "references", label: "References", section: "references" },
];

/** Explorer node kinds that open the embedded visual editor alongside Monaco in Learning Mode. */
export const LEARNING_MODE_VISUAL_KINDS = new Set<string>([
  "overview",
  "objectives",
  "topics",
  "examples",
  "practice",
  "coding-lab",
  "notebook",
  "project",
  "research-paper",
  "assignment",
  "discussion",
  "checkpoint",
  "reflection",
  "references",
  "quiz",
  "question",
  "resources",
  "resource-item",
  "video",
]);

export function isLearningModeVisualEditor(kind: string): boolean {
  return LEARNING_MODE_VISUAL_KINDS.has(kind);
}

/** @deprecated use isLearningModeVisualEditor */
export function isBuilderComponent(kind: string): boolean {
  return isLearningModeVisualEditor(kind);
}
