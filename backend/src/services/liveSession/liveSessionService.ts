import crypto from "crypto";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { gradeAnswer, calculateLivePoints } from "../quizGradingService.js";
import {
  DEFAULT_LIVE_SESSION_SETTINGS,
  type LiveSessionSettings,
  type LeaderboardEntry,
  type QuestionForClient,
  type LiveSessionState,
} from "./types.js";
import { assertCanJoinSession, assertHostOrAdmin, assertQuizHostAccess } from "./liveSessionAccessService.js";
import { assertQuizReadyForLive } from "./liveQuizValidation.js";
import { isSelfPaced, resolvePaceMode } from "./paceMode.js";
import {
  initLateJoinParticipant,
  initParticipantForSelfPaced,
  submitSelfPacedAnswer,
} from "./selfPacedProgression.js";
import { extractQuizBrandingFromMetadata } from "../../utils/quizBranding.js";
import { publishAttemptCompleted } from "../quizAnalyticsPipeline.js";
import { buildQuestionSnapshot } from "../quizReporting/questionSnapshot.js";
import { buildAttemptResultsFromLiveAnswers } from "../quizReporting/attemptReviewService.js";

const ROOM_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[bytes[i]! % ROOM_CODE_CHARS.length];
  }
  return code;
}

async function uniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode();
    const existing = await prisma.liveSession.findUnique({ where: { roomCode: code } });
    if (!existing) return code;
  }
  throw new AppError(500, "Failed to generate room code");
}

async function uniquePin(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const pin = String(crypto.randomInt(1000, 10000));
    const existing = await prisma.liveSession.findFirst({
      where: { pin, status: { in: ["lobby", "active", "scheduled"] } },
    });
    if (!existing) return pin;
  }
  throw new AppError(500, "Failed to generate PIN");
}

function parseSettings(raw: unknown): LiveSessionSettings {
  const merged = { ...DEFAULT_LIVE_SESSION_SETTINGS, ...(raw as Partial<LiveSessionSettings>) };
  if (!merged.paceMode) {
    merged.paceMode = merged.autoNextQuestion ? "self_paced" : "self_paced";
  }
  if (!merged.questionTimerSeconds || merged.questionTimerSeconds < 5) {
    merged.questionTimerSeconds = DEFAULT_LIVE_SESSION_SETTINGS.questionTimerSeconds;
  }
  if (!merged.scoring) {
    merged.scoring = DEFAULT_LIVE_SESSION_SETTINGS.scoring;
  }
  return merged;
}

function optionDisplayText(text: string, index: number, questionType: string): string {
  const trimmed = text?.trim();
  if (trimmed) return trimmed;
  if (questionType === "true_false") {
    return index === 0 ? "True" : "False";
  }
  return `Option ${String.fromCharCode(65 + index)}`;
}

function questionDisplayText(text: string, order: number): string {
  const trimmed = text?.trim();
  if (trimmed) return trimmed;
  return `Question ${order + 1}`;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

type SessionQuestion = {
  id: string;
  text: string;
  type: string;
  marks: number;
  negativeMarks: number;
  hint?: string | null;
  referenceLinks?: string | null;
  bloomLevel?: string | null;
  order: number;
  explanation?: string | null;
  metadata?: unknown;
  options: Array<{ id: string; text: string; order: number; isCorrect: boolean }>;
};

function sortQuestionsByOrder(questions: SessionQuestion[]): SessionQuestion[] {
  return [...questions].sort((a, b) => a.order - b.order);
}

function resolveQuestionOrder(settings: LiveSessionSettings, questions: SessionQuestion[]): string[] {
  const sortedIds = sortQuestionsByOrder(questions).map((q) => q.id);
  if (settings.questionOrder?.length === sortedIds.length) {
    const valid = settings.questionOrder.every((id) => sortedIds.includes(id));
    if (valid) return settings.questionOrder;
  }
  return sortedIds;
}

function getQuestionByIndex(
  settings: LiveSessionSettings,
  questions: SessionQuestion[],
  index: number
): SessionQuestion | null {
  const order = resolveQuestionOrder(settings, questions);
  const questionId = order[index];
  if (!questionId) return null;
  return questions.find((q) => q.id === questionId) ?? null;
}

function applyOptionOrder<T extends { id: string }>(options: T[], optionOrder?: string[]): T[] {
  if (!optionOrder?.length) return options;
  const byId = new Map(options.map((o) => [o.id, o]));
  const ordered = optionOrder.map((id) => byId.get(id)).filter(Boolean) as T[];
  return ordered.length === options.length ? ordered : options;
}

function freezeSessionQuestionOrders(
  settings: LiveSessionSettings,
  questions: SessionQuestion[]
): LiveSessionSettings {
  const sorted = sortQuestionsByOrder(questions);
  let questionOrder = sorted.map((q) => q.id);
  if (settings.randomizeQuestions) {
    questionOrder = shuffleArray(questionOrder);
  }

  const optionOrders: Record<string, string[]> = {};
  if (settings.randomizeOptions) {
    for (const q of sorted) {
      optionOrders[q.id] = shuffleArray(q.options.map((o) => o.id));
    }
  }

  return {
    ...settings,
    questionOrder,
    ...(Object.keys(optionOrders).length > 0 ? { optionOrders } : {}),
  };
}

function stripCorrectAnswers(question: SessionQuestion): QuestionForClient {
  const options = question.options.map(({ id, text, order }, index) => ({
    id,
    text: optionDisplayText(text, index, question.type),
    order,
  }));
  return {
    id: question.id,
    text: questionDisplayText(question.text, question.order),
    type: question.type,
    marks: question.marks,
    order: question.order,
    metadata: question.metadata ?? null,
    options,
  };
}

function questionForClient(
  question: SessionQuestion,
  settings: LiveSessionSettings
): QuestionForClient {
  const base = stripCorrectAnswers(question);
  return {
    ...base,
    options: applyOptionOrder(base.options, settings.optionOrders?.[question.id]),
  };
}

export async function createLiveSession(
  hostUserId: string,
  role: string,
  data: {
    quizId: string;
    title?: string;
    sessionType?: string;
    courseId?: string;
    lectureId?: string;
    learningUniverseId?: string;
    settings?: Partial<LiveSessionSettings>;
  }
) {
  await assertQuizHostAccess(hostUserId, role, data.quizId);

  const quiz = await prisma.quiz.findUnique({
    where: { id: data.quizId },
    include: { questions: { select: { id: true } } },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");
  if (quiz.questions.length === 0) throw new AppError(400, "Quiz has no questions");

  const roomCode = await uniqueRoomCode();
  const pin = await uniquePin();
  const settings = { ...DEFAULT_LIVE_SESSION_SETTINGS, ...data.settings };

  const session = await prisma.liveSession.create({
    data: {
      roomCode,
      pin,
      title: data.title || quiz.title,
      sessionType: data.sessionType || "live_classroom",
      quizId: data.quizId,
      hostUserId,
      courseId: data.courseId,
      lectureId: data.lectureId,
      learningUniverseId: data.learningUniverseId,
      settings,
      cameraEnabled: settings.cameraRequired ?? false,
    },
    include: {
      quiz: { select: { id: true, title: true, totalMarks: true } },
      host: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await prisma.sessionAnalytics.create({ data: { sessionId: session.id } });

  return session;
}

export async function getSessionById(sessionId: string) {
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: { orderBy: { order: "asc" } } },
          },
        },
      },
      host: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      participants: {
        include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true, profileImage: true } } },
        orderBy: { score: "desc" },
      },
    },
  });
  if (!session) throw new AppError(404, "Live session not found");
  return session;
}

export async function getSessionByRoomCode(roomCode: string) {
  const session = await prisma.liveSession.findUnique({
    where: { roomCode: roomCode.toUpperCase() },
    select: {
      id: true,
      roomCode: true,
      title: true,
      status: true,
      sessionType: true,
      hostUserId: true,
      courseId: true,
      settings: true,
      quiz: { select: { id: true, title: true, questions: { select: { id: true } } } },
      host: { select: { firstName: true, lastName: true } },
      _count: { select: { participants: true } },
    },
  });
  if (!session) throw new AppError(404, "Session not found. Check your room code.");
  return session;
}

export async function joinSession(
  sessionId: string,
  userId: string,
  role: string,
  displayName?: string,
  avatar?: string,
  avatarCategory?: string
) {
  const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, "Live session not found");
  if (session.status === "finished") throw new AppError(400, "This session has ended");

  await assertCanJoinSession(userId, role, session);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, avatar: true, profileImage: true },
  });

  const settings = parseSettings(session.settings);
  const name =
    displayName ||
    (settings.anonymousMode ? `Player ${userId.slice(-4).toUpperCase()}` : `${user?.firstName} ${user?.lastName}`.trim());

  const existing = await prisma.liveParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });

  if (existing) {
    if (!settings.allowRejoin && session.status !== "lobby") {
      throw new AppError(403, "Rejoin is not allowed for this session");
    }

    let status: string = "online";
    if (session.status === "active") {
      const fullSession = await prisma.liveSession.findUnique({
        where: { id: sessionId },
        include: {
          quiz: {
            include: {
              questions: {
                orderBy: { order: "asc" },
                include: { options: { orderBy: { order: "asc" } } },
              },
            },
          },
        },
      });
      if (fullSession) {
        const frozenSettings = parseSettings(fullSession.settings);
        const questionIndex = isSelfPaced(frozenSettings)
          ? existing.currentQuestionIndex
          : fullSession.currentQuestionIndex;
        if (questionIndex >= 0) {
          const activeQ = getQuestionByIndex(
            frozenSettings,
            fullSession.quiz.questions,
            questionIndex
          );
          if (activeQ) {
            const priorAnswer = await prisma.liveAnswer.findUnique({
              where: {
                sessionId_participantId_questionId: {
                  sessionId,
                  participantId: existing.id,
                  questionId: activeQ.id,
                },
              },
            });
            if (priorAnswer) status = "answered";
          }
        }
        if (existing.finishedAt) status = "submitted";
      }
    }

    await logSessionEvent(sessionId, "reconnect", existing.id, { userId });

    return prisma.liveParticipant.update({
      where: { id: existing.id },
      data: {
        status,
        lastSeenAt: new Date(),
        displayName: name,
        avatar: avatar || existing.avatar,
        avatarCategory: avatarCategory || existing.avatarCategory,
        ...(isSelfPaced(settings) &&
        session.status === "active" &&
        existing.currentQuestionIndex < 0
          ? { currentQuestionIndex: 0, questionStartedAt: new Date() }
          : {}),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true, profileImage: true } } },
    });
  }

  const avatarStyles: Record<string, string> = {
    professional: "avataaars",
    student: "adventurer",
    minimal: "initials",
    cartoon: "lorelei",
    fantasy: "personas",
    animals: "identicon",
    technology: "bottts",
    space: "pixel-art",
    gaming: "pixel-art",
    "anime-style": "micah",
    robots: "bottts-neutral",
    abstract: "shapes",
  };
  const categories = Object.keys(avatarStyles);
  const randomCategory = avatarCategory || categories[Math.floor(Math.random() * categories.length)]!;
  const style = avatarStyles[randomCategory] || "initials";
  const uniqueSeed = `seed_${userId}_${Math.floor(Math.random() * 1000)}`;
  const defaultAvatar = `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(uniqueSeed)}`;

  const created = await prisma.liveParticipant.create({
    data: {
      sessionId,
      userId,
      displayName: name,
      avatar: avatar || user?.profileImage || user?.avatar || defaultAvatar,
      avatarCategory: randomCategory,
      status: "online",
      ...(isSelfPaced(settings) && session.status === "active"
        ? { currentQuestionIndex: 0, questionStartedAt: new Date() }
        : {}),
    },
    include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true, profileImage: true } } },
  });

  await logSessionEvent(sessionId, "join", created.id, { userId, displayName: name });
  return created;
}

export async function startSession(sessionId: string, hostUserId: string, role: string) {
  await assertHostOrAdmin(hostUserId, role, sessionId);

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      participants: true,
      quiz: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!session) throw new AppError(404, "Live session not found");
  if (session.status === "finished") throw new AppError(400, "Session already finished");
  if (session.participants.length === 0) throw new AppError(400, "No participants have joined yet");

  await assertQuizReadyForLive(session.quizId);

  const settings = freezeSessionQuestionOrders(
    parseSettings(session.settings),
    session.quiz.questions
  );
  const now = new Date();

  if (isSelfPaced(settings)) {
    const activeSettings = {
      ...settings,
      musicPlaying: settings.musicEnabled ? true : false,
    };
    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        status: "active",
        startedAt: now,
        currentQuestionIndex: 0,
        questionStartedAt: now,
        settings: activeSettings as object,
      },
    });
    await initParticipantForSelfPaced(
      sessionId,
      session.participants.map((p) => p.id),
      now
    );
    await logSessionEvent(sessionId, "session_started", null, { paceKind: "self_paced" });
    return updated;
  }

  const updated = await prisma.liveSession.update({
    where: { id: sessionId },
    data: {
      status: "active",
      startedAt: new Date(),
      currentQuestionIndex: 0,
      questionStartedAt: new Date(),
      settings: settings as object,
    },
  });
  await logSessionEvent(sessionId, "session_started", null, { paceKind: "instructor_paced" });
  return updated;
}

export async function advanceQuestion(sessionId: string, hostUserId: string, role: string) {
  await assertHostOrAdmin(hostUserId, role, sessionId);

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!session) throw new AppError(404, "Live session not found");
  if (session.status !== "active") throw new AppError(400, "Session is not active");

  const settings = parseSettings(session.settings);
  const questionOrder = resolveQuestionOrder(settings, session.quiz.questions);
  const nextIndex = session.currentQuestionIndex + 1;
  if (nextIndex >= questionOrder.length) {
    return finishSession(sessionId, hostUserId, role);
  }

  const oldIndex = session.currentQuestionIndex;
  const updated = await prisma.liveSession.update({
    where: { id: sessionId },
    data: { currentQuestionIndex: nextIndex, questionStartedAt: new Date() },
  });

  console.log(`[NEXT QUESTION STAGE 3] advanceQuestion() updated index: ${oldIndex} -> ${nextIndex}`);

  await prisma.liveParticipant.updateMany({
    where: { sessionId, status: { in: ["answered", "thinking"] } },
    data: { status: "online" },
  });

  const nextQId = questionOrder[nextIndex];
  const nextQ = session.quiz.questions.find((q) => q.id === nextQId);

  await logSessionEvent(sessionId, "question_advanced", null, {
    questionIndex: nextIndex,
    questionText: nextQ ? nextQ.text : "",
  });

  return updated;
}

export interface LiveAnswerResultPayload {
  isCorrect: boolean;
  correctOptions: string[];
  pointsEarned: number;
  explanation: string | null;
  responseTimeMs: number;
  streak: number;
  xpEarned: number;
  totalScore: number;
  totalXp: number;
  rank: number;
}

async function buildLiveAnswerResultPayload(
  sessionId: string,
  participantId: string,
  question: { explanation: string | null },
  answer: { isCorrect: boolean; pointsEarned: number; responseTimeMs: number | null },
  settings: LiveSessionSettings,
  participant: { streak: number; score: number; xp: number },
  correctOptions: string[]
): Promise<LiveAnswerResultPayload> {
  const leaderboard = await buildLeaderboard(sessionId);
  const rank = leaderboard.find((e) => e.participantId === participantId)?.rank ?? 0;
  return {
    isCorrect: answer.isCorrect,
    correctOptions,
    pointsEarned: answer.pointsEarned,
    explanation: settings.showExplanations ? question.explanation : null,
    responseTimeMs: answer.responseTimeMs ?? 0,
    streak: participant.streak,
    xpEarned: 0,
    totalScore: participant.score,
    totalXp: participant.xp,
    rank,
  };
}


export async function logSessionEvent(
  sessionId: string,
  eventType: string,
  participantId?: string | null,
  payload: object = {}
) {
  return prisma.liveSessionEvent.create({
    data: {
      sessionId,
      participantId,
      eventType,
      payload: payload as any,
    },
  }).catch((err) => {
    console.error("Failed to log session event:", err);
  });
}

export async function submitLiveAnswer(
  sessionId: string,
  participantId: string,
  questionId: string,
  answer: unknown
) {
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!session) throw new AppError(404, "Live session not found");
  if (session.status !== "active") {
    const existingWhenFinished = await prisma.liveAnswer.findUnique({
      where: { sessionId_participantId_questionId: { sessionId, participantId, questionId } },
    });
    if (existingWhenFinished) {
      const settings = parseSettings(session.settings);
      const q = session.quiz.questions.find((x) => x.id === questionId);
      const participant = await prisma.liveParticipant.findUnique({ where: { id: participantId } });
      if (q && participant) {
        const { correctOptions } = gradeAnswer(q, existingWhenFinished.answer);
        return buildLiveAnswerResultPayload(
          sessionId,
          participantId,
          q,
          existingWhenFinished,
          settings,
          participant,
          correctOptions
        );
      }
    }
    throw new AppError(400, session.status === "finished" ? "Session has ended" : "Session is not active");
  }

  const participant = await prisma.liveParticipant.findUnique({ where: { id: participantId } });
  if (!participant || participant.sessionId !== sessionId) throw new AppError(403, "Invalid participant");

  const settings = parseSettings(session.settings);

  // V2 Lives check
  if (settings.lives && settings.lives > 0 && participant.lives <= 0) {
    throw new AppError(403, "You have run out of lives and are eliminated!");
  }

  if (isSelfPaced(settings)) {
    return submitSelfPacedAnswer(sessionId, participantId, questionId, answer, {
      settings,
      questions: session.quiz.questions,
      getQuestionByIndex,
      questionForClient,
      resolveQuestionOrder,
      buildLeaderboard,
    });
  }

  const questionIndex = session.currentQuestionIndex;
  const question = getQuestionByIndex(settings, session.quiz.questions, questionIndex);

  const existingAnswer = await prisma.liveAnswer.findUnique({
    where: { sessionId_participantId_questionId: { sessionId, participantId, questionId } },
  });

  if (existingAnswer && !settings.multipleAttempts) {
    const storedQ = session.quiz.questions.find((x) => x.id === questionId);
    if (storedQ) {
      const { correctOptions } = gradeAnswer(storedQ, existingAnswer.answer);
      return buildLiveAnswerResultPayload(
        sessionId,
        participantId,
        storedQ,
        existingAnswer,
        settings,
        participant,
        correctOptions
      );
    }
  }

  if (!question || question.id !== questionId) {
    throw new AppError(400, "This question is not currently active");
  }

  // V2 Powerup extraction from incoming answer structure
  let usedPowerup: string | undefined;
  let clientAnswer = answer;
  if (answer && typeof answer === "object" && "usedPowerup" in answer) {
    usedPowerup = (answer as any).usedPowerup;
    clientAnswer = (answer as any).answer;
  }

  const { isCorrect, correctOptions } = gradeAnswer(question, clientAnswer);
  const responseTimeMs = session.questionStartedAt
    ? Date.now() - session.questionStartedAt.getTime()
    : 0;

  const newStreak = isCorrect ? participant.streak + 1 : 0;
  
  // Powerups inventory resolution
  let inventory: string[] = [];
  try {
    inventory = Array.isArray(participant.powerups)
      ? (participant.powerups as string[])
      : JSON.parse((participant.powerups as string) || "[]");
  } catch {
    inventory = [];
  }

  let shieldActive = false;
  let skipPenaltyActive = false;
  let doubleXpActive = false;
  let luckyActive = false;

  if (usedPowerup && inventory.includes(usedPowerup)) {
    inventory = inventory.filter((pw) => pw !== usedPowerup);
    if (usedPowerup === "shield") shieldActive = true;
    if (usedPowerup === "skip_penalty") skipPenaltyActive = true;
    if (usedPowerup === "double_xp") doubleXpActive = true;
    if (usedPowerup === "lucky") luckyActive = true;
  }

  // V2 scoring rules — academic marks vs gamification points stay separate
  let scoreDelta = 0;
  let speedBonus = 0;
  let streakBonus = 0;
  let comboBonus = 0;
  let coinGain = 0;
  const academicMarksEarned = isCorrect ? question.marks : 0;

  if (isCorrect) {
    // 1. Base marks (leaderboard also starts from academic marks)
    scoreDelta = question.marks;
    if (luckyActive) {
      scoreDelta += 15; // Lucky bonus is gamification only
    }

    // 2. Speed bonus
    if (settings.scoring?.speedWeight && settings.scoring.speedWeight > 0) {
      const ratio = Math.max(0, 1 - responseTimeMs / (settings.questionTimerSeconds * 1000));
      speedBonus = Math.round(settings.scoring.speedWeight * ratio);
    }

    // 3. Streak bonus
    if (settings.scoring?.streakBonus && settings.scoring.streakBonus > 0 && newStreak >= 3) {
      streakBonus = settings.scoring.streakBonus;
    }

    // 4. Combo bonus (small combo helper)
    if (newStreak > 1) {
      comboBonus = 10 * (newStreak - 1);
    }

    // 5. Coins
    if (settings.coinsEnabled) {
      coinGain = 10 + (newStreak > 1 ? 5 : 0);
    }
  } else {
    // Negative marks (prevented if shield or skip penalty active) — leaderboard only
    if (settings.negativeMarking && !shieldActive && !skipPenaltyActive) {
      scoreDelta = -question.negativeMarks;
    }
  }

  const finalScoreEarned = scoreDelta + speedBonus + streakBonus + comboBonus;
  const newScore = Math.max(0, participant.score + finalScoreEarned);

  // V2 XP logic
  let xpGain = 0;
  if (settings.xpEnabled !== false) {
    if (isCorrect) {
      xpGain = 20; // Base XP
      if (speedBonus > 0) xpGain += 10;
      if (newStreak > 1) xpGain += 5 * (newStreak - 1);
      if (doubleXpActive) xpGain = xpGain * 2;
    }
  }

  // V2 Lives check
  let newLives = participant.lives;
  if (settings.lives && settings.lives > 0 && !isCorrect && !shieldActive) {
    newLives = Math.max(0, participant.lives - 1);
  }

  // Add random powerup reward on correct answer (25% chance or streak milestones)
  const powerupOptions = ["shield", "double_xp", "extra_time", "50-50", "skip_penalty", "retry"];
  if (isCorrect && (Math.random() < 0.25 || newStreak % 3 === 0)) {
    const randomPowerup = powerupOptions[Math.floor(Math.random() * powerupOptions.length)]!;
    if (inventory.length < 5 && !inventory.includes(randomPowerup)) {
      inventory.push(randomPowerup);
    }
  }

  const liveAnswer = await prisma.$transaction(async (tx) => {
    if (existingAnswer) {
      await tx.liveAnswer.delete({ where: { id: existingAnswer.id } });
    }

    const otherCorrectAnswers = await tx.liveAnswer.count({
      where: { sessionId, questionId, isCorrect: true },
    });
    const isFirstCorrect = isCorrect && otherCorrectAnswers === 0;

    const created = await tx.liveAnswer.create({
      data: {
        sessionId,
        participantId,
        questionId,
        answer: clientAnswer as object,
        isCorrect,
        pointsEarned: finalScoreEarned,
        responseTimeMs,
        marksEarned: academicMarksEarned,
        xpEarned: xpGain,
        streakAt: participant.streak,
        isFirstCorrect,
        isLastCorrect: false,
        questionSnapshot: buildQuestionSnapshot(question) as object,
      },
    });

    const priorAnswers = await tx.liveAnswer.findMany({
      where: { participantId },
      select: { responseTimeMs: true },
    });
    const totalResponseTime = priorAnswers.reduce((sum, a) => sum + (a.responseTimeMs || 0), 0) + responseTimeMs;
    const totalAnswersCount = priorAnswers.length + 1;
    const newAnswerSpeed = totalResponseTime / totalAnswersCount;

    const correctCount = participant.correctCount + (isCorrect ? 1 : 0);
    const wrongCount = participant.wrongCount + (isCorrect ? 0 : 1);
    const totalAnswered = correctCount + wrongCount;
    const accuracy = totalAnswered > 0 ? (correctCount / totalAnswered) * 100 : 0;

    await tx.liveParticipant.update({
      where: { id: participantId },
      data: {
        score: newScore,
        xp: participant.xp + xpGain,
        streak: newStreak,
        currentStreak: newStreak,
        correctCount,
        wrongCount,
        status: newLives <= 0 && settings.lives && settings.lives > 0 ? "disconnected" : "answered",
        lastSeenAt: new Date(),
        accuracy,
        answerSpeed: newAnswerSpeed,
        lives: newLives,
        coins: participant.coins + coinGain,
        powerups: inventory as any,
      },
    });

    return created;
  });

  // Log events chronologically in the timeline ledger
  await logSessionEvent(sessionId, "answer", participantId, {
    questionId,
    userAnswer: clientAnswer,
    questionIndex: session.currentQuestionIndex,
    isCorrect,
    responseTimeMs,
    pointsEarned: finalScoreEarned,
    xpEarned: xpGain,
    coinsEarned: coinGain,
    livesRemaining: newLives,
    usedPowerup,
    newStreak,
  });

  if (newLives < participant.lives) {
    await logSessionEvent(sessionId, "life_lost", participantId, {
      livesRemaining: newLives,
    });
  }

  const leaderboard = await buildLeaderboard(sessionId);
  const rank = leaderboard.find((e) => e.participantId === participantId)?.rank ?? 0;

  return {
    liveAnswer,
    isCorrect,
    correctOptions,
    pointsEarned: finalScoreEarned,
    explanation: settings.showExplanations ? question.explanation : null,
    responseTimeMs,
    streak: newStreak,
    xpEarned: xpGain,
    totalScore: newScore,
    totalXp: participant.xp + xpGain,
    rank,
  };
}

export async function buildPlayerSessionState(
  sessionId: string,
  participantId: string,
  previousRanks?: Map<string, number>
): Promise<LiveSessionState> {
  const session = await getSessionById(sessionId);
  const settings = parseSettings(session.settings);
  const participant = await prisma.liveParticipant.findUnique({ where: { id: participantId } });
  if (!participant) throw new AppError(404, "Participant not found");

  const questions = session.quiz.questions;
  const questionOrder = resolveQuestionOrder(settings, questions);
  const leaderboard = await buildLeaderboard(sessionId, previousRanks);

  let currentQuestion: QuestionForClient | null = null;
  const idx = participant.currentQuestionIndex;

  if (
    session.status === "active" &&
    !participant.finishedAt &&
    idx >= 0 &&
    idx < questionOrder.length
  ) {
    const active = getQuestionByIndex(settings, questions, idx);
    if (active) currentQuestion = questionForClient(active, settings);
  }

  return {
    id: session.id,
    roomCode: session.roomCode,
    pin: session.pin,
    title: session.title,
    status: participant.finishedAt
      ? ("finished" as LiveSessionState["status"])
      : (session.status as LiveSessionState["status"]),
    sessionType: session.sessionType as LiveSessionState["sessionType"],
    currentQuestionIndex: idx,
    questionStartedAt: participant.questionStartedAt?.toISOString() ?? null,
    settings,
    questionCount: questionOrder.length,
    currentQuestion,
    participants: leaderboard,
    hostUserId: session.hostUserId,
    quizBranding: extractQuizBrandingFromMetadata(
      session.quiz.metadata as Record<string, unknown>,
      session.quiz.id
    ),
  };
}

export async function getPlayerSessionView(sessionId: string, userId: string) {
  const participant = await prisma.liveParticipant.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
  });

  const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
  const settings = session ? parseSettings(session.settings) : DEFAULT_LIVE_SESSION_SETTINGS;

  const state =
    participant && isSelfPaced(settings)
      ? await buildPlayerSessionState(sessionId, participant.id)
      : await buildSessionState(sessionId);

  let currentAnswerResult: LiveAnswerResultPayload | null = null;
  if (participant && state.currentQuestion && state.status === "active") {
    const sessionFull = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        quiz: {
          include: {
            questions: {
              orderBy: { order: "asc" },
              include: { options: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    });
    if (sessionFull) {
      const viewSettings = parseSettings(sessionFull.settings);
      const question = isSelfPaced(viewSettings)
        ? getQuestionByIndex(viewSettings, sessionFull.quiz.questions, participant.currentQuestionIndex)
        : getQuestionByIndex(viewSettings, sessionFull.quiz.questions, sessionFull.currentQuestionIndex);
      const answer = await prisma.liveAnswer.findUnique({
        where: {
          sessionId_participantId_questionId: {
            sessionId,
            participantId: participant.id,
            questionId: state.currentQuestion.id,
          },
        },
      });
      if (answer && question) {
        const { correctOptions } = gradeAnswer(question, answer.answer);
        const ldb = await buildLeaderboard(sessionId);
        const rank = ldb.find((e) => e.participantId === participant.id)?.rank ?? 0;
        currentAnswerResult = {
          isCorrect: answer.isCorrect,
          correctOptions,
          pointsEarned: answer.pointsEarned,
          explanation: viewSettings.showExplanations ? question.explanation : null,
          responseTimeMs: answer.responseTimeMs ?? 0,
          streak: participant.streak,
          xpEarned: 0,
          totalScore: participant.score,
          totalXp: participant.xp,
          rank,
        };
      }
    }
  }

  return {
    participantId: participant?.id ?? null,
    sessionState: state,
    currentAnswerResult,
    hasSubmittedCurrentQuestion: currentAnswerResult !== null,
  };
}

export async function buildLeaderboard(sessionId: string, previousRanks?: Map<string, number>): Promise<LeaderboardEntry[]> {
  const participants = await prisma.liveParticipant.findMany({
    where: { sessionId },
    include: { user: { select: { avatar: true, profileImage: true } } },
    orderBy: [{ score: "desc" }, { correctCount: "desc" }],
  });

  const fastestByParticipant = await prisma.liveAnswer.groupBy({
    by: ["participantId"],
    where: { sessionId, isCorrect: true, responseTimeMs: { not: null } },
    _min: { responseTimeMs: true },
  });
  const fastestMap = new Map(fastestByParticipant.map((f) => [f.participantId, f._min.responseTimeMs]));

  // Find min response time for Fastest Thinker badge
  const minResponseTime = fastestByParticipant.length > 0
    ? Math.min(...fastestByParticipant.map((f) => f._min.responseTimeMs || Infinity))
    : Infinity;

  return Promise.all(participants.map(async (p, index) => {
    const total = p.correctCount + p.wrongCount;
    const accuracy = total > 0 ? Math.round((p.correctCount / total) * 100) : 0;
    const rank = index + 1;
    const effectivePrevRank = previousRanks?.get(p.id) ?? p.prevRank;
    
    let movement: "up" | "down" | "same" = "same";
    let rankChange = 0;
    if (effectivePrevRank !== null && effectivePrevRank !== undefined) {
      if (rank < effectivePrevRank) movement = "up";
      else if (rank > effectivePrevRank) movement = "down";
      rankChange = effectivePrevRank - rank;
    }

    // Save persistent rank variables
    await prisma.liveParticipant.update({
      where: { id: p.id },
      data: { rank, prevRank: effectivePrevRank, rankChange },
    }).catch(() => {});

    const badges: string[] = [];
    const fastestMs = fastestMap.get(p.id) ?? null;

    if (fastestMs !== null && fastestMs === minResponseTime) badges.push("Fastest Thinker");
    if (accuracy === 100 && p.correctCount >= 3) badges.push("Perfect Accuracy");
    if (fastestMs !== null && fastestMs < 1000) badges.push("Lightning Answer");
    if (p.wrongCount === 0 && p.correctCount >= 1) badges.push("No Wrong Answers");
    if (p.streak >= 5) badges.push("Consistency");
    if (rankChange >= 3) badges.push("Top Climber");
    if (rank === 1 && p.score > 0) badges.push("Quiz Champion");
    if (p.answerSpeed > 0 && p.answerSpeed < 2000) badges.push("Speed Demon");
    if (rankChange >= 2 && index >= 3) badges.push("Comeback King");
    if (p.correctCount >= 10) badges.push("Knowledge Master");

    return {
      participantId: p.id,
      userId: p.userId,
      displayName: p.displayName,
      avatar: p.avatar || p.user?.profileImage || p.user?.avatar || null,
      score: p.score,
      xp: p.xp,
      streak: p.streak,
      correctCount: p.correctCount,
      wrongCount: p.wrongCount,
      accuracy,
      rank,
      movement,
      fastestAnswerMs: fastestMs,
      badges,
      rankChange,
      avatarCategory: p.avatarCategory,
      cameraOn: p.cameraOn,
      micOn: p.micOn,
      raisedHand: p.raisedHand,
      networkStatus: p.networkStatus,
      device: p.device,
      status: p.status,
      lastSeenAt: p.lastSeenAt.toISOString(),
      lives: p.lives,
      coins: p.coins,
      powerups: p.powerups,
    };
  }));
}

export async function saveLeaderboardSnapshot(sessionId: string, questionIndex: number) {
  const rankings = await buildLeaderboard(sessionId);
  await prisma.leaderboardSnapshot.create({
    data: { sessionId, questionIndex, rankings: rankings as object[] },
  });
  return rankings;
}

export async function finishSession(sessionId: string, hostUserId: string, role: string) {
  await assertHostOrAdmin(hostUserId, role, sessionId);

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: { orderBy: { order: "asc" } } },
          },
        },
      },
      participants: { include: { user: true } },
    },
  });
  if (!session) throw new AppError(404, "Live session not found");

  const settings = parseSettings(session.settings);
  const finalLeaderboard = await buildLeaderboard(sessionId);
  const completedAttemptEvents: Array<{ attemptId: string; userId: string }> = [];

  const allLiveAnswers = await prisma.liveAnswer.findMany({ where: { sessionId } });
  const answersByParticipant = new Map<string, typeof allLiveAnswers>();
  for (const a of allLiveAnswers) {
    const list = answersByParticipant.get(a.participantId) || [];
    list.push(a);
    answersByParticipant.set(a.participantId, list);
  }

  await prisma.$transaction(async (tx) => {
    for (const entry of finalLeaderboard) {
      const participant = session.participants.find((p) => p.id === entry.participantId);
      if (!participant?.userId) continue;

      const participantAnswers = answersByParticipant.get(entry.participantId) || [];
      const results = buildAttemptResultsFromLiveAnswers(session.quiz.questions, participantAnswers);
      const unansweredCount = Math.max(0, session.quiz.questions.length - participantAnswers.length);
      const academicScore = results.reduce((sum, r) => sum + Number(r.marksEarned || 0), 0);
      const academicTotalMarks =
        session.quiz.questions.reduce((sum, q) => sum + (q.marks || 0), 0) ||
        session.quiz.totalMarks ||
        0;

      const attempt = await tx.quizAttempt.create({
        data: {
          userId: participant.userId,
          quizId: session.quizId,
          // Academic marks SOT — never store live/gamification points in QuizAttempt.score
          score: academicScore,
          totalMarks: academicTotalMarks,
          answers: JSON.stringify({
            liveSessionId: sessionId,
            academicScore,
            livePoints: entry.score,
            score: academicScore,
            correctCount: entry.correctCount,
            wrongCount: entry.wrongCount,
            unansweredCount,
            rank: entry.rank,
            results,
          }),
        },
      });
      completedAttemptEvents.push({ attemptId: attempt.id, userId: participant.userId });

      await tx.liveParticipant.update({
        where: { id: entry.participantId },
        data: { rank: entry.rank, quizAttemptId: attempt.id, status: "submitted" },
      });
    }

    const totalParticipants = session.participants.length;
    const avgAccuracy =
      totalParticipants > 0
        ? finalLeaderboard.reduce((sum, e) => sum + e.accuracy, 0) / totalParticipants
        : 0;

    const answers = await tx.liveAnswer.findMany({ where: { sessionId } });
    const avgResponseTimeMs =
      answers.length > 0
        ? Math.round(answers.reduce((s, a) => s + (a.responseTimeMs ?? 0), 0) / answers.length)
        : null;

    await tx.sessionAnalytics.update({
      where: { sessionId },
      data: {
        totalParticipants,
        avgAccuracy,
        avgResponseTimeMs,
        questionStats: await buildQuestionStats(sessionId, settings, session.quiz.questions),
      },
    });

    const finishedSettings = { ...settings, musicPlaying: false };
    await tx.liveSession.update({
      where: { id: sessionId },
      data: { status: "finished", endedAt: new Date(), settings: finishedSettings as object },
    });
  });

  await logSessionEvent(sessionId, "session_finished", null, {
    finalLeaderboard,
  });

  for (const item of completedAttemptEvents) {
    await publishAttemptCompleted({
      attemptId: item.attemptId,
      quizId: session.quizId,
      studentUserId: item.userId,
      extraRecipientIds: [session.hostUserId],
    });
  }

  return { finalLeaderboard, sessionId };
}

async function buildQuestionStats(
  sessionId: string,
  settings: LiveSessionSettings,
  questions: SessionQuestion[]
) {
  const order = resolveQuestionOrder(settings, questions);
  const stats = [];

  for (let i = 0; i < order.length; i++) {
    const questionId = order[i]!;
    const question = questions.find((q) => q.id === questionId);
    if (!question) continue;

    const answers = await prisma.liveAnswer.findMany({
      where: { sessionId, questionId: question.id },
    });
    const total = answers.length;
    const correct = answers.filter((a) => a.isCorrect).length;

    stats.push({
      questionId: question.id,
      questionIndex: i,
      text: question.text.slice(0, 80),
      totalAnswers: total,
      correctPercent: total > 0 ? Math.round((correct / total) * 100) : 0,
      avgTimeMs:
        total > 0
          ? Math.round(answers.reduce((s, a) => s + (a.responseTimeMs ?? 0), 0) / total)
          : 0,
    });
  }
  return stats;
}

export async function getLiveAnalytics(sessionId: string, hostUserId: string, role: string) {
  await assertHostOrAdmin(hostUserId, role, sessionId);

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      analytics: true,
      participants: true,
      quiz: { include: { questions: { orderBy: { order: "asc" }, include: { options: true } } } },
    },
  });
  if (!session) throw new AppError(404, "Live session not found");

  const settings = parseSettings(session.settings);
  const currentQuestion = getQuestionByIndex(
    settings,
    session.quiz.questions,
    session.currentQuestionIndex
  );
  let currentQuestionStats = null;

  if (currentQuestion && session.status === "active") {
    const answers = await prisma.liveAnswer.findMany({
      where: { sessionId, questionId: currentQuestion.id },
    });
    const total = session.participants.length;
    const answered = answers.length;
    const correct = answers.filter((a) => a.isCorrect).length;

    const optionCounts: Record<string, number> = {};
    for (const opt of currentQuestion.options) {
      optionCounts[opt.id] = 0;
    }
    for (const a of answers) {
      const selected = a.answer;
      if (typeof selected === "string") {
        if (optionCounts[selected] !== undefined) {
          optionCounts[selected]++;
        }
      } else if (Array.isArray(selected)) {
        for (const s of selected) {
          if (optionCounts[s] !== undefined) {
            optionCounts[s]++;
          }
        }
      }
    }

    currentQuestionStats = {
      questionId: currentQuestion.id,
      questionIndex: session.currentQuestionIndex,
      text: currentQuestion.text,
      totalParticipants: total,
      answered,
      pending: total - answered,
      correctPercent: answered > 0 ? Math.round((correct / answered) * 100) : 0,
      wrongPercent: answered > 0 ? Math.round(((answered - correct) / answered) * 100) : 0,
      avgTimeMs:
        answered > 0
          ? Math.round(answers.reduce((s, a) => s + (a.responseTimeMs ?? 0), 0) / answered)
          : 0,
      optionCounts,
    };
  }

  const leaderboard = await buildLeaderboard(sessionId);

  return {
    session: {
      id: session.id,
      status: session.status,
      currentQuestionIndex: session.currentQuestionIndex,
      questionCount: session.quiz.questions.length,
    },
    currentQuestionStats,
    participants: session.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      status: p.status,
      score: p.score,
    })),
    leaderboard,
    analytics: session.analytics,
  };
}

export async function buildSessionState(sessionId: string, previousRanks?: Map<string, number>): Promise<LiveSessionState> {
  const session = await getSessionById(sessionId);
  const settings = parseSettings(session.settings);
  const questions = session.quiz.questions;
  const questionOrder = resolveQuestionOrder(settings, questions);

  let currentQuestion: QuestionForClient | null = null;
  if (session.currentQuestionIndex >= 0 && session.currentQuestionIndex < questionOrder.length) {
    const active = getQuestionByIndex(settings, questions, session.currentQuestionIndex);
    if (active) {
      currentQuestion = questionForClient(active, settings);
    }
  }
  console.log(`[NEXT QUESTION STAGE 5] buildSessionState():`, {
    currentQuestionIndex: session.currentQuestionIndex,
    questionOrderLength: questionOrder.length,
    hasCurrentQuestion: !!currentQuestion,
    currentQuestionId: currentQuestion?.id,
    paceMode: settings.paceMode,
    isSelfPaced: isSelfPaced(settings)
  });

  const leaderboard = await buildLeaderboard(sessionId, previousRanks);

  return {
    id: session.id,
    quizId: session.quizId,
    roomCode: session.roomCode,
    pin: session.pin,
    title: session.title,
    status: session.status as LiveSessionState["status"],
    sessionType: session.sessionType as LiveSessionState["sessionType"],
    currentQuestionIndex: session.currentQuestionIndex,
    questionStartedAt: session.questionStartedAt?.toISOString() ?? null,
    settings,
    questionCount: questionOrder.length,
    currentQuestion,
    participants: leaderboard,
    hostUserId: session.hostUserId,
    quizBranding: extractQuizBrandingFromMetadata(
      session.quiz.metadata as Record<string, unknown>,
      session.quiz.id
    ),
  };
}

export async function listHostSessions(hostUserId: string) {
  return prisma.liveSession.findMany({
    where: { hostUserId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      quiz: { select: { title: true } },
      _count: { select: { participants: true } },
    },
  });
}

export async function listParticipantHistory(userId: string) {
  return prisma.liveParticipant.findMany({
    where: { userId },
    orderBy: { joinedAt: "desc" },
    take: 50,
    include: {
      session: {
        select: {
          id: true,
          title: true,
          roomCode: true,
          status: true,
          sessionType: true,
          endedAt: true,
          quiz: { select: { title: true } },
        },
      },
    },
  });
}
