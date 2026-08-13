/**
 * Canonical LU lesson component registry — single source for kinds, tex, defaults.
 */

export const LU_COMPONENT_KINDS = [
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

export type LuLessonComponentKind = (typeof LU_COMPONENT_KINDS)[number];

export const COMPONENT_TITLES: Record<LuLessonComponentKind, string> = {
  overview: "Overview",
  objectives: "Learning Objectives",
  topics: "Topics",
  examples: "Examples",
  practice: "Practice",
  "coding-lab": "Coding Lab",
  notebook: "Notebook",
  project: "Project",
  "research-paper": "Research Paper",
  assignment: "Assignment",
  discussion: "Discussion",
  resources: "Resources",
  quiz: "Quiz",
  checkpoint: "Checkpoint",
  reflection: "Reflection",
  references: "References",
  video: "Video",
};

/** LaTeX command name (no hyphens) */
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

export const TEX_PATTERNS: Record<LuLessonComponentKind, RegExp> = {
  overview: /\\overviewmarkdown\s*\{/,
  objectives: /\\theory\s*\{[^}]*title=\{[^}]*Objectives/i,
  topics: /\\theory\s*\{[^}]*title=\{[^}]*(Topics|Core Content)/i,
  examples: /\\theory\s*\{[^}]*title=\{[^}]*Examples/i,
  practice: /\\practice\s*\{/,
  "coding-lab": /\\codinglab\s*\{/,
  notebook: /\\notebook\s*\{/,
  project: /\\project\s*\{/,
  "research-paper": /\\researchpaper\s*\{/,
  assignment: /\\assignment\s*\{/,
  discussion: /\\discussion\s*\{/,
  resources: /\\resource\s*\{|\\download\s*\{/,
  quiz: /\\quiz\s*\{/,
  checkpoint: /\\checkpoint\s*\{/,
  reflection: /\\reflection\s*\{/,
  references: /\\references\s*\{/,
  video: /\\video\s*\{/,
};

/** Only overview is singleton per lesson */
export const SINGLETON_COMPONENTS = new Set<LuLessonComponentKind>(["overview"]);

export const CHILD_CONTAINER_KINDS = new Set<LuLessonComponentKind>(["quiz", "resources"]);

export function defaultConfigForKind(kind: LuLessonComponentKind, title: string): Record<string, unknown> {
  switch (kind) {
    case "overview":
      return { body: `Welcome to ${title}. Add your lesson introduction here.` };
    case "objectives":
      return { items: ["Explain key concepts", "Apply techniques in practice", "Complete the checkpoint"] };
    case "topics":
      return { title, body: "Add your main teaching content here." };
    case "examples":
      return { title: "Examples", body: "Walk through worked examples." };
    case "practice":
      return { language: "python", starterCode: 'print("Hello, learner!")', expectedOutput: "Hello, learner!" };
    case "coding-lab":
      return {
        language: "python",
        starterCode: "# Write your solution here\n",
        hints: ["Read the problem carefully"],
        tests: [{ input: "", expectedOutput: "", hidden: false }],
        timeLimitMs: 5000,
      };
    case "notebook":
      return {
        kernel: "python",
        cells: [{ id: "cell-1", type: "markdown", source: `# ${title}\n\nIntroduce the notebook lesson.` }],
      };
    case "project":
      return {
        introduction: `Complete the ${title} project.`,
        objectives: ["Apply course concepts", "Deliver working solution"],
        prerequisites: [],
        difficulty: "intermediate",
        estimatedHours: 4,
        instructions: "Follow the project brief and submit all deliverables.",
        deliverables: [{ id: "d1", title: "Solution", description: "Working implementation", required: true }],
        rubric: [{ criterion: "Correctness", points: 40, description: "Meets requirements" }],
        submission: { type: "zip", maxFiles: 5, allowLate: false, resubmissions: 2 },
      };
    case "research-paper":
      return {
        paperType: "research",
        title,
        authors: [],
        abstract: "",
        keywords: [],
        sections: [{ id: "s1", title: "Introduction", content: "", order: 0 }],
        references: [],
      };
    case "assignment":
      return { dueDate: "", points: 100, instructions: "Complete and submit before the due date." };
    case "discussion":
      return { prompt: "What was the most challenging concept in this lesson?" };
    case "resources":
      return { items: [] };
    case "quiz":
      return { questions: [] };
    case "checkpoint":
      return { title: "Lesson complete — great work!", message: "You may proceed to the next section." };
    case "reflection":
      return { prompt: "What did you learn? What questions remain?" };
    case "references":
      return { items: [{ citation: "Author (Year). Title. Publisher.", url: "" }] };
    case "video":
      return { type: "upload", file: "", title };
    default:
      return {};
  }
}

export function inferKindFromComponentId(id: string): LuLessonComponentKind {
  const base = id.replace(/-\d+$/, "") as LuLessonComponentKind;
  if (LU_COMPONENT_KINDS.includes(base)) return base;
  if (id.startsWith("question")) return "quiz";
  if (id.startsWith("resource")) return "resources";
  if (id.startsWith("coding-lab")) return "coding-lab";
  if (id.startsWith("research-paper")) return "research-paper";
  if (id.startsWith("video")) return "video";
  return "topics";
}
