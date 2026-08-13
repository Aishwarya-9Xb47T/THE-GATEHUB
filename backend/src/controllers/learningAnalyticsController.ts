import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import { requireLearnerScope } from "../services/learnerScopeService.js";
import { getLearnerExperience } from "./learningExperienceController.js";
import { recalculateCourseProgressFromSteps } from "../services/learnerStepProgressService.js";

/**
 * Student learning analytics for one Learning Universe.
 * Aggregates published experience steps + existing step-progress rows.
 */
export async function getStudentLearningAnalytics(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const learningUniverseId = req.params.id;
  const scope = await requireLearnerScope(req.user.id, learningUniverseId);
  const experience = await getLearnerExperience(learningUniverseId, req.user.id);
  if (!experience) throw new AppError(404, "Experience not found");

  const percentComplete = await recalculateCourseProgressFromSteps(scope);

  const rows = await prisma.learningUniverseStepProgress.findMany({
    where: {
      userId: scope.userId,
      learningUniverseId,
      publishVersionId: scope.publishVersionId,
    },
  });

  const byLesson = new Map<string, { visited: number; completed: number; timeSpent: number; steps: number }>();
  for (const track of experience.outline.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        const exp = experience.lessons[lesson.id];
        const steps = (exp?.steps ?? []).filter((s) => s.kind !== "next-lesson");
        byLesson.set(lesson.id, {
          visited: 0,
          completed: 0,
          timeSpent: 0,
          steps: steps.length,
        });
      }
    }
  }

  for (const row of rows) {
    const bucket = byLesson.get(row.lessonId);
    if (!bucket) continue;
    if (row.visited) bucket.visited += 1;
    if (row.completed) bucket.completed += 1;
    bucket.timeSpent += row.timeSpent ?? 0;
  }

  const lessons: Array<{
    lessonId: string;
    title: string;
    moduleTitle: string;
    stepCount: number;
    visitedSteps: number;
    completedSteps: number;
    timeSpentSeconds: number;
    percent: number;
  }> = [];

  for (const track of experience.outline.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        const b = byLesson.get(lesson.id)!;
        const percent = b.steps ? Math.round((b.completed / b.steps) * 100) : 0;
        lessons.push({
          lessonId: lesson.id,
          title: lesson.title,
          moduleTitle: mod.title,
          stepCount: b.steps,
          visitedSteps: b.visited,
          completedSteps: b.completed,
          timeSpentSeconds: b.timeSpent,
          percent,
        });
      }
    }
  }

  const totalTime = lessons.reduce((n, l) => n + l.timeSpentSeconds, 0);
  const weakLessons = lessons
    .filter((l) => l.stepCount > 0 && l.percent < 70)
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 5);

  res.json({
    success: true,
    data: {
      universeId: learningUniverseId,
      universeTitle: experience.universe.title,
      publishVersionId: scope.publishVersionId,
      percentComplete,
      totalTimeSpentSeconds: totalTime,
      lessonCount: lessons.length,
      lessonsCompleted: lessons.filter((l) => l.percent === 100).length,
      lessons,
      weakLessons,
    },
  });
}

/**
 * Instructor cohort analytics for one Learning Universe (owner/admin).
 */
export async function getInstructorLearningAnalytics(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const learningUniverseId = req.params.id;

  const universe = await prisma.learningUniverse.findUnique({
    where: { id: learningUniverseId },
    select: { id: true, title: true, instructorId: true },
  });
  if (!universe) throw new AppError(404, "Learning Universe not found");
  if (universe.instructorId !== req.user.id && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Forbidden");
  }

  const enrollments = await prisma.learningUniverseEnrollment.findMany({
    where: { learningUniverseId },
    include: {
      progress: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const buckets = { notStarted: 0, early: 0, mid: 0, late: 0, complete: 0 };
  const learners = enrollments.map((e) => {
    const pct = e.progress?.percentComplete ?? 0;
    if (pct <= 0) buckets.notStarted += 1;
    else if (pct < 40) buckets.early += 1;
    else if (pct < 70) buckets.mid += 1;
    else if (pct < 100) buckets.late += 1;
    else buckets.complete += 1;
    return {
      userId: e.userId,
      name: e.user.name,
      email: e.user.email,
      percentComplete: pct,
      lastAccessed: e.progress?.lastAccessed ?? null,
      lastLessonId: e.progress?.lastLessonId ?? null,
      isCompleted: e.isCompleted || pct === 100,
    };
  });

  const avg =
    learners.length > 0
      ? Math.round(learners.reduce((n, l) => n + l.percentComplete, 0) / learners.length)
      : 0;

  res.json({
    success: true,
    data: {
      universeId,
      universeTitle: universe.title,
      enrollmentCount: learners.length,
      averageProgress: avg,
      distribution: buckets,
      learners: learners
        .sort((a, b) => b.percentComplete - a.percentComplete)
        .slice(0, 50),
    },
  });
}
