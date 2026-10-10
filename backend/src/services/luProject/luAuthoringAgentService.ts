/**
 * Autonomous AI LaTeX Engineering Agent Service
 * Handles:
 * 1. Project planning & multi-file generation (from empty project to full course structure)
 * 2. Safe transactional plan execution with pre-change snapshot
 * 3. Real compilation via local pdflatex + diagnostics extraction
 * 4. Error mapping from merged main.tex back to specific component source files
 * 5. Autonomous repair loop (up to 3 retries, stall detection)
 * 6. PDF verification & safe rollback
 */
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../utils/prisma.js";
import { AiRouter } from "../ai/AiRouter.js";
import {
  getLuAuthoringState,
  type LuAuthoringState,
  type LuExplorerNode,
} from "./luAuthoringState.js";
import {
  loadProjectFiles,
  getProjectJsonFromFiles,
  normalizeProjectPath,
  type ProjectFileRecord,
} from "./luProjectFiles.js";
import {
  applyStructureAction,
  type StructureAction,
} from "./luProjectStructureService.js";
import {
  captureProjectSnapshotForProject,
  pushUndo,
  restoreSnapshot,
  readStack,
  UNDO_STACK_PATH,
  type ProjectSnapshot,
} from "./luTransactionEngine.js";
import { prepareLuBuild } from "./luBuildEngine.js";
import { resolveProjectIncludesWithFallback } from "./luIncludeResolver.js";
import {
  compileLatexLocally,
  storeCompiledPdfFromPath,
  type LatexCompilationResult,
} from "../latexCompileService.js";
import {
  mapErrorsToSourceFiles,
  type MappedLatexError,
} from "./luErrorMapper.js";
import { resetYjsForFileIds } from "./yjsDocumentService.js";
import {
  LU_AUTHORING_SYSTEM_RULES,
  hintForKind,
} from "./luAuthoringGuidePrompt.js";
import type { LuLessonComponentKind } from "./luComponentRegistry.js";
import { emitTexFromComponent } from "./luComponentEmitters.js";
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
  scaffoldCodingLabContent,
  scaffoldResearchPaperContent,
  scaffoldNotebookContent,
  scaffoldReflectionContent,
  scaffoldReferencesContent,
  scaffoldCheckpointContent,
  scaffoldTrackContent,
  scaffoldModuleContent,
} from "./luAuthoringTemplates.js";
import type { LuAuthoringGuideScope } from "./luAuthoringGuideService.js";

export interface LuAgentPlanRequest {
  prompt: string;
  scope?: LuAuthoringGuideScope;
  activeFilePath?: string;
  targetPaths?: string[];
  kinds?: string[];
}

export interface LuAgentFileOperation {
  path: string;
  operation: "create" | "update";
  kind: string;
  title: string;
  content: string;
  existingContent?: string;
}

export interface LuAgentPlan {
  planId: string;
  summary: string;
  isScaffoldedCourse: boolean;
  structuralActions: StructureAction[];
  fileOperations: LuAgentFileOperation[];
  provider: string;
  usedFallback: boolean;
  scope: string;
}

export interface LuAgentExecutionResult {
  success: boolean;
  planId: string;
  snapshotId: string;
  modifiedFiles: string[];
  repairsApplied?: string[];
}

export interface LuAgentRepairHistoryItem {
  attempt: number;
  stage: string;
  errorCount: number;
  repairedFiles: string[];
  sampleError?: string;
}

export interface LuAgentCompileRepairResult {
  success: boolean;
  attempts: number;
  logs: string;
  pdfPath?: string;
  pdfUrl?: string;
  errors: MappedLatexError[];
  repairedFiles: string[];
  stalled: boolean;
  verified: boolean;
  snapshotId?: string;
  history: LuAgentRepairHistoryItem[];
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
  const trimmed = p.trim().replace(/\\/g, "/");
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
        // continue
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        // continue
      }
    }
    return null;
  }
}

/** Sanitize common LaTeX escapable issues in body content without breaking macros */
export function sanitizeLatexSource(raw: string): string {
  if (!raw) return "";
  let out = raw;

  // Fix unescaped % attached to numbers or words (e.g. "100%", "95%")
  out = out.replace(/(?<=[0-9a-zA-Z])\s*%(?!\s*\\)/g, "\\%");

  // Fix unescaped & outside of tabular or commands
  // e.g. "AT&T" -> "AT\&T"
  out = out.replace(/([a-zA-Z0-9])\s*&\s*([a-zA-Z0-9])/g, "$1 \\& $2");

  // Fix unescaped _ outside of math mode or commands e.g. some_variable in normal text
  // but protect commands like \input, \overviewmarkdown
  out = out.replace(/(?<!\\[a-zA-Z0-9_]*)(?<=[a-zA-Z0-9])_(?=[a-zA-Z0-9])/g, "\\_");

  // Balance unmatched single braces if easily detectable
  const openCount = (out.match(/(?<!\\)\{/g) || []).length;
  const closeCount = (out.match(/(?<!\\)\}/g) || []).length;
  if (openCount > closeCount) {
    out += "}".repeat(openCount - closeCount);
  }

  return out;
}

/** Default pedagogical scaffold generator for each component kind */
export function generateDefaultComponentScaffold(kind: string, title: string, prompt: string): string {
  const topic = prompt.slice(0, 100).trim() || title;

  switch (kind) {
    case "overview":
      return `\\overviewmarkdown={\nWelcome to ${title}. In this lesson, you will master the principles of ${topic} through theoretical foundations, worked examples, and interactive lab practice.\n}\n`;
    case "objectives":
      return `\\theory{title={Learning Objectives},body={\nBy the end of this lesson, you will be able to:\n1. Understand the fundamental principles of ${topic}.\n2. Analyze and solve practical problems in ${topic}.\n3. Implement robust solutions in real-world scenarios.\n}}\n`;
    case "topics":
      return `\\theory{title={${title || "Core Theory"}},body={\nThis module explores ${topic} comprehensively.\n\nKey Concepts:\n- Theoretical framework and mathematical models\n- Architecture, constraints, and performance trade-offs\n- Standard industry best practices\n}}\n`;
    case "examples":
      return `\\theory{title={Worked Examples},body={\nStep-by-step example demonstrating ${topic}:\n\nExample 1: Basic Formulation\nGiven initial conditions, calculate the expected outcome systematically.\n\nExample 2: Complex Edge Case\nAddressing edge cases and verifying solution validity.\n}}\n`;
    case "practice":
      return `\\practice{\nlanguage={python},\nstartercode={\n# Practice: ${topic}\ndef run_practice():\n    # Implement solution here\n    return "Success"\n\nprint(run_practice())\n},\nexpectedoutput={Success}\n}\n`;
    case "coding-lab":
      return `\\codinglab{\ntitle={${title || "Hands-on Lab"}},\nlanguage={python},\nstartercode={\n# Lab: ${topic}\ndef solve():\n    return 42\n},\ninstructions={Implement the required logic for ${topic}. Your code must pass all test cases within the memory and time limits.},\nexpectedoutput={42},\ntimeLimitMs={10000}\n}\n`;
    case "notebook":
      return `\\notebook{title={${title || "Interactive Notebook"}},kernel={python}}\n\\notebookcell{type={markdown},source={# ${topic}\\n\\nExploratory notebook on ${topic}.}}\n\\notebookcell{type={code},source={print("Notebook ready for ${topic}")}}\n`;
    case "quiz":
      return `\\quiz{\ntitle={${title || "Assessment Quiz"}},\nshuffle={false},\ntimeLimitSec={600},\npassingScore={70}\n}\n\\input{question-01}\n\\input{question-02}\n`;
    case "question":
      return `\\quiz{\nquestion={Which of the following is true regarding ${topic}?},\noptionA={It provides guaranteed optimal performance under all circumstances},\noptionB={It requires proper synchronization and edge case handling},\noptionC={It completely eliminates computational complexity},\noptionD={It cannot be implemented with standard algorithms},\ncorrect={B},\nexplanation={Option B is correct because real-world implementations of ${topic} require handling boundary constraints and synchronization properly.}\n}\n`;
    case "research-paper":
      return `\\researchpaper{title={${title || "Research Paper: " + topic}},paperType={research},abstract={This study investigates the foundations and modern applications of ${topic}.}}\n\\researchsection{title={Introduction},body={Recent advances in ${topic} demonstrate significant promise. We examine the core methodologies and empirical findings.}}\n\\researchsection{title={Methodology & Results},body={Detailed analysis of empirical data and formal verification.}}\n\\researchsection{title={Conclusion},body={Summary of insights and future research directions.}}\n`;
    case "project":
      return `\\project{\ntitle={${title || "Capstone Project"}},\ndescription={Develop an end-to-end implementation applying ${topic}.},\ndifficulty={intermediate},\nestimatedHours={6},\ninstructions={1. Design system architecture\\n2. Implement core modules\\n3. Verify test cases and documentation},\ndeliverables={Source code repository, technical report, and demonstration},\nsubmissionType={zip}\n}\n`;
    case "reflection":
      return `\\reflection{prompt={Reflect on how ${topic} impacts modern software and computing architectures. What was the most challenging concept?}}\n`;
    case "checkpoint":
      return `\\checkpoint{title={Milestone Complete!},message={Congratulations! You have completed all requirements for ${topic}.}}\n`;
    case "assignment":
      return `\\assignment{title={${title}},duedate={2026-12-31},points={100},instructions={Complete all exercises and submit your solution report.}}\n`;
    case "discussion":
      return `\\discussion{prompt={What trade-offs do you consider most critical when designing systems using ${topic}?}}\n`;
    default:
      return `\\theory{title={${title}},body={Detailed content covering ${topic}.}}\n`;
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * STAGE 1: PLANNER & MULTI-FILE GENERATION
 * ══════════════════════════════════════════════════════════════════════
 */
export async function planLuAgent(
  projectId: string,
  request: LuAgentPlanRequest
): Promise<LuAgentPlan> {
  const prompt = request.prompt?.trim();
  if (!prompt) {
    throw new Error("Prompt is required — describe your course, lesson, or change request.");
  }

  const state = await getLuAuthoringState(projectId);
  if (!state.isV2) {
    throw new Error("Learning Universe v2 required. Please initialize course setup first.");
  }

  const existingFiles = await loadProjectFiles(projectId);
  const existingFilesByPath = new Map(
    existingFiles.map((f) => [normalizePath(f.path), f.content || ""])
  );

  const tracks = state.project.tracks;
  const isFreshProject = tracks.length === 0;

  // Case 1: Fresh project with no tracks/modules/lessons
  // Autonomous Course Syllabus Planning
  if (isFreshProject) {
    return await planFreshCourse(projectId, prompt, request);
  }

  // Case 2: Existing project with tracks/modules
  // Targeted Scope Planning or Structural Augmentation
  return await planExistingProjectChanges(projectId, state, prompt, request, existingFilesByPath);
}

/** Plan a brand new course from scratch when project has 0 tracks */
async function planFreshCourse(
  projectId: string,
  prompt: string,
  request: LuAgentPlanRequest
): Promise<LuAgentPlan> {
  const planId = uuidv4();
  const summaryPrompt = `Plan a structured Learning Universe course for the following instructor request:
"${prompt}"

Determine:
1. Track title (e.g. "Foundations of Computer Systems")
2. Module title (e.g. "Module 1: Architecture & Execution")
3. Lesson title (e.g. "Lesson 1: Processor Pipelining & Memory")
4. Lesson components to generate: overview, objectives, topics, examples, coding-lab, quiz (with 2 questions), checkpoint.

Return a JSON object in this exact schema:
{
  "summary": "Course plan summary",
  "trackTitle": "Title of Track 1",
  "trackDescription": "Description",
  "moduleTitle": "Title of Module 1",
  "moduleDescription": "Description",
  "lessonTitle": "Title of Lesson 1"
}`;

  let planMeta = {
    summary: `Structured course generated for: "${prompt.slice(0, 60)}"`,
    trackTitle: "Foundations & Core Principles",
    trackDescription: `Comprehensive course track covering ${prompt.slice(0, 80)}.`,
    moduleTitle: "Module 1: Core Fundamentals",
    moduleDescription: `Fundamental principles, architecture, and practice of ${prompt.slice(0, 80)}.`,
    lessonTitle: "Lesson 1: Introduction and Core Concepts",
  };

  let providerUsed = "template-engine";
  let usedFallback = true;

  try {
    const aiResponse = await AiRouter.chat([
      {
        role: "system",
        content: "You are an expert curriculum designer. Return strictly valid JSON.",
      },
      {
        role: "user",
        content: summaryPrompt,
      },
    ]);

    if (aiResponse?.message?.content) {
      const parsed = extractJsonObject(aiResponse.message.content);
      if (parsed?.trackTitle && parsed?.moduleTitle && parsed?.lessonTitle) {
        planMeta = {
          summary: typeof parsed.summary === "string" ? parsed.summary : planMeta.summary,
          trackTitle: String(parsed.trackTitle),
          trackDescription: String(parsed.trackDescription || planMeta.trackDescription),
          moduleTitle: String(parsed.moduleTitle),
          moduleDescription: String(parsed.moduleDescription || planMeta.moduleDescription),
          lessonTitle: String(parsed.lessonTitle),
        };
        providerUsed = aiResponse.provider || "ai";
        usedFallback = false;
      }
    }
  } catch {
    // Graceful fallback to deterministic high-quality syllabus
  }

  const structuralActions: StructureAction[] = [
    {
      action: "createTrack",
      title: planMeta.trackTitle,
      description: planMeta.trackDescription,
    },
    {
      action: "createModule",
      trackId: "track-01",
      title: planMeta.moduleTitle,
      description: planMeta.moduleDescription,
    },
    {
      action: "createLesson",
      trackId: "track-01",
      moduleId: "mod-01",
      title: planMeta.lessonTitle,
    },
    {
      action: "appendLessonBlock",
      trackId: "track-01",
      moduleId: "mod-01",
      lessonId: "lesson-01",
      block: "overview",
      title: "Overview",
    },
    {
      action: "appendLessonBlock",
      trackId: "track-01",
      moduleId: "mod-01",
      lessonId: "lesson-01",
      block: "objectives",
      title: "Learning Objectives",
    },
    {
      action: "appendLessonBlock",
      trackId: "track-01",
      moduleId: "mod-01",
      lessonId: "lesson-01",
      block: "topics",
      title: "Core Theory",
    },
    {
      action: "appendLessonBlock",
      trackId: "track-01",
      moduleId: "mod-01",
      lessonId: "lesson-01",
      block: "examples",
      title: "Worked Examples",
    },
    {
      action: "appendLessonBlock",
      trackId: "track-01",
      moduleId: "mod-01",
      lessonId: "lesson-01",
      block: "coding-lab",
      title: "Hands-on Lab",
    },
    {
      action: "appendLessonBlock",
      trackId: "track-01",
      moduleId: "mod-01",
      lessonId: "lesson-01",
      block: "quiz",
      title: "Module Quiz",
    },
    {
      action: "addQuizQuestion",
      trackId: "track-01",
      moduleId: "mod-01",
      lessonId: "lesson-01",
      quizId: "quiz-01",
      title: "Conceptual Review",
    },
    {
      action: "addQuizQuestion",
      trackId: "track-01",
      moduleId: "mod-01",
      lessonId: "lesson-01",
      quizId: "quiz-01",
      title: "Applied Problem",
    },
    {
      action: "appendLessonBlock",
      trackId: "track-01",
      moduleId: "mod-01",
      lessonId: "lesson-01",
      block: "checkpoint",
      title: "Lesson Milestone",
    },
  ];

  // Prepare file operations with rich content
  const fileOperations: LuAgentFileOperation[] = [
    {
      path: "/track-01/mod-01/lesson-01/overview.tex",
      operation: "create",
      kind: "overview",
      title: "Overview",
      content: generateDefaultComponentScaffold("overview", planMeta.lessonTitle, prompt),
    },
    {
      path: "/track-01/mod-01/lesson-01/objectives.tex",
      operation: "create",
      kind: "objectives",
      title: "Learning Objectives",
      content: generateDefaultComponentScaffold("objectives", "Objectives", prompt),
    },
    {
      path: "/track-01/mod-01/lesson-01/topics.tex",
      operation: "create",
      kind: "topics",
      title: "Core Theory",
      content: generateDefaultComponentScaffold("topics", "Core Theory", prompt),
    },
    {
      path: "/track-01/mod-01/lesson-01/examples.tex",
      operation: "create",
      kind: "examples",
      title: "Worked Examples",
      content: generateDefaultComponentScaffold("examples", "Worked Examples", prompt),
    },
    {
      path: "/track-01/mod-01/lesson-01/coding-lab-01.tex",
      operation: "create",
      kind: "coding-lab",
      title: "Hands-on Lab",
      content: generateDefaultComponentScaffold("coding-lab", "Hands-on Lab", prompt),
    },
    {
      path: "/track-01/mod-01/lesson-01/quiz-01.tex",
      operation: "create",
      kind: "quiz",
      title: "Module Quiz",
      content: `\\quiz{\ntitle={${planMeta.moduleTitle} Quiz},\nshuffle={false},\ntimeLimitSec={600},\npassingScore={70}\n}\n\\input{quiz-01/question-01}\n\\input{quiz-01/question-02}\n`,
    },
    {
      path: "/track-01/mod-01/lesson-01/quiz-01/question-01.tex",
      operation: "create",
      kind: "question",
      title: "Conceptual Review",
      content: generateDefaultComponentScaffold("question", "Conceptual Review", prompt),
    },
    {
      path: "/track-01/mod-01/lesson-01/quiz-01/question-02.tex",
      operation: "create",
      kind: "question",
      title: "Applied Problem",
      content: generateDefaultComponentScaffold("question", "Applied Problem", prompt),
    },
    {
      path: "/track-01/mod-01/lesson-01/checkpoint.tex",
      operation: "create",
      kind: "checkpoint",
      title: "Lesson Milestone",
      content: generateDefaultComponentScaffold("checkpoint", planMeta.lessonTitle, prompt),
    },
  ];

  // Try generating richer AI content for the created files if AI router is active
  await enrichFileOperationsWithAi(fileOperations, prompt);

  return {
    planId,
    summary: planMeta.summary,
    isScaffoldedCourse: true,
    structuralActions,
    fileOperations,
    provider: providerUsed,
    usedFallback,
    scope: request.scope || "entire-project",
  };
}

/** Plan modifications for an existing project with tracks and lessons */
async function planExistingProjectChanges(
  projectId: string,
  state: LuAuthoringState,
  prompt: string,
  request: LuAgentPlanRequest,
  existingFiles: Map<string, string>
): Promise<LuAgentPlan> {
  const planId = uuidv4();
  const flatExplorer = flattenExplorer(state.explorer);
  const structuralActions: StructureAction[] = [];
  const fileOperations: LuAgentFileOperation[] = [];

  // Determine targeted files based on scope / selection
  const targetedNodes = resolveTargetNodes(state.explorer, request);

  // If prompt explicitly asks to add new lessons, tracks, or modules, create them!
  const lowerPrompt = prompt.toLowerCase();
  const asksNewLesson =
    lowerPrompt.includes("add lesson") ||
    lowerPrompt.includes("create lesson") ||
    lowerPrompt.includes("new lesson");
  const asksNewQuiz =
    lowerPrompt.includes("add quiz") ||
    lowerPrompt.includes("create quiz") ||
    lowerPrompt.includes("new quiz");
  const asksNewLab =
    lowerPrompt.includes("add coding lab") ||
    lowerPrompt.includes("new lab") ||
    lowerPrompt.includes("add lab");

  if (targetedNodes.length === 0 && (asksNewLesson || state.project.tracks.length > 0)) {
    // Add to first available module or active file context
    const firstTrack = state.project.tracks[0];
    const firstMod = firstTrack?.modules[0];
    if (firstTrack && firstMod) {
      const newLessonTitle = prompt.slice(0, 60).replace(/^(create|add|new)\s+(lesson\s+)?/i, "").trim() || "New Lesson";
      structuralActions.push({
        action: "createLesson",
        trackId: firstTrack.id,
        moduleId: firstMod.id,
        title: newLessonTitle,
      });
      structuralActions.push({
        action: "appendLessonBlock",
        trackId: firstTrack.id,
        moduleId: firstMod.id,
        lessonId: `lesson-0${firstMod.lessons.length + 1}`,
        block: "overview",
        title: "Overview",
      });
      structuralActions.push({
        action: "appendLessonBlock",
        trackId: firstTrack.id,
        moduleId: firstMod.id,
        lessonId: `lesson-0${firstMod.lessons.length + 1}`,
        block: "topics",
        title: "Key Concepts",
      });

      const lessonDir = `/${firstTrack.folder}/${firstMod.folder}/lesson-0${firstMod.lessons.length + 1}`;
      fileOperations.push({
        path: `${lessonDir}/overview.tex`,
        operation: "create",
        kind: "overview",
        title: "Overview",
        content: generateDefaultComponentScaffold("overview", newLessonTitle, prompt),
      });
      fileOperations.push({
        path: `${lessonDir}/topics.tex`,
        operation: "create",
        kind: "topics",
        title: "Key Concepts",
        content: generateDefaultComponentScaffold("topics", "Key Concepts", prompt),
      });
    }
  }

  // Populate targeted files from explorer
  for (const node of targetedNodes) {
    if (!node.filePath) continue;
    const normPath = normalizePath(node.filePath);
    const existing = existingFiles.get(normPath) || "";
    const isUpdate = existing.trim().length > 0;

    fileOperations.push({
      path: normPath,
      operation: isUpdate ? "update" : "create",
      kind: node.kind,
      title: node.title,
      existingContent: existing,
      content: isUpdate && existing.trim().length > 50
        ? existing // Keep existing baseline for targeted edits
        : generateDefaultComponentScaffold(node.kind, node.title, prompt),
    });
  }

  // Enrich with AI if available
  await enrichFileOperationsWithAi(fileOperations, prompt);

  return {
    planId,
    summary: `Plan targeting ${fileOperations.length} project file(s) for "${prompt.slice(0, 50)}"`,
    isScaffoldedCourse: false,
    structuralActions,
    fileOperations,
    provider: "ai-agent",
    usedFallback: false,
    scope: request.scope || "current-lesson",
  };
}

function resolveTargetNodes(explorer: LuExplorerNode[], request: LuAgentPlanRequest): LuExplorerNode[] {
  const flat = flattenExplorer(explorer).filter((n) => n.filePath?.trim());

  if (request.targetPaths?.length) {
    const targetSet = new Set(request.targetPaths.map(normalizePath));
    return flat.filter((n) => n.filePath && targetSet.has(normalizePath(n.filePath)));
  }

  if (request.scope === "current-file" && request.activeFilePath) {
    const norm = normalizePath(request.activeFilePath);
    return flat.filter((n) => n.filePath && normalizePath(n.filePath) === norm);
  }

  if (request.scope === "current-lesson" && request.activeFilePath) {
    const active = flat.find((n) => n.filePath && normalizePath(n.filePath) === normalizePath(request.activeFilePath!));
    if (active?.lessonId) {
      return flat.filter((n) => n.lessonId === active.lessonId);
    }
  }

  if (request.scope === "current-module" && request.activeFilePath) {
    const active = flat.find((n) => n.filePath && normalizePath(n.filePath) === normalizePath(request.activeFilePath!));
    if (active?.moduleId) {
      return flat.filter((n) => n.moduleId === active.moduleId);
    }
  }

  if (request.scope === "project-incomplete") {
    return flat.filter((n) => n.status === "empty" || n.status === "draft" || n.status === "error");
  }

  if (request.scope === "entire-project") {
    return flat.filter((n) => COMPONENT_KINDS.has(n.kind));
  }

  // Default: if active file exists, pick its lesson or itself
  if (request.activeFilePath) {
    const norm = normalizePath(request.activeFilePath);
    const active = flat.find((n) => n.filePath && normalizePath(n.filePath) === norm);
    if (active?.lessonId) {
      return flat.filter((n) => n.lessonId === active.lessonId);
    }
    return active ? [active] : flat.slice(0, 5);
  }

  return flat.slice(0, 6);
}

/** Enhance file operations with LLM response if available */
async function enrichFileOperationsWithAi(operations: LuAgentFileOperation[], prompt: string): Promise<void> {
  if (!operations.length) return;

  const targetList = operations
    .map((op) => `- path: ${op.path}\n  kind: ${op.kind}\n  title: ${op.title}\n  hint: ${hintForKind(op.kind)}`)
    .join("\n\n");

  const userMessage = `Instructor request:\n"${prompt}"\n\nGenerate complete LaTeX code for the following project files:\n\n${targetList}\n\nReturn JSON in format: { "files": [ { "path": "/path/to/file.tex", "content": "\\\\command{...}" } ] }`;

  try {
    const response = await AiRouter.chat([
      { role: "system", content: LU_AUTHORING_SYSTEM_RULES },
      { role: "user", content: userMessage },
    ]);

    if (response?.message?.content) {
      const parsed = extractJsonObject(response.message.content);
      if (parsed && Array.isArray(parsed.files)) {
        const byPath = new Map<string, string>();
        for (const f of parsed.files) {
          if (f && typeof f === "object" && typeof (f as any).path === "string" && typeof (f as any).content === "string") {
            byPath.set(normalizePath((f as any).path), sanitizeLatexSource((f as any).content));
          }
        }

        for (const op of operations) {
          const aiContent = byPath.get(op.path);
          if (aiContent && aiContent.trim().length > 10) {
            op.content = aiContent;
          }
        }
      }
    }
  } catch {
    // Keep deterministic scaffolds
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * STAGE 2 & 3: TRANSACTIONAL EXECUTION & ROLLBACK
 * ══════════════════════════════════════════════════════════════════════
 */
export async function executeLuAgentPlan(
  projectId: string,
  plan: LuAgentPlan,
  options?: { rollbackOnFailure?: boolean }
): Promise<LuAgentExecutionResult> {
  // Step 1: Capture pre-execution snapshot for safe rollback
  const snapshotLabel = `Pre-Agent: ${plan.summary.slice(0, 40)}`;
  const snapshot = await captureProjectSnapshotForProject(projectId, snapshotLabel);
  await pushUndo(projectId, snapshot);

  const modifiedPaths: string[] = [];

  try {
    // Step 2: Apply structural actions sequentially
    for (const action of plan.structuralActions) {
      await applyStructureAction(projectId, action);
    }

    // Step 3: Write generated file operations to database
    const yjsResetIds: string[] = [];
    for (const op of plan.fileOperations) {
      const normPath = normalizePath(op.path);
      const fileName = normPath.split("/").pop() || "file.tex";
      const sanitized = sanitizeLatexSource(op.content).trim() + "\n";

      // Ensure parent folders exist
      const segments = normPath.split("/").filter(Boolean);
      let currentDir = "";
      for (let i = 0; i < segments.length - 1; i++) {
        currentDir += `/${segments[i]}`;
        const dirExists = await prisma.latexFile.findFirst({
          where: { projectId, path: currentDir },
        });
        if (!dirExists) {
          await prisma.latexFile.create({
            data: {
              projectId,
              path: currentDir,
              name: segments[i],
              isFolder: true,
              content: null,
            },
          });
        }
      }

      const existingFile = await prisma.latexFile.findFirst({
        where: { projectId, path: normPath },
      });

      if (existingFile) {
        await prisma.latexFile.update({
          where: { id: existingFile.id },
          data: { content: sanitized },
        });
        yjsResetIds.push(existingFile.id);
      } else {
        const created = await prisma.latexFile.create({
          data: {
            projectId,
            path: normPath,
            name: fileName,
            isFolder: false,
            content: sanitized,
          },
        });
        yjsResetIds.push(created.id);
      }

      modifiedPaths.push(normPath);
    }

    if (yjsResetIds.length > 0) {
      await resetYjsForFileIds(projectId, yjsResetIds);
    }

    // Step 4: Run prepareLuBuild to rebuild orchestration files and validate AST
    await prepareLuBuild({
      projectId,
      mode: "repair",
      preserveInstructorContent: true,
    });

    return {
      success: true,
      planId: plan.planId,
      snapshotId: snapshot.id,
      modifiedFiles: modifiedPaths,
    };
  } catch (err: any) {
    if (options?.rollbackOnFailure) {
      await restoreSnapshot(projectId, snapshot);
    }
    throw new Error(`Failed to apply agent plan: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Roll back changes to a designated snapshot */
export async function rollbackLuAgent(projectId: string, snapshotId?: string): Promise<{ success: boolean }> {
  const undoStack = await readStack(projectId, UNDO_STACK_PATH);
  if (!undoStack.entries.length) {
    throw new Error("No previous snapshot available for rollback.");
  }

  let targetSnapshot: ProjectSnapshot | undefined;
  if (snapshotId) {
    targetSnapshot = undoStack.entries.find((s) => s.id === snapshotId);
  } else {
    targetSnapshot = undoStack.entries[undoStack.entries.length - 1];
  }

  if (!targetSnapshot) {
    throw new Error(`Snapshot ${snapshotId || "latest"} not found in undo history.`);
  }

  await restoreSnapshot(projectId, targetSnapshot);
  return { success: true };
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * STAGE 2: REAL COMPILATION & AUTONOMOUS REPAIR LOOP
 * ══════════════════════════════════════════════════════════════════════
 */
export async function runAgentCompileAndRepair(
  projectId: string,
  options: { maxRetries?: number; snapshotId?: string } = {}
): Promise<LuAgentCompileRepairResult> {
  const maxRetries = options.maxRetries ?? 3;
  const history: LuAgentRepairHistoryItem[] = [];
  const repairedFiles = new Set<string>();

  let attempt = 0;
  let lastErrorSignature = "";

  while (attempt <= maxRetries) {
    // Step 1: Prepare build and resolve merged project
    const build = await prepareLuBuild({
      projectId,
      mode: "compile",
      forPdf: true,
      skipDryRunPdf: true,
      preserveInstructorContent: true,
    });

    const files = await loadProjectFiles(projectId);
    const resolved = resolveProjectIncludesWithFallback(files, { forPdf: true });
    const mergedTex = resolved.mergedForPdf?.trim() || "";

    if (!mergedTex) {
      return {
        success: false,
        attempts: attempt,
        logs: "Include merge produced empty document.",
        errors: [{ message: "Merged project is empty", file: "/main.tex" }],
        repairedFiles: Array.from(repairedFiles),
        stalled: true,
        verified: false,
        snapshotId: options.snapshotId,
        history,
      };
    }

    // Step 2: Run real local pdflatex compilation
    const compileResult: LatexCompilationResult = await compileLatexLocally(projectId, mergedTex, {
      copyReferencedImages: true,
      enableBibtex: false,
      compilerFallback: true,
      maxPasses: 1,
      preserveProvidedMainTex: true,
      timeoutMs: 90000,
    });

    // Step 3: Check compilation success and physical PDF verification
    if (compileResult.success && compileResult.pdfPath) {
      const pdfExists = fs.existsSync(compileResult.pdfPath);
      const pdfSize = pdfExists ? fs.statSync(compileResult.pdfPath).size : 0;

      if (pdfExists && pdfSize > 0) {
        // Store compiled PDF to obtain public preview URL
        let pdfUrl: string | undefined;
        try {
          const stored = await storeCompiledPdfFromPath(compileResult.pdfPath, `agent-${projectId}`);
          pdfUrl = stored.publicUrl;
        } catch {
          pdfUrl = undefined;
        }

        history.push({
          attempt,
          stage: "verified",
          errorCount: 0,
          repairedFiles: Array.from(repairedFiles),
        });

        return {
          success: true,
          attempts: attempt,
          logs: compileResult.logs,
          pdfPath: compileResult.pdfPath,
          pdfUrl,
          errors: [],
          repairedFiles: Array.from(repairedFiles),
          stalled: false,
          verified: true,
          snapshotId: options.snapshotId,
          history,
        };
      }
    }

    // Step 4: Map compiler errors to original source files and lines
    const mappedErrors: MappedLatexError[] = mapErrorsToSourceFiles(
      compileResult.errors || [],
      resolved.lineMap || []
    );

    const errorSignature = mappedErrors
      .map((e) => `${e.sourceFile || e.file}:${e.sourceLine || e.line}:${e.message}`)
      .sort()
      .join("|");

    // Detect stall (same errors after attempt)
    if (attempt > 0 && errorSignature === lastErrorSignature) {
      history.push({
        attempt,
        stage: "stalled",
        errorCount: mappedErrors.length,
        repairedFiles: Array.from(repairedFiles),
        sampleError: mappedErrors[0]?.message,
      });

      return {
        success: false,
        attempts: attempt,
        logs: compileResult.logs,
        errors: mappedErrors,
        repairedFiles: Array.from(repairedFiles),
        stalled: true,
        verified: false,
        snapshotId: options.snapshotId,
        history,
      };
    }

    lastErrorSignature = errorSignature;

    if (attempt >= maxRetries) {
      history.push({
        attempt,
        stage: "max_retries_exceeded",
        errorCount: mappedErrors.length,
        repairedFiles: Array.from(repairedFiles),
        sampleError: mappedErrors[0]?.message,
      });

      return {
        success: false,
        attempts: attempt,
        logs: compileResult.logs,
        errors: mappedErrors,
        repairedFiles: Array.from(repairedFiles),
        stalled: false,
        verified: false,
        snapshotId: options.snapshotId,
        history,
      };
    }

    // Step 5: Perform targeted repairs on affected files
    const errorsByFile = new Map<string, MappedLatexError[]>();
    for (const err of mappedErrors) {
      const targetFile = err.sourceFile || err.file;
      if (!targetFile || targetFile === "/main.tex") continue;
      const list = errorsByFile.get(targetFile) || [];
      list.push(err);
      errorsByFile.set(targetFile, list);
    }

    const currentAttemptRepairs: string[] = [];
    const yjsResetIds: string[] = [];

    for (const [targetPath, errList] of errorsByFile.entries()) {
      const normPath = normalizePath(targetPath);
      const existing = await prisma.latexFile.findFirst({
        where: { projectId, path: normPath },
      });
      if (!existing || !existing.content) continue;

      const repairedContent = await repairSourceFileContent(
        existing.content,
        errList,
        normPath
      );

      if (repairedContent !== existing.content) {
        await prisma.latexFile.update({
          where: { id: existing.id },
          data: { content: repairedContent },
        });
        yjsResetIds.push(existing.id);
        repairedFiles.add(normPath);
        currentAttemptRepairs.push(normPath);
      }
    }

    if (yjsResetIds.length > 0) {
      await resetYjsForFileIds(projectId, yjsResetIds);
    }

    history.push({
      attempt,
      stage: "repair_applied",
      errorCount: mappedErrors.length,
      repairedFiles: currentAttemptRepairs,
      sampleError: mappedErrors[0]?.message,
    });

    // If no files could be repaired, progress is stalled
    if (currentAttemptRepairs.length === 0) {
      return {
        success: false,
        attempts: attempt,
        logs: compileResult.logs,
        errors: mappedErrors,
        repairedFiles: Array.from(repairedFiles),
        stalled: true,
        verified: false,
        snapshotId: options.snapshotId,
        history,
      };
    }

    attempt++;
  }

  return {
    success: false,
    attempts: attempt,
    logs: "Compilation failed after repair attempts.",
    errors: [],
    repairedFiles: Array.from(repairedFiles),
    stalled: false,
    verified: false,
    snapshotId: options.snapshotId,
    history,
  };
}

/** Targeted repair of a single source file given its mapped compiler errors */
async function repairSourceFileContent(
  currentContent: string,
  errors: MappedLatexError[],
  filePath: string
): Promise<string> {
  let content = currentContent;

  // 1. Deterministic repairs for common syntax breaks
  content = sanitizeLatexSource(content);

  // Fix unclosed \begin{env} or missing \end{env}
  const beginMatches = [...content.matchAll(/\\begin\{([^}]+)\}/g)].map((m) => m[1]);
  const endMatches = [...content.matchAll(/\\end\{([^}]+)\}/g)].map((m) => m[1]);
  for (const env of beginMatches) {
    if (!endMatches.includes(env)) {
      content += `\n\\end{${env}}\n`;
    }
  }

  // 2. AI repair pass for semantic/macro issues
  const errorSnippets = errors
    .map((e) => `Line ${e.sourceLine || "?"}: ${e.message}`)
    .join("\n");

  const repairPrompt = `Fix the following LaTeX compilation error(s) in file "${filePath}":
${errorSnippets}

File content:
\`\`\`latex
${content}
\`\`\`

Rules:
1. Preserve all existing working sections.
2. Fix ONLY the erroneous lines, undefined control sequences, missing braces, or unescaped characters.
3. Return the entire corrected file content wrapped in \`\`\`latex ... \`\`\`.`;

  try {
    const aiResponse = await AiRouter.chat([
      {
        role: "system",
        content: "You are a LaTeX compilation debugger. Output only the corrected LaTeX inside a ```latex code block.",
      },
      {
        role: "user",
        content: repairPrompt,
      },
    ]);

    if (aiResponse?.message?.content) {
      const match = aiResponse.message.content.match(/```(?:latex)?\s*([\s\S]*?)```/i);
      if (match?.[1]?.trim()) {
        const candidate = match[1].trim() + "\n";
        if (candidate.length > 20) {
          return sanitizeLatexSource(candidate);
        }
      }
    }
  } catch {
    // Keep deterministic repair
  }

  return content;
}
