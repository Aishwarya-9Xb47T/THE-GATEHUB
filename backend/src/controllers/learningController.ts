import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import {
  getCanonicalProgressForCourseEnrollment,
  getCanonicalLuProgressForUser,
  buildStudentLuLearnUrl,
} from "../services/canonicalLuProgress.js";

export async function getMyLearning(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const userId = req.user.id;

  const [courseEnrollments, luEnrollments] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            subtitle: true,
            thumbnail: true,
            difficulty: true,
            price: true,
            categoryRel: { select: { id: true, name: true } },
            instructor: { select: { firstName: true, lastName: true } },
          },
        },
        progress: true,
      },
      orderBy: { enrolledAt: "desc" },
    }),
    prisma.learningUniverseEnrollment.findMany({
      where: { userId },
      include: {
        learningUniverse: {
          select: {
            id: true,
            title: true,
            description: true,
            thumbnail: true,
            difficulty: true,
            price: true,
            categoryRel: { select: { id: true, name: true } },
            instructor: { select: { firstName: true, lastName: true } },
          },
        },
        progress: true,
      },
      orderBy: { enrolledAt: "desc" },
    }),
  ]);

  const linkedLuIds = new Set<string>();

  const courseItems = await Promise.all(
    courseEnrollments.map(async (e) => {
      const luProgress = await getCanonicalProgressForCourseEnrollment(userId, e.course.id);
      if (luProgress) linkedLuIds.add(luProgress.learningUniverseId);

      const progressPercent = luProgress?.percentComplete ?? e.progress?.percent ?? 0;
      const isCompleted =
        luProgress?.isCompleted ?? (e.isCompleted || e.progress?.percent === 100);
      const lastAccessed =
        luProgress?.lastAccessed ?? e.progress?.lastAccessed ?? e.enrolledAt;

      // Prefer course learn shell when no deep-link lesson; otherwise LU deep-link (lesson+step).
      let continueUrl = `/student/course/${e.course.id}/learn`;
      if (luProgress) {
        continueUrl = luProgress.continueUrl;
        // Keep course-scoped entry when starting with no lesson yet
        if (!luProgress.continueLessonId) {
          continueUrl = `/student/course/${e.course.id}/learn`;
        }
      }

      return {
        type: "course" as const,
        id: e.course.id,
        enrollmentId: e.id,
        learningUniverseId: luProgress?.learningUniverseId ?? null,
        title: e.course.title,
        subtitle: e.course.subtitle,
        thumbnail: e.course.thumbnail,
        difficulty: e.course.difficulty,
        price: e.course.price,
        category: e.course.categoryRel,
        instructor: e.course.instructor,
        progressPercent,
        isCompleted,
        lastAccessed,
        lastLessonId: luProgress?.lastLessonId ?? null,
        lastStepId: luProgress?.lastStepId ?? null,
        hasCertificate: luProgress?.hasActiveCertificate ?? false,
        continueUrl,
      };
    })
  );

  const luItems = (
    await Promise.all(
      luEnrollments.map(async (e) => {
        // Dedupe: LU already shown via linked Course card
        if (linkedLuIds.has(e.learningUniverse.id)) return null;

        const luProgress =
          (await getCanonicalLuProgressForUser(userId, e.learningUniverse.id)) ?? null;
        const progressPercent = luProgress?.percentComplete ?? e.progress?.percentComplete ?? 0;
        const isCompleted =
          luProgress?.isCompleted ?? (e.isCompleted || (e.progress?.percentComplete ?? 0) === 100);
        const lastAccessed =
          luProgress?.lastAccessed ?? e.progress?.lastAccessed ?? e.enrolledAt;
        const continueUrl =
          luProgress?.continueUrl ??
          buildStudentLuLearnUrl(e.learningUniverse.id, e.progress?.lastLessonId, e.progress?.lastStepId);

        return {
          type: "learning_universe" as const,
          id: e.learningUniverse.id,
          enrollmentId: e.id,
          learningUniverseId: e.learningUniverse.id,
          title: e.learningUniverse.title,
          subtitle: e.learningUniverse.description,
          thumbnail: e.learningUniverse.thumbnail,
          difficulty: e.learningUniverse.difficulty,
          price: e.learningUniverse.price,
          category: e.learningUniverse.categoryRel,
          instructor: e.learningUniverse.instructor,
          progressPercent,
          isCompleted,
          lastAccessed,
          lastLessonId: luProgress?.lastLessonId ?? e.progress?.lastLessonId ?? null,
          lastStepId: luProgress?.lastStepId ?? e.progress?.lastStepId ?? null,
          hasCertificate: luProgress?.hasActiveCertificate ?? false,
          continueUrl,
        };
      })
    )
  ).filter((x): x is NonNullable<typeof x> => x != null);

  const items = [...courseItems, ...luItems].sort(
    (a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
  );

  const inProgress = items.filter((i) => i.progressPercent > 0 && i.progressPercent < 100);
  const continueLearning = inProgress.length ? inProgress : items.filter((i) => !i.isCompleted);

  res.json({
    success: true,
    items,
    continueLearning: continueLearning.slice(0, 6),
    stats: {
      total: items.length,
      completed: items.filter((i) => i.isCompleted).length,
      inProgress: items.filter((i) => i.progressPercent > 0 && i.progressPercent < 100).length,
    },
  });
}
