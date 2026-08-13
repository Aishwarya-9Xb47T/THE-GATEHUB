import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";

export async function assertHostOrAdmin(userId: string, role: string, sessionId: string) {
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: { hostUserId: true },
  });
  if (!session) throw new AppError(404, "Live session not found");
  if (session.hostUserId !== userId && !isAdminRole(role)) {
    throw new AppError(403, "Only the session host can perform this action");
  }
  return session;
}

export async function assertCanJoinSession(
  userId: string,
  role: string,
  session: { hostUserId: string; courseId: string | null; status: string; settings: unknown }
) {
  if (session.hostUserId === userId || isAdminRole(role)) return;

  const settings = session.settings as { lockLateJoin?: boolean };
  if (settings.lockLateJoin && session.status !== "lobby") {
    throw new AppError(403, "Late join is locked for this session");
  }

  if (session.courseId) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: session.courseId } },
    });
    if (!enrollment) {
      throw new AppError(403, "You must be enrolled in this course to join");
    }
  }
}

export async function assertQuizHostAccess(userId: string, role: string, quizId: string) {
  if (isAdminRole(role)) return;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      lectures: {
        take: 1,
        select: { section: { select: { course: { select: { instructorId: true } } } } },
      },
    },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");

  const instructorId = quiz.lectures[0]?.section?.course?.instructorId;
  if (instructorId && instructorId !== userId) {
    throw new AppError(403, "You do not have permission to host this quiz");
  }
}
