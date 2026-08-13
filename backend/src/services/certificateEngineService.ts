import fs from "fs/promises";
import path from "path";
import { prisma } from "../utils/prisma.js";
import { allocateCertificateId, buildVerificationUrl } from "./certificateIdService.js";
import { logCertificateAudit } from "./certificateAuditService.js";
import {
  checkCourseCertificateEligibility,
  checkLuCertificateEligibility,
} from "./certificateEligibilityService.js";
import { createNotification } from "./notificationService.js";
import { getPlatformSettings } from "./platformSettingsService.js";
import {
  PremiumCertificateService,
  captureCertificateTemplateSnapshot,
  type CertificateData,
  type CertificateTemplateSnapshot,
} from "./premiumCertificateService.js";
import { getLearnerExperience } from "../controllers/learningExperienceController.js";
import { resolveLearnerScope } from "./learnerScopeService.js";

const pdfService = new PremiumCertificateService();

const CERT_UPLOAD_DIR = path.join(process.cwd(), "uploads", "certificates");

async function ensureCertDir() {
  await fs.mkdir(CERT_UPLOAD_DIR, { recursive: true });
}

function pdfPathFor(certificateId: string) {
  return path.join(CERT_UPLOAD_DIR, `${certificateId}.pdf`);
}

function countOutlineStats(experience: Awaited<ReturnType<typeof getLearnerExperience>>) {
  if (!experience) {
    return { trackCount: 0, moduleCount: 0, lessonCount: 0 };
  }
  let moduleCount = 0;
  let lessonCount = 0;
  for (const track of experience.outline.tracks) {
    moduleCount += track.modules.length;
    for (const mod of track.modules) {
      lessonCount += mod.lessons.length;
    }
  }
  return { trackCount: experience.outline.tracks.length, moduleCount, lessonCount };
}

export interface LuCertificatePayload {
  studentName: string;
  studentEmail: string;
  studentId: string;
  instructorName: string;
  instructorId: string;
  courseTitle: string;
  courseDescription: string;
  completionDate: Date;
  certificateId: string;
  verificationUrl: string;
  metadata: Record<string, unknown>;
}

async function buildLuPayload(
  userId: string,
  learningUniverseId: string,
  certificateId: string,
  completionDate: Date
): Promise<LuCertificatePayload> {
  const [user, lu, experience, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.learningUniverse.findUnique({
      where: { id: learningUniverseId },
      include: { instructor: { select: { id: true, firstName: true, lastName: true } } },
    }),
    getLearnerExperience(learningUniverseId, userId),
    getPlatformSettings(),
  ]);

  if (!user || !lu) throw new Error("User or learning universe not found");

  const instructorName = lu.instructor
    ? `${lu.instructor.firstName} ${lu.instructor.lastName}`
    : "Course Instructor";
  const stats = countOutlineStats(experience);
  const templateSnapshot = captureCertificateTemplateSnapshot(settings);
  const verificationUrl = buildVerificationUrl(certificateId);

  return {
    studentName: `${user.firstName} ${user.lastName}`.trim(),
    studentEmail: user.email,
    studentId: user.id,
    instructorName,
    instructorId: lu.instructorId,
    courseTitle: lu.title,
    courseDescription: lu.description || `Successfully completed ${lu.title}.`,
    completionDate,
    certificateId,
    verificationUrl,
    metadata: {
      studentEmail: user.email,
      studentId: user.id,
      studentName: `${user.firstName} ${user.lastName}`.trim(),
      instructorId: lu.instructorId,
      instructorName,
      learningUniverseName: lu.title,
      learningUniverseId,
      courseTitle: lu.title,
      trackCount: stats.trackCount,
      moduleCount: stats.moduleCount,
      lessonCount: stats.lessonCount,
      courseDuration: lu.estimatedHours ?? experience?.universe.estimatedHours ?? null,
      completionPercentage: 100,
      completionDate: completionDate.toISOString(),
      issueDate: new Date().toISOString(),
      institution: settings.platformName || "THE GATEHUB",
      platformName: settings.platformName || "THE GATEHUB",
      verificationUrl,
      templateSnapshot,
    },
  };
}

function toCertificateData(payload: LuCertificatePayload): Omit<CertificateData, "certificateId"> {
  return {
    studentName: payload.studentName,
    studentEmail: payload.studentEmail,
    courseTitle: payload.courseTitle,
    courseDescription: payload.courseDescription,
    instructorName: payload.instructorName,
    completionDate: payload.completionDate,
    verificationUrl: payload.verificationUrl,
  };
}

async function generateAndStorePdf(
  payload: LuCertificatePayload,
  templateSnapshot?: CertificateTemplateSnapshot | null
): Promise<{ pdfPath: string; buffer: Buffer }> {
  await ensureCertDir();
  const buffer = await pdfService.generateCertificate(toCertificateData(payload), {
    certificateId: payload.certificateId,
    verificationUrl: payload.verificationUrl,
    templateSnapshot: templateSnapshot ?? (payload.metadata.templateSnapshot as CertificateTemplateSnapshot | undefined) ?? null,
  });
  const filePath = pdfPathFor(payload.certificateId);
  await fs.writeFile(filePath, buffer);
  return { pdfPath: filePath, buffer };
}

export async function tryAutoIssueLuCertificate(
  userId: string,
  learningUniverseId: string
) {
  const existing = await prisma.learningUniverseCertificate.findFirst({
    where: {
      userId,
      learningUniverseId,
      status: "active",
    },
  });
  if (existing) return existing;

  const eligibility = await checkLuCertificateEligibility(userId, learningUniverseId);
  if (!eligibility.eligible || !eligibility.completionDate) return null;

  return issueLuCertificate(userId, learningUniverseId, eligibility.completionDate);
}

export async function issueLuCertificate(
  userId: string,
  learningUniverseId: string,
  completionDate: Date
) {
  const scope = await resolveLearnerScope(userId, learningUniverseId, { requireEnrollment: true });
  const existing = await prisma.learningUniverseCertificate.findFirst({
    where: {
      userId,
      learningUniverseId,
      status: "active",
    },
  });
  if (existing) return existing;

  const certificateId = await allocateCertificateId();
  const payload = await buildLuPayload(userId, learningUniverseId, certificateId, completionDate);
  const { pdfPath } = await generateAndStorePdf(payload);

  const lu = await prisma.learningUniverse.findUnique({
    where: { id: learningUniverseId },
    select: { title: true, instructorId: true },
  });

  let cert;
  try {
    cert = await prisma.learningUniverseCertificate.create({
      data: {
        certificateId,
        userId,
        learningUniverseId,
        publishVersionId: scope?.publishVersionId ?? undefined,
        certificateTitle: `Certificate of Completion — ${lu?.title ?? "Course"}`,
        certificateBody: `Awarded for successful completion of ${lu?.title ?? "the course"}.`,
        completionDate,
        pdfPath,
        verificationUrl: payload.verificationUrl,
        url: `/uploads/certificates/${certificateId}.pdf`,
        metadata: payload.metadata,
        status: "active",
      },
    });
  } catch (err: unknown) {
    // Concurrent claim race: unique partial index or P2002 → return existing active cert
    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
    if (code === "P2002") {
      const raced = await prisma.learningUniverseCertificate.findFirst({
        where: { userId, learningUniverseId, status: "active" },
      });
      if (raced) return raced;
    }
    throw err;
  }

  await logCertificateAudit({
    certificateRecordId: cert.id,
    certificatePublicId: certificateId,
    scope: "learning_universe",
    action: "generated",
    userId,
    metadata: { learningUniverseId },
  });

  await createNotification({
    userId,
    type: "certificate_earned",
    title: "Certificate earned!",
    message: `Congratulations! You earned your certificate for ${lu?.title ?? "your course"}.`,
    link: "/student/certificates",
    metadata: { certificateId, learningUniverseId },
  });

  if (lu?.instructorId) {
    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    await createNotification({
      userId: lu.instructorId,
      type: "certificate_issued",
      title: "Certificate issued",
      message: `${student?.firstName ?? "A student"} ${student?.lastName ?? ""} earned a certificate for ${lu.title}.`.trim(),
      link: "/instructor/certificates",
      metadata: { certificateId, learningUniverseId, studentId: userId },
    });
  }

  return cert;
}

export async function getLuCertificatePdfBuffer(
  cert: {
    certificateId: string;
    pdfPath: string | null;
    status: string;
    userId: string;
    learningUniverseId: string;
    completionDate: Date | null;
    issuedAt: Date;
    metadata?: unknown;
  },
  auditUserId?: string,
  ipAddress?: string
): Promise<Buffer> {
  if (cert.status === "revoked") {
    throw new Error("Certificate has been revoked");
  }

  if (cert.pdfPath) {
    try {
      const buf = await fs.readFile(cert.pdfPath);
      if (buf.length > 0) {
        await logCertificateAudit({
          certificatePublicId: cert.certificateId,
          action: "downloaded",
          userId: auditUserId,
          ipAddress,
        });
        return buf;
      }
    } catch {
      /* regenerate */
    }
  }

  const payload = await buildLuPayload(
    cert.userId,
    cert.learningUniverseId,
    cert.certificateId,
    cert.completionDate ?? cert.issuedAt
  );
  const snapshot =
    cert.metadata && typeof cert.metadata === "object"
      ? ((cert.metadata as Record<string, unknown>).templateSnapshot as CertificateTemplateSnapshot | undefined)
      : undefined;
  const { pdfPath, buffer } = await generateAndStorePdf(payload, snapshot ?? null);
  await prisma.learningUniverseCertificate.update({
    where: { certificateId: cert.certificateId },
    data: { pdfPath, verificationUrl: payload.verificationUrl },
  });

  await logCertificateAudit({
    certificatePublicId: cert.certificateId,
    action: "downloaded",
    userId: auditUserId,
    ipAddress,
  });

  return buffer;
}

export async function revokeLuCertificate(
  certificateRecordId: string,
  revokedById: string,
  reason?: string
) {
  const cert = await prisma.learningUniverseCertificate.update({
    where: { id: certificateRecordId },
    data: {
      status: "revoked",
      revokedAt: new Date(),
      revokedById,
      revokeReason: reason ?? null,
    },
  });

  await logCertificateAudit({
    certificateRecordId: cert.id,
    certificatePublicId: cert.certificateId,
    action: "revoked",
    userId: revokedById,
    metadata: { reason },
  });

  await createNotification({
    userId: cert.userId,
    type: "certificate_revoked",
    title: "Certificate revoked",
    message: `Your certificate (${cert.certificateId}) has been revoked.`,
    link: "/student/certificates",
    metadata: { certificateId: cert.certificateId, reason },
  });

  return cert;
}

export async function reissueLuCertificate(
  certificateRecordId: string,
  reissuedById: string
) {
  const old = await prisma.learningUniverseCertificate.findUnique({
    where: { id: certificateRecordId },
  });
  if (!old) throw new Error("Certificate not found");
  if (old.status !== "revoked") throw new Error("Only revoked certificates can be reissued");

  const completionDate = old.completionDate ?? old.issuedAt;
  const newCert = await issueLuCertificate(old.userId, old.learningUniverseId, completionDate);

  await prisma.learningUniverseCertificate.update({
    where: { id: newCert.id },
    data: { reissuedFromId: old.id },
  });

  await logCertificateAudit({
    certificateRecordId: newCert.id,
    certificatePublicId: newCert.certificateId,
    action: "reissued",
    userId: reissuedById,
    metadata: { previousCertificateId: old.certificateId },
  });

  return newCert;
}

export async function verifyCertificatePublic(certificateId: string, ipAddress?: string) {
  const [luCert, courseCert] = await Promise.all([
    prisma.learningUniverseCertificate.findUnique({
      where: { certificateId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        learningUniverse: {
          include: { instructor: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
    prisma.certificate.findUnique({
      where: { certificateId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        course: {
          include: { instructor: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
  ]);

  const cert = luCert ?? courseCert;
  if (!cert) return null;

  await logCertificateAudit({
    certificateRecordId: cert.id,
    certificatePublicId: certificateId,
    scope: luCert ? "learning_universe" : "course",
    action: "verified",
    ipAddress,
  });

  const revoked = cert.status === "revoked";
  const instructor = luCert
    ? luCert.learningUniverse.instructor
    : courseCert?.course.instructor;
  const courseTitle = luCert ? luCert.learningUniverse.title : courseCert!.course.title;

  return {
    valid: !revoked,
    status: revoked ? "REVOKED" : "VERIFIED",
    certificateId: cert.certificateId,
    studentName: `${cert.user.firstName} ${cert.user.lastName}`,
    courseTitle,
    instructorName: instructor ? `${instructor.firstName} ${instructor.lastName}` : "Course Instructor",
    completionDate: cert.completionDate ?? cert.issuedAt,
    issueDate: cert.issuedAt,
    verificationStatus: revoked ? "REVOKED" : "AUTHENTIC",
    revokedAt: cert.revokedAt,
    revokeReason: cert.revokeReason,
    verificationUrl: cert.verificationUrl ?? buildVerificationUrl(cert.certificateId),
    scope: luCert ? "learning_universe" : "course",
  };
}

export async function issueCourseCertificate(userId: string, courseId: string) {
  const existing = await prisma.certificate.findFirst({
    where: { userId, courseId, status: "active" },
  });
  if (existing) return existing;

  const eligibility = await checkCourseCertificateEligibility(userId, courseId);
  if (!eligibility.eligible || !eligibility.completionDate) {
    throw new Error("Not eligible for certificate");
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      course: {
        include: { instructor: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!enrollment) throw new Error("Enrollment not found");

  const certificateId = await allocateCertificateId();
  const verificationUrl = buildVerificationUrl(certificateId);
  const settings = await getPlatformSettings();
  const templateSnapshot = captureCertificateTemplateSnapshot(settings);
  const instructorName = enrollment.course.instructor
    ? `${enrollment.course.instructor.firstName} ${enrollment.course.instructor.lastName}`
    : "Course Instructor";
  const studentName = `${enrollment.user.firstName} ${enrollment.user.lastName}`.trim();

  const certData: Omit<CertificateData, "certificateId"> = {
    studentName,
    studentEmail: enrollment.user.email,
    courseTitle: enrollment.course.title,
    courseDescription: enrollment.course.description || `Successfully completed ${enrollment.course.title}.`,
    instructorName,
    completionDate: eligibility.completionDate,
    verificationUrl,
  };

  await ensureCertDir();
  const buffer = await pdfService.generateCertificate(certData, {
    certificateId,
    verificationUrl,
    templateSnapshot,
  });
  const filePath = pdfPathFor(certificateId);
  await fs.writeFile(filePath, buffer);

  const cert = await prisma.certificate.create({
    data: {
      certificateId,
      userId,
      courseId,
      certificateTitle: `Certificate of Completion — ${enrollment.course.title}`,
      certificateBody: `Awarded for successful completion of ${enrollment.course.title}.`,
      completionDate: eligibility.completionDate,
      pdfPath: filePath,
      verificationUrl,
      url: `/uploads/certificates/${certificateId}.pdf`,
      status: "active",
      metadata: {
        studentEmail: enrollment.user.email,
        studentId: userId,
        studentName,
        courseTitle: enrollment.course.title,
        instructorId: enrollment.course.instructorId,
        instructorName,
        completionPercentage: 100,
        completionDate: eligibility.completionDate.toISOString(),
        issueDate: new Date().toISOString(),
        institution: settings.platformName || "THE GATEHUB",
        platformName: settings.platformName || "THE GATEHUB",
        verificationUrl,
        templateSnapshot,
      },
    },
  });

  await logCertificateAudit({
    certificateRecordId: cert.id,
    certificatePublicId: certificateId,
    scope: "course",
    action: "generated",
    userId,
    metadata: { courseId },
  });

  await createNotification({
    userId,
    type: "certificate_earned",
    title: "Certificate earned!",
    message: `Congratulations! You earned your certificate for ${enrollment.course.title}.`,
    link: "/student/certificates",
    metadata: { certificateId, courseId },
  });

  return cert;
}

export async function getCourseCertificatePdfBuffer(
  cert: {
    certificateId: string;
    pdfPath: string | null;
    status: string;
    userId: string;
    courseId: string;
    completionDate: Date | null;
    issuedAt: Date;
    metadata?: unknown;
  },
  auditUserId?: string,
  ipAddress?: string
): Promise<Buffer> {
  if (cert.status === "revoked") {
    throw new Error("Certificate has been revoked");
  }

  if (cert.pdfPath) {
    try {
      const buf = await fs.readFile(cert.pdfPath);
      if (buf.length > 0) {
        await logCertificateAudit({
          certificatePublicId: cert.certificateId,
          action: "downloaded",
          userId: auditUserId,
          ipAddress,
        });
        return buf;
      }
    } catch {
      /* regenerate */
    }
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: cert.userId, courseId: cert.courseId } },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      course: {
        include: { instructor: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!enrollment) throw new Error("Enrollment not found");

  const meta = (cert.metadata && typeof cert.metadata === "object"
    ? (cert.metadata as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const snapshot = meta.templateSnapshot as CertificateTemplateSnapshot | undefined;
  const instructorName =
    (typeof meta.instructorName === "string" && meta.instructorName) ||
    (enrollment.course.instructor
      ? `${enrollment.course.instructor.firstName} ${enrollment.course.instructor.lastName}`
      : "Course Instructor");
  const studentName =
    (typeof meta.studentName === "string" && meta.studentName) ||
    `${enrollment.user.firstName} ${enrollment.user.lastName}`.trim();
  const courseTitle =
    (typeof meta.courseTitle === "string" && meta.courseTitle) || enrollment.course.title;
  const verificationUrl = buildVerificationUrl(cert.certificateId);
  const completionDate = cert.completionDate ?? cert.issuedAt;

  const buffer = await pdfService.generateCertificate(
    {
      studentName,
      studentEmail: enrollment.user.email,
      courseTitle,
      courseDescription: enrollment.course.description || `Successfully completed ${courseTitle}.`,
      instructorName,
      completionDate,
      verificationUrl,
    },
    {
      certificateId: cert.certificateId,
      verificationUrl,
      templateSnapshot: snapshot ?? null,
    }
  );

  await ensureCertDir();
  const filePath = pdfPathFor(cert.certificateId);
  await fs.writeFile(filePath, buffer);
  await prisma.certificate.update({
    where: { certificateId: cert.certificateId },
    data: { pdfPath: filePath, verificationUrl },
  });

  await logCertificateAudit({
    certificatePublicId: cert.certificateId,
    action: "downloaded",
    userId: auditUserId,
    ipAddress,
  });

  return buffer;
}

export async function tryAutoIssueCourseCertificate(userId: string, courseId: string) {
  try {
    return await issueCourseCertificate(userId, courseId);
  } catch {
    return null;
  }
}
