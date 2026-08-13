/**
 * Canonical LU progress presentation helpers for Course ↔ LU bridge.
 * Progress SOT remains LearningUniverseStepProgress → recalculateCourseProgressFromSteps.
 * These helpers only READ and shape URLs/percent for dashboards / My Courses / instructor views.
 */
import { prisma } from "../utils/prisma.js";
import { resolveCanonicalUniverseId } from "./learnerScopeService.js";
import { ensureLinkedLearningUniverseEnrollment } from "./enrollmentService.js";

export interface LuProgressPresentation {
  learningUniverseId: string;
  percentComplete: number;
  isCompleted: boolean;
  completedAt: Date | null;
  lastAccessed: Date | null;
  lastLessonId: string | null;
  lastStepId: string | null;
  completedLessons: number;
  totalLessons: number;
  continueLessonId: string | null;
  continueUrl: string;
  hasActiveCertificate: boolean;
}

/** Student learn URL for an LU (optionally deep-linked to lesson + step). */
export function buildStudentLuLearnUrl(
  learningUniverseId: string,
  lessonId?: string | null,
  stepId?: string | null
): string {
  let path = `/student/learning-universe/${learningUniverseId}/learn`;
  if (lessonId) path += `/${lessonId}`;
  if (lessonId && stepId) path += `?step=${encodeURIComponent(stepId)}`;
  return path;
}

async function listLuLessonIds(learningUniverseId: string): Promise<string[]> {
  const tracks = await prisma.learningUniverseTrack.findMany({
    where: { learningUniverseId },
    orderBy: { order: "asc" },
    select: {
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
  });
  return tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons.map((l) => l.id)));
}

/**
 * Load canonical LU progress for a user. Optionally sync from a Course enrollment first.
 */
export async function getCanonicalLuProgressForUser(
  userId: string,
  learningUniverseId: string,
  opts?: { courseId?: string }
): Promise<LuProgressPresentation | null> {
  if (opts?.courseId) {
    await ensureLinkedLearningUniverseEnrollment(userId, opts.courseId);
  }

  const enrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId, learningUniverseId } },
    include: {
      progress: {
        include: {
          lessonProgress: {
            select: { lessonId: true, completed: true, updatedAt: true },
          },
        },
      },
    },
  });
  if (!enrollment) return null;

  const lessonIds = await listLuLessonIds(learningUniverseId);
  const percentComplete = enrollment.progress?.percentComplete ?? 0;
  const isCompleted = enrollment.isCompleted || percentComplete === 100;
  const completedLessons =
    enrollment.progress?.lessonProgress.filter((lp) => lp.completed).length ?? 0;

  const completedSet = new Set(
    (enrollment.progress?.lessonProgress || []).filter((lp) => lp.completed).map((lp) => lp.lessonId)
  );
  const nextLessonId = lessonIds.find((id) => !completedSet.has(id)) || null;
  const lastTouched = (enrollment.progress?.lessonProgress || [])
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

  const resumeLessonId = enrollment.progress?.lastLessonId ?? null;
  const resumeStepId = enrollment.progress?.lastStepId ?? null;

  // Resume priority: completed → first lesson (review); else lastLesson+step; else next incomplete; else first
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

  const cert = await prisma.learningUniverseCertificate.findFirst({
    where: { userId, learningUniverseId, status: "active" },
    select: { id: true },
  });

  return {
    learningUniverseId,
    percentComplete,
    isCompleted,
    completedAt: enrollment.completedAt,
    lastAccessed: enrollment.progress?.lastAccessed ?? null,
    lastLessonId: resumeLessonId,
    lastStepId: resumeStepId,
    completedLessons,
    totalLessons: lessonIds.length,
    continueLessonId,
    continueUrl: buildStudentLuLearnUrl(learningUniverseId, continueLessonId, continueStepId),
    hasActiveCertificate: Boolean(cert),
  };
}

/** Resolve Course → LU and return canonical progress presentation (or null if no LU link). */
export async function getCanonicalProgressForCourseEnrollment(
  userId: string,
  courseId: string
): Promise<LuProgressPresentation | null> {
  const luId = await resolveCanonicalUniverseId(courseId);
  if (!luId) return null;
  return getCanonicalLuProgressForUser(userId, luId, { courseId });
}
