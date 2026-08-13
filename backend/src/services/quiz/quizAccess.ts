/**
 * Shared access control for legacy Quiz entities.
 */

import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";

export async function assertLegacyQuizAccess(quizId: string, userId: string, role: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      lectures: { take: 1, select: { section: { select: { course: { select: { instructorId: true } } } } } },
      liveSessions: { where: { hostUserId: userId }, take: 1 },
    },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");
  if (isAdminRole(role)) return quiz;
  if (quiz.authorId === userId) return quiz;
  if (quiz.liveSessions.length > 0) return quiz;
  const instructorId = quiz.lectures[0]?.section?.course?.instructorId;
  if (instructorId === userId) return quiz;
  throw new AppError(403, "Forbidden");
}
