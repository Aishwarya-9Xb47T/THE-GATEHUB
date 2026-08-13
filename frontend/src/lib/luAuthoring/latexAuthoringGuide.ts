/** Copy-paste prompt for external ChatGPT / Claude. */
export const CHATGPT_AUTHORING_PROMPT = `You are THE GATEHUB Academic Authoring Studio LaTeX expert.

ONE COMMAND PER FILE in a multi-file \\input project:

ORCHESTRATION:
- track.tex  → \\track{...} + \\input{track-01/module-01/module}
- module.tex → \\module{...} + \\input{track-01/module-01/lesson-01}
- lesson.tex → \\lesson{...} + \\input{lesson-01/overview} + \\input{lesson-01/practice} etc.

COMPONENTS (one command each):
- overview: \\overviewmarkdown={text}
- objectives/topics/examples: \\theory{title={...},body={...}}
- practice: \\practice{language={python},startercode={...},expectedoutput={...}}
- coding-lab: \\codinglab{title={...},language={python},startercode={...},instructions={...},timeLimitMs={10000}}
- notebook: \\notebook{title={...},kernel={python}} + \\notebookcell{type={markdown|code},source={...}}
- quiz: \\quiz{title={...}} + \\input{question-id}
- question: \\quiz{question={...},optionA={...},optionB={...},optionC={...},optionD={...},correct={B},explanation={...}}
- project: \\project{title={...},description={...},difficulty={...},instructions={...},deliverables={...}}
- research-paper: \\researchpaper{title={...},abstract={...}} + \\researchsection{title={...},body={...}}
- assignment: \\assignment{title={...},duedate={...},points={100},instructions={...}}
- discussion: \\discussion{prompt={...}}
- checkpoint: \\checkpoint{title={...},message={...}}
- reflection: \\reflection{prompt={...}}
- references: \\references{\\referenceitem{citation={...}}}
- resource: \\resource{type={link},title={...},url={...}}

PATH RULES: use \\input{lesson-01/overview} NOT \\input{overview}. Hyphens in paths.

Reply with ONLY the LaTeX for the file shown. No explanation.`;

export type LuAuthoringGuideScope =
  | "current-file"
  | "current-lesson"
  | "current-module"
  | "current-track"
  | "project-incomplete"
  | "entire-project"
  | "selected";

export interface LuAuthoringGuideSelectableFile {
  path: string;
  kind: string;
  title: string;
  status: string;
  lessonId?: string;
  moduleId?: string;
  trackId?: string;
  depth: number;
}

export interface LuAuthoringGuideFileResult {
  path: string;
  kind: string;
  title: string;
  content: string;
}

export interface LuAuthoringGuideResponse {
  files: LuAuthoringGuideFileResult[];
  summary: string;
  provider: string;
  usedFallback: boolean;
  availableFiles?: LuAuthoringGuideSelectableFile[];
}

export const AI_GUIDE_KIND_FILTERS: { kind: string; label: string }[] = [
  { kind: "track", label: "Track" },
  { kind: "module", label: "Module" },
  { kind: "lesson", label: "Lesson" },
  { kind: "overview", label: "Overview" },
  { kind: "objectives", label: "Objectives" },
  { kind: "topics", label: "Topics" },
  { kind: "examples", label: "Examples" },
  { kind: "practice", label: "Practice" },
  { kind: "coding-lab", label: "Coding Lab" },
  { kind: "notebook", label: "Notebook" },
  { kind: "quiz", label: "Quiz" },
  { kind: "question", label: "Question" },
  { kind: "project", label: "Project" },
  { kind: "research-paper", label: "Research Paper" },
  { kind: "assignment", label: "Assignment" },
  { kind: "discussion", label: "Discussion" },
  { kind: "checkpoint", label: "Checkpoint" },
  { kind: "reflection", label: "Reflection" },
  { kind: "references", label: "References" },
  { kind: "resources", label: "Resources" },
];

export const AI_GUIDE_QUICK_PROMPTS = [
  "Introductory lesson for complete beginners with overview, objectives, topics, practice, and checkpoint.",
  "Python coding lab with starter code, clear instructions, and expected output for variables and loops.",
  "Module quiz with 3 multiple-choice questions testing core concepts from the lesson.",
  "Research paper component summarizing key academic concepts with introduction and conclusion sections.",
  "Capstone project with instructions, deliverables, difficulty level, and submission requirements.",
  "Full lesson on machine learning basics: overview, theory, examples, coding lab, and quiz.",
];

export const LATEX_QUICK_REFERENCE = [
  { file: "track.tex", owns: "\\track{...} + \\input{track-01/module-01/module}" },
  { file: "module.tex", owns: "\\module{...} + \\input{.../lesson-01}" },
  { file: "lesson-01.tex", owns: "\\lesson{...} + \\input{lesson-01/overview}" },
  { file: "overview.tex", owns: "\\overviewmarkdown={Plain introduction}" },
  { file: "objectives.tex", owns: "\\theory{title={Learning Objectives},body={...}}" },
  { file: "topics.tex", owns: "\\theory{title={Core Content},body={...}}" },
  { file: "practice.tex", owns: "\\practice{language={python},startercode={...},expectedoutput={...}}" },
  { file: "coding-lab-01.tex", owns: "\\codinglab{title={...},language={python},startercode={...},instructions={...}}" },
  { file: "quiz-01.tex", owns: "\\quiz{title={...}} + \\input{quiz-q-01}" },
  { file: "question.tex", owns: "\\quiz{question={...},optionA={...},correct={B},...}" },
  { file: "research-paper-01.tex", owns: "\\researchpaper{...} + \\researchsection{...}" },
  { file: "project.tex", owns: "\\project{title={...},instructions={...},deliverables={...}}" },
  { file: "notebook.tex", owns: "\\notebook{...} + \\notebookcell{type={code},source={...}}" },
];

export async function fetchLuAuthoringGuideFiles(
  projectId: string
): Promise<LuAuthoringGuideSelectableFile[]> {
  const { api } = await import("@/lib/api");
  const res = await api<{ success: boolean; data: { files: LuAuthoringGuideSelectableFile[] } }>(
    `/latex-projects/${projectId}/lu/ai-guide/files`
  );
  return res.data?.data?.files ?? [];
}

export async function generateLuAuthoringGuide(
  projectId: string,
  options: {
    prompt: string;
    scope: LuAuthoringGuideScope;
    activeFilePath?: string;
    targetPaths?: string[];
    kinds?: string[];
  }
): Promise<LuAuthoringGuideResponse> {
  const { api } = await import("@/lib/api");
  const res = await api<{ success: boolean; data: LuAuthoringGuideResponse; error?: string }>(
    `/latex-projects/${projectId}/lu/ai-guide`,
    {
      method: "POST",
      body: options,
    }
  );
  if (res.error) throw new Error(res.error);
  if (!res.data?.data) throw new Error("AI Guide returned no data");
  return res.data.data;
}

export async function copyAuthoringPromptToClipboard(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(CHATGPT_AUTHORING_PROMPT);
    return true;
  } catch {
    return false;
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const KIND_LABELS: Record<string, string> = Object.fromEntries(
  AI_GUIDE_KIND_FILTERS.map((k) => [k.kind, k.label])
);

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export function statusColor(status: string): string {
  switch (status) {
    case "complete":
      return "text-emerald-400";
    case "error":
      return "text-red-400";
    case "draft":
      return "text-amber-400";
    default:
      return "text-slate-500";
  }
}
