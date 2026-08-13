import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";

export async function assertAssessmentAuthorOrAdmin(
  assessmentId: string,
  userId: string,
  role: string
) {
  if (isAdminRole(role)) return;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { authorId: true },
  });
  if (!assessment) throw new AppError(404, "Assessment not found");
  if (assessment.authorId !== userId) {
    throw new AppError(403, "You do not have access to this assessment");
  }
}

export async function assertCanViewAssessment(
  assessmentId: string,
  userId: string,
  role: string
) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { authorId: true, visibility: true, lifecycle: true },
  });
  if (!assessment) throw new AppError(404, "Assessment not found");

  if (assessment.authorId === userId || isAdminRole(role)) return assessment;
  if (assessment.visibility === "public" && assessment.lifecycle === "published") {
    return assessment;
  }
  throw new AppError(403, "You do not have access to this assessment");
}
