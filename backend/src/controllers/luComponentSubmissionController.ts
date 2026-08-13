import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import { hasLearningUniverseAccess } from "../services/enrollmentService.js";
import { requireLearnerScope } from "../services/learnerScopeService.js";

function submissionWhere(
  learningUniverseId: string,
  publishVersionId: string,
  lessonId: string,
  componentKey: string,
  userId: string
) {
  return {
    learningUniverseId_publishVersionId_lessonId_componentKey_userId: {
      learningUniverseId,
      publishVersionId,
      lessonId,
      componentKey,
      userId,
    },
  };
}

async function assertLessonAccess(
  learningUniverseId: string,
  lessonId: string,
  userId: string,
  userRole?: string
) {
  const lesson = await prisma.learningUniverseLesson.findFirst({
    where: { id: lessonId, module: { track: { learningUniverseId } } },
    include: { module: { include: { track: { include: { learningUniverse: true } } } } },
  });
  if (!lesson) throw new AppError(404, "Lesson not found");
  const lu = lesson.module.track.learningUniverse;
  const allowed = await hasLearningUniverseAccess(
    learningUniverseId,
    userId,
    userRole,
    lu.instructorId,
    lu.price
  );
  if (!allowed) throw new AppError(403, "Enroll or purchase to access this lesson");
  return lesson;
}

export async function getMyComponentSubmission(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { id: learningUniverseId, lessonId, componentKey } = req.params;
  await assertLessonAccess(learningUniverseId, lessonId, req.user.id, req.user.role);
  const scope = await requireLearnerScope(req.user.id, learningUniverseId);

  const submission = await prisma.learningUniverseComponentSubmission.findUnique({
    where: submissionWhere(
      learningUniverseId,
      scope.publishVersionId,
      lessonId,
      componentKey,
      req.user.id
    ),
  });

  res.json({ success: true, submission });
}

export async function upsertComponentSubmission(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { id: learningUniverseId, lessonId, componentKey } = req.params;
  const { kind, payload, status } = req.body as {
    kind: string;
    payload?: Record<string, unknown>;
    status?: "draft" | "submitted";
  };

  if (!kind) throw new AppError(400, "kind is required");

  await assertLessonAccess(learningUniverseId, lessonId, req.user.id, req.user.role);
  const scope = await requireLearnerScope(req.user.id, learningUniverseId);

  const submission = await prisma.learningUniverseComponentSubmission.upsert({
    where: submissionWhere(
      learningUniverseId,
      scope.publishVersionId,
      lessonId,
      componentKey,
      req.user.id
    ),
    create: {
      learningUniverseId,
      publishVersionId: scope.publishVersionId,
      lessonId,
      componentKey,
      componentKind: kind,
      userId: req.user.id,
      payload: payload ?? {},
      status: status === "submitted" ? "submitted" : "draft",
    },
    update: {
      componentKind: kind,
      payload: payload ?? {},
      status: status === "submitted" ? "submitted" : undefined,
      submittedAt: status === "submitted" ? new Date() : undefined,
    },
  });

  res.json({ success: true, submission });
}

export async function listInstructorComponentSubmissions(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }

  const { id: learningUniverseId } = req.params;
  const lu = await prisma.learningUniverse.findUnique({
    where: { id: learningUniverseId },
    select: { instructorId: true },
  });
  if (!lu) throw new AppError(404, "Learning universe not found");
  if (lu.instructorId !== req.user.id && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Forbidden");
  }

  const submissions = await prisma.learningUniverseComponentSubmission.findMany({
    where: { learningUniverseId, status: { not: "draft" } },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      lesson: { select: { id: true, title: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  res.json({ success: true, submissions });
}

export async function reviewComponentSubmission(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }

  const { submissionId } = req.params;
  const { action, grade, feedback } = req.body as {
    action: "approve" | "reject" | "request_revision";
    grade?: number;
    feedback?: string;
  };

  const submission = await prisma.learningUniverseComponentSubmission.findUnique({
    where: { id: submissionId },
    include: {
      learningUniverse: { select: { instructorId: true, id: true, title: true } },
      lesson: { select: { id: true, title: true } },
      user: { select: { id: true, firstName: true } },
    },
  });
  if (!submission) throw new AppError(404, "Submission not found");
  if (submission.learningUniverse.instructorId !== req.user.id && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Forbidden");
  }

  const statusMap = {
    approve: "approved",
    reject: "rejected",
    request_revision: "revision_requested",
  } as const;

  const updated = await prisma.learningUniverseComponentSubmission.update({
    where: { id: submissionId },
    data: {
      status: statusMap[action] ?? submission.status,
      grade: grade ?? undefined,
      feedback: feedback ?? undefined,
      reviewedAt: new Date(),
      reviewedById: req.user.id,
    },
  });

  res.json({ success: true, submission: updated });
}
