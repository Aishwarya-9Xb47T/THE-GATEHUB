import { prisma } from "../utils/prisma.js";

export const AUDIT_ACTIONS = {
  ADMIN_LOGIN: "ADMIN_LOGIN",
  ADMIN_LOGOUT: "ADMIN_LOGOUT",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_UNSUSPENDED: "USER_UNSUSPENDED",
  USER_DELETED: "USER_DELETED",
  USER_RESTORED: "USER_RESTORED",
  ADMIN_CREATED: "ADMIN_CREATED",
  ADMIN_REMOVED: "ADMIN_REMOVED",
  ADMIN_PROMOTED: "ADMIN_PROMOTED",
  ADMIN_DEMOTED: "ADMIN_DEMOTED",
  ADMIN_DISABLED: "ADMIN_DISABLED",
  ADMIN_ENABLED: "ADMIN_ENABLED",
  INSTRUCTOR_PROMOTED: "INSTRUCTOR_PROMOTED",
  INSTRUCTOR_DEMOTED: "INSTRUCTOR_DEMOTED",
  COURSE_DELETED: "COURSE_DELETED",
  LU_DELETED: "LU_DELETED",
  PAYMENT_ACTION: "PAYMENT_ACTION",
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

interface LogAuditInput {
  adminId: string;
  action: AuditAction | string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAuditEvent(input: LogAuditInput) {
  try {
    return await prisma.adminAuditLog.create({
      data: {
        adminId: input.adminId,
        action: input.action,
        targetId: input.targetId,
        targetType: input.targetType,
        details: input.details ?? undefined,
        ipAddress: input.ipAddress,
      },
    });
  } catch (err) {
    console.error("[AUDIT] Failed to log event:", input.action, err);
    return null;
  }
}

export function getClientIp(req: { headers: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } }): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim();
  return req.ip || req.socket?.remoteAddress;
}
