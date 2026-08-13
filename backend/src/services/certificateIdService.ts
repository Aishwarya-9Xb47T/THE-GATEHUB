import { prisma } from "../utils/prisma.js";
import { getPlatformSettings } from "./platformSettingsService.js";

export function getFrontendBaseUrl(): string {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

export function buildVerificationUrl(certificateId: string): string {
  return `${getFrontendBaseUrl()}/verify/certificate/${encodeURIComponent(certificateId)}`;
}

/** Globally unique sequential ID: GH-CERT-2026-000001 */
export async function allocateCertificateId(): Promise<string> {
  const settings = await getPlatformSettings();
  const prefix = (settings.certificatePrefix || "GH-CERT").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt++) {
    const certificateId = await prisma.$transaction(async (tx) => {
      const existing = await tx.certificateSequence.findUnique({ where: { year } });
      const nextNumber = (existing?.lastNumber ?? 0) + 1;

      if (existing) {
        await tx.certificateSequence.update({
          where: { year },
          data: { lastNumber: nextNumber },
        });
      } else {
        await tx.certificateSequence.create({ data: { year, lastNumber: nextNumber } });
      }

      const padded = String(nextNumber).padStart(6, "0");
      return `${prefix}-${year}-${padded}`;
    });

    const [luDup, courseDup] = await Promise.all([
      prisma.learningUniverseCertificate.findUnique({ where: { certificateId } }),
      prisma.certificate.findUnique({ where: { certificateId } }),
    ]);
    if (!luDup && !courseDup) return certificateId;
  }

  throw new Error("Failed to allocate a unique certificate ID");
}
