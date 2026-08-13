/**
 * Canonical Quiz Room session report model.
 * ONE source of truth for instructor UI, analytics, CSV, Excel, PDF.
 */

import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import {
  buildLiveParticipantReview,
  type AttemptReviewDTO,
  type AttemptReviewItem,
} from './attemptReviewService.js';
import { describeQuestionContentForExport, stringifyExportValue } from './contentSerialize.js';
import { parseQuestionSnapshot } from './questionSnapshot.js';

export type CanonicalContent = {
  text: string;
  imageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
  formulas: string[];
  codeBlocks: Array<{ language?: string; content: string }>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  links: Array<{ label: string; url: string }>;
  exportText: string;
};

export type CanonicalStudentRow = {
  participantId: string;
  attemptId: string | null;
  userId: string | null;
  displayName: string;
  email: string | null;
  rank: number;
  academicScore: number;
  maxScore: number;
  percentage: number;
  accuracy: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  timeTakenMs: number;
  status: string;
  finishedAt: string | null;
  livePoints: number;
  violationCount: number;
};

export type CanonicalQuestionAnalysis = {
  questionId: string;
  number: number;
  type: string;
  marks: number;
  text: string;
  content: CanonicalContent;
  difficulty: string | null;
  bloomLevel: string | null;
  topic: string;
  answered: number;
  unanswered: number;
  correct: number;
  incorrect: number;
  correctPercent: number;
  incorrectPercent: number;
  unansweredPercent: number;
  averageTimeMs: number | null;
  averageMarks: number;
  optionDistribution: Array<{
    optionId: string;
    text: string;
    isCorrect: boolean;
    count: number;
    percent: number;
  }>;
  correctOptionIds: string[];
  options: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
};

export type CanonicalSessionReport = {
  quiz: {
    id: string;
    title: string;
    description: string | null;
    instructorName: string | null;
    totalMarks: number;
    questionCount: number;
  };
  session: {
    id: string;
    title: string;
    roomCode: string | null;
    status: string;
    hostedAt: string | null;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
  };
  summary: {
    participantCount: number;
    completedCount: number;
    inProgressCount: number;
    averageScore: number;
    averagePercentage: number;
    averageAccuracy: number;
    highestScore: number;
    lowestScore: number;
    medianScore: number;
    completionRate: number;
    averageTimeMs: number | null;
    totalMarks: number;
    totalQuestions: number;
    totalCorrectAnswers: number;
    totalIncorrectAnswers: number;
    totalUnanswered: number;
    scoreDistribution: Array<{ bucket: string; count: number }>;
  };
  insights: {
    strongestQuestion: { number: number; text: string; correctPercent: number } | null;
    weakestQuestion: { number: number; text: string; correctPercent: number } | null;
    fastestQuestion: { number: number; text: string; averageTimeMs: number } | null;
    slowestQuestion: { number: number; text: string; averageTimeMs: number } | null;
  };
  students: CanonicalStudentRow[];
  questionAnalysis: CanonicalQuestionAnalysis[];
  learningAnalytics: {
    byTopic: Array<{
      topic: string;
      questions: number;
      correctPercent: number;
      averageTimeMs: number | null;
    }>;
    byBloom: Array<{
      level: string;
      questions: number;
      correctPercent: number;
      averageTimeMs: number | null;
    }>;
    byDifficulty: Array<{
      difficulty: string;
      questions: number;
      correctPercent: number;
      averageMarks: number;
      averageTimeMs: number | null;
    }>;
  };
  security: {
    totalViolations: number;
    studentsFlagged: number;
    eventCount: number;
    cameraRequired: boolean;
  };
  events: Array<{
    id: string;
    eventType: string;
    timestamp: string;
    participantId: string | null;
    displayName: string | null;
    payload: Record<string, unknown>;
  }>;
};

function extractContent(text: string, metadata: unknown): CanonicalContent {
  const meta = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>;
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];
  const formulas: string[] = [];
  const codeBlocks: Array<{ language?: string; content: string }> = [];
  const tables: Array<{ headers: string[]; rows: string[][] }> = [];
  const links: Array<{ label: string; url: string }> = [];

  const md = String(text || '');
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(md)) !== null) {
    const alt = (m[1] || '').toLowerCase();
    const url = m[2] || '';
    if (alt.includes('video') || /\.(mp4|webm)(\?|$)/i.test(url)) videoUrls.push(url);
    else if (alt.includes('audio') || /\.(mp3|wav)(\?|$)/i.test(url)) audioUrls.push(url);
    else imageUrls.push(url);
  }
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((m = linkRe.exec(md)) !== null) {
    if (!m[0]!.startsWith('!')) links.push({ label: m[1] || 'Link', url: m[2] || '' });
  }
  const formulaBlock = md.match(/\$\$([\s\S]*?)\$\$/g) || [];
  for (const f of formulaBlock) formulas.push(f.replace(/^\$\$|\$\$$/g, '').trim());
  const formulaInline = md.match(/(?<!\$)\$([^$\n]+)\$(?!\$)/g) || [];
  for (const f of formulaInline) formulas.push(f.replace(/^\$|\$$/g, '').trim());
  const codeRe = /```(\w*)\n?([\s\S]*?)```/g;
  while ((m = codeRe.exec(md)) !== null) {
    codeBlocks.push({ language: m[1] || undefined, content: m[2] || '' });
  }

  const metaCode = meta.code || (Array.isArray(meta.codeBlocks) ? meta.codeBlocks[0] : null);
  if (metaCode && typeof metaCode === 'object') {
    const c = metaCode as any;
    const body = String(c.code || c.content || '');
    if (body) codeBlocks.push({ language: c.language, content: body });
  }
  if (typeof meta.starterCode === 'string' && meta.starterCode.trim()) {
    codeBlocks.push({ language: String(meta.language || 'plain'), content: meta.starterCode });
  }
  const rawFormulas = meta.formulas || meta.equations;
  if (Array.isArray(rawFormulas)) {
    for (const f of rawFormulas) {
      const latex = typeof f === 'string' ? f : (f as any)?.latex || (f as any)?.content;
      if (latex) formulas.push(String(latex));
    }
  }
  const table = meta.table || (Array.isArray(meta.tables) ? meta.tables[0] : null);
  if (table && typeof table === 'object') {
    const t = table as any;
    tables.push({
      headers: Array.isArray(t.headers) ? t.headers.map(String) : [],
      rows: Array.isArray(t.rows)
        ? t.rows.map((r: any) => (Array.isArray(r) ? r.map(String) : [String(r)]))
        : [],
    });
  }
  const mediaUrl = String((meta as any).mediaUrl || (meta as any).media?.url || '').trim();
  if (mediaUrl && !imageUrls.includes(mediaUrl)) imageUrls.push(mediaUrl);

  return {
    text: md,
    imageUrls: [...new Set(imageUrls)],
    videoUrls: [...new Set(videoUrls)],
    audioUrls: [...new Set(audioUrls)],
    formulas: [...new Set(formulas.filter(Boolean))],
    codeBlocks,
    tables,
    links,
    exportText: describeQuestionContentForExport({ text: md, metadata: meta }),
  };
}

function scoreBucket(pct: number): string {
  if (pct <= 20) return '0–20%';
  if (pct <= 40) return '21–40%';
  if (pct <= 60) return '41–60%';
  if (pct <= 80) return '61–80%';
  return '81–100%';
}

function asOptionIds(answer: unknown): string[] {
  if (answer == null) return [];
  if (Array.isArray(answer)) return answer.map(String);
  if (typeof answer === 'string') return answer ? [answer] : [];
  if (typeof answer === 'object' && (answer as any).optionId) return [String((answer as any).optionId)];
  return [];
}

export async function buildCanonicalSessionReport(sessionId: string): Promise<CanonicalSessionReport> {
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      host: { select: { firstName: true, lastName: true, email: true } },
      quiz: {
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: { options: { orderBy: { order: 'asc' } } },
          },
        },
      },
      participants: {
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      },
      answers: true,
      events: { orderBy: { timestamp: 'asc' } },
    },
  });
  if (!session) throw new AppError(404, 'Session not found');

  const questions = session.quiz.questions;
  const questionCount = questions.length;
  const settings = (session.settings || {}) as Record<string, unknown>;

  /** Prefer first LiveAnswer.questionSnapshot for historical marks/text/options. */
  const snapshotByQuestionId = new Map<string, ReturnType<typeof parseQuestionSnapshot>>();
  for (const a of session.answers) {
    if (snapshotByQuestionId.has(a.questionId)) continue;
    const snap = parseQuestionSnapshot(a.questionSnapshot);
    if (snap) snapshotByQuestionId.set(a.questionId, snap);
  }

  const resolveQuestionView = (q: (typeof questions)[0]) => {
    const snap = snapshotByQuestionId.get(q.id);
    if (snap) {
      return {
        text: snap.text,
        type: snap.type,
        marks: snap.marks,
        difficulty: snap.difficulty,
        bloomLevel: snap.bloomLevel,
        metadata: snap.metadata,
        options: snap.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
          order: o.order,
        })),
      };
    }
    return {
      text: q.text,
      type: q.type,
      marks: q.marks,
      difficulty: q.difficulty,
      bloomLevel: q.bloomLevel,
      metadata: q.metadata,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        order: o.order,
      })),
    };
  };

  const totalMarks =
    questions.reduce((s, q) => s + (resolveQuestionView(q).marks || 0), 0) ||
    session.quiz.totalMarks ||
    0;

  const answersByParticipant = new Map<string, typeof session.answers>();
  for (const a of session.answers) {
    const list = answersByParticipant.get(a.participantId) || [];
    list.push(a);
    answersByParticipant.set(a.participantId, list);
  }

  const students: CanonicalStudentRow[] = session.participants.map((p) => {
    const pAnswers = answersByParticipant.get(p.id) || [];
    let academicScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let timeTakenMs = 0;
    for (const a of pAnswers) {
      const q = questions.find((qq) => qq.id === a.questionId);
      const max = q ? resolveQuestionView(q).marks : 0;
      if (a.isCorrect) {
        correctCount += 1;
        // Academic SOT: LiveAnswer.marksEarned (never pointsEarned / live score)
        academicScore +=
          typeof a.marksEarned === 'number'
            ? Math.max(0, a.marksEarned)
            : max;
      } else {
        incorrectCount += 1;
      }
      timeTakenMs += a.responseTimeMs || 0;
    }
    const unansweredCount = Math.max(0, questionCount - pAnswers.length);
    const percentage =
      totalMarks > 0 ? Math.round((academicScore / totalMarks) * 10000) / 100 : 0;
    const attempted = correctCount + incorrectCount;
    const accuracy =
      attempted > 0
        ? Math.round((correctCount / attempted) * 10000) / 100
        : Math.round((p.accuracy || 0) * 100) / 100;
    const completed = Boolean(p.finishedAt) || p.status === 'submitted';

    return {
      participantId: p.id,
      attemptId: p.quizAttemptId,
      userId: p.userId,
      displayName: p.displayName,
      email: p.user?.email || null,
      rank: p.rank || 0,
      academicScore,
      maxScore: totalMarks,
      percentage,
      accuracy,
      correctCount,
      incorrectCount,
      unansweredCount,
      timeTakenMs,
      status: completed ? 'completed' : p.status || 'in_progress',
      finishedAt: p.finishedAt?.toISOString() || null,
      livePoints: p.score,
      violationCount: p.violationCount || 0,
    };
  });

  students.sort((a, b) => b.academicScore - a.academicScore || a.timeTakenMs - b.timeTakenMs);
  students.forEach((s, i) => {
    s.rank = i + 1;
  });

  const completedStudents = students.filter((s) => s.status === 'completed');
  const scored = students.filter(
    (s) => s.correctCount + s.incorrectCount + s.unansweredCount > 0 || s.status === 'completed',
  );
  const scorePool = scored.length ? scored : students;
  const academicScores = scorePool.map((s) => s.academicScore);
  const avgScore =
    academicScores.length > 0
      ? Math.round((academicScores.reduce((a, b) => a + b, 0) / academicScores.length) * 10) / 10
      : 0;
  const avgPct =
    scorePool.length > 0
      ? Math.round((scorePool.reduce((s, p) => s + p.percentage, 0) / scorePool.length) * 100) / 100
      : 0;
  const avgAcc =
    scorePool.length > 0
      ? Math.round((scorePool.reduce((s, p) => s + p.accuracy, 0) / scorePool.length) * 100) / 100
      : 0;

  const buckets = ['0–20%', '21–40%', '41–60%', '61–80%', '81–100%'];
  const scoreDistribution = buckets.map((bucket) => ({
    bucket,
    count: scorePool.filter((s) => scoreBucket(s.percentage) === bucket).length,
  }));

  const questionAnalysis: CanonicalQuestionAnalysis[] = questions.map((q, idx) => {
    const view = resolveQuestionView(q);
    const qAnswers = session.answers.filter((a) => a.questionId === q.id);
    const answered = qAnswers.length;
    const correct = qAnswers.filter((a) => a.isCorrect).length;
    const incorrect = Math.max(0, answered - correct);
    const unanswered = Math.max(0, students.length - answered);
    const denom = Math.max(1, students.length);
    const optionCounts: Record<string, number> = {};
    for (const o of view.options) optionCounts[o.id] = 0;
    for (const a of qAnswers) {
      for (const id of asOptionIds(a.answer)) {
        optionCounts[id] = (optionCounts[id] || 0) + 1;
      }
    }
    const avgTime =
      answered > 0
        ? Math.round(qAnswers.reduce((s, a) => s + (a.responseTimeMs || 0), 0) / answered)
        : null;
    const avgMarks =
      answered > 0
        ? Math.round(
            (qAnswers.reduce((s, a) => {
              if (typeof a.marksEarned === 'number') return s + Math.max(0, a.marksEarned);
              return s + (a.isCorrect ? view.marks : 0);
            }, 0) /
              answered) *
              100,
          ) / 100
        : 0;
    const meta = (view.metadata || {}) as Record<string, unknown>;
    const topic = String(meta?.topic || 'General');

    return {
      questionId: q.id,
      number: idx + 1,
      type: view.type,
      marks: view.marks,
      text: view.text,
      content: extractContent(view.text, view.metadata),
      difficulty: view.difficulty,
      bloomLevel: view.bloomLevel,
      topic,
      answered,
      unanswered,
      correct,
      incorrect,
      correctPercent: students.length > 0 ? Math.round((correct / denom) * 100) : 0,
      incorrectPercent: students.length > 0 ? Math.round((incorrect / denom) * 100) : 0,
      unansweredPercent: students.length > 0 ? Math.round((unanswered / denom) * 100) : 0,
      averageTimeMs: avgTime,
      averageMarks: avgMarks,
      optionDistribution: view.options.map((o) => ({
        optionId: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        count: optionCounts[o.id] || 0,
        percent: answered > 0 ? Math.round(((optionCounts[o.id] || 0) / answered) * 100) : 0,
      })),
      correctOptionIds: view.options.filter((o) => o.isCorrect).map((o) => o.id),
      options: view.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        order: o.order,
      })),
    };
  });

  const withAnswers = questionAnalysis.filter((q) => q.answered > 0);
  const strongest =
    withAnswers.length > 0
      ? withAnswers.reduce((best, q) => (q.correctPercent > best.correctPercent ? q : best))
      : null;
  const weakest =
    withAnswers.length > 0
      ? withAnswers.reduce((worst, q) => (q.correctPercent < worst.correctPercent ? q : worst))
      : null;
  const withTime = questionAnalysis.filter((q) => q.averageTimeMs != null);
  const fastest =
    withTime.length > 0
      ? withTime.reduce((a, b) => ((a.averageTimeMs || 0) < (b.averageTimeMs || 0) ? a : b))
      : null;
  const slowest =
    withTime.length > 0
      ? withTime.reduce((a, b) => ((a.averageTimeMs || 0) > (b.averageTimeMs || 0) ? a : b))
      : null;

  const groupStats = (keyFn: (q: CanonicalQuestionAnalysis) => string) => {
    const map = new Map<
      string,
      { questions: number; correct: number; answered: number; timeSum: number; timeCount: number; marksSum: number }
    >();
    for (const q of questionAnalysis) {
      const key = keyFn(q);
      const cur =
        map.get(key) || { questions: 0, correct: 0, answered: 0, timeSum: 0, timeCount: 0, marksSum: 0 };
      cur.questions += 1;
      cur.correct += q.correct;
      cur.answered += q.answered;
      if (q.averageTimeMs != null) {
        cur.timeSum += q.averageTimeMs;
        cur.timeCount += 1;
      }
      cur.marksSum += q.averageMarks;
      map.set(key, cur);
    }
    return [...map.entries()].map(([key, v]) => ({
      key,
      questions: v.questions,
      correctPercent: v.answered > 0 ? Math.round((v.correct / v.answered) * 100) : 0,
      averageTimeMs: v.timeCount > 0 ? Math.round(v.timeSum / v.timeCount) : null,
      averageMarks: v.questions > 0 ? Math.round((v.marksSum / v.questions) * 100) / 100 : 0,
    }));
  };

  const nameById = new Map(session.participants.map((p) => [p.id, p.displayName]));
  const totalViolations = students.reduce((s, p) => s + p.violationCount, 0);

  return {
    quiz: {
      id: session.quizId,
      title: session.quiz.title,
      description: session.quiz.description,
      instructorName:
        [session.host?.firstName, session.host?.lastName].filter(Boolean).join(' ') || null,
      totalMarks,
      questionCount,
    },
    session: {
      id: session.id,
      title: session.title,
      roomCode: session.roomCode,
      status: session.status,
      hostedAt: (session.startedAt || session.createdAt)?.toISOString?.() || null,
      startedAt: session.startedAt?.toISOString() || null,
      endedAt: session.endedAt?.toISOString() || null,
      createdAt: session.createdAt.toISOString(),
    },
    summary: {
      participantCount: students.length,
      completedCount: completedStudents.length,
      inProgressCount: Math.max(0, students.length - completedStudents.length),
      averageScore: avgScore,
      averagePercentage: avgPct,
      averageAccuracy: avgAcc,
      highestScore: academicScores.length ? Math.max(...academicScores) : 0,
      lowestScore: academicScores.length ? Math.min(...academicScores) : 0,
      medianScore: (() => {
        if (!academicScores.length) return 0;
        const sorted = [...academicScores].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10
          : sorted[mid]!;
      })(),
      completionRate:
        students.length > 0
          ? Math.round((completedStudents.length / students.length) * 1000) / 10
          : 0,
      averageTimeMs:
        scorePool.length > 0
          ? Math.round(scorePool.reduce((s, p) => s + p.timeTakenMs, 0) / scorePool.length)
          : null,
      totalMarks,
      totalQuestions: questionCount,
      totalCorrectAnswers: students.reduce((s, p) => s + p.correctCount, 0),
      totalIncorrectAnswers: students.reduce((s, p) => s + p.incorrectCount, 0),
      totalUnanswered: students.reduce((s, p) => s + p.unansweredCount, 0),
      scoreDistribution,
    },
    insights: {
      strongestQuestion: strongest
        ? {
            number: strongest.number,
            text: strongest.text.slice(0, 120),
            correctPercent: strongest.correctPercent,
          }
        : null,
      weakestQuestion: weakest
        ? {
            number: weakest.number,
            text: weakest.text.slice(0, 120),
            correctPercent: weakest.correctPercent,
          }
        : null,
      fastestQuestion: fastest
        ? {
            number: fastest.number,
            text: fastest.text.slice(0, 120),
            averageTimeMs: fastest.averageTimeMs!,
          }
        : null,
      slowestQuestion: slowest
        ? {
            number: slowest.number,
            text: slowest.text.slice(0, 120),
            averageTimeMs: slowest.averageTimeMs!,
          }
        : null,
    },
    students,
    questionAnalysis,
    learningAnalytics: {
      byTopic: groupStats((q) => q.topic).map((g) => ({
        topic: g.key,
        questions: g.questions,
        correctPercent: g.correctPercent,
        averageTimeMs: g.averageTimeMs,
      })),
      byBloom: groupStats((q) => q.bloomLevel || 'L2').map((g) => ({
        level: g.key,
        questions: g.questions,
        correctPercent: g.correctPercent,
        averageTimeMs: g.averageTimeMs,
      })),
      byDifficulty: groupStats((q) => q.difficulty || 'medium').map((g) => ({
        difficulty: g.key,
        questions: g.questions,
        correctPercent: g.correctPercent,
        averageMarks: g.averageMarks,
        averageTimeMs: g.averageTimeMs,
      })),
    },
    security: {
      totalViolations,
      studentsFlagged: students.filter((s) => s.violationCount > 0).length,
      eventCount: session.events.length,
      cameraRequired: Boolean(settings.cameraRequired),
    },
    events: session.events.map((ev) => ({
      id: ev.id,
      eventType: ev.eventType,
      timestamp: ev.timestamp.toISOString(),
      participantId: ev.participantId,
      displayName: ev.participantId ? nameById.get(ev.participantId) || null : null,
      payload: (ev.payload || {}) as Record<string, unknown>,
    })),
  };
}

export async function buildCanonicalStudentReport(sessionId: string, participantId: string) {
  const [sessionReport, review] = await Promise.all([
    buildCanonicalSessionReport(sessionId),
    buildLiveParticipantReview(sessionId, participantId),
  ]);
  return { sessionReport, review };
}

export function reviewItemToExportRow(item: AttemptReviewItem, studentName: string) {
  return {
    student: studentName,
    questionNumber: item.questionNumber,
    question: item.questionText,
    type: item.questionType,
    marks: item.maxMarks,
    options: item.options.map((o) => o.text).join(' | '),
    studentAnswer:
      stringifyExportValue(item.selectedAnswer) ||
      (item.status === 'unanswered' ? 'Not answered' : ''),
    correctAnswer: stringifyExportValue(item.correctAnswer),
    status: item.status,
    marksAwarded: item.marksAwarded,
    explanation: item.explanation || '',
    timeTakenMs: item.timeTakenMs || 0,
    media: describeQuestionContentForExport({
      text: item.questionText,
      metadata: item.metadata || item.questionSnapshot?.metadata,
    }),
  };
}

export function resolveQuestionContentFromItem(item: AttemptReviewItem): CanonicalContent {
  const snap = item.questionSnapshot || parseQuestionSnapshot(null);
  const text = snap?.text || item.questionText;
  const metadata = snap?.metadata ?? item.metadata;
  return extractContent(text, metadata);
}
