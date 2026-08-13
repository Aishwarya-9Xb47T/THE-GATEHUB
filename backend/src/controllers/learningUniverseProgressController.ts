import { isAdminRole } from "../utils/roles.js";
import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { tryAutoIssueLuCertificate } from "../services/certificateEngineService.js";
import { getLuCertificatePdfBuffer } from "../services/certificateEngineService.js";
import { verifyCertificatePublic } from "../services/certificateEngineService.js";
import {
  requireLearnerScope,
  resolveLearnerScope,
  resolveCanonicalUniverseId,
} from "../services/learnerScopeService.js";
import { updateResumePosition, recalculateCourseProgressFromSteps } from "../services/learnerStepProgressService.js";
import { ensureLinkedLearningUniverseEnrollment } from "../services/enrollmentService.js";

/**
 * Resolve courseId OR learningUniverseId → canonical LU id.
 * Reuses resolveCanonicalUniverseId (no second resolution system).
 * When the client passes a Course id and the user has a Course enrollment,
 * syncs the linked LU enrollment so progress can load.
 */
async function resolveProgressUniverseId(userId: string, rawId: string): Promise<string> {
  const resolved = await resolveCanonicalUniverseId(rawId);

  const course = await prisma.course.findUnique({ where: { id: rawId }, select: { id: true, title: true } });
  if (course) {
    const courseEnrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
      select: { id: true },
    });
    if (courseEnrollment) {
      await ensureLinkedLearningUniverseEnrollment(userId, course.id);
    }
    if (!resolved) {
      throw new AppError(
        404,
        `This course (“${course.title}”) is not available in the current learning format yet. It has no linked Learning Universe.`
      );
    }
  }

  const learningUniverseId = resolved || rawId;
  const lu = await prisma.learningUniverse.findUnique({ where: { id: learningUniverseId }, select: { id: true } });
  if (!lu) throw new AppError(404, "Learning Universe not found");
  return lu.id;
}

async function getEnrollmentWithProgress(userId: string, learningUniverseId: string) {
  const enrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId, learningUniverseId } },
    include: {
      progress: {
        include: {
          lessonProgress: {
            include: { lesson: { select: { id: true, title: true, order: true } } },
          },
        },
      },
    },
  });
  if (!enrollment) throw new AppError(404, "Not enrolled");
  if (!enrollment.progress) {
    const progress = await prisma.learningUniverseProgress.create({
      data: {
        enrollmentId: enrollment.id,
        percentComplete: 0,
        publishVersionId: enrollment.publishVersionId ?? undefined,
      },
      include: { lessonProgress: true },
    });
    return { ...enrollment, progress };
  }
  return enrollment;
}

async function countUniverseLessons(learningUniverseId: string) {
  return prisma.learningUniverseLesson.count({
    where: { module: { track: { learningUniverseId } } },
  });
}

async function issueCertificateIfComplete(
  userId: string,
  learningUniverseId: string,
  _enrollmentId: string
) {
  return tryAutoIssueLuCertificate(userId, learningUniverseId);
}

export async function getProgress(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const learningUniverseId = await resolveProgressUniverseId(req.user.id, req.params.id);
  const enrollment = await getEnrollmentWithProgress(req.user.id, learningUniverseId);
  const totalLessons = await countUniverseLessons(learningUniverseId);

  const scope = await resolveLearnerScope(req.user.id, learningUniverseId, { requireEnrollment: true });
  let percentComplete = enrollment.progress?.percentComplete ?? 0;
  if (scope) {
    percentComplete = await recalculateCourseProgressFromSteps(scope);
  }

  const lastLesson = enrollment.progress?.lessonProgress
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

  const certificate = await prisma.learningUniverseCertificate.findFirst({
    where: {
      userId: req.user.id,
      learningUniverseId,
      status: "active",
      ...(enrollment.publishVersionId ? { publishVersionId: enrollment.publishVersionId } : {}),
    },
  });

  res.json({
    success: true,
    learningUniverseId,
    progress: enrollment.progress,
    percentComplete,
    totalLessons,
    lastLessonId: enrollment.progress?.lastLessonId ?? lastLesson?.lessonId ?? null,
    lastStepId: enrollment.progress?.lastStepId ?? null,
    publishVersionId: enrollment.publishVersionId ?? enrollment.progress?.publishVersionId ?? null,
    isCompleted: enrollment.isCompleted,
    certificate: certificate
      ? { id: certificate.id, certificateId: certificate.certificateId, issuedAt: certificate.issuedAt }
      : null,
  });
}

export async function updateLessonProgress(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const learningUniverseId = await resolveProgressUniverseId(req.user.id, req.params.id);
  const { lessonId } = req.params;
  const completed = req.body.completed === true;
  const touchOnly = req.body.touch === true;
  const stepId = typeof req.body.stepId === "string" ? req.body.stepId : undefined;

  const scope = await requireLearnerScope(req.user.id, learningUniverseId);
  const enrollment = await getEnrollmentWithProgress(req.user.id, learningUniverseId);
  const progressId = enrollment.progress!.id;

  const lesson = await prisma.learningUniverseLesson.findFirst({
    where: { id: lessonId, module: { track: { learningUniverseId } } },
  });
  if (!lesson) throw new AppError(404, "Lesson not found");

  await prisma.lessonProgress.upsert({
    where: { progressId_lessonId: { progressId, lessonId } },
    create: {
      progressId,
      lessonId,
      completed: completed || false,
      ...(completed ? { completedAt: new Date() } : {}),
    },
    update: {
      ...(touchOnly ? {} : { completed }),
      ...(completed ? { completedAt: new Date() } : {}),
    },
  });

  const result = await recalculateCourseProgressFromSteps(scope);
  const totalLessons = await countUniverseLessons(learningUniverseId);
  const completedCount = await prisma.lessonProgress.count({
    where: { progressId, completed: true },
  });

  if (result === 100) {
    await issueCertificateIfComplete(req.user.id, learningUniverseId, enrollment.id);
  }

  if (stepId) {
    await updateResumePosition(scope, lessonId, stepId);
  } else if (completed) {
    await prisma.learningUniverseProgress.update({
      where: { id: progressId },
      data: { lastLessonId: lessonId, lastAccessed: new Date() },
    });
  }

  res.json({
    success: true,
    learningUniverseId,
    percentComplete: result,
    completedCount,
    totalLessons,
    isCompleted: result === 100,
  });
}

export async function downloadLuCertificate(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { id } = req.params;

  const cert = await prisma.learningUniverseCertificate.findUnique({
    where: { id },
    include: {
      user: { select: { firstName: true, lastName: true } },
      learningUniverse: {
        include: { instructor: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  if (!cert) throw new AppError(404, "Certificate not found");
  if (cert.userId !== req.user.id && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Access denied");
  }

  const ip =
    typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
      : req.socket.remoteAddress;

  const pdfBuffer = await getLuCertificatePdfBuffer(cert, req.user.id, ip);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="certificate-${cert.certificateId}.pdf"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
}

export async function verifyLuCertificate(req: AuthRequest, res: Response) {
  const { certificateId } = req.params;
  const ip =
    typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
      : req.socket.remoteAddress;

  const result = await verifyCertificatePublic(certificateId, ip);
  if (!result) throw new AppError(404, "Certificate not found");
  res.json({ success: true, ...result });
}
