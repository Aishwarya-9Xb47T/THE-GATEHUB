import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import {
  buildGoogleAuthUrl,
  disconnectGoogle,
  getGoogleConnectionStatus,
  handleGoogleCallback,
  isGoogleOAuthConfigured,
} from "../services/integrations/googleOAuthService.js";
import { getWorkspaceSnapshot, restoreWorkspaceVersion, saveWorkspaceSnapshot } from "../services/integrations/workspaceService.js";
import { requireLearnerScope } from "../services/learnerScopeService.js";
import { syncIpynbToDrive, colabUrlFromDriveFileId } from "../services/integrations/colabLaunchService.js";
import { buildOverleafLaunchUrl } from "../services/integrations/overleafLaunchService.js";
import { validateColabUrl } from "../services/colabUrlValidator.js";
import { listIntegrationProviders } from "../services/integrations/integrationProviderRegistry.js";
import { registerGoogleProviders } from "../services/integrations/googleIntegrationProvider.js";

registerGoogleProviders();

export async function listProviders(_req: AuthRequest, res: Response) {
  res.json({ success: true, providers: listIntegrationProviders() });
}

export async function googleStatus(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const status = await getGoogleConnectionStatus(req.user.id);
  res.json({ success: true, ...status, configured: isGoogleOAuthConfigured() });
}

export async function googleConnect(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const returnTo = String(req.query.returnTo || process.env.CLIENT_URL || "http://localhost:5173");
  const url = buildGoogleAuthUrl(req.user.id, returnTo);
  res.json({ success: true, url });
}

export async function googleCallback(req: AuthRequest, res: Response) {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

  try {
    const { returnTo } = await handleGoogleCallback(code, state);
    const target = new URL(returnTo.startsWith("http") ? returnTo : `${clientUrl}${returnTo}`);
    target.searchParams.set("google", "connected");
    res.redirect(target.toString());
  } catch (err) {
    const target = new URL(`${clientUrl}/integrations/google/callback`);
    target.searchParams.set("google", "error");
    target.searchParams.set("message", err instanceof Error ? err.message : "OAuth failed");
    res.redirect(target.toString());
  }
}

export async function googleDisconnect(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await disconnectGoogle(req.user.id);
  res.json({ success: true });
}

export async function getWorkspace(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { id: learningUniverseId, lessonId, stepId } = req.params;
  const scope = await requireLearnerScope(req.user.id, learningUniverseId);
  const snapshot = await getWorkspaceSnapshot({
    userId: req.user.id,
    learningUniverseId,
    publishVersionId: scope.publishVersionId,
    lessonId,
    stepId,
    workspaceKind: String(req.query.kind || "workspace"),
  });
  res.json({ success: true, snapshot });
}

export async function saveWorkspace(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { id: learningUniverseId, lessonId, stepId } = req.params;
  const { payload, workspaceKind, syncDrive, label } = req.body as {
    payload?: Record<string, unknown>;
    workspaceKind?: string;
    syncDrive?: boolean;
    label?: string;
  };
  if (!payload || typeof payload !== "object") throw new AppError(400, "payload is required");

  const scope = await requireLearnerScope(req.user.id, learningUniverseId);
  const snapshot = await saveWorkspaceSnapshot(
    {
      userId: req.user.id,
      learningUniverseId,
      publishVersionId: scope.publishVersionId,
      lessonId,
      stepId,
      workspaceKind: workspaceKind || "workspace",
    },
    payload,
    { syncDrive: syncDrive === true, label }
  );
  res.json({ success: true, snapshot });
}

export async function restoreWorkspace(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { id: learningUniverseId, lessonId, stepId } = req.params;
  const version = Number(req.body.version);
  if (!Number.isFinite(version)) throw new AppError(400, "version is required");
  const scope = await requireLearnerScope(req.user.id, learningUniverseId);

  const snapshot = await restoreWorkspaceVersion(
    {
      userId: req.user.id,
      learningUniverseId,
      publishVersionId: scope.publishVersionId,
      lessonId,
      stepId,
      workspaceKind: String(req.body.workspaceKind || "workspace"),
    },
    version
  );
  res.json({ success: true, snapshot });
}

export async function launchColabCompanion(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { id: learningUniverseId, lessonId, stepId } = req.params;
  const {
    cells,
    language,
    title,
    colabUrl: instructorColabUrl,
    driveFileId,
    enableColab,
  } = req.body as {
    cells?: Array<{ type: "code" | "markdown"; source: string }>;
    language?: string;
    title?: string;
    colabUrl?: string;
    driveFileId?: string;
    enableColab?: boolean;
  };

  if (enableColab === false) {
    throw new AppError(403, "Google Colab companion is disabled for this lab");
  }

  const instructor = instructorColabUrl ? validateColabUrl(instructorColabUrl) : null;
  if (instructor?.valid && instructor.normalizedUrl) {
    return res.json({
      success: true,
      url: instructor.normalizedUrl,
      embedSupported: false,
      mode: "instructor-starter",
    });
  }

  if (!Array.isArray(cells) || cells.length === 0) {
    throw new AppError(400, "cells are required to sync notebook to Google Drive");
  }

  const synced = await syncIpynbToDrive(
    req.user.id,
    `gatehub-${title || stepId}`,
    cells,
    language || "python",
    driveFileId || null
  );

  if ("error" in synced) {
    throw new AppError(
      synced.status === 401 || synced.error.includes("not connected") ? 401 : 502,
      synced.error
    );
  }

  const scope = await requireLearnerScope(req.user.id, learningUniverseId);
  const snapshot = await getWorkspaceSnapshot({
    userId: req.user.id,
    learningUniverseId,
    publishVersionId: scope.publishVersionId,
    lessonId,
    stepId,
    workspaceKind: "coding-lab",
  });

  const existingPayload = (snapshot?.payload as Record<string, unknown>) || {};
  await saveWorkspaceSnapshot(
    {
      userId: req.user.id,
      learningUniverseId,
      publishVersionId: scope.publishVersionId,
      lessonId,
      stepId,
      workspaceKind: "coding-lab",
    },
    { ...existingPayload, colabDriveFileId: synced.fileId },
    { label: "Colab sync" }
  );

  res.json({
    success: true,
    url: synced.colabUrl,
    driveFileId: synced.fileId,
    embedSupported: false,
    mode: driveFileId ? "drive-resync" : "drive-create",
  });
}

export async function launchOverleafCompanion(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { enableOverleaf, overleafUrl, title, files } = req.body as {
    enableOverleaf?: boolean;
    overleafUrl?: string;
    title?: string;
    files?: Array<{ name: string; content: string }>;
  };

  if (enableOverleaf === false) {
    throw new AppError(403, "Overleaf companion is disabled for this paper");
  }

  const launch = buildOverleafLaunchUrl({
    title,
    overleafUrl,
    files,
  });

  res.json({
    success: true,
    ...launch,
    hint: "Sign in to Overleaf with Google in the new tab if prompted. Your GateHub session stays open.",
  });
}

export async function getColabCompanionUrl(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { driveFileId } = req.query;
  if (!driveFileId || typeof driveFileId !== "string") {
    throw new AppError(400, "driveFileId is required");
  }
  res.json({
    success: true,
    url: colabUrlFromDriveFileId(driveFileId),
    embedSupported: false,
  });
}
