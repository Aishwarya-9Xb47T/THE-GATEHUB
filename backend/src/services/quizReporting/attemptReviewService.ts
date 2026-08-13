/**
 * Shared authoritative attempt review builder for instructor + student reports.
 * Live path: LiveAnswer (+ questionSnapshot) is source of truth.
 * Course path: QuizAttempt.answers.results (+ optional snapshots).
 */

import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { buildQuestionSnapshot, parseQuestionSnapshot, type QuestionSnapshot } from './questionSnapshot.js';

export type ReviewStatus = 'correct' | 'incorrect' | 'unanswered' | 'partial' | 'needs_review';

export type AttemptReviewItem = {
  questionId: string;
  questionNumber: number;
  questionText: string;
  questionType: string;
  options: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
  correctAnswer: unknown;
  selectedAnswer: unknown;
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean | null;
  status: ReviewStatus;
  marksAwarded: number;
  maxMarks: number;
  explanation: string | null;
  difficulty: string | null;
  bloomLevel: string | null;
  timeTakenMs: number | null;
  answeredAt: string | null;
  metadata: unknown;
  questionSnapshot: QuestionSnapshot | null;
};

export type AttemptReviewSummary = {
  attemptId: string | null;
  sessionId: string | null;
  participantId: string | null;
  studentId: string | null;
  studentName: string;
  studentEmail: string | null;
  quizId: string;
  quizTitle: string;
  attemptDate: string;
  submittedAt: string | null;
  score: number;
  maxScore: number;
  percentage: number;
  accuracy: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  timeTakenMs: number | null;
  rank: number | null;
  livePoints: number | null;
  status: string;
};

export type AttemptReviewDTO = {
  summary: AttemptReviewSummary;
  questions: AttemptReviewItem[];
};

function asOptionIdArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value ? [value] : [];
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.selectedOptionIds)) return obj.selectedOptionIds.map(String);
    if (Array.isArray(obj.optionIds)) return obj.optionIds.map(String);
    if (obj.optionId != null) return [String(obj.optionId)];
    if (obj.answer != null) return asOptionIdArray(obj.answer);
  }
  return [];
}

function resolveStatus(args: {
  answered: boolean;
  isCorrect: boolean | null;
  questionType: string;
  selectedIds: string[];
  correctIds: string[];
}): ReviewStatus {
  if (!args.answered) return 'unanswered';
  const type = (args.questionType || '').toLowerCase();
  if (type.includes('essay') || type.includes('short') || type === 'poll') {
    if (args.isCorrect == null) return 'needs_review';
  }
  if (args.isCorrect === true) return 'correct';
  if (
    (type.includes('multiple_select') || type.includes('multi')) &&
    args.selectedIds.length > 0 &&
    args.correctIds.length > 0
  ) {
    const sel = new Set(args.selectedIds);
    const cor = new Set(args.correctIds);
    const overlap = [...sel].filter((id) => cor.has(id)).length;
    if (overlap > 0 && (sel.size !== cor.size || overlap !== cor.size)) return 'partial';
  }
  return 'incorrect';
}

function labelAnswers(
  optionIds: string[],
  options: Array<{ id: string; text: string }>,
  raw: unknown,
): unknown {
  if (optionIds.length === 0) return raw ?? null;
  const mapped = optionIds.map((id) => {
    const opt = options.find((o) => o.id === id);
    return opt ? { id: opt.id, text: opt.text } : { id, text: id };
  });
  return mapped.length === 1 ? mapped[0] : mapped;
}

function buildItemFromSnapshot(args: {
  snapshot: QuestionSnapshot;
  questionNumber: number;
  selectedRaw: unknown;
  isCorrect: boolean | null;
  marksAwarded: number;
  timeTakenMs: number | null;
  answeredAt: Date | string | null;
  answered: boolean;
}): AttemptReviewItem {
  const options = args.snapshot.options || [];
  const correctOptionIds = options.filter((o) => o.isCorrect).map((o) => o.id);
  const selectedOptionIds = asOptionIdArray(args.selectedRaw);
  const status = resolveStatus({
    answered: args.answered,
    isCorrect: args.isCorrect,
    questionType: args.snapshot.type,
    selectedIds: selectedOptionIds,
    correctIds: correctOptionIds,
  });

  return {
    questionId: args.snapshot.questionId,
    questionNumber: args.questionNumber,
    questionText: args.snapshot.text,
    questionType: args.snapshot.type,
    options: options.map((o) => ({
      id: o.id,
      text: o.text,
      isCorrect: o.isCorrect,
      order: o.order,
    })),
    correctAnswer: labelAnswers(correctOptionIds, options, correctOptionIds),
    selectedAnswer: args.answered
      ? labelAnswers(selectedOptionIds, options, args.selectedRaw)
      : null,
    selectedOptionIds,
    correctOptionIds,
    isCorrect: args.answered ? args.isCorrect : null,
    status,
    marksAwarded: args.answered ? Number(args.marksAwarded || 0) : 0,
    maxMarks: args.snapshot.marks,
    explanation: args.snapshot.explanation,
    difficulty: args.snapshot.difficulty,
    bloomLevel: args.snapshot.bloomLevel,
    timeTakenMs: args.timeTakenMs,
    answeredAt: args.answeredAt ? new Date(args.answeredAt).toISOString() : null,
    metadata: args.snapshot.metadata,
    questionSnapshot: args.snapshot,
  };
}

export async function buildLiveParticipantReview(
  sessionId: string,
  participantId: string,
): Promise<AttemptReviewDTO> {
  const participant = await prisma.liveParticipant.findFirst({
    where: { id: participantId, sessionId },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  if (!participant) throw new AppError(404, 'Participant not found');

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: { options: { orderBy: { order: 'asc' } } },
          },
        },
      },
      answers: {
        where: { participantId },
      },
    },
  });
  if (!session) throw new AppError(404, 'Session not found');

  const answersByQ = new Map(session.answers.map((a) => [a.questionId, a]));
  const questions = session.quiz.questions;

  const items: AttemptReviewItem[] = questions.map((q, idx) => {
    const liveAns = answersByQ.get(q.id);
    const snapshot =
      parseQuestionSnapshot(liveAns?.questionSnapshot) || buildQuestionSnapshot(q);
    return buildItemFromSnapshot({
      snapshot,
      questionNumber: idx + 1,
      selectedRaw: liveAns?.answer ?? null,
      isCorrect: liveAns ? liveAns.isCorrect : null,
      marksAwarded: liveAns?.marksEarned ?? 0,
      timeTakenMs: liveAns?.responseTimeMs ?? null,
      answeredAt: liveAns?.answeredAt ?? null,
      answered: Boolean(liveAns),
    });
  });

  const correctCount = items.filter((i) => i.status === 'correct').length;
  const incorrectCount = items.filter((i) => i.status === 'incorrect' || i.status === 'partial').length;
  const unansweredCount = items.filter((i) => i.status === 'unanswered').length;
  const maxScore =
    items.reduce((s, i) => s + (Number(i.maxMarks) || 0), 0) ||
    questions.reduce((s, q) => s + (q.marks || 0), 0) ||
    session.quiz.totalMarks ||
    1;
  // Prefer summing academic marks from items / LiveAnswer (not gamification points)
  const academicMarks = items.reduce((s, i) => s + Math.max(0, Number(i.marksAwarded) || 0), 0);
  const attempted = correctCount + incorrectCount;
  const accuracy = attempted > 0 ? Math.round((correctCount / attempted) * 10000) / 100 : 0;
  const percentage = maxScore > 0 ? Math.round((academicMarks / maxScore) * 10000) / 100 : 0;
  const timeTakenMs = items.reduce((s, i) => s + (i.timeTakenMs || 0), 0) || null;

  return {
    summary: {
      attemptId: participant.quizAttemptId,
      sessionId,
      participantId: participant.id,
      studentId: participant.userId,
      studentName:
        participant.displayName ||
        [participant.user?.firstName, participant.user?.lastName].filter(Boolean).join(' ') ||
        'Student',
      studentEmail: participant.user?.email || null,
      quizId: session.quizId,
      quizTitle: session.quiz.title || session.title,
      attemptDate: (participant.joinedAt || session.createdAt).toISOString(),
      submittedAt: (participant.finishedAt || session.endedAt || null)?.toISOString?.() || null,
      score: academicMarks,
      maxScore,
      percentage,
      accuracy,
      correctCount,
      incorrectCount,
      unansweredCount,
      timeTakenMs,
      rank: participant.rank,
      livePoints: participant.score,
      status: participant.status,
    },
    questions: items,
  };
}

/**
 * Batch-build reviews for every participant in one session load.
 * Avoids N+1 (quiz+answers per student) used by detailed Excel/CSV exports.
 */
export async function buildAllLiveParticipantReviews(
  sessionId: string,
): Promise<Map<string, AttemptReviewDTO>> {
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: { options: { orderBy: { order: 'asc' } } },
          },
        },
      },
      participants: {
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      },
      answers: true,
    },
  });
  if (!session) throw new AppError(404, 'Session not found');

  const answersByParticipant = new Map<string, typeof session.answers>();
  for (const a of session.answers) {
    const list = answersByParticipant.get(a.participantId) || [];
    list.push(a);
    answersByParticipant.set(a.participantId, list);
  }

  const questions = session.quiz.questions;
  const out = new Map<string, AttemptReviewDTO>();

  for (const participant of session.participants) {
    const answers = answersByParticipant.get(participant.id) || [];
    const answersByQ = new Map(answers.map((a) => [a.questionId, a]));
    const items: AttemptReviewItem[] = questions.map((q, idx) => {
      const liveAns = answersByQ.get(q.id);
      const snapshot =
        parseQuestionSnapshot(liveAns?.questionSnapshot) || buildQuestionSnapshot(q);
      return buildItemFromSnapshot({
        snapshot,
        questionNumber: idx + 1,
        selectedRaw: liveAns?.answer ?? null,
        isCorrect: liveAns ? liveAns.isCorrect : null,
        marksAwarded: liveAns?.marksEarned ?? 0,
        timeTakenMs: liveAns?.responseTimeMs ?? null,
        answeredAt: liveAns?.answeredAt ?? null,
        answered: Boolean(liveAns),
      });
    });

    const correctCount = items.filter((i) => i.status === 'correct').length;
    const incorrectCount = items.filter((i) => i.status === 'incorrect' || i.status === 'partial').length;
    const unansweredCount = items.filter((i) => i.status === 'unanswered').length;
    const maxScore =
      items.reduce((s, i) => s + (Number(i.maxMarks) || 0), 0) ||
      questions.reduce((s, q) => s + (q.marks || 0), 0) ||
      session.quiz.totalMarks ||
      1;
    const academicMarks = items.reduce((s, i) => s + Math.max(0, Number(i.marksAwarded) || 0), 0);
    const attempted = correctCount + incorrectCount;
    const accuracy = attempted > 0 ? Math.round((correctCount / attempted) * 10000) / 100 : 0;
    const percentage = maxScore > 0 ? Math.round((academicMarks / maxScore) * 10000) / 100 : 0;
    const timeTakenMs = items.reduce((s, i) => s + (i.timeTakenMs || 0), 0) || null;

    out.set(participant.id, {
      summary: {
        attemptId: participant.quizAttemptId,
        sessionId,
        participantId: participant.id,
        studentId: participant.userId,
        studentName:
          participant.displayName ||
          [participant.user?.firstName, participant.user?.lastName].filter(Boolean).join(' ') ||
          'Student',
        studentEmail: participant.user?.email || null,
        quizId: session.quizId,
        quizTitle: session.quiz.title || session.title,
        attemptDate: (participant.joinedAt || session.createdAt).toISOString(),
        submittedAt: (participant.finishedAt || session.endedAt || null)?.toISOString?.() || null,
        score: academicMarks,
        maxScore,
        percentage,
        accuracy,
        correctCount,
        incorrectCount,
        unansweredCount,
        timeTakenMs,
        rank: participant.rank,
        livePoints: participant.score,
        status: participant.status,
      },
      questions: items,
    });
  }

  return out;
}

export async function buildQuizAttemptReview(attemptId: string): Promise<AttemptReviewDTO> {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      quiz: {
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: { options: { orderBy: { order: 'asc' } } },
          },
        },
      },
    },
  });
  if (!attempt) throw new AppError(404, 'Attempt not found');

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(attempt.answers || '{}') as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const liveSessionId = typeof payload.liveSessionId === 'string' ? payload.liveSessionId : null;
  if (liveSessionId) {
    const participant = await prisma.liveParticipant.findFirst({
      where: {
        sessionId: liveSessionId,
        OR: [{ quizAttemptId: attemptId }, { userId: attempt.userId }],
      },
      orderBy: { joinedAt: 'desc' },
    });
    if (participant) {
      const liveReview = await buildLiveParticipantReview(liveSessionId, participant.id);
      liveReview.summary.attemptId = attemptId;
      return liveReview;
    }
  }

  const results = Array.isArray(payload.results) ? (payload.results as any[]) : [];
  const rawAnswers = (payload.answers && typeof payload.answers === 'object'
    ? (payload.answers as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const items: AttemptReviewItem[] = attempt.quiz.questions.map((q, idx) => {
    const result = results.find((r) => r.questionId === q.id);
    const snapshot =
      parseQuestionSnapshot(result?.questionSnapshot) || buildQuestionSnapshot(q);
    const selectedRaw = result?.userAnswer ?? rawAnswers[q.id] ?? null;
    const answered = selectedRaw != null && selectedRaw !== '';
    return buildItemFromSnapshot({
      snapshot,
      questionNumber: idx + 1,
      selectedRaw,
      isCorrect: result ? Boolean(result.isCorrect) : answered ? false : null,
      marksAwarded: result?.marksEarned ?? (result?.isCorrect ? q.marks : 0),
      timeTakenMs: result?.responseTimeMs ?? null,
      answeredAt: result?.answeredAt ?? attempt.createdAt,
      answered,
    });
  });

  const correctCount = items.filter((i) => i.status === 'correct').length;
  const incorrectCount = items.filter((i) => i.status === 'incorrect' || i.status === 'partial').length;
  const unansweredCount = items.filter((i) => i.status === 'unanswered').length;
  // Prefer snapshot marks so later question edits cannot change historical denominators.
  const maxScore =
    items.reduce((s, i) => s + (Number(i.maxMarks) || 0), 0) ||
    attempt.totalMarks ||
    attempt.quiz.totalMarks ||
    1;
  // Always prefer item-level academic marks; attempt.score may hold live/gamification points.
  const fromItems = items.reduce((s, i) => s + Math.max(0, Number(i.marksAwarded) || 0), 0);
  const academicMarks = fromItems > 0 || results.length > 0 ? fromItems : Number(attempt.score) || 0;
  const attempted = correctCount + incorrectCount;
  const accuracy =
    attempted > 0 ? Math.round((correctCount / attempted) * 10000) / 100 : 0;
  const percentage =
    maxScore > 0 ? Math.min(100, Math.max(0, Math.round((academicMarks / maxScore) * 10000) / 100)) : 0;

  return {
    summary: {
      attemptId: attempt.id,
      sessionId: null,
      participantId: null,
      studentId: attempt.userId,
      studentName:
        [attempt.user?.firstName, attempt.user?.lastName].filter(Boolean).join(' ') || 'Student',
      studentEmail: attempt.user?.email || null,
      quizId: attempt.quizId,
      quizTitle: attempt.quiz.title,
      attemptDate: attempt.createdAt.toISOString(),
      submittedAt: attempt.createdAt.toISOString(),
      score: academicMarks,
      maxScore,
      percentage,
      accuracy,
      correctCount,
      incorrectCount,
      unansweredCount,
      timeTakenMs: items.reduce((s, i) => s + (i.timeTakenMs || 0), 0) || null,
      rank: typeof payload.rank === 'number' ? payload.rank : null,
      livePoints: null,
      status: 'submitted',
    },
    questions: items,
  };
}

/** Build results[] payload for QuizAttempt from LiveAnswer rows */
export function buildAttemptResultsFromLiveAnswers(
  questions: Array<{
    id: string;
    order: number;
    text: string;
    type: string;
    marks: number;
    negativeMarks: number;
    difficulty?: string | null;
    bloomLevel?: string | null;
    hint?: string | null;
    explanation?: string | null;
    metadata?: unknown;
    options: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
  }>,
  answers: Array<{
    questionId: string;
    answer: unknown;
    isCorrect: boolean;
    marksEarned: number;
    responseTimeMs: number | null;
    answeredAt: Date;
    questionSnapshot?: unknown;
  }>,
) {
  const byQ = new Map(answers.map((a) => [a.questionId, a]));
  return questions.map((q) => {
    const a = byQ.get(q.id);
    const snapshot = parseQuestionSnapshot(a?.questionSnapshot) || buildQuestionSnapshot(q);
    const correctOptions = snapshot.options.filter((o) => o.isCorrect).map((o) => o.id);
    return {
      questionId: q.id,
      userAnswer: a?.answer ?? null,
      isCorrect: a ? a.isCorrect : false,
      correctOptions,
      explanation: snapshot.explanation,
      marksEarned: a?.marksEarned ?? 0,
      maxMarks: snapshot.marks,
      responseTimeMs: a?.responseTimeMs ?? null,
      answeredAt: a?.answeredAt?.toISOString?.() ?? null,
      questionSnapshot: snapshot,
    };
  });
}

export async function buildQuestionResponseDistribution(
  sessionId: string,
  questionId: string,
) {
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            where: { id: questionId },
            include: { options: { orderBy: { order: 'asc' } } },
          },
        },
      },
      answers: {
        where: { questionId },
        include: {
          participant: {
            select: {
              id: true,
              displayName: true,
              userId: true,
              user: { select: { email: true, firstName: true, lastName: true } },
            },
          },
        },
      },
      participants: { select: { id: true } },
    },
  });
  if (!session) throw new AppError(404, 'Session not found');
  const question = session.quiz.questions[0];
  if (!question) throw new AppError(404, 'Question not found');

  const snapshot =
    parseQuestionSnapshot(session.answers[0]?.questionSnapshot) || buildQuestionSnapshot(question);
  const optionCounts: Record<string, number> = {};
  for (const o of snapshot.options) optionCounts[o.id] = 0;

  const responses = session.answers.map((a) => {
    const selectedIds = asOptionIdArray(a.answer);
    for (const id of selectedIds) {
      if (optionCounts[id] != null) optionCounts[id] += 1;
      else optionCounts[id] = 1;
    }
    return {
      participantId: a.participantId,
      displayName: a.participant.displayName,
      email: a.participant.user?.email || null,
      selectedAnswer: labelAnswers(selectedIds, snapshot.options, a.answer),
      selectedOptionIds: selectedIds,
      isCorrect: a.isCorrect,
      marksEarned: a.marksEarned,
      responseTimeMs: a.responseTimeMs,
      answeredAt: a.answeredAt.toISOString(),
    };
  });

  const totalParticipants = session.participants.length;
  const answered = session.answers.length;
  const correct = session.answers.filter((a) => a.isCorrect).length;

  return {
    question: {
      id: question.id,
      text: snapshot.text,
      type: snapshot.type,
      marks: snapshot.marks,
      difficulty: snapshot.difficulty,
      explanation: snapshot.explanation,
      options: snapshot.options,
      correctOptionIds: snapshot.options.filter((o) => o.isCorrect).map((o) => o.id),
    },
    stats: {
      totalParticipants,
      answered,
      unanswered: Math.max(0, totalParticipants - answered),
      correct,
      incorrect: Math.max(0, answered - correct),
      correctPercent: answered > 0 ? Math.round((correct / answered) * 100) : 0,
      averageTimeMs:
        answered > 0
          ? Math.round(
              session.answers.reduce((s, a) => s + (a.responseTimeMs || 0), 0) / answered,
            )
          : null,
    },
    optionDistribution: snapshot.options.map((o) => ({
      optionId: o.id,
      text: o.text,
      isCorrect: o.isCorrect,
      count: optionCounts[o.id] || 0,
    })),
    responses,
  };
}
