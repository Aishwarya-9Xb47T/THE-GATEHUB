/** Lesson section markers for editor focus navigation */
export type LessonSection =
  | "overview"
  | "objectives"
  | "topics"
  | "examples"
  | "practice"
  | "coding-lab"
  | "notebook"
  | "quiz"
  | "project"
  | "research-paper"
  | "resource"
  | "assignment"
  | "discussion"
  | "checkpoint"
  | "reflection"
  | "references";

export const LESSON_SECTION_TO_BLOCK: Record<LessonSection, string> = {
  overview: "overview",
  objectives: "objectives",
  topics: "topics",
  examples: "examples",
  practice: "practice",
  "coding-lab": "coding-lab",
  notebook: "notebook",
  quiz: "quiz",
  project: "project",
  "research-paper": "research-paper",
  resource: "resources",
  assignment: "assignment",
  discussion: "discussion",
  checkpoint: "checkpoint",
  reflection: "reflection",
  references: "references",
};

export const LESSON_SECTION_PATTERNS: Record<LessonSection, RegExp> = {
  overview: /\\overviewmarkdown\s*\{/,
  objectives: /\\theory\s*\{[^}]*title=\{[^}]*Objectives/i,
  topics: /\\theory\s*\{[^}]*title=\{[^}]*(Topics|Core Content)/i,
  examples: /\\theory\s*\{[^}]*title=\{[^}]*Examples/i,
  practice: /\\practice\s*\{/,
  "coding-lab": /\\codinglab\s*\{/,
  notebook: /\\notebook\s*\{/,
  quiz: /\\quiz\s*\{/,
  project: /\\project\s*\{/,
  "research-paper": /\\researchpaper\s*\{/,
  resource: /\\resource\s*\{|\\download\s*\{/,
  assignment: /\\assignment\s*\{/,
  discussion: /\\discussion\s*\{/,
  checkpoint: /\\checkpoint\s*\{/,
  reflection: /\\reflection\s*\{/,
  references: /\\references\s*\{/,
};

export const LESSON_SECTION_LABELS: Record<LessonSection, string> = {
  overview: "Overview",
  objectives: "Learning Objectives",
  topics: "Topics",
  examples: "Examples",
  practice: "Practice",
  "coding-lab": "Coding Lab",
  notebook: "Notebook",
  quiz: "Quiz",
  project: "Project",
  "research-paper": "Research Paper",
  resource: "Resources",
  assignment: "Assignment",
  discussion: "Discussion",
  checkpoint: "Checkpoint",
  reflection: "Reflection",
  references: "References",
};
