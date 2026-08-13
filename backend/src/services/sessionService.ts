import { prisma } from "../utils/prisma.js";
import { getClientIp } from "./auditLogService.js";

function parseUserAgent(ua: string | null): { browser: string; device: string } {
  if (!ua) return { browser: "Unknown", device: "Unknown" };
  let browser = "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";

  let device = "Desktop";
  if (/Mobile|Android|iPhone/i.test(ua)) device = "Mobile";
  else if (/Tablet|iPad/i.test(ua)) device = "Tablet";

  return { browser, device };
}

export async function recordLoginHistory(
  userId: string,
  req?: { headers: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } },
  success = true
) {
  const userAgent = typeof req?.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : null;
  await prisma.loginHistory.create({
    data: {
      userId,
      ipAddress: req ? getClientIp(req) : null,
      userAgent,
      success,
    },
  });
}

export async function createUserSession(
  userId: string,
  tokenVersion: number,
  req?: { headers: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } }
) {
  const userAgent = typeof req?.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : null;
  return prisma.userSession.create({
    data: {
      userId,
      tokenVersion,
      ipAddress: req ? getClientIp(req) : null,
      userAgent,
    },
  });
}

export async function getActiveSessions(userId: string, currentSessionId?: string) {
  const sessions = await prisma.userSession.findMany({
    where: { userId, revoked: false },
    orderBy: { lastActive: "desc" },
    take: 20,
  });

  return sessions.map((s) => {
    const { browser, device } = parseUserAgent(s.userAgent);
    return {
      ...s,
      browser,
      device,
      isCurrent: currentSessionId ? s.id === currentSessionId : false,
    };
  });
}

export async function getLoginHistory(userId: string, limit = 20) {
  const rows = await prisma.loginHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((h) => {
    const { browser, device } = parseUserAgent(h.userAgent);
    return { ...h, browser, device };
  });
}

export async function logoutAllDevices(userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  await prisma.userSession.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });
  return user.tokenVersion;
}

export async function revokeSession(sessionId: string, userId: string) {
  await prisma.userSession.updateMany({
    where: { id: sessionId, userId },
    data: { revoked: true },
  });
}

export async function touchSession(sessionId: string, userId: string) {
  await prisma.userSession.updateMany({
    where: { id: sessionId, userId, revoked: false },
    data: { lastActive: new Date() },
  });
}

/** Create session on first authenticated request if user has no active session (legacy tokens) */
export async function ensureSessionForUser(
  userId: string,
  tokenVersion: number,
  req?: { headers: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } }
) {
  const active = await prisma.userSession.count({
    where: { userId, revoked: false, tokenVersion },
  });
  if (active === 0) {
    return createUserSession(userId, tokenVersion, req);
  }
  return null;
}
