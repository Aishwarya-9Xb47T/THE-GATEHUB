import { prisma } from "../utils/prisma.js";
import { getLearnerExperience } from "../controllers/learningExperienceController.js";
import type { LearnerExperienceStep } from "./learningExperience/learningExperienceSchema.js";

export interface PendingRequirement {
  code: string;
  label: string;
  lessonId?: string;
  lessonTitle?: string;
  stepId?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  completionPercent: number;
  pendingRequirements: PendingRequirement[];
  completionDate: Date | null;
}

function workspacePayloadMeaningful(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.cells) && p.cells.length > 0) return true;
  if (Array.isArray(p.files) && p.files.length > 0) return true;
  if (typeof p.code === "string" && p.code.trim().length > 0) return true;
  if (typeof p.mainTex === "string" && p.mainTex.trim().length > 0) return true;
  if (typeof p.submitted === "boolean" && p.submitted) return true;
  return Object.keys(p).length > 0;
}

function stepSatisfied(
  step: LearnerExperienceStep,
  lessonId: string,
  lessonTitle: string,
  lessonCompleted: boolean,
  submissionByKey: Map<string, { status: string; grade: number | null; payload: unknown }>,
  snapshotByStep: Map<string, { payload: unknown }>
): PendingRequirement | null {
  if (!step.progressRule.requiredForCompletion) return null;

  const rule = step.progressRule;
  const label = `${lessonTitle}: ${step.title}`;

  if (rule.event === "view" || rule.event === "complete" || rule.event === "participate") {
    if (lessonCompleted) return null;
    return { code: "step_incomplete", label, lessonId, lessonTitle, stepId: step.id };
  }

  if (rule.event === "score") {
    const passingScore = Number(step.payload.passingScore ?? 70);
    const submission = submissionByKey.get(`${lessonId}:${step.id}`);
    const payloadScore =
      submission?.payload && typeof submission.payload === "object"
        ? Number((submission.payload as Record<string, unknown>).score)
        : NaN;
    const grade = submission?.grade ?? payloadScore;
    if (submission && submission.status !== "draft" && !Number.isNaN(grade) && grade >= passingScore) {
      return null;
    }
    return {
      code: "quiz_not_passed",
      label: `${label} (minimum ${passingScore}%)`,
      lessonId,
      lessonTitle,
      stepId: step.id,
    };
  }

  if (rule.event === "submit") {
    const requiresApproval = step.payload.requiresInstructorApproval === true;
    const submission = submissionByKey.get(`${lessonId}:${step.id}`);
    if (requiresApproval) {
      if (submission?.status === "approved") return null;
      return {
        code: "instructor_approval_pending",
        label: `${label} (instructor approval required)`,
        lessonId,
        lessonTitle,
        stepId: step.id,
      };
    }
    if (submission && submission.status !== "draft") return null;

    const snapshot = snapshotByStep.get(`${lessonId}:${step.id}`);
    if (snapshot && workspacePayloadMeaningful(snapshot.payload)) return null;

    return {
      code: "submission_required",
      label: `${label} (submission required)`,
      lessonId,
      lessonTitle,
      stepId: step.id,
    };
  }

  if (lessonCompleted) return null;
  return { code: "step_incomplete", label, lessonId, lessonTitle, stepId: step.id };
}

export async function checkLuCertificateEligibility(
  userId: string,
  learningUniverseId: string
): Promise<EligibilityResult> {
  const experience = await getLearnerExperience(learningUniverseId, userId);
  if (!experience) {
    return {
      eligible: false,
      completionPercent: 0,
      pendingRequirements: [{ code: "not_enrolled", label: "Learning experience not available" }],
      completionDate: null,
    };
  }

  if (!experience.completionRules.certificateEligible) {
    const enrollment = await prisma.learningUniverseEnrollment.findUnique({
      where: { userId_learningUniverseId: { userId, learningUniverseId } },
      include: { progress: true },
    });
    return {
      eligible: false,
      completionPercent: enrollment?.progress?.percentComplete ?? 0,
      pendingRequirements: [{ code: "not_eligible", label: "This course does not offer certificates" }],
      completionDate: null,
    };
  }

  const enrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId, learningUniverseId } },
    include: {
      progress: { include: { lessonProgress: true } },
    },
  });

  if (!enrollment) {
    return {
      eligible: false,
      completionPercent: 0,
      pendingRequirements: [{ code: "not_enrolled", label: "Not enrolled in this course" }],
      completionDate: null,
    };
  }

  const [submissions, snapshots] = await Promise.all([
    prisma.learningUniverseComponentSubmission.findMany({
      where: {
        learningUniverseId,
        userId,
        publishVersionId: enrollment.publishVersionId ?? undefined,
      },
      select: { lessonId: true, componentKey: true, status: true, grade: true, payload: true },
    }),
    prisma.studentWorkspaceSnapshot.findMany({
      where: {
        learningUniverseId,
        userId,
        publishVersionId: enrollment.publishVersionId ?? undefined,
      },
      select: { lessonId: true, stepId: true, payload: true },
    }),
  ]);

  const submissionByKey = new Map<string, { status: string; grade: number | null; payload: unknown }>(
    submissions.map((s) => [`${s.lessonId}:${s.componentKey}`, s])
  );
  const snapshotByStep = new Map<string, { payload: unknown }>(
    snapshots.map((s: { lessonId: string; stepId: string; payload: unknown }) => [`${s.lessonId}:${s.stepId}`, s])
  );

  const completedLessonIds = new Set(
    (enrollment.progress?.lessonProgress ?? []).filter((p) => p.completed).map((p) => p.lessonId)
  );

  const allLessonIds: string[] = [];
  for (const track of experience.outline.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        allLessonIds.push(lesson.id);
      }
    }
  }

  const pending: PendingRequirement[] = [];
  const minPercent = experience.completionRules.minimumProgressPercent ?? 100;
  const percent = enrollment.progress?.percentComplete ?? 0;

  if (percent < minPercent) {
    pending.push({
      code: "progress_incomplete",
      label: `Course progress ${percent}% (minimum ${minPercent}% required)`,
    });
  }

  for (const lessonId of allLessonIds) {
    const lessonExp = experience.lessons[lessonId];
    const lessonTitle = lessonExp?.title ?? lessonId;
    if (!completedLessonIds.has(lessonId)) {
      pending.push({
        code: "lesson_incomplete",
        label: `Lesson not completed: ${lessonTitle}`,
        lessonId,
        lessonTitle,
      });
      continue;
    }

    if (!lessonExp) continue;
    for (const step of lessonExp.steps) {
      const req = stepSatisfied(
        step,
        lessonId,
        lessonTitle,
        true,
        submissionByKey,
        snapshotByStep
      );
      if (req) pending.push(req);
    }
  }

  const completionDate =
    enrollment.completedAt ??
    (enrollment.progress?.lessonProgress ?? [])
      .filter((p) => p.completed && p.completedAt)
      .map((p) => p.completedAt!)
      .sort((a, b) => b.getTime() - a.getTime())[0] ??
    null;

  return {
    eligible: pending.length === 0,
    completionPercent: percent,
    pendingRequirements: pending,
    completionDate,
  };
}

export async function checkCourseCertificateEligibility(
  userId: string,
  courseId: string
): Promise<EligibilityResult> {
  // LU-backed courses: use canonical LU certificate eligibility (same as player)
  const { resolveCanonicalUniverseId } = await import("./learnerScopeService.js");
  const luId = await resolveCanonicalUniverseId(courseId);
  if (luId) {
    return checkLuCertificateEligibility(userId, luId);
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: { progress: true },
  });

  if (!enrollment) {
    return {
      eligible: false,
      completionPercent: 0,
      pendingRequirements: [{ code: "not_enrolled", label: "Not enrolled in this course" }],
      completionDate: null,
    };
  }

  const percent = enrollment.progress?.percent ?? 0;
  const pending: PendingRequirement[] = [];

  if (!enrollment.isCompleted || percent < 100) {
    pending.push({
      code: "progress_incomplete",
      label: `Course progress ${percent}% (100% required)`,
    });
  }

  if (!enrollment.completedAt) {
    pending.push({ code: "not_completed", label: "Course completion date not recorded" });
  }

  return {
    eligible: pending.length === 0,
    completionPercent: percent,
    pendingRequirements: pending,
    completionDate: enrollment.completedAt,
  };
}
