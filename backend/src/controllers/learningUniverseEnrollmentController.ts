import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import {
  grantLearningUniverseEnrollment,
  hasCompletedLuPayment,
} from "../services/enrollmentService.js";
import { resolveCanonicalUniverseId } from "../services/learnerScopeService.js";

async function resolveLuIdOrThrow(ref: string): Promise<string> {
  const id = (await resolveCanonicalUniverseId(ref)) || ref;
  const lu = await prisma.learningUniverse.findUnique({ where: { id }, select: { id: true } });
  if (!lu) throw new AppError(404, "Learning Universe not found");
  return lu.id;
}

export async function enroll(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const learningUniverseId = await resolveLuIdOrThrow(req.params.id);

  const lu = await prisma.learningUniverse.findUnique({ where: { id: learningUniverseId } });
  if (!lu) throw new AppError(404, "Learning Universe not found");
  if (lu.status !== "published") throw new AppError(400, "Learning Universe is not available");

  if (lu.price > 0) {
    const paid = await hasCompletedLuPayment(req.user.id, learningUniverseId);
    if (!paid) throw new AppError(402, "Payment required for this Learning Universe");
  }

  const existing = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId: req.user.id, learningUniverseId } },
  });
  if (existing) {
    return res.json({ success: true, enrollment: existing, alreadyEnrolled: true });
  }

  const enrollment = await grantLearningUniverseEnrollment(req.user.id, learningUniverseId);
  res.status(201).json({ success: true, enrollment });
}

export async function check(req: AuthRequest, res: Response) {
  if (!req.user) return res.json({ success: true, enrolled: false, paid: false });
  const learningUniverseId = (await resolveCanonicalUniverseId(req.params.id)) || req.params.id;

  const enrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId: req.user.id, learningUniverseId } },
  });
  const paid = await hasCompletedLuPayment(req.user.id, learningUniverseId);

  res.json({ success: true, enrolled: !!enrollment, paid, learningUniverseId });
}

export async function myEnrollments(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const enrollments = await prisma.learningUniverseEnrollment.findMany({
    where: { userId: req.user.id },
    include: {
      learningUniverse: {
        select: {
          id: true,
          title: true,
          subtitle: true,
          description: true,
          thumbnail: true,
          bannerUrl: true,
          difficulty: true,
          price: true,
          structuredData: true,
          categoryRel: { select: { name: true, slug: true } },
          instructor: { select: { firstName: true, lastName: true } },
          tracks: {
            select: {
              modules: {
                select: {
                  estimatedHours: true,
                  lessons: { select: { id: true } },
                },
              },
            },
          },
        },
      },
      progress: {
        include: {
          lessonProgress: {
            select: { lessonId: true, completed: true, updatedAt: true },
          },
        },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });

  const enriched = await Promise.all(
    enrollments.map(async (e) => {
      const modules = e.learningUniverse.tracks.flatMap((t) => t.modules);
      const lessons = modules.flatMap((m) => m.lessons);
      const moduleCount = modules.length;
      const lessonCount = lessons.length;
      const estimatedHours = modules.reduce((sum, m) => sum + (m.estimatedHours || 0), 0);

      const { getCanonicalLuProgressForUser } = await import("../services/canonicalLuProgress.js");
      const { readStructuredRecord } = await import("../services/productRoutingService.js");
      const luProgress = await getCanonicalLuProgressForUser(req.user!.id, e.learningUniverse.id);
      const percent = luProgress?.percentComplete ?? e.progress?.percentComplete ?? 0;
      const isCompleted = luProgress?.isCompleted ?? (e.isCompleted || percent === 100);
      const completedLessons = luProgress?.completedLessons ?? e.progress?.lessonProgress.filter((lp) => lp.completed).length ?? 0;
      const continueUrl =
        luProgress?.continueUrl ??
        `/student/learning-universe/${e.learningUniverse.id}/learn`;

      const sd = readStructuredRecord(e.learningUniverse.structuredData);
      const linkedCourseId = typeof sd.linkedCourseId === "string" ? sd.linkedCourseId : null;

      // Prefer Course My Courses card when a classic Course enrollment also exists for the same LU.
      let suppressedByCourseEnrollment = false;
      if (linkedCourseId) {
        const courseEnrollment = await prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: req.user!.id, courseId: linkedCourseId } },
          select: { id: true },
        });
        suppressedByCourseEnrollment = Boolean(courseEnrollment);
      } else {
        const product = await prisma.product.findFirst({
          where: { learningUniverseId: e.learningUniverse.id, courseId: { not: null } },
          select: { courseId: true },
        });
        if (product?.courseId) {
          const courseEnrollment = await prisma.enrollment.findUnique({
            where: { userId_courseId: { userId: req.user!.id, courseId: product.courseId } },
            select: { id: true },
          });
          suppressedByCourseEnrollment = Boolean(courseEnrollment);
        }
      }

      const { tracks: _tracks, structuredData: _sd, ...luRest } = e.learningUniverse;
      return {
        ...e,
        isCompleted,
        suppressedByCourseEnrollment,
        linkedCourseId,
        learningUniverse: {
          ...luRest,
          category: e.learningUniverse.categoryRel,
          moduleCount,
          lessonCount,
          completedLessons,
          estimatedHours,
          productType: e.learningUniverse.price > 0 ? "premium-course" : "learning-universe",
          subtitle: e.learningUniverse.subtitle || e.learningUniverse.description,
        },
        progress: {
          percentComplete: percent,
          lastAccessed: luProgress?.lastAccessed ?? e.progress?.lastAccessed ?? null,
          completedLessons,
          totalLessons: lessonCount,
        },
        continueUrl,
        canDownload: isCompleted,
        hasCertificate: luProgress?.hasActiveCertificate ?? false,
      };
    })
  );

  // Canonical My Courses: omit LU rows already represented by a Course enrollment card.
  const deduped = enriched.filter((e) => !e.suppressedByCourseEnrollment);

  res.json({ success: true, enrollments: deduped });
}
