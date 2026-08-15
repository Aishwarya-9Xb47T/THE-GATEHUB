import { isAdminRole } from "../utils/roles.js";
import { createHash } from "crypto";
import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { prisma } from "../utils/prisma.js";
import { compileLatexLocally, storeCompiledPdf, storeCompiledPdfFromPath, resolveMainTexForProject, buildPdfLinkContext } from "../services/latexCompileService.js";
import { normalizeLatexTextContent } from "../services/latexContentSanitizer.js";
import { loadProjectFiles, isLuV2Project, normalizeProjectPath } from "../services/luProject/luProjectFiles.js";
import { resolveProjectIncludesWithFallback } from "../services/luProject/luIncludeResolver.js";
import { mapErrorsToSourceFiles } from "../services/luProject/luErrorMapper.js";
import { LU_PROJECT_JSON_PATH } from "../services/luProject/luProjectSchema.js";
import { resolveLuV2ContentSnapshot, LuBuildNotReadyError } from "../services/luProject/luCompileSource.js";
import { hashSnapshotPayload, hashFromProjectFiles } from "../services/luProject/projectSnapshotHash.js";
import { updateProjectSyncState, logSyncOperation, loadProjectSyncState } from "../services/luProject/projectSyncState.js";
import { buildLessonPreviewForFile } from "../services/luProject/luIncludeGraphicsInjector.js";
import { persistMulterFile } from "../middlewares/persistUpload.js";
import { isB2Configured } from "../services/b2StorageService.js";

const MAX_TITLE_LENGTH = 160;

const compileCache = new Map<string, { hash: string; pdfUrl: string; updatedAt: number }>();

const forbiddenLatexRules: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\\(?:immediate\s*)?\\write18\b/i, message: "Shell escape commands are not allowed." },
  { pattern: /\\open(?:in|out)\b/i, message: "File read/write primitives are not allowed." },
  { pattern: /\\(input|include)\s*\{[^}]*\.\.[^}]*\}/i, message: "Parent-path includes are not allowed." },
  { pattern: /\\(usepackage|RequirePackage)\s*\{\s*shellesc\s*\}/i, message: "Package shellesc is not allowed." },
];

function assertTeacher(req: AuthRequest): NonNullable<AuthRequest["user"]> {
  if (!req.user) {
    throw new AppError(401, "Authentication required");
  }
  if (req.user.role !== "instructor" && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Only teachers can access LaTeX notes");
  }
  return req.user;
}

function normalizeTitle(rawTitle: string): string {
  const title = rawTitle.trim();
  if (!title) throw new AppError(400, "Document title is required");
  if (title.length > MAX_TITLE_LENGTH) {
    throw new AppError(400, `Document title cannot exceed ${MAX_TITLE_LENGTH} characters`);
  }
  return title;
}

function validateLatexContent(content: string): string {
  if (typeof content !== "string") {
    throw new AppError(400, "LaTeX content must be a string");
  }

  if (!content.trim()) {
    throw new AppError(400, "LaTeX content is required");
  }

  for (const rule of forbiddenLatexRules) {
    if (rule.pattern.test(content)) {
      throw new AppError(400, rule.message);
    }
  }

  return normalizeLatexTextContent(content);
}

function escapeForLatexTitle(input: string): string {
  return input.replace(/[\\{}$&#%_^~]/g, (match) => {
    const map: Record<string, string> = {
      "\\": "\\textbackslash{}",
      "{": "\\{",
      "}": "\\}",
      "$": "\\$",
      "&": "\\&",
      "#": "\\#",
      "%": "\\%",
      "_": "\\_",
      "^": "\\^{}",
      "~": "\\~{}",
    };
    return map[match] ?? match;
  });
}

// REMOVED: ensureLatexDocument function - DO NOT modify LaTeX content

function buildDefaultTemplate(title: string): string {
  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{amsfonts}
\\usepackage{amssymb}
\\usepackage{graphicx}
\\usepackage[margin=1in]{geometry}
\\title{${escapeForLatexTitle(title)}}
\\author{Teacher}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Add your notes here.

\\end{document}`;
}

function hashDocumentContent(title: string, content: string): string {
  return createHash("sha256").update(`${title}\n${content}`).digest("hex");
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function hashCompileSnapshot(
  projectId: string,
  mainFileName: string,
  code: string,
  workspaceFiles?: Array<{ name: string; content: string }>
): string {
  return hashSnapshotPayload({
    projectId,
    mainFileName,
    code,
    files: workspaceFiles ?? [],
  });
}

export async function createLatexDocument(req: AuthRequest, res: Response) {
  const user = assertTeacher(req);
  const rawTitle = typeof req.body?.title === "string" ? req.body.title : "Untitled Notes";
  const title = normalizeTitle(rawTitle);

  // Use EXACT content provided, no modifications
  const rawContent = typeof req.body?.content === "string" ? req.body.content : buildDefaultTemplate(title);
  const content = validateLatexContent(rawContent);

  const document = await prisma.latexDocument.create({
    data: {
      title,
      content,
      userId: user.id,
    },
  });

  res.status(201).json({ success: true, document });
}

export async function getLatexDocument(req: AuthRequest, res: Response) {
  const user = assertTeacher(req);
  const { id } = req.params;

  const document = await prisma.latexDocument.findFirst({
    where: { id, userId: user.id },
  });

  if (!document) {
    throw new AppError(404, "LaTeX document not found");
  }

  res.json({ success: true, document });
}

export async function updateLatexDocument(req: AuthRequest, res: Response) {
  const user = assertTeacher(req);
  const { id } = req.params;

  const existing = await prisma.latexDocument.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    throw new AppError(404, "LaTeX document not found");
  }

  const data: { title?: string; content?: string } = {};

  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "title")) {
    if (typeof req.body.title !== "string") {
      throw new AppError(400, "title must be a string");
    }
    data.title = normalizeTitle(req.body.title);
  }

  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "content")) {
    data.content = validateLatexContent(req.body.content);
  }

  if (!Object.keys(data).length) {
    throw new AppError(400, "At least one field (title/content) is required");
  }

  const document = await prisma.latexDocument.update({
    where: { id: existing.id },
    data,
  });

  compileCache.delete(existing.id);

  res.json({ success: true, document });
}

export async function uploadLatexImage(req: AuthRequest, res: Response) {
  try {
    assertTeacher(req);

    if (!req.file) {
      throw new AppError(400, "Image file is required");
    }

    console.log("LaTeX image upload:", {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });

    const allowedMimeTypes = new Set([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ]);

    if (!allowedMimeTypes.has(req.file.mimetype)) {
      throw new AppError(400, `Only image uploads are supported. Got: ${req.file.mimetype}`);
    }

    const imageUrl = isB2Configured()
      ? await persistMulterFile(req.file, "latex")
      : `/uploads/latex/${req.file.filename}`;
    const snippet = `\\includegraphics[width=0.7\\linewidth]{${req.file.filename}}`;

    console.log("Image upload successful:", { imageUrl, filename: req.file.filename });

    res.status(201).json({
      success: true,
      image: {
        filename: req.file.filename,
        url: imageUrl,
        latexPath: req.file.filename,
        snippet,
      },
    });
  } catch (error: any) {
    console.error("LaTeX image upload error:", error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, `Image upload failed: ${error.message}`);
  }
}

async function compileTeacherDocument(req: AuthRequest, res: Response, documentId: string) {
  const user = assertTeacher(req);

  const document = await prisma.latexDocument.findFirst({
    where: { id: documentId, userId: user.id },
  });

  if (!document) {
    throw new AppError(404, "LaTeX document not found");
  }

  // CRITICAL: Use EXACT content from editor, NO modifications
  const latexContent = validateLatexContent(document.content);
  console.log("LATEX INPUT:", latexContent);
  
  const hash = hashDocumentContent(document.title, latexContent);
  const forceCompile = toBoolean(req.body?.force);

  const cached = compileCache.get(document.id);
  if (!forceCompile && document.pdfUrl && cached?.hash === hash) {
    return res.json({
      success: true,
      cached: true,
      documentId: document.id,
      pdfUrl: document.pdfUrl,
      errors: [],
    });
  }

  const compiled = await compileLatexLocally(document.id, latexContent, {
    workspaceSubdir: "teacher-documents",
    copyReferencedImages: true,
    enableBibtex: true,
    compilerFallback: true,
    maxPasses: 3
  });

  if (!compiled.success) {
    return res.status(500).json({
      success: false,
      error: "Compilation failed",
      message: compiled.errors.length > 0 ? compiled.errors[0].message : "Unknown LaTeX compilation error",
      logs: compiled.logs,
      errors: compiled.errors,
      documentId: document.id,
      compilationTime: compiled.compilationTime,
      compilerUsed: compiled.compilerUsed,
      passesCompleted: compiled.passesCompleted,
      bibtexRun: compiled.bibtexRun
    });
  }

  const fileName = `${document.id}-${hash.slice(0, 12)}`;
  const storedPdf = await storeCompiledPdf(document.id, fileName, {
    workspaceSubdir: "teacher-documents",
  });

  const updated = await prisma.latexDocument.update({
    where: { id: document.id },
    data: { pdfUrl: storedPdf.publicUrl },
  });

  compileCache.set(document.id, {
    hash,
    pdfUrl: storedPdf.publicUrl,
    updatedAt: Date.now(),
  });

  return res.json({
    success: true,
    cached: false,
    documentId: updated.id,
    pdfUrl: updated.pdfUrl,
    errors: [],
    compilationTime: compiled.compilationTime,
    compilerUsed: compiled.compilerUsed,
    passesCompleted: compiled.passesCompleted,
    bibtexRun: compiled.bibtexRun
  });
}

function buildValidationErrors(issues: import("../services/luProject/luProjectValidator.js").LuValidationIssue[]) {
  return issues.map((issue) => ({
    type: issue.code,
    message: issue.message,
    line: issue.line ?? null,
    file: issue.file ?? null,
    suggestedFix: issue.suggestedFix ?? null,
  }));
}

async function compileLegacyProject(
  code: string,
  projectId: string,
  res: Response,
  workspaceFiles?: Array<{ name: string; content: string }>,
  mainFileName?: string,
  snapshotHash?: string,
  activeFilePath?: string
) {
  let content = "";
  let preserveProvidedMainTex = false;
  let buildRepairs: string[] = [];
  let pdfProjectContext: {
    project: import("../services/luProject/luProjectSchema.js").LuProjectJson;
    files: import("../services/luProject/luProjectFiles.js").ProjectFileRecord[];
    parsed?: import("../controllers/learning-universe-parser.js").ParsedLearningUniverse;
    linkContext?: import("../../../shared/lesson-body/dist/contentEngine.js").PdfLinkContext;
  } | undefined;
  let compileSnapshot: Awaited<ReturnType<typeof resolveLuV2ContentSnapshot>> | null = null;

  const projectFiles = await loadProjectFiles(projectId).catch(() => []);
  const isLuV2 = isLuV2Project(projectFiles);

  if (isLuV2) {
    const overlay = new Map(
      (workspaceFiles ?? []).map((f) => {
        const normalized = normalizeProjectPath(`/${f.name.replace(/\\/g, "/").replace(/^\//, "")}`);
        return [normalized, f.content] as const;
      })
    );
    const snapshot = await resolveLuV2ContentSnapshot(projectId, {
      runBuild: false,
      fileOverlay: overlay.size ? overlay : undefined,
    }).catch((err: unknown) => {
      if (err instanceof LuBuildNotReadyError) throw err;
      return null;
    });
    if (snapshot) {
      compileSnapshot = snapshot;
      const linkContext = await buildPdfLinkContext(projectId);
      pdfProjectContext = { project: snapshot.project, files: snapshot.files, parsed: snapshot.parsed, linkContext };
      // Overleaf-style: always compile the full merged project (all tracks/modules/lessons).
      content = validateLatexContent(snapshot.mergedForPdf);
      preserveProvidedMainTex = true;
      console.log(`[LATEX] LU v2 full-project compile (${content.length} chars, ${snapshot.files.length} files)`);
    }
  }

  if (!content && workspaceFiles?.length) {
    const normalizedMainName = (mainFileName ?? "main.tex").replace(/\\/g, "/").replace(/^\//, "");
    const canonicalMain = workspaceFiles.find((f) => f.name.replace(/\\/g, "/").replace(/^\//, "") === "main.tex");
    const selectedMain =
      canonicalMain ??
      workspaceFiles.find((f) => f.name.replace(/\\/g, "/").replace(/^\//, "") === normalizedMainName) ??
      workspaceFiles[0];
    const main = selectedMain;
    if (main?.content?.trim()) {
      content = validateLatexContent(main.content);
    } else if (code?.trim()) {
      content = validateLatexContent(code);
    }
  }

  if (!content) {
    let lastMergeError = "";
    const snapshot = await resolveLuV2ContentSnapshot(projectId, { runBuild: true }).catch((err: unknown) => {
      if (err instanceof LuBuildNotReadyError) {
        throw err;
      }
      const msg = err instanceof Error ? (err.stack || err.message) : String(err);
      lastMergeError = msg;
      console.error("[LATEX] LU v2 merge failed with error:", msg);
      return null;
    });
    if (snapshot) {
      content = validateLatexContent(snapshot.mergedForPdf);
      preserveProvidedMainTex = true;
      const linkContext = await buildPdfLinkContext(projectId);
      pdfProjectContext = { project: snapshot.project, files: snapshot.files, parsed: snapshot.parsed, linkContext };
      compileSnapshot = snapshot;
      console.log(`[LATEX] LU v2 compile — merged DSL for PDF (${content.length} chars)`);
    } else {
      const projectFiles = await loadProjectFiles(projectId).catch(() => []);
      if (isLuV2Project(projectFiles)) {
        throw new AppError(
          500,
          `Could not merge Learning Universe project files for compilation: ${lastMergeError || "Unknown merge failure"}`
        );
      }
    }
  }


  if (!content) {
    if (code?.trim()) {
      content = validateLatexContent(code);
    } else {
      content = validateLatexContent(await resolveMainTexForProject(projectId));
    }
  }

  console.log("LATEX INPUT length:", content.length);

  const mainName = mainFileName ?? "main.tex";
  const mainInFiles =
    workspaceFiles?.find((f) => f.name.replace(/\\/g, "/") === mainName) ??
    workspaceFiles?.find((f) => f.name.replace(/\\/g, "/").endsWith(`/${mainName}`));
  const codeForHash = mainInFiles?.content ?? code;
  const compiledSnapshotHash =
    workspaceFiles?.length
      ? hashCompileSnapshot(projectId, mainName, codeForHash, workspaceFiles)
      : hashFromProjectFiles(projectId, compileSnapshot?.files ?? (await loadProjectFiles(projectId)));

  if (snapshotHash && snapshotHash !== compiledSnapshotHash) {
    console.warn("[LATEX] Snapshot hash mismatch", {
      expected: snapshotHash,
      actual: compiledSnapshotHash,
      projectId,
      activeFilePath,
    });
    // After autosave flush the client hash should match; if not, proceed with DB snapshot
    // rather than blocking compile (stale client hash must not break the editor).
  }

  const result = await compileLatexLocally(projectId, content, {
    copyReferencedImages: true,
    enableBibtex: true,
    compilerFallback: true,
    maxPasses: 3,
    timeoutMs: Number(process.env.LATEX_COMPILE_TIMEOUT_MS || 300000),
    preserveProvidedMainTex,
    inlineWorkspaceFiles: workspaceFiles,
    mainFileName: mainFileName ?? "main.tex",
    pdfProjectContext,
    compileScope: "full",
  });

  if (!result.success || !result.pdfPath) {
    let errors = result.errors;
    let buildStages: Array<{ name: string; ok: boolean; detail?: string }> = [];
    try {
      const projectFiles = await loadProjectFiles(projectId);
      if (isLuV2Project(projectFiles)) {
        const resolved = resolveProjectIncludesWithFallback(projectFiles);
        errors = mapErrorsToSourceFiles(result.errors, resolved.lineMap);
        buildStages = [
          { name: "Manifest Loaded", ok: true },
          { name: "Dependency Graph Built", ok: true },
          { name: "Components Validated", ok: buildRepairs.length === 0 },
          { name: "Media Validated", ok: true },
          { name: "References Validated", ok: true },
          { name: "Quiz Validated", ok: true },
          { name: "Labs Validated", ok: true },
          { name: "Project Validated", ok: true },
        ];
      }
    } catch {
      // keep original errors
    }
    const primaryError = errors[0];
    const noPages = result.logs?.includes("No pages of output");
    const compileReport = result.compileReport
      ? {
          ...result.compileReport,
          stages: buildStages.length
            ? buildStages
            : (result.compileReport.stages as unknown[]) ?? [],
        }
      : undefined;
    return res.status(500).json({
      success: false,
      error: primaryError?.type || (noPages ? "Empty PDF" : "Compilation failed"),
      message: primaryError?.message || (noPages
          ? "LaTeX compiled but produced no pages. Add lesson content or check track/module files."
          : "Unknown LaTeX compilation error"),
      suggestedFix: primaryError?.suggestedFix,
      logs: result.logs,
      errors: errors.map((e) => ({
        message: e.message,
        line: e.sourceLine ?? e.line,
        file: e.sourceFile ?? e.file ?? null,
        type: e.type,
        category: e.category,
        macro: e.macro ?? null,
        column: e.column ?? null,
        raw: e.raw,
        suggestedFix: e.suggestedFix,
        autoRepairAvailable: e.autoRepairAvailable ?? false,
        autoRepairAction: e.autoRepairAction ?? null,
      })),
      compileReport,
      includeOrder: result.logParse?.includeOrder,
      failedAtFile: result.logParse?.failedAtFile,
      compilationTime: result.compilationTime,
      compilerUsed: result.compilerUsed,
      passesCompleted: result.passesCompleted,
      bibtexRun: result.bibtexRun,
      generatedTex: result.generatedTex,
      compileCommands: result.compileCommands,
      outputDirectory: result.outputDirectory,
      compiledSnapshotHash,
    });
  }

  // Copy the validated PDF immediately — do not re-read workspace later (avoids races)
  const storedPdf = await storeCompiledPdfFromPath(result.pdfPath, `compiled-${projectId}`);

  const lessonPreview =
    compileSnapshot
      ? buildLessonPreviewForFile(
          compileSnapshot.parsed,
          compileSnapshot.project,
          activeFilePath
        )
      : null;

  const syncState = await loadProjectSyncState(projectId).catch(() => null);
  await updateProjectSyncState(projectId, {
    compiledSnapshotHash,
    compiledVersion: syncState?.projectVersion,
    recomputeHash: false,
  }).catch(() => {});
  logSyncOperation("compile", projectId, {
    compiledSnapshotHash,
    compileVersion: syncState?.projectVersion,
    fileOverlayCount: workspaceFiles?.length ?? 0,
  });

  return res.json({
    success: true,
    fileUrl: storedPdf.publicUrl,
    logs: result.logs,
    errors: [],
    repairs: buildRepairs.length ? buildRepairs : undefined,
    compilationTime: result.compilationTime,
    compilerUsed: result.compilerUsed,
    passesCompleted: result.passesCompleted,
    bibtexRun: result.bibtexRun,
    generatedTex: result.generatedTex,
    compileCommands: result.compileCommands,
    outputDirectory: result.outputDirectory,
    compiledSnapshotHash,
    lessonPreview: lessonPreview
      ? {
          lessonTitle: lessonPreview.lessonTitle,
          blocks: lessonPreview.blocks,
          focusComponentId: lessonPreview.focusComponentId,
        }
      : undefined,
  });
}

async function compileLegacyProjectSafe(
  code: string,
  projectId: string,
  res: Response,
  workspaceFiles?: Array<{ name: string; content: string }>,
  mainFileName?: string,
  snapshotHash?: string,
  activeFilePath?: string
) {
  try {
    return await compileLegacyProject(
      code,
      projectId,
      res,
      workspaceFiles,
      mainFileName,
      snapshotHash,
      activeFilePath
    );
  } catch (err) {
    if (err instanceof LuBuildNotReadyError) {
      const errors = buildValidationErrors(err.issues);
      const primary = errors[0];
      return res.status(422).json({
        success: false,
        error: primary?.type || "VALIDATION_FAILED",
        message: primary?.message || err.message,
        validationFailed: true,
        errors,
        repairs: err.repairs,
        suggestedFix: primary?.suggestedFix,
      });
    }
    const message = err instanceof Error ? err.message : "Compilation failed";
    console.error("[LATEX] compileLegacyProjectSafe:", message);
    return res.status(500).json({
      success: false,
      error: "Compilation failed",
      message,
      errors: [{ message, line: null, type: "Compile Engine" }],
    });
  }
}

export async function compileLatex(req: AuthRequest, res: Response) {
  console.log("LATEX COMPILE API HIT");
  
  // Bypass auth for debugging - allow direct compilation
  // assertTeacher(req);

  const documentId = typeof req.body?.documentId === "string" ? req.body.documentId : null;
  if (documentId) {
    // Skip teacher document compilation for now - focus on direct code compilation
    return res.status(400).json({ error: "Document compilation not supported in debug mode" });
  }

  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : "";
  const mainFileName = typeof req.body?.mainFileName === "string" ? req.body.mainFileName : "main.tex";
  const snapshotHash = typeof req.body?.snapshotHash === "string" ? req.body.snapshotHash : undefined;
  const rawFiles = req.body?.files;
  const workspaceFiles = Array.isArray(rawFiles)
    ? rawFiles
        .filter((f: unknown) => f && typeof f === "object")
        .map((f: { name?: string; content?: string }) => ({
          name: String(f.name ?? "untitled.tex"),
          content: String(f.content ?? ""),
        }))
        .filter((f: { name: string; content: string }) => f.name.trim().length > 0)
    : undefined;

  const activeFilePath =
    typeof req.body?.activeFilePath === "string" ? req.body.activeFilePath : undefined;

  if (!projectId) {
    throw new AppError(400, "projectId is required for compilation");
  }

  return compileLegacyProjectSafe(
    code,
    projectId,
    res,
    workspaceFiles,
    mainFileName,
    snapshotHash,
    activeFilePath
  );
}
