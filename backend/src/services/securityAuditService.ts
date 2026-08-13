import { prisma } from "../utils/prisma.js";

export const SECURITY_ACTIONS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILURE: "LOGIN_FAILURE",
  LOGOUT: "LOGOUT",
  REGISTER: "REGISTER",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  EMAIL_VERIFICATION_SENT: "EMAIL_VERIFICATION_SENT",
  EMAIL_CHANGE_REQUESTED: "EMAIL_CHANGE_REQUESTED",
  EMAIL_CHANGED: "EMAIL_CHANGED",
  ROLE_CHANGED: "ROLE_CHANGED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
} as const;

export type SecurityAction = (typeof SECURITY_ACTIONS)[keyof typeof SECURITY_ACTIONS];

/** Never pass passwords, hashes, raw tokens, or reset links in meta. */
export async function logSecurityEvent(input: {
  action: SecurityAction | string;
  userId?: string | null;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.securityAuditLog.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        email: input.email ? input.email.trim().toLowerCase() : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ? String(input.userAgent).slice(0, 2000) : null,
        meta: input.meta ?? undefined,
      },
    });
  } catch (err) {
    console.error("[SECURITY_AUDIT] Failed to log:", input.action);
  }
}

export function getReqMeta(req?: {
  headers?: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
}) {
  if (!req) return { ipAddress: undefined as string | undefined, userAgent: undefined as string | undefined };
  const forwarded = req.headers?.["x-forwarded-for"];
  const ip =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : req.ip || req.socket?.remoteAddress;
  const ua = req.headers?.["user-agent"];
  return {
    ipAddress: ip,
    userAgent: typeof ua === "string" ? ua : undefined,
  };
}
