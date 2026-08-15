import { Response } from "express";
import { z } from "zod";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { prisma } from "../utils/prisma.js";
import {
  createLiveSession,
  getSessionById,
  getSessionByRoomCode,
  joinSession,
  startSession,
  advanceQuestion,
  finishSession,
  getLiveAnalytics,
  buildSessionState,
  listHostSessions,
  listParticipantHistory,
  buildLeaderboard,
  getPlayerSessionView,
} from "../services/liveSession/liveSessionService.js";
import {
  formatAnswerResultPayload,
  resolveSessionPaceKind,
  routeLiveSubmit,
} from "../liveSession/liveAssessmentRouter.js";
import {
  createQuizRoom,
  updateQuizRoom,
  launchQuizRoom,
  deleteQuizRoom,
  duplicateQuizRoom,
  listQuizRooms,
  getQuizRoomPreview,
  listInstructorQuestionBank,
  listQuizRoomReports,
  listQuizRoomTemplates,
  createQuizRoomTemplate,
  deleteQuizRoomTemplate,
  getQuizRoomPreferences,
  saveQuizRoomPreferences,
  lookupByCodeOrPin,
} from "../services/liveSession/quizRoomService.js";
import { LIVE_SESSION_TYPES, QUIZ_ROOM_SOURCE_TYPES } from "../services/liveSession/types.js";
import {
  buildCanonicalSessionReport,
} from "../services/quizReporting/sessionReportService.js";
import {
  buildLiveParticipantReview,
  buildQuestionResponseDistribution,
} from "../services/quizReporting/attemptReviewService.js";
import { assertHostOrAdmin } from "../services/liveSession/liveSessionAccessService.js";
import {
  broadcastToLiveSession,
  refreshLiveSessionState,
} from "../ws/liveSessionServer.js";

function isFinishResult(result: unknown): result is { finalLeaderboard: unknown; sessionId: string } {
  return typeof result === "object" && result !== null && "finalLeaderboard" in result;
}

const settingsSchema = z
  .object({
    questionTimerSeconds: z.number().int().min(5).max(300).optional(),
    breakBetweenQuestionsSeconds: z.number().int().min(0).max(120).optional(),
    randomizeQuestions: z.boolean().optional(),
    randomizeOptions: z.boolean().optional(),
    negativeMarking: z.boolean().optional(),
    multipleAttempts: z.boolean().optional(),
    showLeaderboard: z.boolean().optional(),
    anonymousMode: z.boolean().optional(),
    teamMode: z.boolean().optional(),
    autoNextQuestion: z.boolean().optional(),
    showExplanations: z.boolean().optional(),
    showCorrectAnswer: z.boolean().optional(),
    lockLateJoin: z.boolean().optional(),
    allowRejoin: z.boolean().optional(),
    requireLogin: z.boolean().optional(),
    guestMode: z.boolean().optional(),
    maxPlayers: z.number().int().min(2).max(500).optional(),
    roomPassword: z.string().max(32).optional(),
    musicEnabled: z.boolean().optional(),
    musicVolume: z.number().optional(),
    musicLoop: z.boolean().optional(),
    musicShuffle: z.boolean().optional(),
    currentTrackIndex: z.number().optional(),
    musicPlaying: z.boolean().optional(),
    selectedTrack: z.object({ id: z.string(), name: z.string(), url: z.string() }).nullable().optional(),
    uploadedTrack: z.object({ id: z.string(), name: z.string(), url: z.string() }).nullable().optional(),
    playlist: z.array(z.object({ name: z.string(), url: z.string(), duration: z.number().optional() })).optional(),
    eventTracks: z.record(z.string()).optional(),
    cameraRequired: z.boolean().optional(),
    browserLock: z.boolean().optional(),
    fullscreenLock: z.boolean().optional(),
    tabDetection: z.boolean().optional(),
  })
  .optional();

const createSessionSchema = z.object({
  quizId: z.string().min(1),
  title: z.string().min(1).optional(),
  sessionType: z.enum(LIVE_SESSION_TYPES as unknown as [string, ...string[]]).optional(),
  sourceType: z.enum(QUIZ_ROOM_SOURCE_TYPES as unknown as [string, ...string[]]).optional(),
  courseId: z.string().optional(),
  lectureId: z.string().optional(),
  learningUniverseId: z.string().optional(),
  settings: settingsSchema,
  scheduledAt: z.string().datetime().optional().nullable(),
  asDraft: z.boolean().optional(),
});

const updateSessionSchema = z.object({
  title: z.string().min(1).optional(),
  sessionType: z.enum(LIVE_SESSION_TYPES as unknown as [string, ...string[]]).optional(),
  sourceType: z.enum(QUIZ_ROOM_SOURCE_TYPES as unknown as [string, ...string[]]).optional(),
  quizId: z.string().min(1).optional(),
  courseId: z.string().nullable().optional(),
  lectureId: z.string().nullable().optional(),
  learningUniverseId: z.string().nullable().optional(),
  settings: settingsSchema,
  scheduledAt: z.string().datetime().optional().nullable(),
});

const templateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sessionType: z.enum(LIVE_SESSION_TYPES as unknown as [string, ...string[]]).optional(),
  sourceType: z.enum(QUIZ_ROOM_SOURCE_TYPES as unknown as [string, ...string[]]).optional(),
  settings: settingsSchema,
});

const joinSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatar: z.string().optional(),
  avatarCategory: z.string().optional(),
});

export async function create(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = createSessionSchema.parse(req.body);
  const session = await createQuizRoom(req.user.id, req.user.role, data);
  res.status(201).json({ success: true, data: session });
}

export async function update(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = updateSessionSchema.parse(req.body);
  const session = await updateQuizRoom(req.params.id, req.user.id, req.user.role, data);
  res.json({ success: true, data: session });
}

export async function launch(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const session = await launchQuizRoom(req.params.id, req.user.id, req.user.role);
  res.json({ success: true, data: session });
}

export async function remove(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const result = await deleteQuizRoom(req.params.id, req.user.id, req.user.role);
  res.json({ success: true, data: result });
}

export async function duplicate(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const asDraft = req.body?.asDraft !== false;
  const session = await duplicateQuizRoom(req.params.id, req.user.id, req.user.role, asDraft);
  res.status(201).json({ success: true, data: session });
}

export async function preview(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const quizId = req.query.quizId as string;
  if (!quizId) throw new AppError(400, "quizId is required");
  const previewData = await getQuizRoomPreview(quizId, req.user.id, req.user.role);
  res.json({ success: true, data: previewData });
}

export async function questionBank(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const items = await listInstructorQuestionBank(req.user.id);
  res.json({ success: true, data: items });
}

export async function reports(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await listQuizRoomReports(req.user.id);
  res.json({ success: true, data });
}

export async function templates(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await listQuizRoomTemplates(req.user.id);
  res.json({ success: true, data });
}

export async function createTemplate(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = templateSchema.parse(req.body);
  const template = await createQuizRoomTemplate(req.user.id, data);
  res.status(201).json({ success: true, data: template });
}

export async function removeTemplate(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const result = await deleteQuizRoomTemplate(req.params.templateId, req.user.id);
  res.json({ success: true, data: result });
}

export async function getPreferences(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const defaults = await getQuizRoomPreferences(req.user.id);
  res.json({ success: true, data: defaults });
}

export async function savePreferences(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = z.record(z.unknown()).parse(req.body);
  const saved = await saveQuizRoomPreferences(req.user.id, body as Partial<import("../services/liveSession/types.js").LiveSessionSettings>);
  res.json({ success: true, data: saved.defaults });
}

export async function getOne(req: AuthRequest, res: Response) {
  const session = await getSessionById(req.params.id);
  res.json({ success: true, data: session });
}

export async function getByRoomCode(req: AuthRequest, res: Response) {
  const session = await getSessionByRoomCode(req.params.code);
  res.json({ success: true, data: session });
}

export async function join(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { displayName, avatar, avatarCategory } = joinSchema.parse(req.body);
  const participant = await joinSession(req.params.id, req.user.id, req.user.role, displayName, avatar, avatarCategory);
  res.json({ success: true, data: participant });
}

export async function start(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const session = await startSession(req.params.id, req.user.id, req.user.role);
  await refreshLiveSessionState(req.params.id);
  broadcastToLiveSession(req.params.id, { type: "session_started" });
  res.json({ success: true, data: session });
}

export async function nextQuestion(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const result = await advanceQuestion(req.params.id, req.user.id, req.user.role);
  await refreshLiveSessionState(req.params.id);
  if (isFinishResult(result)) {
    broadcastToLiveSession(req.params.id, {
      type: "session_finished",
      leaderboard: result.finalLeaderboard,
    });
  } else {
    broadcastToLiveSession(req.params.id, { type: "question_advanced" });
  }
  res.json({ success: true, data: result });
}

export async function finish(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const result = await finishSession(req.params.id, req.user.id, req.user.role);
  await refreshLiveSessionState(req.params.id);
  broadcastToLiveSession(req.params.id, {
    type: "session_finished",
    leaderboard: result.finalLeaderboard,
  });
  res.json({ success: true, data: result });
}

export async function analytics(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await getLiveAnalytics(req.params.id, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function state(req: AuthRequest, res: Response) {
  const sessionState = await buildSessionState(req.params.id);
  res.json({ success: true, data: sessionState });
}

const submitAnswerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.unknown(),
});

export async function playerView(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await getPlayerSessionView(req.params.id, req.user.id);
  res.json({ success: true, data });
}

export async function submitAnswer(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { questionId, answer } = submitAnswerSchema.parse(req.body);
  const sessionId = req.params.id;

  const participant = await prisma.liveParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId: req.user.id } },
  });
  if (!participant) throw new AppError(403, "You are not a participant in this session");

  const { transition } = await routeLiveSubmit(
    sessionId,
    participant.id,
    req.user.id,
    questionId,
    answer
  );
  const resultPayload = formatAnswerResultPayload(transition.payload);
  const leaderboard = await buildLeaderboard(sessionId);

  broadcastToLiveSession(sessionId, {
    type: "answer_received",
    participantId: participant.id,
    questionId,
  });
  broadcastToLiveSession(sessionId, { type: "leaderboard", rankings: leaderboard });

  const paceKind = await resolveSessionPaceKind(sessionId);
  if (paceKind !== "self_paced") {
    await refreshLiveSessionState(sessionId);
  }

  res.json({
    success: true,
    data: resultPayload ?? {},
  });
}

export async function mySessions(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const status = req.query.status as string | undefined;
  const sourceType = req.query.sourceType as string | undefined;
  const sessions = await listQuizRooms(req.user.id, { status, sourceType });
  res.json({ success: true, data: sessions });
}

export async function myHistory(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const history = await listParticipantHistory(req.user.id);
  res.json({ success: true, data: history });
}

export async function lookupByCode(req: AuthRequest, res: Response) {
  const session = await lookupByCodeOrPin(req.params.code);
  res.json({
    success: true,
    data: {
      id: session.id,
      roomCode: session.roomCode,
      pin: session.pin,
      title: session.title,
      status: session.status,
      sessionType: session.sessionType,
      participantCount: session._count.participants,
      questionCount: session.quiz.questions.length,
      hostName: `${session.host.firstName} ${session.host.lastName}`,
    },
  });
}

/** @deprecated use create with createQuizRoom */
export async function createLegacy(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = createSessionSchema.parse(req.body);
  const session = await createLiveSession(req.user.id, req.user.role, data);
  res.status(201).json({ success: true, data: session });
}

export async function exportCsv(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const sessionId = req.params.id;
  await assertHostOrAdmin(req.user.id, req.user.role, sessionId);
  const report = await buildCanonicalSessionReport(sessionId);
  const { formatFullSessionReportCsv, sanitizeReportFilename } = await import(
    "../services/quizReporting/sessionReportExports.js"
  );
  // Always return a well-formed CSV (empty sessions get an explicit "No attempts yet" body).
  const csvContent = await formatFullSessionReportCsv(sessionId);
  const filename = sanitizeReportFilename(
    `${report.quiz.title || "Quiz"}_${report.session.roomCode || "Report"}`,
    "csv"
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(csvContent);
}

export async function exportExcel(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const sessionId = req.params.id;
  await assertHostOrAdmin(req.user.id, req.user.role, sessionId);
  const report = await buildCanonicalSessionReport(sessionId);
  const { formatDetailedExcel, formatSessionReportExcel, sanitizeReportFilename } = await import(
    "../services/quizReporting/sessionReportExports.js"
  );
  // Prefer detailed workbook when students exist; otherwise summary sheets only.
  // Always exports the ENTIRE authorized dataset (not a UI page).
  const buffer =
    report.students.length > 0
      ? await formatDetailedExcel(sessionId)
      : formatSessionReportExcel(report);
  const filename = sanitizeReportFilename(
    `${report.quiz.title || "Quiz"}_${report.session.roomCode || "Report"}`,
    "xlsx"
  );
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
}

export async function exportPdf(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const sessionId = req.params.id;
  await assertHostOrAdmin(req.user.id, req.user.role, sessionId);
  const report = await buildCanonicalSessionReport(sessionId);
  const { renderSessionReportPdf, buildSessionReportHtml, sanitizeReportFilename } = await import(
    "../services/quizReporting/sessionReportExports.js"
  );
  const filename = sanitizeReportFilename(
    `${report.quiz.title || "Quiz"}_${report.session.roomCode || "Report"}`,
    "pdf"
  );

  try {
    const pdf = await renderSessionReportPdf(report);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(pdf);
  } catch (err) {
    // Fallback: printable HTML if Chromium/puppeteer unavailable
    const html = buildSessionReportHtml(report);
    const fallback = html.replace(
      "</body>",
      `<script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body>`
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(fallback);
  }
}

/** @deprecated legacy Excel builder kept unused — replaced by canonical exports */

export async function replayData(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const sessionId = req.params.id;
  await assertHostOrAdmin(req.user.id, req.user.role, sessionId);

  const report = await buildCanonicalSessionReport(sessionId);

  // Backward-compatible payload for existing instructor page + richer canonical block
  const participants = report.students.map((s) => ({
    id: s.participantId,
    participantId: s.participantId,
    displayName: s.displayName,
    email: s.email,
    user: s.email ? { email: s.email, id: s.userId } : null,
    userId: s.userId,
    score: s.livePoints,
    academicScore: s.academicScore,
    maxScore: s.maxScore,
    percentage: s.percentage,
    accuracy: s.accuracy,
    correctCount: s.correctCount,
    wrongCount: s.incorrectCount,
    unansweredCount: s.unansweredCount,
    timeTakenMs: s.timeTakenMs,
    status: s.status,
    rank: s.rank,
    finishedAt: s.finishedAt,
    quizAttemptId: s.attemptId,
    violationCount: s.violationCount,
    xp: 0,
    coins: 0,
    lives: 3,
  }));

  const questionStats = report.questionAnalysis.map((q) => ({
    questionId: q.questionId,
    text: q.text,
    type: q.type,
    marks: q.marks,
    difficulty: q.difficulty || "medium",
    answered: q.answered,
    unanswered: q.unanswered,
    correct: q.correct,
    incorrect: q.incorrect,
    correctPercent: q.correctPercent,
    incorrectPercent: q.incorrectPercent,
    unansweredPercent: q.unansweredPercent,
    averageTimeMs: q.averageTimeMs,
    averageMarks: q.averageMarks,
    optionDistribution: q.optionDistribution,
    content: q.content,
    topic: q.topic,
    bloomLevel: q.bloomLevel,
  }));

  res.json({
    success: true,
    data: {
      report, // canonical model
      summary: report.summary,
      insights: report.insights,
      learningAnalytics: report.learningAnalytics,
      security: report.security,
      questionStats,
      session: {
        id: report.session.id,
        title: report.session.title || report.quiz.title,
        status: report.session.status,
        roomCode: report.session.roomCode,
        createdAt: report.session.createdAt,
        startedAt: report.session.startedAt,
        endedAt: report.session.endedAt,
        hostedAt: report.session.hostedAt,
        questionCount: report.summary.totalQuestions,
        totalMarks: report.summary.totalMarks,
        instructorName: report.quiz.instructorName,
        questions: report.questionAnalysis.map((q) => ({
          id: q.questionId,
          text: q.text,
          order: q.number - 1,
          marks: q.marks,
          difficulty: q.difficulty || "medium",
          bloomLevel: q.bloomLevel || "L2",
          type: q.type,
          options: q.options,
          metadata: {
            topic: q.topic,
            imageUrls: q.content.imageUrls,
            videoUrls: q.content.videoUrls,
            formulas: q.content.formulas,
            codeBlocks: q.content.codeBlocks,
            tables: q.content.tables,
          },
        })),
      },
      participants,
      events: report.events.map((ev) => ({
        id: ev.id,
        type: ev.eventType,
        eventType: ev.eventType,
        timestamp: ev.timestamp,
        participantId: ev.participantId,
        displayName: ev.displayName,
        payload: ev.payload,
        metadata: ev.payload,
        participant: ev.displayName ? { displayName: ev.displayName } : null,
      })),
    },
  });
}

export async function listSessionStudents(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const sessionId = req.params.id;
  await assertHostOrAdmin(req.user.id, req.user.role, sessionId);
  const data = await buildSessionStudentsPayload(sessionId);
  res.json({ success: true, data: { students: data.participants, summary: data.summary } });
}

export async function getParticipantAttemptReview(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const sessionId = req.params.id;
  const participantId = req.params.participantId;
  await assertHostOrAdmin(req.user.id, req.user.role, sessionId);
  const review = await buildLiveParticipantReview(sessionId, participantId);
  res.json({ success: true, data: review });
}

export async function getQuestionResponses(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const sessionId = req.params.id;
  const questionId = req.params.questionId;
  await assertHostOrAdmin(req.user.id, req.user.role, sessionId);
  const data = await buildQuestionResponseDistribution(sessionId, questionId);
  res.json({ success: true, data });
}

/** Internal helper shared by listSessionStudents */
async function buildSessionStudentsPayload(sessionId: string) {
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: { include: { questions: true } },
      participants: {
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      },
      answers: true,
    },
  });
  if (!session) throw new AppError(404, "Session not found");
  const questionCount = session.quiz.questions.length;
  const participants = session.participants.map((p) => {
    const pAnswers = session.answers.filter((a) => a.participantId === p.id);
    const correctCount = p.correctCount || pAnswers.filter((a) => a.isCorrect).length;
    const wrongCount = p.wrongCount || pAnswers.filter((a) => !a.isCorrect).length;
    return {
      id: p.id,
      participantId: p.id,
      displayName: p.displayName,
      email: p.user?.email || null,
      user: p.user,
      score: p.score,
      academicScore: pAnswers.reduce((s, a) => {
        if (!a.isCorrect) return s;
        const q = session.quiz.questions.find((qq) => qq.id === a.questionId);
        return s + (q?.marks || 0);
      }, 0),
      maxScore: session.quiz.totalMarks || questionCount,
      accuracy: Math.round(p.accuracy || 0),
      correctCount,
      wrongCount,
      unansweredCount: Math.max(0, questionCount - pAnswers.length),
      timeTakenMs: pAnswers.reduce((s, a) => s + (a.responseTimeMs || 0), 0),
      status: p.status,
      rank: p.rank,
      finishedAt: p.finishedAt,
      quizAttemptId: p.quizAttemptId,
    };
  });
  const scores = participants.map((p) => p.academicScore);
  return {
    participants,
    summary: {
      totalParticipants: participants.length,
      completed: participants.filter((p) => p.finishedAt || p.status === "submitted").length,
      averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      averageAccuracy:
        participants.length > 0
          ? Math.round(participants.reduce((s, p) => s + p.accuracy, 0) / participants.length)
          : 0,
      highestScore: scores.length ? Math.max(...scores) : 0,
      lowestScore: scores.length ? Math.min(...scores) : 0,
      questionCount,
    },
  };
}

export async function getReview(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const sessionId = req.params.id;

  const participant = await prisma.liveParticipant.findFirst({
    where: { sessionId, userId: req.user.id }
  });
  if (!participant) throw new AppError(404, "You did not participate in this session");

  // Authoritative review from LiveAnswer (+ snapshots)
  const review = await buildLiveParticipantReview(sessionId, participant.id);

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            include: { options: true }
          }
        }
      },
      answers: {
        where: { participantId: participant.id }
      }
    }
  });
  if (!session) throw new AppError(404, "Session not found");

  const classTimes = await prisma.liveAnswer.groupBy({
    by: ["questionId"],
    where: { sessionId },
    _avg: { responseTimeMs: true }
  });

  const reviewItems = session.quiz.questions.map((q) => {
    const studentAnswer = session.answers.find((a) => a.questionId === q.id);
    const avgTime = classTimes.find((c) => c.questionId === q.id)?._avg?.responseTimeMs || 0;
    const dtoItem = review.questions.find((i) => i.questionId === q.id);
    
    return {
      questionId: q.id,
      questionNumber: dtoItem?.questionNumber,
      text: dtoItem?.questionText || q.text,
      type: dtoItem?.questionType || q.type,
      difficulty: dtoItem?.difficulty || q.difficulty,
      topic: (q as any).topic || null,
      marks: dtoItem?.maxMarks ?? q.marks,
      negativeMarks: q.negativeMarks,
      explanation: dtoItem?.explanation ?? q.explanation,
      hint: q.hint,
      referenceLinks: q.referenceLinks,
      bloomLevel: dtoItem?.bloomLevel || q.bloomLevel,
      status: dtoItem?.status,
      averageClassTimeMs: avgTime,
      options: (dtoItem?.options || q.options).map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        order: o.order,
      })),
      correctAnswer: dtoItem?.correctAnswer,
      selectedAnswer: dtoItem?.selectedAnswer,
      selectedOptionIds: dtoItem?.selectedOptionIds,
      correctOptionIds: dtoItem?.correctOptionIds,
      studentAnswer: studentAnswer
        ? {
            answer: dtoItem?.selectedAnswer ?? studentAnswer.answer,
            isCorrect: studentAnswer.isCorrect,
            pointsEarned: studentAnswer.pointsEarned,
            marksAwarded: dtoItem?.marksAwarded ?? studentAnswer.marksEarned,
            maxMarks: dtoItem?.maxMarks ?? q.marks,
            xpEarned: studentAnswer.xpEarned,
            responseTimeMs: studentAnswer.responseTimeMs,
            answeredAt: studentAnswer.answeredAt,
            status: dtoItem?.status,
          }
        : null,
    };
  });

  res.json({ success: true, data: reviewItems, review });
}

export async function validateQuiz(req: AuthRequest, res: Response) {
  const { id: sessionId } = req.params;
  const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { quizId: true } });
  if (!session) throw new AppError(404, "Session not found");

  const { validateQuizForLive } = await import("../services/liveSession/liveQuizValidation.js");
  const quiz = await prisma.quiz.findUnique({
    where: { id: session.quizId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");

  const result = validateQuizForLive(quiz.questions);
  res.json({ success: true, data: result });
}

export async function autoFixQuiz(req: AuthRequest, res: Response) {
  const { id: sessionId } = req.params;
  const session = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { quizId: true } });
  if (!session) throw new AppError(404, "Session not found");

  const { autoFixQuizForLive } = await import("../services/liveSession/liveQuizValidation.js");
  const result = await autoFixQuizForLive(session.quizId);
  res.json({ success: true, data: result });
}

const DEFAULT_MUSIC_LIBRARY = [
  {
    id: "default-calm",
    name: "Calm Piano.mp3",
    title: "Calm Piano.mp3",
    category: "Calm",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    duration: 372,
  },
  {
    id: "default-energetic",
    name: "Energetic Techno.mp3",
    title: "Energetic Techno.mp3",
    category: "Energetic",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    duration: 423,
  },
  {
    id: "default-epic",
    name: "Epic Cinematic.mp3",
    title: "Epic Cinematic.mp3",
    category: "Epic",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    duration: 344,
  },
  {
    id: "default-focus",
    name: "Focus Ambient.mp3",
    title: "Focus Ambient.mp3",
    category: "Focus",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    duration: 302,
  },
  {
    id: "default-happy",
    name: "Happy Ukulele.mp3",
    title: "Happy Ukulele.mp3",
    category: "Happy",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    duration: 362,
  },
  {
    id: "default-kids",
    name: "Kids Fun Playground.mp3",
    title: "Kids Fun Playground.mp3",
    category: "Kids",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    duration: 502,
  },
  {
    id: "default-science",
    name: "Sci-Fi Discovery.mp3",
    title: "Sci-Fi Discovery.mp3",
    category: "Science",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
    duration: 418,
  },
  {
    id: "default-technology",
    name: "Technology Waves.mp3",
    title: "Technology Waves.mp3",
    category: "Technology",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    duration: 318,
  },
  {
    id: "default-victory",
    name: "Victory Fanfare.mp3",
    title: "Victory Fanfare.mp3",
    category: "Victory",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
    duration: 544,
  },
  {
    id: "default-countdown",
    name: "Tension Countdown.mp3",
    title: "Tension Countdown.mp3",
    category: "Countdown",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
    duration: 489,
  },
  {
    id: "default-suspense",
    name: "Suspense Thriller.mp3",
    title: "Suspense Thriller.mp3",
    category: "Suspense",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3",
    duration: 402,
  },
  {
    id: "default-relax",
    name: "Relax Chill Lounge.mp3",
    title: "Relax Chill Lounge.mp3",
    category: "Relax",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3",
    preview: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3",
    duration: 395,
  }
];

export async function listMusic(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const tracks = await prisma.musicTrack.findMany({
    where: { uploaderId: req.user.id },
    orderBy: { uploadDate: "desc" },
  });
  const mapped = tracks.map((track) => ({
    id: track.id,
    name: track.filename,
    title: track.filename,
    filename: track.filename,
    duration: track.duration,
    url: `/uploads/${track.storageKey}`,
    size: track.size,
    mimeType: track.mimeType,
    checksum: track.checksum,
    storageKey: track.storageKey,
  }));
  res.json({ success: true, tracks: mapped });
}

export async function listDefaultMusic(req: AuthRequest, res: Response) {
  const mapped = DEFAULT_MUSIC_LIBRARY.map((track) => ({
    ...track,
    title: track.name,
    filename: track.name,
  }));
  res.json({ success: true, tracks: mapped });
}

export async function uploadMusic(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (!req.file) {
    throw new AppError(400, "No audio file uploaded");
  }

  const uploadDir = process.env.UPLOAD_DIR || "uploads";
  const musicDir = path.join(process.cwd(), uploadDir, "music");
  if (!fs.existsSync(musicDir)) {
    fs.mkdirSync(musicDir, { recursive: true });
  }

  const filename = req.file.filename;
  const targetPath = path.join(musicDir, filename);

  try {
    await fs.promises.rename(req.file.path, targetPath);
  } catch (err) {
    await fs.promises.copyFile(req.file.path, targetPath);
    await fs.promises.unlink(req.file.path);
  }

  const checksum = await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(targetPath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });

  const { persistAtPublicRelative } = await import("../middlewares/persistUpload.js");
  await persistAtPublicRelative(targetPath, `music/${filename}`, req.file.mimetype);

  const queryDuration = req.query.duration || req.body.duration;
  const duration = queryDuration ? parseFloat(String(queryDuration)) : 180;

  const track = await prisma.musicTrack.create({
    data: {
      filename: req.file.originalname,
      duration,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploaderId: req.user.id,
      checksum,
      storageKey: `music/${filename}`,
    },
  });

  const mapped = {
    id: track.id,
    name: track.filename,
    title: track.filename,
    filename: track.filename,
    duration: track.duration,
    url: `/uploads/${track.storageKey}`,
    size: track.size,
    mimeType: track.mimeType,
    checksum: track.checksum,
    storageKey: track.storageKey,
  };

  res.status(201).json({ success: true, track: mapped });
}

export async function deleteMusic(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const trackId = req.params.id;

  const track = await prisma.musicTrack.findUnique({
    where: { id: trackId },
  });

  if (!track) {
    throw new AppError(404, "Music track not found");
  }

  if (track.uploaderId !== req.user.id && req.user.role !== "admin") {
    throw new AppError(403, "Forbidden");
  }

  const uploadDir = process.env.UPLOAD_DIR || "uploads";
  const filePath = path.join(process.cwd(), uploadDir, track.storageKey);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath).catch(() => {});
  }

  await prisma.musicTrack.delete({
    where: { id: trackId },
  });

  res.json({ success: true });
}


