import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import { prisma } from "../utils/prisma.js";
import {
  checkCourseCertificateEligibility,
  checkLuCertificateEligibility,
} from "../services/certificateEligibilityService.js";
import {
  issueLuCertificate,
  reissueLuCertificate,
  revokeLuCertificate,
  tryAutoIssueLuCertificate,
  verifyCertificatePublic,
} from "../services/certificateEngineService.js";
import { logCertificateAudit } from "../services/certificateAuditService.js";
import { buildVerificationUrl } from "../services/certificateIdService.js";

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim();
  return req.socket.remoteAddress ?? undefined;
}

export async function getLuEligibility(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { resolveCanonicalUniverseId } = await import("../services/learnerScopeService.js");
  const learningUniverseId =
    (await resolveCanonicalUniverseId(req.params.id)) || req.params.id;
  const result = await checkLuCertificateEligibility(req.user.id, learningUniverseId);

  const existing = await prisma.learningUniverseCertificate.findFirst({
    where: { userId: req.user.id, learningUniverseId, status: "active" },
    select: { id: true, certificateId: true, issuedAt: true, verificationUrl: true },
  });

  const certificateUnavailable = result.pendingRequirements.some((p) => p.code === "not_eligible");

  res.json({
    success: true,
    ...result,
    certificateUnavailable,
    certificate: existing
      ? {
          id: existing.id,
          certificateId: existing.certificateId,
          issuedAt: existing.issuedAt,
          verificationUrl: existing.verificationUrl ?? buildVerificationUrl(existing.certificateId),
        }
      : null,
  });
}

export async function getCourseEligibility(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const courseId = req.params.courseId;
  const result = await checkCourseCertificateEligibility(req.user.id, courseId);

  const existing = await prisma.certificate.findFirst({
    where: { userId: req.user.id, courseId, status: "active" },
    select: { id: true, certificateId: true, issuedAt: true, verificationUrl: true },
  });

  res.json({
    success: true,
    ...result,
    certificate: existing
      ? {
          id: existing.id,
          certificateId: existing.certificateId,
          issuedAt: existing.issuedAt,
          verificationUrl: existing.verificationUrl ?? buildVerificationUrl(existing.certificateId),
        }
      : null,
  });
}

export async function verifyCertificate(req: Request, res: Response) {
  const { certificateId } = req.params;
  const result = await verifyCertificatePublic(certificateId, clientIp(req));
  if (!result) throw new AppError(404, "Certificate not found");
  res.json({ success: true, ...result });
}

export async function logCertificateShare(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { certificateId } = req.params;
  await logCertificateAudit({
    certificatePublicId: certificateId,
    action: "shared",
    userId: req.user.id,
    ipAddress: clientIp(req),
  });
  res.json({ success: true });
}

export async function instructorListCertificates(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }

  const { learningUniverseId, status } = req.query as {
    learningUniverseId?: string;
    status?: string;
  };

  const luFilter =
    learningUniverseId
      ? { learningUniverseId }
      : isAdminRole(req.user.role)
        ? {}
        : { learningUniverse: { instructorId: req.user.id } };

  const statusFilter = status && status !== "all" ? { status } : {};

  const [issued, revoked, universes] = await Promise.all([
    prisma.learningUniverseCertificate.findMany({
      where: { ...luFilter, ...statusFilter, status: status === "revoked" ? "revoked" : statusFilter.status ?? undefined },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        learningUniverse: { select: { id: true, title: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 200,
    }),
    status === "revoked" || status === "all"
      ? prisma.learningUniverseCertificate.findMany({
          where: { ...luFilter, status: "revoked" },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            learningUniverse: { select: { id: true, title: true } },
          },
          orderBy: { revokedAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
    prisma.learningUniverse.findMany({
      where: isAdminRole(req.user.role) ? {} : { instructorId: req.user.id },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const activeCerts = status === "revoked"
    ? []
    : await prisma.learningUniverseCertificate.findMany({
        where: { ...luFilter, status: "active" },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          learningUniverse: { select: { id: true, title: true } },
        },
        orderBy: { issuedAt: "desc" },
        take: 200,
      });

  const pendingStudents: Array<{
    userId: string;
    studentName: string;
    email: string;
    learningUniverseId: string;
    courseTitle: string;
    completionPercent: number;
    pendingRequirements: { label: string }[];
  }> = [];

  if (learningUniverseId) {
    const enrollments = await prisma.learningUniverseEnrollment.findMany({
      where: { learningUniverseId, isCompleted: true },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        progress: true,
      },
      take: 50,
    });
    for (const enr of enrollments) {
      const hasCert = activeCerts.some(
        (c) => c.userId === enr.userId && c.learningUniverseId === learningUniverseId
      );
      if (hasCert) continue;
      const elig = await checkLuCertificateEligibility(enr.userId, learningUniverseId);
      if (!elig.eligible) {
        const lu = universes.find((u) => u.id === learningUniverseId);
        pendingStudents.push({
          userId: enr.userId,
          studentName: `${enr.user.firstName} ${enr.user.lastName}`,
          email: enr.user.email,
          learningUniverseId,
          courseTitle: lu?.title ?? "",
          completionPercent: elig.completionPercent,
          pendingRequirements: elig.pendingRequirements,
        });
      }
    }
  }

  res.json({
    success: true,
    issued: activeCerts,
    revoked: revoked.length ? revoked : issued.filter((c) => c.status === "revoked"),
    pending: pendingStudents,
    universes,
  });
}

export async function instructorRevokeCertificate(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }
  const { id } = req.params;
  const { reason } = req.body as { reason?: string };

  const cert = await prisma.learningUniverseCertificate.findUnique({
    where: { id },
    include: { learningUniverse: { select: { instructorId: true } } },
  });
  if (!cert) throw new AppError(404, "Certificate not found");
  if (!isAdminRole(req.user.role) && cert.learningUniverse.instructorId !== req.user.id) {
    throw new AppError(403, "Forbidden");
  }

  const updated = await revokeLuCertificate(id, req.user.id, reason);
  res.json({ success: true, certificate: updated });
}

export async function instructorReissueCertificate(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }
  const { id } = req.params;

  const cert = await prisma.learningUniverseCertificate.findUnique({
    where: { id },
    include: { learningUniverse: { select: { instructorId: true } } },
  });
  if (!cert) throw new AppError(404, "Certificate not found");
  if (!isAdminRole(req.user.role) && cert.learningUniverse.instructorId !== req.user.id) {
    throw new AppError(403, "Forbidden");
  }

  const newCert = await reissueLuCertificate(id, req.user.id);
  res.json({ success: true, certificate: newCert });
}

export async function claimLuCertificate(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const rawId = req.params.id;
  const { resolveCanonicalUniverseId } = await import("../services/learnerScopeService.js");
  const learningUniverseId = (await resolveCanonicalUniverseId(rawId)) || rawId;

  // Idempotent: reuse existing active certificate (refresh / double-click / concurrent)
  const existing = await prisma.learningUniverseCertificate.findFirst({
    where: { userId: req.user.id, learningUniverseId, status: "active" },
  });
  if (existing) {
    return res.json({
      success: true,
      certificate: {
        id: existing.id,
        certificateId: existing.certificateId,
        issuedAt: existing.issuedAt,
        verificationUrl: existing.verificationUrl ?? buildVerificationUrl(existing.certificateId),
        downloadUrl: `/api/certificates/lu/${existing.id}/download`,
      },
      reused: true,
    });
  }

  const eligibility = await checkLuCertificateEligibility(req.user.id, learningUniverseId);
  if (!eligibility.eligible) {
    return res.status(400).json({
      success: false,
      error: "Certificate requirements not met",
      pendingRequirements: eligibility.pendingRequirements,
    });
  }

  const cert =
    (await tryAutoIssueLuCertificate(req.user.id, learningUniverseId)) ??
    (await issueLuCertificate(
      req.user.id,
      learningUniverseId,
      eligibility.completionDate ?? new Date()
    ));

  res.json({
    success: true,
    certificate: {
      id: cert.id,
      certificateId: cert.certificateId,
      issuedAt: cert.issuedAt,
      verificationUrl: cert.verificationUrl ?? buildVerificationUrl(cert.certificateId),
      downloadUrl: `/api/certificates/lu/${cert.id}/download`,
    },
  });
}
