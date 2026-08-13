import { prisma } from "../utils/prisma.js";
import { publishQuizAttemptEvent } from "./quizAttemptEvents.js";

interface PublishAttemptParams {
  attemptId: string;
  quizId: string;
  studentUserId: string;
  extraRecipientIds?: string[];
}

/**
 * Shared attempt-completion analytics event pipeline.
 * Every quiz completion flow (manual/AI/import/template/homework/live) should call this.
 */
export async function publishAttemptCompleted(params: PublishAttemptParams) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: params.quizId },
    select: {
      id: true,
      authorId: true,
      lectures: {
        select: {
          section: {
            select: {
              course: {
                select: {
                  instructorId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const recipients = new Set<string>([params.studentUserId, ...(params.extraRecipientIds || [])]);
  if (quiz?.authorId) recipients.add(quiz.authorId);
  for (const lecture of quiz?.lectures || []) {
    const instructorId = lecture.section?.course?.instructorId;
    if (instructorId) recipients.add(instructorId);
  }

  publishQuizAttemptEvent([...recipients], {
    type: "QUIZ_ATTEMPT_COMPLETED",
    attemptId: params.attemptId,
    quizId: params.quizId,
    userId: params.studentUserId,
    occurredAt: new Date().toISOString(),
  });
}

