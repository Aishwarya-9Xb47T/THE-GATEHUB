import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { gradeAnswer, calculateLivePoints } from "../quizGradingService.js";
import type { LiveSessionSettings, QuestionForClient, LeaderboardEntry } from "./types.js";
import { publishAttemptCompleted } from "../quizAnalyticsPipeline.js";
import { buildQuestionSnapshot } from "../quizReporting/questionSnapshot.js";
import { buildAttemptResultsFromLiveAnswers } from "../quizReporting/attemptReviewService.js";

type SessionQuestion = {
  id: string;
  text: string;
  type: string;
  marks: number;
  negativeMarks?: number;
  order: number;
  difficulty?: string | null;
  bloomLevel?: string | null;
  hint?: string | null;
  explanation?: string | null;
  metadata?: unknown;
  options: Array<{ id: string; text: string; order: number; isCorrect: boolean }>;
};

export interface SelfPacedSubmitResult {
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
  participantQuestionIndex: number;
  questionStartedAt: string | null;
  nextQuestion: QuestionForClient | null;
  nextQuestionIndex: number | null;
  remainingQuestions: number;
  timer: number;
  finished: boolean;
  isPersonalComplete: boolean;
  feedback: {
    isCorrect: boolean;
    correctOptions: string[];
    explanation: string | null;
    pointsEarned: number;
    xpEarned: number;
    streak: number;
    rank: number;
    responseTimeMs: number;
  };
  score: number;
  currentQuestionIndex: number;
  updatedSession: {
    id: string;
    status: string;
    currentQuestionIndex: number;
    questionCount: number;
  };
}

export async function initParticipantForSelfPaced(
  sessionId: string,
  participantIds: string[],
  startedAt: Date
): Promise<void> {
  if (participantIds.length === 0) return;
  await prisma.liveParticipant.updateMany({
    where: { sessionId, id: { in: participantIds } },
    data: {
      currentQuestionIndex: 0,
      questionStartedAt: startedAt,
      status: "online",
      finishedAt: null,
    },
  });
}

export async function initLateJoinParticipant(
  participantId: string,
  startedAt: Date
): Promise<void> {
  await prisma.liveParticipant.update({
    where: { id: participantId },
    data: {
      currentQuestionIndex: 0,
      questionStartedAt: startedAt,
      status: "online",
    },
  });
}

export async function submitSelfPacedAnswer(
  sessionId: string,
  participantId: string,
  questionId: string,
  answer: unknown,
  deps: {
    settings: LiveSessionSettings;
    questions: SessionQuestion[];
    getQuestionByIndex: (
      settings: LiveSessionSettings,
      questions: SessionQuestion[],
      index: number
    ) => SessionQuestion | null;
    questionForClient: (question: SessionQuestion, settings: LiveSessionSettings) => QuestionForClient;
    resolveQuestionOrder: (settings: LiveSessionSettings, questions: SessionQuestion[]) => string[];
    buildLeaderboard: (sessionId: string) => Promise<LeaderboardEntry[]>;
  }
): Promise<SelfPacedSubmitResult> {
  console.log(`[SELF-PACED] submitSelfPacedAnswer called:`, {
    sessionId,
    participantId,
    questionId,
    currentQuestionIndex: participantId
  });
  const participant = await prisma.liveParticipant.findUnique({ where: { id: participantId } });
  if (!participant || participant.sessionId !== sessionId) {
    throw new AppError(403, "Invalid participant");
  }
  if (participant.finishedAt) {
    throw new AppError(400, "You have already completed this quiz");
  }

  const { settings, questions, getQuestionByIndex, questionForClient, resolveQuestionOrder, buildLeaderboard } = deps;
  const questionOrder = resolveQuestionOrder(settings, questions);
  const questionCount = questionOrder.length;
  let currentIndex = participant.currentQuestionIndex;
  console.log(`[SELF-PACED] Participant state:`, {
    currentIndex,
    questionCount,
    finishedAt: participant.finishedAt
  });

  let targetIndex = questionOrder.indexOf(questionId);
  if (targetIndex < 0) {
    targetIndex = questions.findIndex((q) => q.id === questionId);
  }
  if (targetIndex >= 0) {
    currentIndex = targetIndex;
  }

  if (currentIndex < 0 || currentIndex >= questionCount) {
    throw new AppError(400, "Session has ended");
  }

  const question = questions.find((q) => q.id === questionId) ?? getQuestionByIndex(settings, questions, currentIndex);
  if (!question) {
    throw new AppError(400, "Question not found");
  }

  const existingAnswer = await prisma.liveAnswer.findUnique({
    where: { sessionId_participantId_questionId: { sessionId, participantId, questionId } },
  });

  if (existingAnswer && !settings.multipleAttempts) {
    const { correctOptions } = gradeAnswer(question, existingAnswer.answer);
    const leaderboard = await buildLeaderboard(sessionId);
    const rank = leaderboard.find((e) => e.participantId === participantId)?.rank ?? 0;
    const nextIndex = currentIndex + 1;
    const isComplete = nextIndex >= questionCount;
    const nextQ = !isComplete ? getQuestionByIndex(settings, questions, nextIndex) : null;
    const explanationText = settings.showExplanations ? question.explanation ?? null : null;
    return {
      isCorrect: existingAnswer.isCorrect,
      correctOptions,
      pointsEarned: existingAnswer.pointsEarned,
      explanation: explanationText,
      responseTimeMs: existingAnswer.responseTimeMs ?? 0,
      streak: participant.streak,
      xpEarned: 0,
      totalScore: participant.score,
      totalXp: participant.xp,
      rank,
      participantQuestionIndex: isComplete ? currentIndex : nextIndex,
      questionStartedAt: participant.questionStartedAt?.toISOString() ?? null,
      nextQuestion: nextQ ? questionForClient(nextQ, settings) : null,
      nextQuestionIndex: isComplete ? null : nextIndex,
      remainingQuestions: Math.max(0, questionCount - (currentIndex + 1)),
      timer: settings.questionTimerSeconds ?? 30,
      finished: isComplete,
      isPersonalComplete: isComplete,
      feedback: {
        isCorrect: existingAnswer.isCorrect,
        correctOptions,
        explanation: explanationText,
        pointsEarned: existingAnswer.pointsEarned,
        xpEarned: 0,
        streak: participant.streak,
        rank,
        responseTimeMs: existingAnswer.responseTimeMs ?? 0,
      },
      score: participant.score,
      currentQuestionIndex: currentIndex,
      updatedSession: {
        id: sessionId,
        status: isComplete ? "submitted" : "active",
        currentQuestionIndex: isComplete ? currentIndex : nextIndex,
        questionCount,
      },
    };
  }

  // V2 Powerup extraction from incoming answer structure
  let usedPowerup: string | undefined;
  let clientAnswer = answer;
  if (answer && typeof answer === "object" && "usedPowerup" in answer) {
    usedPowerup = (answer as any).usedPowerup;
    clientAnswer = (answer as any).answer;
  }

  const { isCorrect, correctOptions } = gradeAnswer(question, clientAnswer);
  const responseTimeMs = participant.questionStartedAt
    ? Date.now() - participant.questionStartedAt.getTime()
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
    scoreDelta = question.marks;
    if (luckyActive) {
      scoreDelta += 15; // Lucky bonus is gamification only
    }

    if (settings.scoring?.speedWeight && settings.scoring.speedWeight > 0) {
      const ratio = Math.max(0, 1 - responseTimeMs / (settings.questionTimerSeconds * 1000));
      speedBonus = Math.round(settings.scoring.speedWeight * ratio);
    }

    if (settings.scoring?.streakBonus && settings.scoring.streakBonus > 0 && newStreak >= 3) {
      streakBonus = settings.scoring.streakBonus;
    }

    if (newStreak > 1) {
      comboBonus = 10 * (newStreak - 1);
    }

    if (settings.coinsEnabled) {
      coinGain = 10 + (newStreak > 1 ? 5 : 0);
    }
  } else {
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

  const nextIndex = currentIndex + 1;
  const isComplete = nextIndex >= questionCount;
  const now = new Date();
  let completedAttempt: { id: string; quizId: string; userId: string } | null = null;

  await prisma.$transaction(async (tx) => {
    if (existingAnswer) {
      await tx.liveAnswer.delete({ where: { id: existingAnswer.id } });
    }

    const otherCorrectAnswers = await tx.liveAnswer.count({
      where: { sessionId, questionId, isCorrect: true },
    });
    const isFirstCorrect = isCorrect && otherCorrectAnswers === 0;

    await tx.liveAnswer.create({
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
        questionSnapshot: buildQuestionSnapshot({
          ...question,
          negativeMarks: question.negativeMarks ?? 0,
        }) as object,
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

    const updatedParticipant = await tx.liveParticipant.update({
      where: { id: participantId },
      data: {
        score: newScore,
        xp: participant.xp + xpGain,
        streak: newStreak,
        currentStreak: newStreak,
        correctCount,
        wrongCount,
        status: isComplete ? "submitted" : "online",
        lastSeenAt: now,
        currentQuestionIndex: isComplete ? currentIndex : nextIndex,
        questionStartedAt: isComplete ? participant.questionStartedAt : now,
        finishedAt: isComplete ? now : null,
        accuracy,
        answerSpeed: newAnswerSpeed,
        lives: newLives,
        coins: participant.coins + coinGain,
        powerups: inventory as any,
      },
    });

    if (isComplete && updatedParticipant.userId && !updatedParticipant.quizAttemptId) {
      const session = await tx.liveSession.findUnique({
        where: { id: sessionId },
        select: {
          quizId: true,
          quiz: {
            select: {
              totalMarks: true,
              questions: {
                orderBy: { order: "asc" },
                include: { options: { orderBy: { order: "asc" } } },
              },
            },
          },
        },
      });
      if (session) {
        const participantAnswers = await tx.liveAnswer.findMany({
          where: { sessionId, participantId },
        });
        const correctCount = participant.correctCount + (isCorrect ? 1 : 0);
        const wrongCount = participant.wrongCount + (isCorrect ? 0 : 1);
        const results = buildAttemptResultsFromLiveAnswers(session.quiz.questions, participantAnswers);
        const unansweredCount = Math.max(0, session.quiz.questions.length - participantAnswers.length);
        const attempt = await tx.quizAttempt.create({
          data: {
            userId: updatedParticipant.userId,
            quizId: session.quizId,
            score: newScore,
            totalMarks: session.quiz.totalMarks,
            answers: JSON.stringify({
              liveSessionId: sessionId,
              score: newScore,
              correctCount,
              wrongCount,
              unansweredCount,
              rank: null,
              selfPaced: true,
              results,
            }),
          },
        });
        await tx.liveParticipant.update({
          where: { id: participantId },
          data: { quizAttemptId: attempt.id },
        });
        completedAttempt = { id: attempt.id, quizId: session.quizId, userId: updatedParticipant.userId };
      }
    }
  });

  if (completedAttempt) {
    await publishAttemptCompleted({
      attemptId: completedAttempt.id,
      quizId: completedAttempt.quizId,
      studentUserId: completedAttempt.userId,
    });
  }

  const leaderboard = await buildLeaderboard(sessionId);
  const rank = leaderboard.find((e) => e.participantId === participantId)?.rank ?? 0;
  const nextQuestionRaw = !isComplete ? getQuestionByIndex(settings, questions, nextIndex) : null;
  const explanationText = settings.showExplanations ? question.explanation ?? null : null;
  const result: SelfPacedSubmitResult = {
    isCorrect,
    correctOptions,
    pointsEarned: scoreDelta,
    explanation: explanationText,
    responseTimeMs,
    streak: newStreak,
    xpEarned: xpGain,
    totalScore: newScore,
    totalXp: participant.xp + xpGain,
    rank,
    participantQuestionIndex: isComplete ? currentIndex : nextIndex,
    questionStartedAt: isComplete ? participant.questionStartedAt?.toISOString() ?? null : now.toISOString(),
    nextQuestion: nextQuestionRaw ? questionForClient(nextQuestionRaw, settings) : null,
    nextQuestionIndex: isComplete ? null : nextIndex,
    remainingQuestions: Math.max(0, questionCount - (currentIndex + 1)),
    timer: settings.questionTimerSeconds ?? 30,
    finished: isComplete,
    isPersonalComplete: isComplete,
    feedback: {
      isCorrect,
      correctOptions,
      explanation: explanationText,
      pointsEarned: scoreDelta,
      xpEarned: xpGain,
      streak: newStreak,
      rank,
      responseTimeMs,
    },
    score: newScore,
    currentQuestionIndex: currentIndex,
    updatedSession: {
      id: sessionId,
      status: isComplete ? "submitted" : "active",
      currentQuestionIndex: isComplete ? currentIndex : nextIndex,
      questionCount,
    },
  };

  console.log(`[SELF-PACED] Returning result:`, {
    isCorrect,
    nextQuestionId: result.nextQuestion?.id,
    participantQuestionIndex: result.participantQuestionIndex,
    isPersonalComplete: result.isPersonalComplete,
    nextIndex,
    isComplete
  });

  return result;
}
