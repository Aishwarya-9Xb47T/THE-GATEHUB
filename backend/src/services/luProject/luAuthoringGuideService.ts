import { AiRouter } from "../ai/AiRouter.js";
import { getLuAuthoringState, type LuExplorerNode } from "./luAuthoringState.js";
import { loadProjectFiles } from "./luProjectFiles.js";
import { LU_AUTHORING_SYSTEM_RULES, hintForKind } from "./luAuthoringGuidePrompt.js";
import { emitTexFromComponent } from "./luComponentEmitters.js";
import type { LuLessonComponentKind } from "./luComponentRegistry.js";
import {
  scaffoldOverviewContent,
  scaffoldObjectivesContent,
  scaffoldTopicsContent,
  scaffoldExamplesContent,
  scaffoldPracticeContent,
  scaffoldQuizContent,
  scaffoldQuizQuestionContent,
  scaffoldProjectContent,
  scaffoldAssignmentContent,
  scaffoldDiscussionContent,
  scaffoldResourceContent,
  scaffoldResourceItemContent,
  scaffoldTrackContent,
  scaffoldModuleContent,
  scaffoldMinimalLesson,
  scaffoldCodingLabContent,
  scaffoldResearchPaperContent,
  scaffoldNotebookContent,
  scaffoldReflectionContent,
  scaffoldReferencesContent,
  scaffoldCheckpointContent,
} from "./luAuthoringTemplates.js";

export type LuAuthoringGuideScope =
  | "current-file"
  | "current-lesson"
  | "current-module"
  | "current-track"
  | "project-incomplete"
  | "entire-project"
  | "selected";

export interface LuAuthoringGuideRequest {
  prompt: string;
  scope: LuAuthoringGuideScope;
  activeFilePath?: string;
  /** Explicit file paths from UI checkboxes */
  targetPaths?: string[];
  /** Filter to specific component kinds e.g. ["quiz", "coding-lab"] */
  kinds?: string[];
}

export interface LuAuthoringGuideFileResult {
  path: string;
  kind: string;
  title: string;
  content: string;
}

export interface LuAuthoringGuideResult {
  files: LuAuthoringGuideFileResult[];
  summary: string;
  provider: string;
  usedFallback: boolean;
  availableFiles: LuAuthoringGuideSelectableFile[];
}

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

interface AuthoringTarget {
  path: string;
  kind: string;
  title: string;
  status: string;
  lessonId?: string;
  moduleId?: string;
  trackId?: string;
}

const STRUCTURAL_KINDS = new Set([
  "track",
  "module",
  "lesson",
  "overview",
  "objectives",
  "topics",
  "examples",
  "practice",
  "coding-lab",
  "notebook",
  "quiz",
  "question",
  "project",
  "assignment",
  "discussion",
  "checkpoint",
  "resources",
  "resource-item",
  "research-paper",
  "reflection",
  "references",
]);

const COMPONENT_KINDS = new Set([
  "overview",
  "objectives",
  "topics",
  "examples",
  "practice",
  "coding-lab",
  "notebook",
  "quiz",
  "question",
  "project",
  "assignment",
  "discussion",
  "checkpoint",
  "resources",
  "resource-item",
  "research-paper",
  "reflection",
  "references",
]);

function normalizePath(p: string): string {
  const trimmed = p.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function flattenExplorer(nodes: LuExplorerNode[], depth = 0): Array<LuExplorerNode & { depth: number }> {
  const out: Array<LuExplorerNode & { depth: number }> = [];
  const walk = (list: LuExplorerNode[], d: number) => {
    for (const n of list) {
      out.push({ ...n, depth: d });
      if (n.children?.length) walk(n.children, d + 1);
    }
  };
  walk(nodes, depth);
  return out;
}

function nodeToTarget(n: LuExplorerNode): AuthoringTarget | null {
  if (!n.filePath?.trim()) return null;
  return {
    path: normalizePath(n.filePath),
    kind: n.kind,
    title: n.title,
    status: n.status,
    lessonId: n.lessonId,
    moduleId: n.moduleId,
    trackId: n.trackId,
  };
}

function findNodeByPath(explorer: LuExplorerNode[], filePath: string): LuExplorerNode | undefined {
  const normalized = normalizePath(filePath);
  return flattenExplorer(explorer).find((n) => n.filePath && normalizePath(n.filePath) === normalized);
}

function findAncestorContext(
  explorer: LuExplorerNode[],
  filePath: string
): { trackId?: string; moduleId?: string; lessonId?: string } {
  const node = findNodeByPath(explorer, filePath);
  return {
    trackId: node?.trackId,
    moduleId: node?.moduleId,
    lessonId: node?.lessonId ?? (node?.kind === "lesson" ? node.id.split("-").pop() : undefined),
  };
}

function collectByScope(
  explorer: LuExplorerNode[],
  scope: LuAuthoringGuideScope,
  activeFilePath?: string
): AuthoringTarget[] {
  const flat = flattenExplorer(explorer);
  const withPaths = flat.filter((n) => n.filePath?.trim());

  if (scope === "current-file" && activeFilePath) {
    const node = findNodeByPath(explorer, activeFilePath);
    const t = node ? nodeToTarget(node) : null;
    return t ? [t] : [];
  }

  const ctx = activeFilePath ? findAncestorContext(explorer, activeFilePath) : {};

  if (scope === "current-lesson") {
    const lessonId = ctx.lessonId ?? findNodeByPath(explorer, activeFilePath ?? "")?.lessonId;
    if (!lessonId) {
      const node = activeFilePath ? findNodeByPath(explorer, activeFilePath) : undefined;
      const t = node ? nodeToTarget(node) : null;
      return t ? [t] : [];
    }
    return withPaths
      .filter((n) => n.lessonId === lessonId)
      .map((n) => nodeToTarget(n)!)
      .filter(Boolean);
  }

  if (scope === "current-module") {
    const moduleId = ctx.moduleId;
    if (!moduleId) return [];
    return withPaths
      .filter((n) => n.moduleId === moduleId || n.kind === "module")
      .map((n) => nodeToTarget(n)!)
      .filter(Boolean);
  }

  if (scope === "current-track") {
    const trackId = ctx.trackId;
    if (!trackId) return [];
    return withPaths
      .filter((n) => n.trackId === trackId || n.kind === "track")
      .map((n) => nodeToTarget(n)!)
      .filter(Boolean);
  }

  if (scope === "entire-project") {
    return withPaths
      .filter((n) => STRUCTURAL_KINDS.has(n.kind))
      .map((n) => nodeToTarget(n)!)
      .filter(Boolean);
  }

  // project-incomplete
  return withPaths
    .filter((n) => STRUCTURAL_KINDS.has(n.kind))
    .filter((n) => n.status === "empty" || n.status === "draft" || n.status === "error")
    .map((n) => nodeToTarget(n)!)
    .filter(Boolean);
}

function collectByPaths(explorer: LuExplorerNode[], paths: string[]): AuthoringTarget[] {
  const normalized = new Set(paths.map(normalizePath));
  return flattenExplorer(explorer)
    .filter((n) => n.filePath && normalized.has(normalizePath(n.filePath)))
    .map((n) => nodeToTarget(n)!)
    .filter(Boolean);
}

function applyKindsFilter(targets: AuthoringTarget[], kinds?: string[]): AuthoringTarget[] {
  if (!kinds?.length) return targets;
  const allowed = new Set(kinds.map((k) => k.toLowerCase()));
  return targets.filter((t) => allowed.has(t.kind));
}

export function listSelectableGuideFiles(explorer: LuExplorerNode[]): LuAuthoringGuideSelectableFile[] {
  return flattenExplorer(explorer)
    .filter((n) => n.filePath?.trim() && STRUCTURAL_KINDS.has(n.kind))
    .map((n) => ({
      path: normalizePath(n.filePath!),
      kind: n.kind,
      title: n.title,
      status: n.status,
      lessonId: n.lessonId,
      moduleId: n.moduleId,
      trackId: n.trackId,
      depth: n.depth,
    }));
}

function lessonInputRef(componentPath: string, lessonId: string): string {
  const base = componentPath.split("/").pop()?.replace(/\.tex$/i, "") ?? "";
  return `${lessonId}/${base}`;
}

function moduleInputRef(lessonFilePath: string): string {
  return lessonFilePath.replace(/^\//, "").replace(/\.tex$/i, "");
}

function buildQuizOrchestration(target: AuthoringTarget, allTargets: AuthoringTarget[]): string {
  const header = `\\quiz{
title={${target.title}},
shuffle={false},
timeLimitSec={600},
passingScore={70}
}`;
  const questions = allTargets.filter(
    (t) => t.kind === "question" && t.lessonId === target.lessonId && t.path !== target.path
  );
  const inputs = questions
    .map((q) => {
      const base = q.path.split("/").pop()?.replace(/\.tex$/i, "") ?? "";
      return `\\input{${base}}`;
    })
    .join("\n");
  return inputs ? `${header}\n\n${inputs}\n` : `${header}\n`;
}

function buildLessonOrchestration(
  target: AuthoringTarget,
  allTargets: AuthoringTarget[],
  prompt: string
): string {
  const lessonId = target.lessonId ?? "lesson-01";
  const topic = prompt.slice(0, 80).trim() || target.title;
  const header = `\\lesson{title={${target.title}},duration={45},order={1}}`;
  const childComponents = allTargets.filter(
    (t) =>
      t.path !== target.path &&
      t.lessonId === target.lessonId &&
      COMPONENT_KINDS.has(t.kind)
  );
  const inputs = childComponents
    .map((c) => `\\input{${lessonInputRef(c.path, lessonId)}}`)
    .join("\n");
  return inputs ? `${header}\n\n${inputs}\n` : `${header}\n\n% Add components in explorer, then regenerate\n`;
}

function buildModuleOrchestration(target: AuthoringTarget, allTargets: AuthoringTarget[]): string {
  const header = scaffoldModuleContent(target.title, `Module content for ${target.title}.`).trim();
  const lessons = allTargets.filter((t) => t.kind === "lesson" && t.moduleId === target.moduleId);
  const inputs = lessons.map((l) => `\\input{${moduleInputRef(l.path)}}`).join("\n");
  return inputs ? `${header}\n\n${inputs}\n` : `${header}\n`;
}

function buildTrackOrchestration(target: AuthoringTarget, allTargets: AuthoringTarget[]): string {
  const header = scaffoldTrackContent(target.title, `Track covering ${target.title}.`).trim();
  const modules = allTargets.filter((t) => t.kind === "module" && t.trackId === target.trackId);
  const inputs = modules
    .map((m) => {
      const rel = m.path.replace(/^\//, "").replace(/\/module\.tex$/i, "/module");
      return `\\input{${rel}}`;
    })
    .join("\n");
  return inputs ? `${header}\n\n${inputs}\n` : `${header}\n`;
}

function scaffoldForTarget(target: AuthoringTarget, prompt: string, allTargets: AuthoringTarget[]): string {
  const title = target.title || "Untitled";
  const topic = prompt.slice(0, 120).trim() || title;

  if (target.kind === "lesson") return buildLessonOrchestration(target, allTargets, prompt);
  if (target.kind === "module") return buildModuleOrchestration(target, allTargets);
  if (target.kind === "track") return buildTrackOrchestration(target, allTargets);
  if (target.kind === "quiz") return buildQuizOrchestration(target, allTargets);

  const kind = target.kind as LuLessonComponentKind;
  if (COMPONENT_KINDS.has(target.kind)) {
    try {
      return emitTexFromComponent(kind, title, defaultConfigForScaffold(kind, topic));
    } catch {
      /* fall through */
    }
  }

  switch (target.kind) {
    case "overview":
      return scaffoldOverviewContent(title);
    case "objectives":
      return scaffoldObjectivesContent();
    case "topics":
      return scaffoldTopicsContent(title);
    case "examples":
      return scaffoldExamplesContent();
    case "practice":
      return scaffoldPracticeContent();
    case "coding-lab":
      return scaffoldCodingLabContent(title, topic);
    case "notebook":
      return scaffoldNotebookContent(title);
    case "quiz":
      return scaffoldQuizContent(title);
    case "question":
      return scaffoldQuizQuestionContent(`What is a key concept about ${topic}?`);
    case "project":
      return scaffoldProjectContent(title);
    case "research-paper":
      return scaffoldResearchPaperContent(title, topic);
    case "assignment":
      return scaffoldAssignmentContent(title);
    case "discussion":
      return scaffoldDiscussionContent(`What did you learn about ${topic}?`);
    case "reflection":
      return scaffoldReflectionContent();
    case "references":
      return scaffoldReferencesContent();
    case "checkpoint":
      return scaffoldCheckpointContent(title);
    case "resources":
      return scaffoldResourceContent(title);
    case "resource-item":
      return scaffoldResourceItemContent(title);
    default:
      return `\\theory{title={${title}},body={Content about ${topic}.}}\n`;
  }
}

function defaultConfigForScaffold(kind: LuLessonComponentKind, topic: string): Record<string, unknown> {
  switch (kind) {
    case "overview":
      return { body: `Welcome! In this lesson you will learn about ${topic}.` };
    case "objectives":
      return { items: [`Explain ${topic}`, `Apply ${topic} in practice`, "Complete the lesson checkpoint"] };
    case "topics":
      return { title: "Core Content", body: `This section covers ${topic} in depth with examples.` };
    case "examples":
      return { body: `Worked examples demonstrating ${topic}.` };
    case "practice":
      return { language: "python", starterCode: `# Practice: ${topic}\nprint("Hello")`, expectedOutput: "Hello" };
    case "coding-lab":
      return {
        language: "python",
        starterCode: `# ${topic}\ndef solve():\n    pass`,
        problemStatement: `Complete the coding exercise on ${topic}.`,
        expectedOutput: "",
        timeLimitMs: 10000,
      };
    case "notebook":
      return {
        kernel: "python",
        cells: [
          { type: "markdown", source: `# ${topic}\n\nInteractive notebook lesson.` },
          { type: "code", source: 'print("Ready")' },
        ],
      };
    case "research-paper":
      return {
        title: topic,
        paperType: "research",
        abstract: `An overview of ${topic}.`,
        sections: [
          { title: "Introduction", content: `Introduction to ${topic}.` },
          { title: "Conclusion", content: "Summary and next steps." },
        ],
      };
    case "discussion":
      return { prompt: `What is your experience with ${topic}?` };
    case "reflection":
      return { prompt: `Reflect on what you learned about ${topic}.` };
    case "checkpoint":
      return { title: "Lesson complete!", message: `Great work on ${topic}!` };
    default:
      return {};
  }
}

function buildFallbackResult(
  targets: AuthoringTarget[],
  prompt: string
): LuAuthoringGuideFileResult[] {
  return targets.map((t) => ({
    path: t.path,
    kind: t.kind,
    title: t.title,
    content: scaffoldForTarget(t, prompt, targets),
  }));
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) {
      try {
        return JSON.parse(fence[1].trim()) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseAiGuideResponse(
  raw: string,
  targets: AuthoringTarget[],
  prompt: string
): { files: LuAuthoringGuideFileResult[]; summary: string } | null {
  const json = extractJsonObject(raw);
  if (!json || !Array.isArray(json.files)) return null;

  const byPath = new Map(targets.map((t) => [t.path, t]));
  const files: LuAuthoringGuideFileResult[] = [];
  const seen = new Set<string>();

  for (const item of json.files) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const path = typeof rec.path === "string" ? normalizePath(rec.path) : "";
    const content = typeof rec.content === "string" ? rec.content.trim() : "";
    if (!path || !content || seen.has(path)) continue;
    const target = byPath.get(path);
    if (!target) continue;
    seen.add(path);
    files.push({
      path,
      kind: target.kind,
      title: target.title,
      content,
    });
  }

  // Fill missing targets with scaffolds
  for (const t of targets) {
    if (!seen.has(t.path)) {
      files.push({
        path: t.path,
        kind: t.kind,
        title: t.title,
        content: scaffoldForTarget(t, prompt, targets),
      });
    }
  }

  if (!files.length) return null;
  return {
    files,
    summary: typeof json.summary === "string" ? json.summary : "Generated LaTeX for your project files.",
  };
}

async function loadExistingContent(
  projectId: string,
  targets: AuthoringTarget[]
): Promise<Map<string, string>> {
  const files = await loadProjectFiles(projectId);
  const byPath = new Map(files.map((f) => [normalizePath(f.path), f.content || ""]));
  const out = new Map<string, string>();
  for (const t of targets) {
    out.set(t.path, byPath.get(t.path) ?? "");
  }
  return out;
}

function buildUserMessage(
  prompt: string,
  targets: AuthoringTarget[],
  existing: Map<string, string>,
  allSelectable: AuthoringTarget[]
): string {
  const targetList = targets
    .map((t) => {
      const current = existing.get(t.path)?.trim();
      const preview = current ? current.slice(0, 300) + (current.length > 300 ? "…" : "") : "(empty)";
      const hint = hintForKind(t.kind);
      let childNote = "";
      if (t.kind === "quiz") {
        const children = allSelectable.filter(
          (c) => c.lessonId === t.lessonId && c.kind === "question"
        );
        if (children.length) {
          childNote = `\n  child_questions: ${children.map((c) => c.path).join(", ")} (use \\input{basename} from quiz file)`;
        }
      }
      if (t.kind === "lesson") {
        const children = allSelectable.filter(
          (c) => c.lessonId === t.lessonId && COMPONENT_KINDS.has(c.kind)
        );
        if (children.length) {
          childNote = `\n  child_components: ${children.map((c) => c.path).join(", ")}`;
        }
      }
      if (t.kind === "module") {
        const lessons = allSelectable.filter((c) => c.moduleId === t.moduleId && c.kind === "lesson");
        if (lessons.length) {
          childNote = `\n  child_lessons: ${lessons.map((l) => l.path).join(", ")}`;
        }
      }
      if (t.kind === "track") {
        const modules = allSelectable.filter((c) => c.trackId === t.trackId && c.kind === "module");
        if (modules.length) {
          childNote = `\n  child_modules: ${modules.map((m) => m.path).join(", ")}`;
        }
      }
      return `- path: ${t.path}\n  kind: ${t.kind}\n  title: ${t.title}\n  status: ${t.status}\n  instruction: ${hint}${childNote}\n  current_content: ${preview}`;
    })
    .join("\n\n");

  return `Instructor request (generate rich, pedagogical content):
${prompt.trim()}

Generate LaTeX for EACH file below. Match paths exactly. One command per file.
For track/module/lesson files include all required \\input lines for children listed.

${targetList}`;
}

function resolveTargets(
  explorer: LuExplorerNode[],
  request: LuAuthoringGuideRequest
): AuthoringTarget[] {
  const allStructural = listSelectableGuideFiles(explorer).map((f) => ({
    path: f.path,
    kind: f.kind,
    title: f.title,
    status: f.status,
    lessonId: f.lessonId,
    moduleId: f.moduleId,
    trackId: f.trackId,
  }));

  let targets: AuthoringTarget[];
  if (request.targetPaths?.length) {
    targets = collectByPaths(explorer, request.targetPaths);
  } else if (request.scope === "selected") {
    targets = [];
  } else {
    targets = collectByScope(explorer, request.scope, request.activeFilePath);
  }

  targets = applyKindsFilter(targets, request.kinds);

  // Deduplicate by path
  const seen = new Set<string>();
  return targets.filter((t) => {
    if (seen.has(t.path)) return false;
    seen.add(t.path);
    return true;
  });
}

export async function generateLuAuthoringGuide(
  projectId: string,
  request: LuAuthoringGuideRequest
): Promise<LuAuthoringGuideResult> {
  const prompt = request.prompt?.trim();
  if (!prompt) {
    throw new Error("Describe what you want to teach — paste your course or lesson prompt.");
  }

  const state = await getLuAuthoringState(projectId);
  if (!state.isV2) {
    throw new Error("AI Guide requires a Learning Universe v2 project. Run setup first.");
  }

  const availableFiles = listSelectableGuideFiles(state.explorer);
  const allStructural = availableFiles.map((f) => ({
    path: f.path,
    kind: f.kind,
    title: f.title,
    status: f.status,
    lessonId: f.lessonId,
    moduleId: f.moduleId,
    trackId: f.trackId,
  }));

  const targets = resolveTargets(state.explorer, request);
  if (!targets.length) {
    throw new Error(
      request.targetPaths?.length
        ? "No matching files for your selection. Add structure in the explorer first."
        : request.scope === "project-incomplete"
          ? "No empty or draft files found. Try “Entire project”, pick files manually, or add tracks/modules/lessons."
          : "No target files found. Open a .tex file, select files in the list, or add course structure in the explorer."
    );
  }

  const existing = await loadExistingContent(projectId, targets);
  const userMessage = buildUserMessage(prompt, targets, existing, allStructural);

  let files: LuAuthoringGuideFileResult[];
  let summary: string;
  let provider = "fallback";
  let usedFallback = true;

  try {
    const result = await AiRouter.chat(
      [
        { role: "system", content: LU_AUTHORING_SYSTEM_RULES },
        { role: "user", content: userMessage },
      ],
      { jsonMode: true, temperature: 0.45, maxTokens: 12000, timeoutMs: 180000 }
    );

    provider = result.provider;
    const parsed = parseAiGuideResponse(result.content, targets, prompt);
    if (parsed) {
      files = parsed.files;
      summary = parsed.summary;
      usedFallback = false;
    } else {
      files = buildFallbackResult(targets, prompt);
      summary = "AI response could not be parsed — applied smart scaffolds per file kind. Edit and refine.";
    }
  } catch {
    files = buildFallbackResult(targets, prompt);
    summary =
      "AI provider unavailable — applied smart scaffolds for each file type. Connect OpenAI/Ollama in admin for full AI generation.";
  }

  return { files, summary, provider, usedFallback, availableFiles };
}

/** List selectable files without generating — for UI bootstrap */
export async function listLuAuthoringGuideFiles(projectId: string): Promise<LuAuthoringGuideSelectableFile[]> {
  const state = await getLuAuthoringState(projectId);
  return listSelectableGuideFiles(state.explorer);
}
