import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { prisma } from "../utils/prisma.js";
import {
  ensureLuProjectV2,
  regenerateMainTexFromProjectJson,
  loadProjectFiles,
  isLuV2Project,
  resolveProjectIncludes,
} from "../services/luProject/index.js";
import { getLuAuthoringState } from "../services/luProject/luAuthoringState.js";
import { prepareLuBuild, validateLuBuildReadiness } from "../services/luProject/luBuildEngine.js";
import {
  commitAuthoringTransaction,
  undoAuthoringTransaction,
  redoAuthoringTransaction,
} from "../services/luProject/luTransactionEngine.js";
import {
  generateLuAuthoringGuide,
  listLuAuthoringGuideFiles,
  type LuAuthoringGuideScope,
} from "../services/luProject/luAuthoringGuideService.js";
import {
  planLuAgent,
  executeLuAgentPlan,
  runAgentCompileAndRepair,
  rollbackLuAgent,
  type LuAgentPlanRequest,
} from "../services/luProject/luAuthoringAgentService.js";

async function assertProjectAccess(projectId: string, userId: string) {
  const project = await prisma.latexProject.findUnique({
    where: { id: projectId },
    include: { collaborators: true },
  });
  if (!project) throw new AppError(404, "Project not found");
  const allowed =
    project.ownerId === userId ||
    project.collaborators.some((c) => c.userId === userId);
  if (!allowed) throw new AppError(403, "Not authorized");
  return project;
}

/** Ensure LU project is v2 (auto-migrate legacy single-file projects). */
export async function ensureLuProject(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const result = await ensureLuProjectV2(projectId);
  res.json({ success: true, data: result });
}

/** Regenerate main.tex from project.json */
export async function regenerateLuMainTex(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const mainTex = await regenerateMainTexFromProjectJson(projectId);
  res.json({ success: true, data: { mainTex } });
}

/** Preview merged DSL after include resolution */
export async function resolveLuProject(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const files = await loadProjectFiles(projectId);
  const resolved = resolveProjectIncludes(files);
  res.json({
    success: true,
    data: {
      mergedDsl: resolved.mergedDsl,
      isV2Project: resolved.isV2Project,
      includedFiles: resolved.includedFiles,
    },
  });
}

/** Block manual main.tex edits on v2 projects — enforced in updateFileContent too */
export async function getLuProjectMeta(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const files = await loadProjectFiles(projectId);
  res.json({
    success: true,
    data: {
      isV2: isLuV2Project(files),
      mainTexReadOnly: isLuV2Project(files),
    },
  });
}

/** Full authoring state: explorer tree, health, progress */
export async function getLuAuthoringStateHandler(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const state = await getLuAuthoringState(projectId);
  res.json({ success: true, data: state });
}

/** Structure mutations — transactional commit with snapshot undo support */
export async function mutateLuStructure(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const result = await commitAuthoringTransaction(projectId, req.body);
  const state = await getLuAuthoringState(projectId);
  res.json({
    success: true,
    data: {
      project: result.project,
      state,
      createdFilePath: result.createdFilePath,
      createdComponentId: result.createdComponentId,
      transactionId: result.transactionId,
      canUndo: result.canUndo,
      canRedo: result.canRedo,
    },
  });
}

export async function undoLuTransaction(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  await undoAuthoringTransaction(projectId);
  const state = await getLuAuthoringState(projectId);
  res.json({ success: true, data: { state } });
}

export async function redoLuTransaction(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  await redoAuthoringTransaction(projectId);
  const state = await getLuAuthoringState(projectId);
  res.json({ success: true, data: { state } });
}

/** Pre-compilation validation — no pdflatex, returns manifest + dependency issues */
export async function validateLuBuild(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const result = await validateLuBuildReadiness(projectId);
  res.json({
    success: true,
    data: {
      ready: result.ready,
      manifest: result.manifest,
      issues: result.issues,
      stages: result.stages,
      retryCount: result.retryCount,
    },
  });
}

/** AI LaTeX authoring guide — generate per-file LaTeX from instructor prompt */
export async function generateLuAuthoringGuideHandler(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  const scope = ([
    "current-file",
    "current-lesson",
    "current-module",
    "current-track",
    "project-incomplete",
    "entire-project",
    "selected",
  ].includes(req.body?.scope)
    ? req.body.scope
    : "current-lesson") as LuAuthoringGuideScope;
  const activeFilePath =
    typeof req.body?.activeFilePath === "string" ? req.body.activeFilePath : undefined;
  const targetPaths = Array.isArray(req.body?.targetPaths)
    ? req.body.targetPaths.filter((p: unknown) => typeof p === "string")
    : undefined;
  const kinds = Array.isArray(req.body?.kinds)
    ? req.body.kinds.filter((k: unknown) => typeof k === "string")
    : undefined;

  const result = await generateLuAuthoringGuide(projectId, {
    prompt,
    scope,
    activeFilePath,
    targetPaths,
    kinds,
  });
  res.json({ success: true, data: result });
}

/** List all files available for AI guide selection */
export async function listLuAuthoringGuideFilesHandler(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const files = await listLuAuthoringGuideFiles(projectId);
  res.json({ success: true, data: { files } });
}

/** Full build preparation — auto-repair + dry-run before compile */
export async function prepareLuBuildHandler(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const forPdf = req.body?.forPdf !== false;
  const result = await prepareLuBuild({
    projectId,
    mode: "repair",
    forPdf,
    skipDryRunPdf: true,
  });
  res.json({
    success: result.ready,
    data: result,
  });
}

/** Autonomous AI Agent — Stage 1: Plan course structure and multi-file changes */
export async function planLuAgentHandler(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  const scope = req.body?.scope;
  const activeFilePath =
    typeof req.body?.activeFilePath === "string" ? req.body.activeFilePath : undefined;
  const targetPaths = Array.isArray(req.body?.targetPaths)
    ? req.body.targetPaths.filter((p: unknown) => typeof p === "string")
    : undefined;
  const kinds = Array.isArray(req.body?.kinds)
    ? req.body.kinds.filter((k: unknown) => typeof k === "string")
    : undefined;

  const plan = await planLuAgent(projectId, {
    prompt,
    scope,
    activeFilePath,
    targetPaths,
    kinds,
  });

  res.json({ success: true, data: plan });
}

/** Autonomous AI Agent — Stage 2 & 3: Safely execute transactional plan */
export async function executeLuAgentPlanHandler(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);

  const plan = req.body?.plan;
  if (!plan || !Array.isArray(plan.fileOperations)) {
    throw new AppError(400, "Valid plan object required");
  }

  const result = await executeLuAgentPlan(projectId, plan, {
    rollbackOnFailure: req.body?.rollbackOnFailure ?? true,
  });

  res.json({ success: true, data: result });
}

/** Autonomous AI Agent — Stage 2: Real compilation + autonomous repair loop */
export async function compileAndRepairLuAgentHandler(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);

  const maxRetries = typeof req.body?.maxRetries === "number" ? req.body.maxRetries : 3;
  const snapshotId = typeof req.body?.snapshotId === "string" ? req.body.snapshotId : undefined;

  const result = await runAgentCompileAndRepair(projectId, {
    maxRetries,
    snapshotId,
  });

  res.json({ success: result.success, data: result });
}

/** Autonomous AI Agent — Rollback to pre-agent snapshot */
export async function rollbackLuAgentHandler(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);

  const snapshotId = typeof req.body?.snapshotId === "string" ? req.body.snapshotId : undefined;
  const result = await rollbackLuAgent(projectId, snapshotId);

  res.json({ success: true, data: result });
}
