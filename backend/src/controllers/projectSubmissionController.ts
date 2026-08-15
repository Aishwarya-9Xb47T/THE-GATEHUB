import { Response } from "express";
import path from "path";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { hasLearningUniverseAccess } from "../services/enrollmentService.js";
import { normalizeSubmissionStatus } from "../services/notificationService.js";

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");

async function assertProjectAccess(
  learningUniverseId: string,
  lessonId: string,
  userId: string,
  userRole?: string
) {
  const lesson = await prisma.learningUniverseLesson.findFirst({
    where: {
      id: lessonId,
      module: { track: { learningUniverseId } },
    },
    include: {
      project: true,
      module: { include: { track: { include: { learningUniverse: true } } } },
    },
  });

  if (!lesson?.project) {
    throw new AppError(404, "Project not found for this lesson");
  }

  const lu = lesson.module.track.learningUniverse;
  const allowed = await hasLearningUniverseAccess(
    learningUniverseId,
    userId,
    userRole,
    lu.instructorId,
    lu.price
  );
  if (!allowed) {
    throw new AppError(403, "Enroll or purchase to access this project");
  }

  return { lesson, project: lesson.project };
}

export async function getMyProjectSubmission(req: AuthRequest, res: Response) {
  const { id: learningUniverseId, lessonId } = req.params;
  const userId = req.user!.id;

  const { project } = await assertProjectAccess(
    learningUniverseId,
    lessonId,
    userId,
    req.user?.role
  );

  const submission = await prisma.learningUniverseProjectSubmission.findUnique({
    where: {
      projectId_userId: { projectId: project.id, userId },
    },
    include: {
      reviewedBy: { select: { firstName: true, lastName: true } },
    },
  });

  res.json({
    success: true,
    data: submission
      ? {
          ...submission,
          status: normalizeSubmissionStatus(submission.status),
        }
      : null,
  });
}

import { validateColabUrl } from "../services/colabUrlValidator.js";

export async function submitProject(req: AuthRequest, res: Response) {
  const { id: learningUniverseId, lessonId } = req.params;
  const userId = req.user!.id;
  const { githubUrl, colabUrl, notes } = req.body as {
    githubUrl?: string;
    colabUrl?: string;
    notes?: string;
  };

  const { project } = await assertProjectAccess(
    learningUniverseId,
    lessonId,
    userId,
    req.user?.role
  );

  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const zipFile = files?.zipFile?.[0];
  const reportPdf = files?.reportPdf?.[0];

  if (!githubUrl && !colabUrl && !zipFile && !reportPdf) {
    throw new AppError(400, "Provide at least one submission: GitHub URL, Colab URL, ZIP, or PDF report");
  }

  let normalizedColabUrl: string | null = null;
  if (colabUrl?.trim()) {
    const check = validateColabUrl(colabUrl.trim());
    if (!check.valid) {
      throw new AppError(400, check.error || "Invalid Google Colab notebook URL");
    }
    normalizedColabUrl = check.normalizedUrl!;
  }

  const { persistMulterFile } = await import("../middlewares/persistUpload.js");
  const zipFileUrl = zipFile ? await persistMulterFile(zipFile, "projects") : undefined;
  const reportPdfUrl = reportPdf ? await persistMulterFile(reportPdf, "pdfs") : undefined;

  const submission = await prisma.learningUniverseProjectSubmission.upsert({
    where: {
      projectId_userId: { projectId: project.id, userId },
    },
    create: {
      projectId: project.id,
      userId,
      githubUrl: githubUrl || null,
      colabUrl: normalizedColabUrl,
      zipFileUrl: zipFileUrl || null,
      reportPdfUrl: reportPdfUrl || null,
      notes: notes || null,
      status: "pending",
    },
    update: {
      githubUrl: githubUrl ?? undefined,
      colabUrl: normalizedColabUrl ?? undefined,
      zipFileUrl: zipFileUrl ?? undefined,
      reportPdfUrl: reportPdfUrl ?? undefined,
      notes: notes ?? undefined,
      status: "pending",
      submittedAt: new Date(),
    },
  });

  res.json({
    success: true,
    data: { ...submission, status: normalizeSubmissionStatus(submission.status) },
  });
}
