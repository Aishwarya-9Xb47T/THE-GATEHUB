import { isAdminRole } from "../utils/roles.js";
import { prisma } from "../utils/prisma.js";
import { ensurePublishVersionPointer } from "./learnerScopeService.js";

export async function grantCourseEnrollment(userId: string, courseId: string) {
  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: { progress: true },
  });

  if (existing) {
    if (!existing.progress) {
      await prisma.courseProgress.create({
        data: { enrollmentId: existing.id, percent: 0 },
      });
    }
    await ensureLinkedLearningUniverseEnrollment(userId, courseId);
    return existing;
  }

  const enrollment = await prisma.enrollment.create({
    data: { userId, courseId },
  });

  await prisma.courseProgress.create({
    data: { enrollmentId: enrollment.id, percent: 0 },
  });

  await ensureLinkedLearningUniverseEnrollment(userId, courseId);
  return enrollment;
}

/** When a Course maps to a Learning Universe (AI Architect), keep LU enrollment in sync. */
export async function ensureLinkedLearningUniverseEnrollment(userId: string, courseId: string) {
  try {
    const { resolveCanonicalUniverseId } = await import("./learnerScopeService.js");
    const luId = await resolveCanonicalUniverseId(courseId);
    if (!luId) return null;
    return grantLearningUniverseEnrollment(userId, luId);
  } catch (err) {
    console.warn("[enrollment] Failed to sync linked Learning Universe enrollment:", err);
    return null;
  }
}

export async function grantLearningUniverseEnrollment(userId: string, learningUniverseId: string) {
  const publishVersionId = await ensurePublishVersionPointer(learningUniverseId);

  const existing = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId, learningUniverseId } },
    include: { progress: true },
  });

  if (existing) {
    if (!existing.publishVersionId && publishVersionId) {
      await prisma.learningUniverseEnrollment.update({
        where: { id: existing.id },
        data: { publishVersionId },
      });
    }
    if (!existing.progress) {
      await prisma.learningUniverseProgress.create({
        data: {
          enrollmentId: existing.id,
          percentComplete: 0,
          publishVersionId: existing.publishVersionId ?? publishVersionId,
        },
      });
    }
    await ensureLinkedCourseEnrollmentFromLu(userId, learningUniverseId);
    return existing;
  }

  const enrollment = await prisma.learningUniverseEnrollment.create({
    data: {
      userId,
      learningUniverseId,
      publishVersionId: publishVersionId ?? undefined,
    },
  });

  await prisma.learningUniverseProgress.create({
    data: {
      enrollmentId: enrollment.id,
      percentComplete: 0,
      publishVersionId: publishVersionId ?? undefined,
    },
  });

  await ensureLinkedCourseEnrollmentFromLu(userId, learningUniverseId);
  return enrollment;
}

/**
 * Reverse bridge: LU enrollment → Course enrollment when a linked Course exists.
 * Does NOT call ensureLinkedLearningUniverseEnrollment (avoids recursion).
 */
async function ensureLinkedCourseEnrollmentFromLu(userId: string, learningUniverseId: string) {
  try {
    const lu = await prisma.learningUniverse.findUnique({
      where: { id: learningUniverseId },
      select: { structuredData: true },
    });
    const { readStructuredRecord } = await import("./productRoutingService.js");
    const sd = readStructuredRecord(lu?.structuredData);
    let courseId = typeof sd.linkedCourseId === "string" ? sd.linkedCourseId : null;
    if (!courseId) {
      const product = await prisma.product.findFirst({
        where: { learningUniverseId, courseId: { not: null } },
        select: { courseId: true },
      });
      courseId = product?.courseId ?? null;
    }
    if (!courseId) return null;

    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) return null;

    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: { progress: true },
    });
    if (existing) {
      if (!existing.progress) {
        await prisma.courseProgress.create({
          data: { enrollmentId: existing.id, percent: 0 },
        });
      }
      return existing;
    }

    const enrollment = await prisma.enrollment.create({
      data: { userId, courseId },
    });
    await prisma.courseProgress.create({
      data: { enrollmentId: enrollment.id, percent: 0 },
    });
    return enrollment;
  } catch (err) {
    console.warn("[enrollment] Failed to sync linked Course enrollment from LU:", err);
    return null;
  }
}

export async function revokeCourseEnrollment(userId: string, courseId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!enrollment) return;
  await prisma.enrollment.delete({ where: { id: enrollment.id } });
}

export async function revokeLearningUniverseEnrollment(userId: string, learningUniverseId: string) {
  const enrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId, learningUniverseId } },
  });
  if (!enrollment) return;
  await prisma.learningUniverseEnrollment.delete({ where: { id: enrollment.id } });
}

export async function hasCompletedCoursePayment(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { price: true } });
  if (!course) return false;
  if (course.price <= 0) return true;

  const payment = await prisma.payment.findFirst({
    where: { userId, courseId, status: "completed" },
  });
  return !!payment;
}

export async function hasCompletedLuPayment(userId: string, learningUniverseId: string) {
  const lu = await prisma.learningUniverse.findUnique({
    where: { id: learningUniverseId },
    select: { price: true },
  });
  if (!lu) return false;
  if (lu.price <= 0) return true;

  const payment = await prisma.payment.findFirst({
    where: { userId, learningUniverseId, status: "completed" },
  });
  return !!payment;
}

export async function hasLearningUniverseAccess(
  learningUniverseId: string,
  userId: string,
  userRole: string | undefined,
  instructorId: string,
  price: number
) {
  if (isAdminRole(userRole) || userId === instructorId) return true;

  const enrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId, learningUniverseId } },
  });
  if (!enrollment) return false;

  if (price <= 0) return true;
  return hasCompletedLuPayment(userId, learningUniverseId);
}
