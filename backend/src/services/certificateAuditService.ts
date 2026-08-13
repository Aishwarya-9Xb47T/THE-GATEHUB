import { prisma } from "../utils/prisma.js";

export type CertificateAuditAction =
  | "generated"
  | "downloaded"
  | "printed"
  | "shared"
  | "verified"
  | "revoked"
  | "reissued";

export interface CertificateAuditInput {
  certificateRecordId?: string;
  certificatePublicId: string;
  scope?: "learning_universe" | "course";
  action: CertificateAuditAction;
  userId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export async function logCertificateAudit(input: CertificateAuditInput) {
  return prisma.certificateAuditLog.create({
    data: {
      certificateRecordId: input.certificateRecordId ?? null,
      certificatePublicId: input.certificatePublicId,
      scope: input.scope ?? "learning_universe",
      action: input.action,
      userId: input.userId ?? null,
      ipAddress: input.ipAddress ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

export async function listCertificateAuditLogs(certificatePublicId: string, limit = 50) {
  return prisma.certificateAuditLog.findMany({
    where: { certificatePublicId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
