import type { LuProjectJson } from "./luProjectSchema.js";
import type { LuValidationIssue } from "./luProjectValidator.js";
import { loadProjectFiles, filesToContentMap, getProjectJsonFromFiles } from "./luProjectFiles.js";
import { resolveProjectIncludesWithFallback } from "./luIncludeResolver.js";
import { parseLearningUniverseLatex } from "../../controllers/learning-universe-parser.js";
import {
  validateLuProjectStructure,
  validateParsedContentBlocks,
  hasBlockingIssues,
} from "./luProjectValidator.js";
import {
  COMPONENT_TITLES,
  type LuLessonComponentKind,
} from "./luComponentRegistry.js";
import { componentFilePath } from "./luComponentFilePaths.js";
import { ensureLuProjectV2 } from "./migrateSingleFileToProject.js";
import { runOneTimeMigrationIfNeeded, repairProjectQuestionOwnership } from "./luMigrationEngine.js";
import { repairOrchestrationTexIfNeeded } from "./luProjectRepair.js";
import { persistProjectJson } from "./luAuthoringEngine.js";
import { getTransactionStackState } from "./luTransactionEngine.js";
import { validateLuBuildReadiness } from "./luBuildEngine.js";

export type LuNodeStatus = "complete" | "draft" | "error" | "empty";

export type LuExplorerNodeKind =
  | "universe"
  | "track"
  | "module"
  | "lesson"
  | "overview"
  | "objectives"
  | "topics"
  | "examples"
  | "practice"
  | "resources"
  | "quiz"
  | "project"
  | "assignment"
  | "discussion"
  | "question"
  | "resource-item"
  | "research-paper"
  | "checkpoint"
  | "reflection"
  | "references"
  | "coding-lab"
  | "notebook"
  | "assessment"
  | "video";

export interface LuExplorerNode {
  id: string;
  kind: LuExplorerNodeKind;
  title: string;
  trackId?: string;
  moduleId?: string;
  lessonId?: string;
  componentId?: string;
  filePath?: string;
  config?: Record<string, unknown>;
  status: LuNodeStatus;
  issues: LuValidationIssue[];
  children?: LuExplorerNode[];
}

export interface LuAuthoringProgress {
  tracks: number;
  modules: number;
  lessons: number;
  quizzes: number;
  projects: number;
  resources: number;
  estimatedHours: number;
  completionPercent: number;
  completeNodes: number;
  totalNodes: number;
}

export interface LuProjectHealth {
  score: number;
  issues: LuValidationIssue[];
  readyToPublish: boolean;
  compileReady: boolean;
}

export interface LuAuthoringState {
  isV2: boolean;
  project: LuProjectJson | null;
  explorer: LuExplorerNode[];
  progress: LuAuthoringProgress;
  health: LuProjectHealth;
  publishStatus: "draft" | "ready" | "issues";
  version: string;
  canUndo: boolean;
  canRedo: boolean;
}

function detectStatus(issues: LuValidationIssue[], hasContent: boolean): LuNodeStatus {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (!hasContent) return "empty";
  if (issues.some((i) => i.severity === "warning")) return "draft";
  return "complete";
}

function analyzeLessonTex(content: string, filePath: string): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];
  if (!/\\lesson\s*\{/.test(content)) {
    issues.push({
      severity: "warning",
      code: "MISSING_LESSON_CMD",
      message: "Missing lesson definition",
      file: filePath,
    });
  }
  return issues;
}

function componentKindToNodeKind(kind: LuLessonComponentKind): LuExplorerNodeKind {
  const map: Record<LuLessonComponentKind, LuExplorerNodeKind> = {
    overview: "overview",
    objectives: "objectives",
    topics: "topics",
    examples: "examples",
    practice: "practice",
    "coding-lab": "coding-lab",
    notebook: "notebook",
    resources: "resources",
    quiz: "quiz",
    assignment: "assignment",
    discussion: "discussion",
    project: "project",
    "research-paper": "research-paper",
    checkpoint: "checkpoint",
    reflection: "reflection",
    references: "references",
    video: "video",
  };
  return map[kind] ?? "topics";
}

function buildComponentNodes(
  lesson: {
    id: string;
    components?: Array<{
      id: string;
      kind: string;
      title: string;
      file?: string;
      children?: Array<{ id: string; kind: string; title: string; file?: string }>;
    }>;
  },
  trackId: string,
  moduleId: string,
  trackFolder: string,
  modFolder: string,
  lessonPath: string,
  lessonIssues: LuValidationIssue[]
): LuExplorerNode[] {
  const nodes: LuExplorerNode[] = [];
  for (const comp of lesson.components ?? []) {
    const kind = componentKindToNodeKind(comp.kind as LuLessonComponentKind);
    const node: LuExplorerNode = {
      id: `${trackId}-${moduleId}-${lesson.id}-${comp.id}`,
      kind,
      title: comp.title || COMPONENT_TITLES[comp.kind as LuLessonComponentKind] || comp.kind,
      trackId,
      moduleId,
      lessonId: lesson.id,
      componentId: comp.id,
      filePath:
        comp.file || componentFilePath(trackFolder, modFolder, lesson.id, comp.id, comp.kind),
      config: (comp as { config?: Record<string, unknown> }).config,
      status: detectStatus(lessonIssues, true),
      issues: [],
      children: [],
    };

    if (comp.children?.length) {
      for (const child of comp.children) {
        const childKind =
          comp.kind === "quiz" ? "question" : comp.kind === "resources" ? "resource-item" : kind;
        const childTexKind =
          comp.kind === "quiz"
            ? child.kind === "question" || child.id.startsWith("question-") || child.id.startsWith("quiz-q-")
              ? "question"
              : "question"
            : comp.kind === "resources"
              ? "resources"
              : comp.kind;
        node.children!.push({
          id: `${trackId}-${moduleId}-${lesson.id}-${child.id}`,
          kind: childKind,
          title: child.title,
          trackId,
          moduleId,
          lessonId: lesson.id,
          componentId: child.id,
          filePath:
            child.file ||
            componentFilePath(trackFolder, modFolder, lesson.id, child.id, childTexKind),
          config: {
            ...((child as { config?: Record<string, unknown> }).config ?? {}),
            parentId:
              (child as { config?: { parentId?: string } }).config?.parentId ??
              (comp.kind === "quiz" ? comp.id : undefined),
          },
          status: "draft",
          issues: [],
        });
      }
    }
    nodes.push(node);
  }
  return nodes;
}

function buildExplorerTree(
  project: LuProjectJson,
  contentMap: Map<string, string>
): LuExplorerNode[] {
  const root: LuExplorerNode = {
    id: "universe",
    kind: "universe",
    title: project.universe.title || project.metadata.title,
    status: detectStatus([], !!project.universe.title),
    issues: [],
    children: [],
  };

  for (const track of project.tracks) {
    const trackPath = `/${track.folder}/${track.file}`;
    const trackContent = contentMap.get(trackPath) || "";
    const trackNode: LuExplorerNode = {
      id: track.id,
      kind: "track",
      title: track.title,
      trackId: track.id,
      filePath: trackPath,
      status: detectStatus([], !!trackContent.trim()),
      issues: [],
      children: [],
    };

    for (const mod of track.modules) {
      const modPath = `/${track.folder}/${mod.folder}/${mod.file}`;
      const modNode: LuExplorerNode = {
        id: `${track.id}-${mod.id}`,
        kind: "module",
        title: mod.title,
        trackId: track.id,
        moduleId: mod.id,
        filePath: modPath,
        status: mod.lessons.length > 0 ? "draft" : "empty",
        issues: [],
        children: [],
      };

      for (const lesson of mod.lessons) {
        const lessonPath = `/${track.folder}/${mod.folder}/${lesson.file}`;
        const lessonContent = contentMap.get(lessonPath) || "";
        const lessonIssues = analyzeLessonTex(lessonContent, lessonPath);

        const lessonNode: LuExplorerNode = {
          id: `${track.id}-${mod.id}-${lesson.id}`,
          kind: "lesson",
          title: lesson.title,
          trackId: track.id,
          moduleId: mod.id,
          lessonId: lesson.id,
          filePath: lessonPath,
          status: detectStatus(lessonIssues, lessonContent.trim().length > 0),
          issues: lessonIssues,
          children: buildComponentNodes(
            lesson,
            track.id,
            mod.id,
            track.folder,
            mod.folder,
            lessonPath,
            lessonIssues
          ),
        };

        modNode.children!.push(lessonNode);
      }

      trackNode.children!.push(modNode);
    }

    root.children!.push(trackNode);
  }

  return [root];
}

function computeProgress(explorer: LuExplorerNode[], project: LuProjectJson): LuAuthoringProgress {
  const flat: LuExplorerNode[] = [];
  const walk = (nodes: LuExplorerNode[]) => {
    for (const n of nodes) {
      flat.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(explorer);

  const lessons = flat.filter((n) => n.kind === "lesson").length;
  const quizzes = flat.filter((n) => n.kind === "quiz").length;
  const projects = flat.filter((n) => n.kind === "project").length;
  const resources = flat.filter((n) => n.kind === "resources").length;
  const completeNodes = flat.filter((n) => n.status === "complete").length;
  const totalNodes = flat.filter((n) => n.kind !== "universe").length;

  let modules = 0;
  const tracks = project.tracks.length;
  for (const t of project.tracks) {
    modules += t.modules.length;
  }

  return {
    tracks,
    modules,
    lessons,
    quizzes,
    projects,
    resources,
    estimatedHours: project.universe.estimatedHours ?? 0,
    completionPercent: totalNodes > 0 ? Math.round((completeNodes / totalNodes) * 100) : 0,
    completeNodes,
    totalNodes,
  };
}

function computeHealth(
  structIssues: LuValidationIssue[],
  contentIssues: LuValidationIssue[],
  explorer: LuExplorerNode[]
): LuProjectHealth {
  const all = [...structIssues, ...contentIssues, ...explorer.flatMap(collectIssues)];
  const errors = all.filter((i) => i.severity === "error");
  const warnings = all.filter((i) => i.severity === "warning");
  const penalty = errors.length * 15 + warnings.length * 5;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return {
    score,
    issues: all.slice(0, 20),
    readyToPublish: errors.length === 0 && score >= 80,
    compileReady: errors.length === 0,
  };
}

function collectIssues(node: LuExplorerNode): LuValidationIssue[] {
  return [...node.issues, ...(node.children?.flatMap(collectIssues) || [])];
}

/** Read-only authoring state — never repairs or regenerates tex on load. */
export async function getLuAuthoringState(projectId: string): Promise<LuAuthoringState> {
  let files = await loadProjectFiles(projectId);
  let project = getProjectJsonFromFiles(files);

  if (!project) {
    try {
      await ensureLuProjectV2(projectId);
      files = await loadProjectFiles(projectId);
      project = getProjectJsonFromFiles(files);
    } catch (err) {
      console.warn("[getLuAuthoringState] ensureLuProjectV2 failed:", err);
    }
  }

  const isV2 = project !== null;

  if (!project) {
    return {
      isV2: false,
      project: null,
      explorer: [],
      progress: {
        tracks: 0,
        modules: 0,
        lessons: 0,
        quizzes: 0,
        projects: 0,
        resources: 0,
        estimatedHours: 0,
        completionPercent: 0,
        completeNodes: 0,
        totalNodes: 0,
      },
      health: { score: 0, issues: [], readyToPublish: false, compileReady: false },
      publishStatus: "draft",
      version: "legacy",
      canUndo: false,
      canRedo: false,
    };
  }

  const migration = await runOneTimeMigrationIfNeeded(projectId, project);
  if (migration.migrated) {
    files = await loadProjectFiles(projectId);
    project = getProjectJsonFromFiles(files)!;
  } else if (repairProjectQuestionOwnership(project)) {
    await persistProjectJson(projectId, project);
  }

  await repairOrchestrationTexIfNeeded(projectId);
  files = await loadProjectFiles(projectId);
  project = getProjectJsonFromFiles(files)!;

  const contentMap = filesToContentMap(files);
  const filePaths = new Set(files.filter((f) => !f.isFolder).map((f) => f.path));
  const structIssues = validateLuProjectStructure(project, filePaths);

  let contentIssues: LuValidationIssue[] = [];
  try {
    const resolved = resolveProjectIncludesWithFallback(files);
    const parsed = parseLearningUniverseLatex(resolved.mergedDsl);
    if (parsed) {
      contentIssues = validateParsedContentBlocks(parsed);
    }
  } catch {
    contentIssues.push({
      severity: "error",
      code: "RESOLVE_FAILED",
      message: "Could not resolve project includes",
    });
  }

  const explorer = buildExplorerTree(project, contentMap);
  const progress = computeProgress(explorer, project);

  let buildIssues: LuValidationIssue[] = [];
  try {
    const buildCheck = await validateLuBuildReadiness(projectId);
    buildIssues = buildCheck.issues;
  } catch {
    // non-fatal for UI load
  }

  const health = computeHealth(structIssues, [...contentIssues, ...buildIssues], explorer);
  const stacks = await getTransactionStackState(projectId);

  return {
    isV2: true,
    project,
    explorer,
    progress,
    health,
    publishStatus: health.readyToPublish ? "ready" : hasBlockingIssues(structIssues) ? "issues" : "draft",
    version: `2.${project.versionMeta.schemaVersion}`,
    canUndo: stacks.canUndo,
    canRedo: stacks.canRedo,
  };
}
