import type { Response } from "express";

export type QuizAttemptEvent =
  | {
      type: "QUIZ_ATTEMPT_COMPLETED";
      attemptId: string;
      quizId: string;
      userId: string;
      occurredAt: string;
    }
  | {
      type: "QUIZ_ANALYTICS_REFRESH";
      quizId: string;
      occurredAt: string;
    };

const streams = new Map<string, Set<Response>>();

function writeEvent(res: Response, event: QuizAttemptEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function openQuizAttemptEventStream(userId: string, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 25_000);

  const bucket = streams.get(userId) ?? new Set<Response>();
  bucket.add(res);
  streams.set(userId, bucket);

  res.on("close", () => {
    clearInterval(keepAlive);
    const current = streams.get(userId);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) streams.delete(userId);
  });
}

export function publishQuizAttemptEvent(userIds: string[], event: QuizAttemptEvent) {
  for (const userId of userIds) {
    const listeners = streams.get(userId);
    if (!listeners?.size) continue;
    for (const res of listeners) {
      writeEvent(res, event);
    }
  }
}

