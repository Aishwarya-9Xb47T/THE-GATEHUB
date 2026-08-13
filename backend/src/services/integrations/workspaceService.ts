import { prisma } from "../../utils/prisma.js";
import { syncJsonToDrive } from "./googleDriveService.js";

export interface WorkspaceContext {
  userId: string;
  learningUniverseId: string;
  publishVersionId: string;
  lessonId: string;
  stepId: string;
  workspaceKind: string;
}

function snapshotWhere(ctx: WorkspaceContext) {
  return {
    userId_learningUniverseId_publishVersionId_lessonId_stepId: {
      userId: ctx.userId,
      learningUniverseId: ctx.learningUniverseId,
      publishVersionId: ctx.publishVersionId,
      lessonId: ctx.lessonId,
      stepId: ctx.stepId,
    },
  };
}

export async function getWorkspaceSnapshot(ctx: WorkspaceContext) {
  return prisma.studentWorkspaceSnapshot.findUnique({
    where: snapshotWhere(ctx),
    include: {
      versions: { orderBy: { version: "desc" }, take: 20 },
    },
  });
}

export async function saveWorkspaceSnapshot(
  ctx: WorkspaceContext,
  payload: Record<string, unknown>,
  options?: { syncDrive?: boolean; label?: string }
) {
  const existing = await getWorkspaceSnapshot(ctx);
  const nextVersion = (existing?.version ?? 0) + 1;

  let driveFileId = existing?.driveFileId ?? null;
  if (options?.syncDrive) {
    const driveName = `gatehub-${ctx.workspaceKind}-${ctx.stepId}`;
    const synced = await syncJsonToDrive(ctx.userId, driveName, payload, driveFileId);
    if (synced) driveFileId = synced.fileId;
  }

  const snapshot = await prisma.studentWorkspaceSnapshot.upsert({
    where: snapshotWhere(ctx),
    create: {
      userId: ctx.userId,
      learningUniverseId: ctx.learningUniverseId,
      publishVersionId: ctx.publishVersionId,
      lessonId: ctx.lessonId,
      stepId: ctx.stepId,
      workspaceKind: ctx.workspaceKind,
      payload,
      driveFileId,
      version: nextVersion,
    },
    update: {
      payload,
      driveFileId,
      workspaceKind: ctx.workspaceKind,
      version: nextVersion,
    },
    include: { versions: { orderBy: { version: "desc" }, take: 20 } },
  });

  await prisma.studentWorkspaceVersion.create({
    data: {
      snapshotId: snapshot.id,
      version: nextVersion,
      payload,
      driveFileId,
      label: options?.label ?? `Auto-save v${nextVersion}`,
    },
  });

  return snapshot;
}

export async function restoreWorkspaceVersion(ctx: WorkspaceContext, version: number) {
  const snapshot = await getWorkspaceSnapshot(ctx);
  if (!snapshot) throw new Error("Workspace not found");
  const target = snapshot.versions.find((v) => v.version === version);
  if (!target) throw new Error("Version not found");

  return saveWorkspaceSnapshot(ctx, target.payload as Record<string, unknown>, {
    label: `Restored v${version}`,
  });
}
