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

  const { resolveCanonicalUniverseIds } = await import("../services/learnerScopeService.js");
  const luByCourseId = await resolveCanonicalUniverseIds(courseEnrollments.map((e) => e.course.id));

  const allLuIds = new Set<string>();
  courseEnrollments.forEach((e) => {
    const luId = luByCourseId.get(e.course.id);
    if (luId) allLuIds.add(luId);
  });
  luEnrollments.forEach((e) => allLuIds.add(e.learningUniverse.id));
  const luIdList = Array.from(allLuIds);

  const [batchLuEnrollments, batchLuCerts, batchTracks] = await Promise.all([
    luIdList.length > 0
      ? prisma.learningUniverseEnrollment.findMany({
          where: { userId, learningUniverseId: { in: luIdList } },
          include: {
            progress: {
              include: {
                lessonProgress: {
                  select: { lessonId: true, completed: true, updatedAt: true },
                },
              },
            },
          },
        })
      : [],
    luIdList.length > 0
      ? prisma.learningUniverseCertificate.findMany({
          where: { userId, learningUniverseId: { in: luIdList }, status: "active" },
          select: { learningUniverseId: true },
        })
      : [],
    luIdList.length > 0
      ? prisma.learningUniverseTrack.findMany({
          where: { learningUniverseId: { in: luIdList } },
          orderBy: { order: "asc" },
          select: {
            learningUniverseId: true,
            modules: {
              orderBy: { order: "asc" },
              select: {
                lessons: {
                  orderBy: { order: "asc" },
                  select: { id: true },
                },
              },
            },
          },
        })
      : [],
  ]);

  const luEnrollmentMap = new Map(batchLuEnrollments.map((e) => [e.learningUniverseId, e]));
  const certSet = new Set(batchLuCerts.map((c) => c.learningUniverseId));
  const lessonsByLuId = new Map<string, string[]>();
  batchTracks.forEach((t) => {
    const arr = lessonsByLuId.get(t.learningUniverseId) || [];
    t.modules.forEach((m) => {
      m.lessons.forEach((l) => arr.push(l.id));
    });
    lessonsByLuId.set(t.learningUniverseId, arr);
  });

  const computeLuProgressSync = (luId: string) => {
    const enrollment = luEnrollmentMap.get(luId);
    if (!enrollment) return null;

    const lessonIds = lessonsByLuId.get(luId) || [];
    const percentComplete = enrollment.progress?.percentComplete ?? 0;
    const isCompleted = enrollment.isCompleted || percentComplete === 100;
    const completedSet = new Set(
      (enrollment.progress?.lessonProgress || []).filter((lp) => lp.completed).map((lp) => lp.lessonId)
    );
    const nextLessonId = lessonIds.find((id) => !completedSet.has(id)) || null;
    const lastTouched = (enrollment.progress?.lessonProgress || [])
      .slice()
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

    const resumeLessonId = enrollment.progress?.lastLessonId ?? null;
    const resumeStepId = enrollment.progress?.lastStepId ?? null;

    let continueLessonId: string | null;
    let continueStepId: string | null = null;

    if (isCompleted) {
      continueLessonId = lessonIds[0] || null;
    } else if (resumeLessonId && lessonIds.includes(resumeLessonId)) {
      continueLessonId = resumeLessonId;
      continueStepId = resumeStepId;
    } else {
      continueLessonId = nextLessonId || lastTouched?.lessonId || lessonIds[0] || null;
    }

    return {
      learningUniverseId: luId,
      percentComplete,
      isCompleted,
      lastAccessed: enrollment.progress?.lastAccessed ?? null,
      lastLessonId: resumeLessonId,
      lastStepId: resumeStepId,
      continueLessonId,
      continueUrl: buildStudentLuLearnUrl(luId, continueLessonId, continueStepId),
      hasActiveCertificate: certSet.has(luId),
    };
  };

  const linkedLuIds = new Set<string>();

  const courseItems = courseEnrollments.map((e) => {
    const luId = luByCourseId.get(e.course.id);
    const luProgress = luId ? computeLuProgressSync(luId) : null;
    if (luProgress) linkedLuIds.add(luProgress.learningUniverseId);

    const progressPercent = luProgress?.percentComplete ?? e.progress?.percent ?? 0;
    const isCompleted =
      luProgress?.isCompleted ?? (e.isCompleted || e.progress?.percent === 100);
    const lastAccessed =
      luProgress?.lastAccessed ?? e.progress?.lastAccessed ?? e.enrolledAt;

    let continueUrl = `/student/course/${e.course.id}/learn`;
    if (luProgress) {
      continueUrl = luProgress.continueUrl;
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
  });

  const luItems = luEnrollments
    .map((e) => {
      // Dedupe: LU already shown via linked Course card
      if (linkedLuIds.has(e.learningUniverse.id)) return null;

      const luProgress = computeLuProgressSync(e.learningUniverse.id);
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
    .filter((item): item is NonNullable<typeof item> => item !== null);

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
