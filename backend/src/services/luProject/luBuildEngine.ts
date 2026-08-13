/**
 * Unified LU build engine — validation, repair, dry-run, and compile readiness.
 * Every compile and publish path must pass through this engine first.
 */
import { prisma } from "../../utils/prisma.js";
import {
  loadProjectFiles,
  filesToContentMap,
  getProjectJsonFromFiles,
  isLuV2Project,
  type ProjectFileRecord,
} from "./luProjectFiles.js";
import { ensureLuProjectV2 } from "./migrateSingleFileToProject.js";
import { repairLuProject } from "./luProjectRepair.js";
import {
  hasBlockingIssues,
  validateLuProjectStructure,
  validateParsedContentBlocks,
  type LuValidationIssue,
} from "./luProjectValidator.js";
import { resolveProjectIncludesWithFallback } from "./luIncludeResolver.js";
import { parseLearningUniverseLatex } from "../../controllers/learning-universe-parser.js";
import { prepareLatexForCompilation } from "../latexLearningCommands.js";
import { compileLatexLocally } from "../latexCompileService.js";
import {
  buildCourseManifest,
  LU_COURSE_MANIFEST_PATH,
  type LuCourseManifest,
} from "./luCourseManifest.js";
import { buildDependencyGraph, dependencyIssuesToValidation } from "./luDependencyGraph.js";
import { lintAllTexFiles, lintMergedDsl } from "./luTexLinter.js";
import { validateProjectTexMacros } from "./luTexMacroValidator.js";
import {
  repairMissingDependencies,
  repairMissingComponentFiles,
  quizValidationToIssues,
} from "./luComponentAutoRepair.js";
import { enforceDslOnFiles } from "./luDslEnforcer.js";
import { rerenderTexMapFromProject, renderCourseDocument } from "./luCourseRenderer.js";
import type { LuCourseDocument } from "./luCourseContentSchema.js";
import { LU_PROJECT_JSON_PATH } from "./luProjectSchema.js";
import { isUserOwnedComponentTexPath } from "./luProjectTexSync.js";
import { resetYjsForFileIds } from "./yjsDocumentService.js";
import {
  regenerateOrchestrationFromProject,
  validateProjectOrchestration,
  orchestrationIssuesToValidation,
  normalizeProjectComponents,
} from "./luOrchestrationEngine.js";

const LU_COURSE_CONTENT_PATH = "/course.content.json";
const VALIDATION_TIMEOUT_MS = Number(process.env.LU_VALIDATION_TIMEOUT_MS || 2000);
const MAX_RETRIES_DEFAULT = 2;

export type LuBuildStage =
  | "load"
  | "repair_project"
  | "repair_orchestration"
  | "build_manifest"
  | "dependency_graph"
  | "structure_validation"
  | "component_repair"
  | "tex_lint"
  | "tex_invariants"
  | "quiz_validation"
  | "include_merge"
  | "content_validation"
  | "dry_run_compile"
  | "ready";

export interface LuBuildStageResult {
  stage: LuBuildStage;
  success: boolean;
  durationMs: number;
  issues?: LuValidationIssue[];
  repairs?: string[];
}

export interface LuBuildOptions {
  projectId: string;
  /** validate = check only; repair = auto-fix; compile = repair + dry-run + allow pdflatex */
  mode?: "validate" | "repair" | "compile";
  maxRetries?: number;
  forPdf?: boolean;
  /** Skip actual pdflatex during dry-run (merge + lint only) */
  skipDryRunPdf?: boolean;
  /**
   * When true (default for compile/validate), never regenerate orchestration or
   * re-render component .tex — instructor edits must survive publish and re-open.
   */
  preserveInstructorContent?: boolean;
}

export interface LuBuildResult {
  ready: boolean;
  manifest?: LuCourseManifest;
  mergedTex?: string;
  stages: LuBuildStageResult[];
  issues: LuValidationIssue[];
  repairs: string[];
  retryCount: number;
  dryRunSuccess: boolean;
}

function stageResult(
  stage: LuBuildStage,
  start: number,
  success: boolean,
  extra?: Partial<LuBuildStageResult>
): LuBuildStageResult {
  return { stage, success, durationMs: Date.now() - start, ...extra };
}

async function persistManifest(projectId: string, manifest: LuCourseManifest): Promise<void> {
  const content = JSON.stringify(manifest, null, 2);
  const existing = await prisma.latexFile.findFirst({
    where: { projectId, path: LU_COURSE_MANIFEST_PATH },
  });
  if (existing) {
    await prisma.latexFile.update({ where: { id: existing.id }, data: { content } });
  } else {
    await prisma.latexFile.create({
      data: {
        projectId,
        path: LU_COURSE_MANIFEST_PATH,
        name: "course.manifest.json",
        isFolder: false,
        content,
      },
    });
  }
}

function collectValidationIssues(
  project: import("./luProjectSchema.js").LuProjectJson,
  files: ProjectFileRecord[],
  contentMap: Map<string, string>,
  forPdf: boolean
): { issues: LuValidationIssue[]; mergedTex?: string; mergedPdfTex?: string; graphIssues: LuValidationIssue[] } {
  const filePaths = new Set(files.filter((f) => !f.isFolder).map((f) => f.path));
  const issues: LuValidationIssue[] = [
    ...validateProjectTexMacros(files).issues,
    ...validateLuProjectStructure(project, filePaths),
    ...orchestrationIssuesToValidation(validateProjectOrchestration(project, contentMap)),
    ...quizValidationToIssues(project),
    ...lintAllTexFiles(contentMap),
    ...enforceDslOnFiles(contentMap).issues,
  ];

  const graph = buildDependencyGraph(files);
  const graphIssues = dependencyIssuesToValidation(graph);
  issues.push(...graphIssues);

  let mergedTex: string | undefined;
  let mergedPdfTex: string | undefined;
  try {
    const resolved = resolveProjectIncludesWithFallback(files, { forPdf });
    mergedTex = (forPdf ? resolved.mergedForPdf : resolved.mergedDsl)?.trim();
    const pdfResolved = forPdf
      ? resolved
      : resolveProjectIncludesWithFallback(files, { forPdf: true });
    mergedPdfTex = pdfResolved.mergedForPdf?.trim();
    if (mergedTex) {
      issues.push(...lintMergedDsl(mergedTex));
      const parsed = parseLearningUniverseLatex(mergedTex);
      if (parsed) {
        issues.push(...validateParsedContentBlocks(parsed));
      } else {
        issues.push({
          severity: "error",
          code: "PARSE_FAILED",
          message: "Could not parse merged Learning Universe DSL",
          suggestedFix: "Check track/module/lesson .tex orchestration files",
        });
      }
    }
  } catch (err) {
    issues.push({
      severity: "error",
      code: "INCLUDE_MERGE_FAILED",
      message: err instanceof Error ? err.message : String(err),
      suggestedFix: "Repair orchestration files or regenerate from project.json",
    });
  }

  return { issues, mergedTex, mergedPdfTex, graphIssues };
}

async function persistRerenderedTex(
  projectId: string,
  texMap: Map<string, string>,
  project?: import("./luProjectSchema.js").LuProjectJson
): Promise<string[]> {
  const repairs: string[] = [];
  const yjsResetIds: string[] = [];

  for (const [path, content] of texMap.entries()) {
    if (!path.endsWith(".tex")) continue;
    const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
    const name = path.split("/").pop() || "file.tex";
    if (existing) {
      if (existing.content !== content) {
        if (
          isUserOwnedComponentTexPath(path) &&
          typeof existing.content === "string" &&
          existing.content.trim().length > 0
        ) {
          continue;
        }
        await prisma.latexFile.update({ where: { id: existing.id }, data: { content } });
        yjsResetIds.push(existing.id);
        repairs.push(`Re-rendered ${path}`);
      }
    } else {
      const created = await prisma.latexFile.create({
        data: { projectId, path, name, isFolder: false, content },
      });
      yjsResetIds.push(created.id);
      repairs.push(`Created ${path} from renderer`);
    }
  }

  if (project) {
    const pj = await prisma.latexFile.findFirst({ where: { projectId, path: LU_PROJECT_JSON_PATH } });
    if (pj) {
      await prisma.latexFile.update({
        where: { id: pj.id },
        data: { content: JSON.stringify(project, null, 2) },
      });
    }
  }

  if (yjsResetIds.length) {
    await resetYjsForFileIds(projectId, yjsResetIds);
  }

  return repairs;
}

/** Re-render .tex from course.content.json or project.json — fixes AI-generated invalid DSL. */
async function repairDslFromRenderer(
  projectId: string,
  project: import("./luProjectSchema.js").LuProjectJson,
  files: ProjectFileRecord[]
): Promise<string[]> {
  const contentFile = files.find((f) => f.path === LU_COURSE_CONTENT_PATH && f.content);
  if (contentFile?.content) {
    try {
      const doc = JSON.parse(contentFile.content) as LuCourseDocument;
      const previous = filesToContentMap(files);
      const rendered = renderCourseDocument(doc, { previousTex: previous });
      return persistRerenderedTex(projectId, new Map(rendered.files.filter((f) => !f.isFolder).map((f) => [f.path, f.content])), rendered.project);
    } catch {
      // fall through to project.json rerender
    }
  }

  const texMap = rerenderTexMapFromProject(project);
  return persistRerenderedTex(projectId, texMap);
}

async function runRepairPass(
  projectId: string,
  project: import("./luProjectSchema.js").LuProjectJson,
  files: ProjectFileRecord[]
): Promise<string[]> {
  const repairs: string[] = [];

  normalizeProjectComponents(project);
  const orchRepairs = await regenerateOrchestrationFromProject(projectId, project);
  repairs.push(...orchRepairs);

  const contentMap = filesToContentMap(files);
  const repairResult = await repairLuProject(projectId, project, contentMap);
  if (repairResult.texChanged) {
    repairs.push("Component files synchronized from project.json");
  }

  await regenerateOrchestrationFromProject(projectId, project);
  repairs.push("Orchestration files overwritten from project.json");

  const refreshedFiles = await loadProjectFiles(projectId);
  const refreshedMap = filesToContentMap(refreshedFiles);
  const graph = buildDependencyGraph(refreshedFiles);

  const depRepair = await repairMissingDependencies(projectId, project, refreshedMap, graph);
  repairs.push(...depRepair.repairs.map((r) => r.message));

  const compRepair = await repairMissingComponentFiles(projectId, project, refreshedMap);
  repairs.push(...compRepair.repairs.map((r) => r.message));

  await regenerateOrchestrationFromProject(projectId, project);

  const afterRepair = await loadProjectFiles(projectId);
  const dslCheck = enforceDslOnFiles(filesToContentMap(afterRepair));
  if (!dslCheck.valid) {
    const dslRepairs = await repairDslFromRenderer(projectId, project, afterRepair);
    repairs.push(...dslRepairs);
    await regenerateOrchestrationFromProject(projectId, project);
  }

  return repairs;
}

async function runDryRunCompile(
  projectId: string,
  mergedTex: string,
  skipPdf: boolean
): Promise<{ success: boolean; issues: LuValidationIssue[] }> {
  const issues: LuValidationIssue[] = [];
  const files = await loadProjectFiles(projectId);
  const project = getProjectJsonFromFiles(files);
  const projectContext = project ? { project, files } : undefined;
  const prepared = prepareLatexForCompilation(mergedTex, projectId, projectContext);
  if (!prepared.validation.valid) {
    for (const v of prepared.validation.issues) {
      issues.push({
        severity: "error",
        code: "UNDEFINED_MACRO",
        message: v.message,
        line: v.line ?? undefined,
      });
    }
    return { success: false, issues };
  }

  if (skipPdf) {
    return { success: true, issues: [] };
  }

  const result = await compileLatexLocally(projectId, mergedTex, {
    copyReferencedImages: true,
    enableBibtex: false,
    compilerFallback: true,
    maxPasses: 1,
    preserveProvidedMainTex: true,
    timeoutMs: Number(process.env.LATEX_DRY_RUN_TIMEOUT_MS || 60000),
  });

  if (!result.success) {
    for (const e of result.errors) {
      issues.push({
        severity: "error",
        code: e.type || "DRY_RUN_COMPILE_FAILED",
        message: e.message,
        line: e.line ?? undefined,
        suggestedFix: e.suggestedFix,
      });
    }
    return { success: false, issues };
  }

  return { success: true, issues: [] };
}

/**
 * Prepare an LU v2 project for compilation. Runs validation, auto-repair, and dry-run.
 * Returns ready=true only when all blocking checks pass.
 */
export async function prepareLuBuild(options: LuBuildOptions): Promise<LuBuildResult> {
  const mode = options.mode ?? "repair";
  const maxRetries = options.maxRetries ?? MAX_RETRIES_DEFAULT;
  const forPdf = options.forPdf ?? true;
  const stages: LuBuildStageResult[] = [];
  const allIssues: LuValidationIssue[] = [];
  const allRepairs: string[] = [];
  let retryCount = 0;
  let manifest: LuCourseManifest | undefined;
  let mergedTex: string | undefined;
  let mergedPdfTex: string | undefined;
  let dryRunSuccess = false;

  const sLoad = Date.now();
  await ensureLuProjectV2(options.projectId);
  let files = await loadProjectFiles(options.projectId);
  if (!isLuV2Project(files)) {
    stages.push(stageResult("load", sLoad, true));
    return {
      ready: true,
      stages,
      issues: [],
      repairs: [],
      retryCount: 0,
      dryRunSuccess: true,
    };
  }

  let project = getProjectJsonFromFiles(files);
  if (!project) {
    const issues: LuValidationIssue[] = [
      { severity: "error", code: "MISSING_PROJECT_JSON", message: "project.json is missing or invalid" },
    ];
    stages.push(stageResult("load", sLoad, false, { issues }));
    return { ready: false, stages, issues, repairs: [], retryCount: 0, dryRunSuccess: false };
  }
  stages.push(stageResult("load", sLoad, true));

  let lastErrorSignature = "";
  const preserveInstructorContent =
    options.preserveInstructorContent ?? (mode === "compile" || mode === "validate");

  while (retryCount <= maxRetries) {
    const shouldRunRepair =
      mode === "repair" || (!preserveInstructorContent && mode === "compile" && retryCount > 0);

    if (shouldRunRepair) {
      const sRepair = Date.now();
      const repairs = await runRepairPass(options.projectId, project, files);
      allRepairs.push(...repairs);
      stages.push(
        stageResult("repair_orchestration", sRepair, true, {
          repairs: repairs.length ? repairs : undefined,
        })
      );

      files = await loadProjectFiles(options.projectId);
      project = getProjectJsonFromFiles(files)!;
    }

    const sManifest = Date.now();
    manifest = buildCourseManifest(options.projectId, project, files);
    await persistManifest(options.projectId, manifest);
    stages.push(stageResult("build_manifest", sManifest, true));

    const sGraph = Date.now();
    const graph = buildDependencyGraph(files);
    const graphIssueCount = graph.missingTargets.length + graph.cycles.length;
    stages.push(
      stageResult("dependency_graph", sGraph, graphIssueCount === 0, {
        issues: graphIssueCount ? dependencyIssuesToValidation(graph) : undefined,
      })
    );

    const contentMap = filesToContentMap(files);
    const sValidate = Date.now();
    const validation = await Promise.race([
      Promise.resolve(collectValidationIssues(project, files, contentMap, forPdf)),
      new Promise<ReturnType<typeof collectValidationIssues>>((_, reject) =>
        setTimeout(() => reject(new Error("Validation timeout")), VALIDATION_TIMEOUT_MS)
      ),
    ]).catch((err) => ({
      issues: [
        {
          severity: "error" as const,
          code: "VALIDATION_TIMEOUT",
          message: err instanceof Error ? err.message : "Validation timed out",
        },
      ],
      mergedTex: undefined,
      mergedPdfTex: undefined,
      graphIssues: [],
    }));
    mergedTex = validation.mergedTex;
    mergedPdfTex = validation.mergedPdfTex;
    allIssues.length = 0;
    allIssues.push(...validation.issues);

    const errorSignature = validation.issues
      .filter((i): i is LuValidationIssue => i.severity === "error")
      .map((i) => `${i.code}:${i.file ?? ""}`)
      .sort()
      .join("|");

    stages.push(
      stageResult("structure_validation", sValidate, !hasBlockingIssues(validation.issues), {
        issues: validation.issues.filter((i) => i.severity === "error"),
      })
    );

    if (hasBlockingIssues(validation.issues)) {
      if (errorSignature === lastErrorSignature) {
        break;
      }
      lastErrorSignature = errorSignature;
      if (mode === "validate" || retryCount >= maxRetries) {
        break;
      }
      retryCount++;
      continue;
    }

    const sDry = Date.now();
    if (mergedTex && (mode === "compile" || mode === "repair")) {
      const dry = await runDryRunCompile(
        options.projectId,
        mergedPdfTex ?? mergedTex,
        options.skipDryRunPdf ?? false
      );
      dryRunSuccess = dry.success;
      if (!dry.success) {
        allIssues.push(...dry.issues);
        stages.push(stageResult("dry_run_compile", sDry, false, { issues: dry.issues }));
        if (retryCount >= maxRetries) break;
        retryCount++;
        continue;
      }
      stages.push(stageResult("dry_run_compile", sDry, true));
    } else {
      dryRunSuccess = true;
      stages.push(stageResult("dry_run_compile", sDry, true));
    }

    stages.push(stageResult("ready", Date.now(), true));
    return {
      ready: true,
      manifest,
      mergedTex,
      stages,
      issues: allIssues.filter((i) => i.severity === "warning"),
      repairs: allRepairs,
      retryCount,
      dryRunSuccess,
    };
  }

  return {
    ready: false,
    manifest,
    mergedTex,
    stages,
    issues: allIssues,
    repairs: allRepairs,
    retryCount,
    dryRunSuccess,
  };
}

/** Quick validation check without repair — for UI health gates. */
export async function validateLuBuildReadiness(projectId: string): Promise<LuBuildResult> {
  return prepareLuBuild({ projectId, mode: "validate", skipDryRunPdf: true });
}
