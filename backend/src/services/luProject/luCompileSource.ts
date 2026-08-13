/**
 * Single entry for LU v2 compile — always merge includes before pdflatex.
 * Lesson .tex files use paths like \\input{lesson-01/overview}; those only resolve
 * during include merge, not when pdflatex reads main.tex directly.
 */
import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import { parseLearningUniverseLatex } from "../../controllers/learning-universe-parser.js";
import {
  isLuV2Project,
  loadProjectFiles,
  getProjectJsonFromFiles,
  normalizeProjectPath,
  type ProjectFileRecord,
} from "./luProjectFiles.js";
import type { LuProjectJson } from "./luProjectSchema.js";
import { prepareLuBuild } from "./luBuildEngine.js";
import type { LuValidationIssue } from "./luProjectValidator.js";
import { resolveProjectIncludesWithFallback } from "./luIncludeResolver.js";
import { stripAuthoringMarkers } from "./luTexMarkers.js";
import {
  applyCompiledPackageToParsed,
  compileAllLessonTexFiles,
  hasBlockingCompileErrors,
} from "./luLessonCompiler.js";
import { validateProjectTexMacros } from "./luTexMacroValidator.js";
import { LU_COMPILED_PACKAGE_PATH } from "./luCompiledPackageSchema.js";
import { injectAllIncludeGraphicsForPublish } from "./luIncludeGraphicsInjector.js";
import { buildLearningCommandStubs } from "../latexLearningCommands.js";
import { stripAuthorLearningCommandDefinitions } from "../learningCommandRegistry.js";
import { prisma } from "../../utils/prisma.js";

export interface LuCompileSource {
  mergedTex: string;
  isV2: true;
  buildRepairs?: string[];
}

/** Canonical LU v2 snapshot — shared by editor compile and publish. */
export interface LuContentSnapshot {
  mergedForPdf: string;
  mergedDsl: string;
  /** Stripped merged source used for parse + publish DSL storage. */
  parseSource: string;
  parsed: ParsedLearningUniverse;
  files: ProjectFileRecord[];
  project: LuProjectJson;
  compiledPackage: import("./luCompiledPackageSchema.js").LuCompiledPackage;
}

function applyFileOverlay(
  files: ProjectFileRecord[],
  overlay?: Map<string, string>
): ProjectFileRecord[] {
  if (!overlay?.size) return files;
  return files.map((f) => {
    if (f.isFolder) return f;
    const override = overlay.get(normalizeProjectPath(f.path));
    return override != null ? { ...f, content: override } : f;
  });
}

/**
 * Resolve one LU v2 content snapshot: merge includes, parse DSL, inject images once.
 * Editor compile and publish must both use this so student view matches compiled PDF.
 */
export async function resolveLuV2ContentSnapshot(
  projectId: string,
  options: {
    runBuild?: boolean;
    fileOverlay?: Map<string, string>;
  } = {}
): Promise<LuContentSnapshot | null> {
  const initialFiles = await loadProjectFiles(projectId);
  if (!isLuV2Project(initialFiles)) return null;

  if (options.runBuild !== false) {
    const build = await prepareLuBuild({
      projectId,
      mode: "compile",
      forPdf: true,
      skipDryRunPdf: true,
      preserveInstructorContent: true,
    });
    if (!build.ready) {
      throw new LuBuildNotReadyError(build.issues, build.repairs);
    }
  }

  const files = applyFileOverlay(await loadProjectFiles(projectId), options.fileOverlay);
  const project = getProjectJsonFromFiles(files);
  if (!project) {
    throw new Error("project.json not found for LU v2 snapshot");
  }

  const resolved = resolveProjectIncludesWithFallback(files, { forPdf: true });
  const mergedForPdf = resolved.mergedForPdf?.trim() || "";
  const mergedDsl = resolved.mergedDsl?.trim() || "";
  if (!mergedForPdf) {
    throw new Error("LU v2 include merge produced empty document");
  }

  const parseSource = stripAuthoringMarkers(mergedForPdf);
  const parsed = parseLearningUniverseLatex(parseSource);
  if (!parsed) {
    throw new Error("Could not parse Learning Universe structure from merged project");
  }

  const macroReport = validateProjectTexMacros(files);
  if (!macroReport.valid) {
    throw new LuBuildNotReadyError(macroReport.issues, []);
  }

  const { package: compiledPackage, issues: compileIssues } = compileAllLessonTexFiles(
    projectId,
    files,
    project
  );

  if (hasBlockingCompileErrors(compileIssues)) {
    throw new LuBuildNotReadyError(
      compileIssues.map((i) => ({
        severity: i.severity,
        code: i.code,
        message: i.message,
        line: i.line,
        file: i.file,
      })),
      []
    );
  }

  applyCompiledPackageToParsed(parsed, project, compiledPackage);
  injectAllIncludeGraphicsForPublish(parsed, project, files);

  await persistCompiledPackage(projectId, compiledPackage);

  return {
    mergedForPdf,
    mergedDsl,
    parseSource,
    parsed,
    files,
    project,
    compiledPackage,
  };
}

async function persistCompiledPackage(
  projectId: string,
  compiledPackage: import("./luCompiledPackageSchema.js").LuCompiledPackage
): Promise<void> {
  const content = JSON.stringify(compiledPackage, null, 2);
  const existing = await prisma.latexFile.findFirst({
    where: { projectId, path: LU_COMPILED_PACKAGE_PATH },
  });
  if (existing) {
    await prisma.latexFile.update({ where: { id: existing.id }, data: { content } });
  } else {
    await prisma.latexFile.create({
      data: {
        projectId,
        path: LU_COMPILED_PACKAGE_PATH,
        name: "course.compiled.json",
        isFolder: false,
        content,
      },
    });
  }
}

/**
 * Build a small LaTeX document for editor PDF preview of a single lesson component file.
 * Avoids compiling the entire merged course (12 lessons) on every edit.
 */
export function buildComponentPreviewDocument(
  activeFilePath: string,
  files: ProjectFileRecord[],
  projectId?: string
): string | null {
  const normalized = normalizeProjectPath(activeFilePath);
  if (!normalized || normalized === "/main.tex" || normalized.endsWith("/main.tex")) {
    return null;
  }
  if (!/\/lesson-\d+\//i.test(normalized)) return null;

  const file = files.find((f) => normalizeProjectPath(f.path) === normalized);
  const rawBody = file?.content?.trim();
  if (!rawBody) return null;

  const stubs = buildLearningCommandStubs(projectId);
  const body = stripAuthorLearningCommandDefinitions(rawBody);

  return `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{amsmath,amssymb}
${stubs}
\\begin{document}
\\section*{${file?.name?.replace(/\.tex$/i, "") ?? "Preview"}}
${body}
\\end{document}`;
}

export class LuBuildNotReadyError extends Error {
  readonly issues: LuValidationIssue[];
  readonly repairs: string[];

  constructor(issues: LuValidationIssue[], repairs: string[] = []) {
    const primary = issues.find((i) => i.severity === "error");
    super(primary?.message ?? "Project failed pre-compilation validation");
    this.name = "LuBuildNotReadyError";
    this.issues = issues;
    this.repairs = repairs;
  }
}

/** Merge all project .tex via unified build engine. Returns null for legacy single-file projects. */
export async function resolveLuV2CompileSource(
  projectId: string,
  options: { forPdf?: boolean; skipBuild?: boolean; fileOverlay?: Map<string, string> } = {}
): Promise<LuCompileSource | null> {
  const snapshot = await resolveLuV2ContentSnapshot(projectId, {
    runBuild: !options.skipBuild,
    fileOverlay: options.fileOverlay,
  }).catch((err: unknown) => {
    if (err instanceof LuBuildNotReadyError) throw err;
    return null;
  });
  if (!snapshot) return null;
  return {
    mergedTex: snapshot.mergedForPdf,
    isV2: true,
  };
}
