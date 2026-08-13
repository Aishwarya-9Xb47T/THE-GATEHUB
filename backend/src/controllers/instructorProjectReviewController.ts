import { isAdminRole } from "../utils/roles.js";
import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import {
  createNotification,
  normalizeSubmissionStatus,
  SUBMISSION_STATUSES,
  SubmissionStatus,
} from "../services/notificationService.js";

const submissionInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  project: {
    include: {
      lesson: {
        select: {
          id: true,
          title: true,
          module: {
            select: {
              track: {
                select: {
                  learningUniverseId: true,
                  learningUniverse: { select: { id: true, title: true, instructorId: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

function formatSubmission<T extends { status: string }>(submission: T) {
  return { ...submission, status: normalizeSubmissionStatus(submission.status) };
}

async function assertInstructorOwnsSubmission(submissionId: string, instructorId: string, role?: string) {
  const submission = await prisma.learningUniverseProjectSubmission.findUnique({
    where: { id: submissionId },
    include: submissionInclude,
  });
  if (!submission) throw new AppError(404, "Submission not found");

  const luInstructorId =
    submission.project.lesson.module.track.learningUniverse.instructorId;
  if (!isAdminRole(role) && luInstructorId !== instructorId) {
    throw new AppError(403, "Access denied");
  }
  return submission;
}

export async function listInstructorSubmissions(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }

  const { learningUniverseId, projectId, status } = req.query as {
    learningUniverseId?: string;
    projectId?: string;
    status?: string;
  };

  const luFilter: { instructorId?: string; id?: string } = {};
  if (!isAdminRole(req.user.role)) luFilter.instructorId = req.user.id;
  if (learningUniverseId) luFilter.id = learningUniverseId;

  const where: Record<string, unknown> = {
    project: {
      lesson: {
        module: {
          track: {
            learningUniverse: luFilter,
          },
        },
      },
      ...(projectId ? { id: projectId } : {}),
    },
  };

  if (status) {
    where.status = status === "pending" ? { in: ["pending", "submitted"] } : status;
  }

  const submissions = await prisma.learningUniverseProjectSubmission.findMany({
    where,
    include: submissionInclude,
    orderBy: { submittedAt: "desc" },
  });

  res.json({
    success: true,
    data: submissions.map(formatSubmission),
  });
}

export async function reviewSubmission(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }

  const { id } = req.params;
  const { action, grade, feedback } = req.body as {
    action: "approve" | "reject" | "request_revision" | "under_review" | "add_feedback";
    grade?: number;
    feedback?: string;
  };

  const submission = await assertInstructorOwnsSubmission(id, req.user.id, req.user.role);
  const lu = submission.project.lesson.module.track.learningUniverse;
  const projectTitle = submission.project.title;
  const studentId = submission.userId;
  const lessonId = submission.project.lesson.id;
  const link = `/student/learning-universe/${lu.id}/learn/${lessonId}/project`;

  let nextStatus: SubmissionStatus = normalizeSubmissionStatus(submission.status) as SubmissionStatus;
  const updateData: {
    status?: string;
    grade?: number | null;
    feedback?: string | null;
    reviewedAt?: Date;
    reviewedById?: string;
  } = {};

  switch (action) {
    case "under_review":
      nextStatus = "under_review";
      break;
    case "approve":
      nextStatus = "approved";
      if (grade !== undefined) updateData.grade = grade;
      if (feedback !== undefined) updateData.feedback = feedback;
      updateData.reviewedAt = new Date();
      updateData.reviewedById = req.user.id;
      break;
    case "reject":
      nextStatus = "rejected";
      if (feedback !== undefined) updateData.feedback = feedback;
      if (grade !== undefined) updateData.grade = grade;
      updateData.reviewedAt = new Date();
      updateData.reviewedById = req.user.id;
      break;
    case "request_revision":
      nextStatus = "pending";
      if (feedback !== undefined) updateData.feedback = feedback;
      updateData.reviewedAt = new Date();
      updateData.reviewedById = req.user.id;
      break;
    case "add_feedback":
      if (feedback === undefined && grade === undefined) {
        throw new AppError(400, "Provide feedback or grade");
      }
      if (feedback !== undefined) updateData.feedback = feedback;
      if (grade !== undefined) updateData.grade = grade;
      updateData.reviewedAt = new Date();
      updateData.reviewedById = req.user.id;
      break;
    default:
      throw new AppError(400, "Invalid review action");
  }

  if (!SUBMISSION_STATUSES.includes(nextStatus)) {
    throw new AppError(400, "Invalid status transition");
  }

  updateData.status = nextStatus;

  const updated = await prisma.learningUniverseProjectSubmission.update({
    where: { id },
    data: updateData,
    include: submissionInclude,
  });

  if (action === "approve") {
    await createNotification({
      userId: studentId,
      type: "project_approved",
      title: "Project approved",
      message: `Your submission for "${projectTitle}" in ${lu.title} was approved.${
        updateData.grade != null ? ` Grade: ${updateData.grade}` : ""
      }`,
      link,
      metadata: { submissionId: id, learningUniverseId: lu.id, projectId: submission.projectId },
    });
  } else if (action === "reject") {
    await createNotification({
      userId: studentId,
      type: "project_rejected",
      title: "Project rejected",
      message: `Your submission for "${projectTitle}" was rejected.${feedback ? ` Feedback: ${feedback}` : ""}`,
      link,
      metadata: { submissionId: id, learningUniverseId: lu.id, projectId: submission.projectId },
    });
  } else if (action === "add_feedback" || action === "request_revision") {
    await createNotification({
      userId: studentId,
      type: "project_feedback",
      title: action === "request_revision" ? "Revision requested" : "Instructor feedback",
      message:
        feedback ||
        (action === "request_revision"
          ? `Please revise your submission for "${projectTitle}".`
          : `New feedback on "${projectTitle}".`),
      link,
      metadata: { submissionId: id, learningUniverseId: lu.id, projectId: submission.projectId },
    });
  }

  res.json({ success: true, data: formatSubmission(updated) });
}

export async function getInstructorReviewFilters(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }

  const instructorId = isAdminRole(req.user.role) ? undefined : req.user.id;

  const universes = await prisma.learningUniverse.findMany({
    where: { ...(instructorId ? { instructorId } : {}), status: "published" },
    select: {
      id: true,
      title: true,
      tracks: {
        select: {
          modules: {
            select: {
              lessons: {
                select: {
                  project: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { title: "asc" },
  });

  const projects = universes.flatMap((u) =>
    u.tracks.flatMap((t) =>
      t.modules.flatMap((m) =>
        m.lessons
          .filter((l) => l.project)
          .map((l) => ({
            id: l.project!.id,
            title: l.project!.title,
            learningUniverseId: u.id,
            learningUniverseTitle: u.title,
          }))
      )
    )
  );

  res.json({
    success: true,
    data: {
      universes: universes.map((u) => ({ id: u.id, title: u.title })),
      projects,
      statuses: SUBMISSION_STATUSES,
    },
  });
}
