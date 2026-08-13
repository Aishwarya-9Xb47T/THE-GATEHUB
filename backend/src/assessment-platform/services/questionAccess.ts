import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";
import type { QuestionPermissionMode, QuestionVisibility } from "../domain/questionMetadata.js";

const READ_MODES: QuestionPermissionMode[] = [
  "department_read",
  "org_read",
  "public_read",
  "fork_allowed",
  "approval_required",
];

export async function assertQuestionAuthorOrAdmin(
  questionId: string,
  userId: string,
  role: string
) {
  if (isAdminRole(role)) return;

  const question = await prisma.assessQuestion.findUnique({
    where: { id: questionId },
    select: { authorId: true },
  });
  if (!question) throw new AppError(404, "Question not found");
  if (question.authorId !== userId) {
    throw new AppError(403, "You do not have access to this question");
  }
}

export async function assertCanViewQuestion(
  questionId: string,
  userId: string,
  role: string
) {
  const question = await prisma.assessQuestion.findUnique({
    where: { id: questionId },
    select: {
      authorId: true,
      visibility: true,
      status: true,
      permissionMode: true,
      organizationId: true,
      departmentId: true,
    },
  });
  if (!question) throw new AppError(404, "Question not found");

  if (question.authorId === userId || isAdminRole(role)) return question;

  if (question.visibility === "public" && question.status === "published") {
    return question;
  }

  if (
    question.visibility === "organization" &&
    READ_MODES.includes(question.permissionMode as QuestionPermissionMode)
  ) {
    return question;
  }

  if (question.visibility === "shared") return question;

  throw new AppError(403, "You do not have access to this question");
}

export async function assertCanForkQuestion(
  questionId: string,
  userId: string,
  role: string
) {
  const question = await assertCanViewQuestion(questionId, userId, role);
  if (
    question.authorId === userId ||
    isAdminRole(role) ||
    question.permissionMode === "fork_allowed" ||
    question.visibility === "public"
  ) {
    return question;
  }
  throw new AppError(403, "Forking is not permitted for this question");
}

export function canEditQuestion(
  question: { authorId: string; status: string },
  userId: string,
  role: string
): boolean {
  if (isAdminRole(role)) return true;
  if (question.authorId !== userId) return false;
  return question.status !== "archived";
}
