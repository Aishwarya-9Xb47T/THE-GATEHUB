import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { prisma } from "../utils/prisma.js";
import {
  listProjectVersions,
  getProjectVersion,
  compareProjectVersions,
  restoreProjectVersion,
  getProjectTimeline,
  createProjectSnapshot,
  recordTimelineEvent,
} from "../services/latexVersionService.js";

async function assertProjectAccess(projectId: string, userId: string) {
  const project = await prisma.latexProject.findUnique({
    where: { id: projectId },
    include: { collaborators: true },
  });
  if (!project) throw new AppError(404, "Project not found");
  if (project.ownerId !== userId && !project.collaborators.some((c) => c.userId === userId)) {
    throw new AppError(403, "Not authorized to access this project");
  }
  return project;
}

export async function listVersions(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const versions = await listProjectVersions(projectId);
  res.json({ success: true, data: versions });
}

export async function getVersion(req: AuthRequest, res: Response) {
  const { projectId, versionId } = req.params;
  await assertProjectAccess(projectId, req.user!.id);
  const version = await getProjectVersion(versionId);
  if (version.projectId !== projectId) throw new AppError(404, "Version not found");
  res.json({ success: true, data: version });
}

export async function compareVersions(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  const versionA = req.query.a as string;
  const versionB = req.query.b as string;
  if (!versionA || !versionB) throw new AppError(400, "Query params a and b are required");

  await assertProjectAccess(projectId, req.user!.id);
  const comparison = await compareProjectVersions(versionA, versionB);
  res.json({ success: true, data: comparison });
}

export async function restoreVersion(req: AuthRequest, res: Response) {
  const { projectId, versionId } = req.params;
  await assertProjectAccess(projectId, req.user!.id);
  const result = await restoreProjectVersion(projectId, versionId, req.user!.id);
  res.json({ success: true, data: result });
}

export async function getTimeline(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const timeline = await getProjectTimeline(projectId);
  res.json({ success: true, data: timeline });
}

export async function createManualSnapshot(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);
  const { notes, dslSource } = req.body || {};
  const snapshot = await createProjectSnapshot(projectId, {
    label: "manual",
    publishType: "manual",
    notes: typeof notes === "string" ? notes : undefined,
    authorId: req.user!.id,
    dslSource: typeof dslSource === "string" ? dslSource : undefined,
  });
  recordTimelineEvent(projectId, "snapshot", req.user!.id, {
    versionId: snapshot?.id,
    versionNumber: snapshot?.versionNumber,
  }).catch(() => {});
  res.status(201).json({ success: true, data: snapshot });
}
