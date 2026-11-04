import crypto from "crypto";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { signToken, sanitizeUser } from "./authService.js";
import { touchSession, createUserSession } from "./sessionService.js";
import { logSecurityEvent, getReqMeta } from "./securityAuditService.js";

export const REFRESH_COOKIE_NAME = "gatehub_refresh_token";
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function getRefreshTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw.trim()).digest("hex");
}

export async function issueRefreshToken(opts: {
  userId: string;
  sessionId: string;
}): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await prisma.authToken.create({
    data: {
      userId: opts.userId,
      type: "refresh_token",
      tokenHash,
      payload: { sessionId: opts.sessionId },
      expiresAt,
    },
  });

  return { rawToken, expiresAt };
}

export async function rotateRefreshToken(rawToken: string, req?: any) {
  if (!rawToken || typeof rawToken !== "string") {
    throw new AppError(401, "No refresh token provided");
  }

  const tokenHash = hashToken(rawToken);
  const row = await prisma.authToken.findUnique({
    where: { tokenHash },
  });

  // Reuse Detection: If an already-used refresh token is presented, compromise is suspected.
  if (row && row.usedAt) {
    console.warn("[Auth Security] Refresh token reuse detected for user", row.userId);
    // Invalidate all active sessions and refresh tokens for this user immediately
    await prisma.userSession.updateMany({
      where: { userId: row.userId, revoked: false },
      data: { revoked: true },
    });
    await prisma.authToken.updateMany({
      where: { userId: row.userId, type: "refresh_token", usedAt: null },
      data: { usedAt: new Date() },
    });

    await logSecurityEvent({
      action: "REFRESH_TOKEN_REUSE_DETECTED",
      userId: row.userId,
      ...getReqMeta(req),
    });

    throw new AppError(401, "Suspicious session activity detected. Please sign in again.");
  }

  if (!row || row.type !== "refresh_token" || row.expiresAt.getTime() < Date.now()) {
    throw new AppError(401, "Session expired. Please sign in again.");
  }

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      avatar: true,
      suspended: true,
      deletedAt: true,
      tokenVersion: true,
      emailVerified: true,
      instructorApprovalStatus: true,
    },
  });

  if (!user || user.suspended || user.deletedAt) {
    throw new AppError(401, "Account inactive or suspended");
  }

  let sessionId = (row.payload as any)?.sessionId as string | undefined;
  if (sessionId) {
    const session = await prisma.userSession.findFirst({
      where: { id: sessionId, userId: user.id, revoked: false },
    });
    if (!session) {
      await prisma.authToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      throw new AppError(401, "Session revoked. Please sign in again.");
    }
    await touchSession(sessionId, user.id);
  } else {
    const session = await createUserSession(user.id, user.tokenVersion, req);
    sessionId = session.id;
  }

  // Invalidate the current consumed refresh token
  await prisma.authToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  // Issue rotated refresh token
  const { rawToken: newRefreshToken } = await issueRefreshToken({
    userId: user.id,
    sessionId,
  });

  // Issue short-lived access token (15m)
  const accessToken = await signToken({ ...user, sessionId });

  await logSecurityEvent({
    action: "TOKEN_ROTATION_SUCCESS",
    userId: user.id,
    email: user.email,
    ...getReqMeta(req),
  });

  return {
    user: sanitizeUser(user),
    accessToken,
    newRefreshToken,
    sessionId,
  };
}

export async function revokeRefreshToken(rawToken: string) {
  if (!rawToken || typeof rawToken !== "string") return;
  try {
    const tokenHash = hashToken(rawToken);
    const row = await prisma.authToken.findUnique({ where: { tokenHash } });
    if (row) {
      await prisma.authToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      const sessionId = (row.payload as any)?.sessionId;
      if (sessionId) {
        await prisma.userSession.updateMany({
          where: { id: sessionId, userId: row.userId },
          data: { revoked: true },
        });
      }
    }
  } catch (err) {
    console.warn("[Auth] revokeRefreshToken error (non-fatal):", err);
  }
}

