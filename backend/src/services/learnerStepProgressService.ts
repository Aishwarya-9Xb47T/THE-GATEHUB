import { prisma } from "../utils/prisma.js";
import type { LearnerScope } from "./learnerScopeService.js";
import { getLearnerExperience } from "../controllers/learningExperienceController.js";
import type { LearnerExperienceStep } from "./learningExperience/learningExperienceSchema.js";

export interface StepProgressRecord {
  lessonId: string;
  stepId: string;
  completed: boolean;
  visited: boolean;
  progress: number;
  timeSpent: number;
  componentState: Record<string, unknown>;
  lastVisited: string | null;
}

function navigableSteps(steps: LearnerExperienceStep[]) {
  return steps.filter((s) => s.kind !== "next-lesson");
}

function lessonPercentFromRows(
  lessonId: string,
  steps: LearnerExperienceStep[],
  rowByKey: Map<string, { completed: boolean; visited: boolean }>
): number {
  const nav = navigableSteps(steps);
  if (nav.length === 0) return 0;

  const required = nav.filter((s) => s.progressRule.requiredForCompletion);
  if (required.length === 0) {
    const visited = nav.filter((s) => rowByKey.get(`${lessonId}:${s.id}`)?.visited).length;
    return Math.round((visited / nav.length) * 100);
  }

  const done = required.filter((s) => rowByKey.get(`${lessonId}:${s.id}`)?.completed).length;
  return Math.round((done / required.length) * 100);
}

/** Recompute course + lesson percent from step progress rows (source of truth). */
export async function recalculateCourseProgressFromSteps(scope: LearnerScope): Promise<number> {
  const experience = await getLearnerExperience(scope.learningUniverseId, scope.userId);
  if (!experience || !scope.enrollmentId) return 0;

  const enrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { id: scope.enrollmentId },
    include: { progress: true },
  });
  if (!enrollment?.progress) return 0;

  const rows = await prisma.learningUniverseStepProgress.findMany({
    where: {
      userId: scope.userId,
      learningUniverseId: scope.learningUniverseId,
      publishVersionId: scope.publishVersionId,
    },
    select: { lessonId: true, stepId: true, completed: true, visited: true },
  });

  const rowByKey = new Map(rows.map((r) => [`${r.lessonId}:${r.stepId}`, r]));

  const lessonIds: string[] = [];
  for (const track of experience.outline.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) lessonIds.push(lesson.id);
    }
  }

  let percentSum = 0;
  for (const lessonId of lessonIds) {
    const exp = experience.lessons[lessonId];
    if (!exp) continue;
    const lessonPct = lessonPercentFromRows(lessonId, exp.steps, rowByKey);
    percentSum += lessonPct;

    await prisma.lessonProgress.upsert({
      where: {
        progressId_lessonId: { progressId: enrollment.progress.id, lessonId },
      },
      create: {
        progressId: enrollment.progress.id,
        lessonId,
        completed: lessonPct === 100,
        ...(lessonPct === 100 ? { completedAt: new Date() } : {}),
      },
      update: {
        completed: lessonPct === 100,
        ...(lessonPct === 100 ? { completedAt: new Date() } : { completedAt: null }),
      },
    });
  }

  const percentComplete = lessonIds.length ? Math.round(percentSum / lessonIds.length) : 0;

  await prisma.learningUniverseProgress.update({
    where: { id: enrollment.progress.id },
    data: { percentComplete, lastAccessed: new Date(), publishVersionId: scope.publishVersionId },
  });

  if (percentComplete === 100) {
    await prisma.learningUniverseEnrollment.update({
      where: { id: enrollment.id },
      data: { isCompleted: true, completedAt: new Date() },
    });
  } else if (enrollment.isCompleted) {
    await prisma.learningUniverseEnrollment.update({
      where: { id: enrollment.id },
      data: { isCompleted: false, completedAt: null },
    });
  }

  return percentComplete;
}

export async function loadStepProgressTree(scope: LearnerScope): Promise<StepProgressRecord[]> {
  const rows = await prisma.learningUniverseStepProgress.findMany({
    where: {
      userId: scope.userId,
      learningUniverseId: scope.learningUniverseId,
      publishVersionId: scope.publishVersionId,
    },
  });

  return rows.map((r) => ({
    lessonId: r.lessonId,
    stepId: r.stepId,
    completed: r.completed,
    visited: r.visited,
    progress: r.progress,
    timeSpent: r.timeSpent,
    componentState: (r.componentState as Record<string, unknown>) ?? {},
    lastVisited: r.lastVisited?.toISOString() ?? null,
  }));
}

export async function upsertStepProgress(
  scope: LearnerScope,
  input: {
    lessonId: string;
    stepId: string;
    completed?: boolean;
    visited?: boolean;
    progress?: number;
    timeSpentDelta?: number;
    componentState?: Record<string, unknown>;
  }
) {
  const existing = await prisma.learningUniverseStepProgress.findUnique({
    where: {
      userId_learningUniverseId_publishVersionId_lessonId_stepId: {
        userId: scope.userId,
        learningUniverseId: scope.learningUniverseId,
        publishVersionId: scope.publishVersionId,
        lessonId: input.lessonId,
        stepId: input.stepId,
      },
    },
  });

  const mergedState = {
    ...((existing?.componentState as Record<string, unknown>) ?? {}),
    ...(input.componentState ?? {}),
  };

  return prisma.learningUniverseStepProgress.upsert({
    where: {
      userId_learningUniverseId_publishVersionId_lessonId_stepId: {
        userId: scope.userId,
        learningUniverseId: scope.learningUniverseId,
        publishVersionId: scope.publishVersionId,
        lessonId: input.lessonId,
        stepId: input.stepId,
      },
    },
    create: {
      userId: scope.userId,
      learningUniverseId: scope.learningUniverseId,
      publishVersionId: scope.publishVersionId,
      lessonId: input.lessonId,
      stepId: input.stepId,
      completed: input.completed ?? false,
      visited: input.visited ?? true,
      progress: input.progress ?? 0,
      timeSpent: input.timeSpentDelta ?? 0,
      componentState: mergedState,
      lastVisited: new Date(),
    },
    update: {
      completed: input.completed ?? undefined,
      visited: input.visited ?? true,
      progress: input.progress ?? undefined,
      timeSpent: input.timeSpentDelta
        ? (existing?.timeSpent ?? 0) + input.timeSpentDelta
        : undefined,
      componentState: Object.keys(mergedState).length ? mergedState : undefined,
      lastVisited: new Date(),
    },
  });
}

export async function updateResumePosition(
  scope: LearnerScope,
  lessonId: string,
  stepId: string
) {
  if (!scope.enrollmentId) return;
  await prisma.learningUniverseProgress.updateMany({
    where: { enrollmentId: scope.enrollmentId },
    data: {
      lastLessonId: lessonId,
      lastStepId: stepId,
      lastAccessed: new Date(),
      publishVersionId: scope.publishVersionId,
    },
  });
}
