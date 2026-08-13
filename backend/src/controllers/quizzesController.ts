import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { assertLegacyQuizAccess } from "../services/quiz/quizAccess.js";
import { gradeQuizAnswers } from "../services/quizGradingService.js";
import { extractQuizBrandingFromMetadata } from "../utils/quizBranding.js";
import { openQuizAttemptEventStream } from "../services/quizAttemptEvents.js";
import { publishAttemptCompleted } from "../services/quizAnalyticsPipeline.js";
import { buildQuizAttemptReview } from "../services/quizReporting/attemptReviewService.js";
// type QuestionType imported removed as it was enum

const createQuizSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

const bulkUpdateSchema = z.object({
  title: z.string().min(1),
  questions: z.array(z.object({
    id: z.string().optional(),
    text: z.string().min(1),
    type: z.string(),
    marks: z.number().int().min(0).default(1),
    order: z.number().int().min(0).optional(),
    explanation: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    media: z.record(z.any()).optional(),
    options: z.array(z.object({
      id: z.string().optional(),
      text: z.string(),
      isCorrect: z.boolean(),
      order: z.number().optional()
    })).optional(),
  }))
});

const questionOptionSchema = z.object({ text: z.string(), isCorrect: z.boolean(), order: z.number().optional() });
const createQuestionSchema = z.object({
  text: z.string().min(1),
  type: z.string(),
  marks: z.number().int().min(0).default(1),
  order: z.number().int().min(0).optional(),
  explanation: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  media: z.record(z.any()).optional(),
  options: z.array(questionOptionSchema).optional(),
});
const submitAttemptSchema = z.object({
  answers: z.record(z.any()),
});

export async function create(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = createQuizSchema.parse(req.body);
  const quiz = await prisma.quiz.create({ data });
  res.status(201).json({ success: true, quiz });
}

export async function getOne(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } } },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");
  res.json({ success: true, quiz });
}

export async function addQuestion(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const quizId = req.params.id;
  await assertLegacyQuizAccess(quizId, req.user.id, req.user.role);
  const data = createQuestionSchema.parse(req.body);
  const maxOrder = await prisma.question.findFirst({
    where: { quizId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const resolvedMediaUrl = (data as any).media?.url || data.metadata?.mediaUrl || (data.metadata?.media as any)?.url || (data.metadata?.diagram as any)?.url || (data.metadata?.diagram as any)?.dataUrl || (Array.isArray(data.metadata?.images) ? data.metadata.images[0]?.url || data.metadata.images[0]?.dataUrl : undefined);
  const mediaObj = (data as any).media || data.metadata?.media || (resolvedMediaUrl ? { url: resolvedMediaUrl, kind: 'image' } : undefined);
  const metaDataObj = {
    ...(data.metadata || {}),
    ...(mediaObj ? { media: mediaObj } : {}),
    ...(resolvedMediaUrl ? { mediaUrl: resolvedMediaUrl } : {}),
  };

  const question = await prisma.question.create({
    data: {
      quizId,
      text: data.text,
      type: data.type,
      marks: data.marks,
      order: data.order ?? (maxOrder?.order ?? 0) + 1,
      explanation: data.explanation,
      metadata: Object.keys(metaDataObj).length > 0 ? (metaDataObj as any) : undefined,
    },
  });
  if (data.options?.length) {
    await prisma.option.createMany({
      data: data.options.map((o, i) => ({
        questionId: question.id,
        text: o.text,
        isCorrect: o.isCorrect,
        order: o.order ?? i,
      })),
    });
  }
  const totalMarks = await prisma.question.aggregate({ where: { quizId }, _sum: { marks: true } });
  await prisma.quiz.update({ where: { id: quizId }, data: { totalMarks: totalMarks._sum.marks ?? 0 } });
  const withOptions = await prisma.question.findUnique({
    where: { id: question.id },
    include: { options: { orderBy: { order: "asc" } } },
  });
  res.status(201).json(withOptions);
}

export async function submitAttempt(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const quizId = req.params.id;
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { include: { options: true } } },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");
  const { answers } = submitAttemptSchema.parse(req.body);
  const { score, results } = gradeQuizAnswers(quiz.questions, answers);

  const attempt = await prisma.quizAttempt.create({
    data: { 
      userId: req.user.id, 
      quizId, 
      score, 
      totalMarks: quiz.totalMarks, 
      answers: JSON.stringify({ answers, results }) 
    },
  });

  await publishAttemptCompleted({
    attemptId: attempt.id,
    quizId,
    studentUserId: req.user.id,
  });

  res.json({ 
    success: true, 
    attempt: { ...attempt, score: Number(attempt.score) }, 
    totalMarks: quiz.totalMarks,
    results 
  });
}

export async function streamAttemptEvents(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  openQuizAttemptEventStream(req.user.id, res);
}

export async function myAttempts(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId: req.user.id },
    include: {
      quiz: {
        select: {
          id: true,
          title: true,
          subject: true,
          metadata: true,
          totalMarks: true,
          lectures: {
            select: {
              section: {
                select: {
                  course: {
                    select: {
                      id: true,
                      title: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const assessmentAttempts = await prisma.assessmentAttempt.findMany({
    where: {
      userId: req.user.id,
      submittedAt: { not: null },
      status: { in: ["submitted", "graded", "completed"] },
    },
    include: {
      deployment: {
        select: {
          id: true,
          mode: true,
          assessment: {
            select: {
              id: true,
              title: true,
              subject: true,
              metadata: true,
              legacyQuizId: true,
            },
          },
        },
      },
      learningRecord: true,
      engagementRecord: true,
    },
    orderBy: { submittedAt: "desc" },
  });

  const formattedAttempts = attempts.map((a) => {
    const course = a.quiz.lectures[0]?.section?.course;
    let answersPayload: Record<string, unknown> = {};
    try {
      answersPayload = JSON.parse(a.answers) as Record<string, unknown>;
    } catch {
      answersPayload = {};
    }
    const isLive = typeof answersPayload.liveSessionId === "string";
    const correctCount = Number(answersPayload.correctCount ?? 0);
    const wrongCount = Number(answersPayload.wrongCount ?? 0);
    const unansweredCount = Number(answersPayload.unansweredCount ?? 0);
    const attempted = correctCount + wrongCount;
    const maxMarks = Math.max(1, a.totalMarks || a.quiz.totalMarks || 1);
    // Academic score: prefer results[] marks when present
    const results = Array.isArray(answersPayload.results) ? (answersPayload.results as any[]) : [];
    const academicFromResults = results.length
      ? results.reduce((sum, r) => sum + Number(r?.marksEarned ?? 0), 0)
      : null;
    const marksEarned = academicFromResults != null
      ? academicFromResults
      : isLive
        ? correctCount // legacy thin live attempts without results
        : Number(a.score);
    const accuracy =
      attempted > 0
        ? Math.round((correctCount / attempted) * 100)
        : Math.round((marksEarned / maxMarks) * 100);
    const percentage = Math.min(100, Math.max(0, Math.round((marksEarned / maxMarks) * 100)));
    const branding = extractQuizBrandingFromMetadata(a.quiz.metadata as Record<string, unknown>, a.quiz.id);

    return {
      id: a.id,
      quizId: a.quiz.id,
      quizName: a.quiz.title,
      attemptType: isLive ? "live" : "course",
      score: marksEarned,
      totalMarks: maxMarks,
      percentage,
      accuracy,
      livePoints: isLive ? Number(a.score) : null,
      correctCount: attempted > 0 || results.length > 0 ? correctCount : null,
      wrongCount: attempted > 0 || results.length > 0 ? wrongCount : null,
      unansweredCount: unansweredCount || null,
      rank: typeof answersPayload.rank === "number" ? answersPayload.rank : null,
      sessionId: isLive ? String(answersPayload.liveSessionId) : null,
      createdAt: a.createdAt,
      courseName: course?.title || (a.quiz.subject?.trim() ? a.quiz.subject : "Standalone Quiz"),
      courseId: course?.id || null,
      bannerUrl: branding.bannerUrl,
      thumbnailUrl: branding.thumbnailUrl,
      coverImageUrl: branding.coverImageUrl,
      coverGradient: branding.coverGradient,
      theme: branding.theme,
      answers: answersPayload,
    };
  });

  const formattedAssessmentAttempts = assessmentAttempts.map((a) => {
    const assessment = a.deployment.assessment;
    const branding = extractQuizBrandingFromMetadata(
      assessment.metadata as Record<string, unknown>,
      assessment.legacyQuizId || assessment.id
    );
    const totalMarks = Math.max(1, Number(a.learningRecord?.totalMarks ?? 0) || 1);
    const score = Number(a.learningRecord?.marksEarned ?? 0);
    const rawAccuracy = Number(a.learningRecord?.accuracy ?? 0);
    const accuracy = rawAccuracy <= 1 ? Math.round(rawAccuracy * 100) : Math.round(rawAccuracy);
    const percentage = Math.min(100, Math.max(0, Math.round((score / totalMarks) * 100)));
    const mode = String(a.deployment.mode || "").toLowerCase();
    const isLive =
      mode.includes("live") || mode.includes("hosted") || mode.includes("instructor_paced");

    return {
      id: `assessment-${a.id}`,
      quizId: assessment.legacyQuizId || assessment.id,
      quizName: assessment.title,
      attemptType: isLive ? "live" : "course",
      score,
      totalMarks,
      percentage,
      accuracy: Math.min(100, Math.max(0, accuracy || percentage)),
      livePoints: isLive ? Number(a.engagementRecord?.sessionScore ?? score) : null,
      correctCount: a.learningRecord?.correctCount ?? null,
      wrongCount: a.learningRecord?.wrongCount ?? null,
      rank: a.engagementRecord?.sessionRank ?? null,
      createdAt: a.submittedAt ?? a.startedAt,
      courseName: assessment.subject?.trim() ? assessment.subject : "Standalone Quiz",
      courseId: null,
      bannerUrl: branding.bannerUrl,
      thumbnailUrl: branding.thumbnailUrl,
      coverImageUrl: branding.coverImageUrl,
      coverGradient: branding.coverGradient,
      theme: branding.theme,
      answers: {
        assessmentAttemptId: a.id,
        deploymentId: a.deploymentId,
        mode: a.deployment.mode,
      },
    };
  });

  const merged = [...formattedAttempts, ...formattedAssessmentAttempts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json({ success: true, attempts: merged });
}

function sanitizeText(str?: string): string {
  if (!str) return '';
  return str
    .replace(/--?\s*\d+\s*(?:of|to|-|\/|—)?\s*\d*--?/gi, '')
    .replace(/\bPage\s+\d+\s*(?:of|to|-|\/|—)\s*\d+\b/gi, '')
    .replace(/\bPage\s+\d+\b/gi, '')
    .replace(/\b\d+\s+of\s+\d+\b/gi, '')
    .replace(/\[\s*EQUATION\s*\]/gi, '')
    .replace(/\[\s*ANSWER\s*\]/gi, '')
    .replace(/\[\s*QUESTION\s*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function bulkUpdate(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const quizId = req.params.id;
  await assertLegacyQuizAccess(quizId, req.user.id, req.user.role);
  
  const data = bulkUpdateSchema.parse(req.body);

  // For simplicity, delete all old questions and options, and recreate them
  await prisma.question.deleteMany({ where: { quizId } });
  
  await prisma.quiz.update({ where: { id: quizId }, data: { title: data.title } });

  for (const [index, q] of data.questions.entries()) {
    const resolvedMediaUrl = (q as any).media?.url || q.metadata?.mediaUrl || (q.metadata?.media as any)?.url || (q.metadata?.diagram as any)?.url || (q.metadata?.diagram as any)?.dataUrl || (Array.isArray(q.metadata?.images) ? q.metadata.images[0]?.url || q.metadata.images[0]?.dataUrl : undefined);
    const mediaObj = (q as any).media || q.metadata?.media || (resolvedMediaUrl ? { url: resolvedMediaUrl, kind: 'image' } : undefined);
    const metaDataObj = {
      ...(q.metadata || {}),
      ...(mediaObj ? { media: mediaObj } : {}),
      ...(resolvedMediaUrl ? { mediaUrl: resolvedMediaUrl } : {}),
    };

    const question = await prisma.question.create({
      data: {
        quizId,
        text: sanitizeText(q.text),
        type: q.type,
        marks: q.marks,
        order: q.order ?? index,
        explanation: q.explanation ? sanitizeText(q.explanation) : undefined,
        metadata: Object.keys(metaDataObj).length > 0 ? (metaDataObj as any) : undefined,
      }
    });
    
    if (q.options?.length) {
      await prisma.option.createMany({
        data: q.options.map((o, optIndex) => ({
          questionId: question.id,
          text: sanitizeText(o.text),
          isCorrect: o.isCorrect,
          order: o.order ?? optIndex
        }))
      });
    }
  }

  const totalMarks = await prisma.question.aggregate({ where: { quizId }, _sum: { marks: true } });
  await prisma.quiz.update({ where: { id: quizId }, data: { totalMarks: totalMarks._sum.marks ?? 0 } });

  res.json({ success: true, message: "Quiz updated successfully" });
}

export async function sessionsList(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const quizId = req.params.id;
  const sessions = await prisma.liveSession.findMany({
    where: { quizId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { participants: true } }
    }
  });
  res.json({ success: true, sessions });
}

export async function getAttemptReview(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { attemptId } = req.params;

  const ownership = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    select: { userId: true, quizId: true, score: true },
  });
  if (!ownership) throw new AppError(404, "Attempt not found");
  if (ownership.userId !== req.user.id) throw new AppError(403, "Forbidden");

  const review = await buildQuizAttemptReview(attemptId);

  // Class stats must use academic scores (review.summary / results), never live points.
  const allAttempts = await prisma.quizAttempt.findMany({
    where: { quizId: ownership.quizId },
    select: { id: true, score: true, answers: true, totalMarks: true },
  });
  const academicScores = allAttempts.map((a) => {
    try {
      const payload = JSON.parse(a.answers || "{}") as Record<string, unknown>;
      if (typeof payload.academicScore === "number") return Number(payload.academicScore);
      const results = Array.isArray(payload.results) ? (payload.results as any[]) : [];
      if (results.length) {
        return results.reduce((sum, r) => sum + Number(r?.marksEarned ?? 0), 0);
      }
    } catch {
      /* fall through */
    }
    return Number(a.score);
  });
  const scores = academicScores.slice().sort((a, b) => a - b);
  const totalAttempts = scores.length;
  const studentAcademic = review.summary.score;
  const highestScore = scores.length > 0 ? Math.max(...scores) : studentAcademic;
  const classAverage =
    totalAttempts > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / totalAttempts) * 10) / 10
      : studentAcademic;
  const belowCount = scores.filter((s) => s < studentAcademic).length;
  const percentile = totalAttempts > 0 ? Math.round((belowCount / totalAttempts) * 100) : 100;

  const reviewItems = review.questions.map((item) => {
    const topic =
      item.metadata && typeof item.metadata === "object" && (item.metadata as any).topic
        ? String((item.metadata as any).topic)
        : "General";
    return {
      questionId: item.questionId,
      questionNumber: item.questionNumber,
      text: item.questionText,
      type: item.questionType,
      difficulty: item.difficulty || "medium",
      bloomLevel: item.bloomLevel || "L2",
      topic,
      marks: item.maxMarks,
      negativeMarks: item.questionSnapshot?.negativeMarks ?? 0,
      hint: item.questionSnapshot?.hint ?? null,
      explanation: item.explanation,
      metadata: item.metadata,
      options: item.options,
      correctAnswer: item.correctAnswer,
      selectedAnswer: item.selectedAnswer,
      selectedOptionIds: item.selectedOptionIds,
      correctOptionIds: item.correctOptionIds,
      status: item.status,
      studentAnswer: {
        answer: item.selectedAnswer ?? item.selectedOptionIds,
        isCorrect: item.isCorrect,
        pointsEarned: item.marksAwarded,
        marksAwarded: item.marksAwarded,
        maxMarks: item.maxMarks,
        responseTimeMs: item.timeTakenMs ?? 0,
        status: item.status,
      },
      averageClassTimeMs: null,
    };
  });

  const topicStats: Record<string, { correct: number; total: number }> = {};
  reviewItems.forEach((item) => {
    const topic = item.topic;
    if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 };
    topicStats[topic].total += 1;
    if (item.status === "correct") topicStats[topic].correct += 1;
  });
  const topicAnalysis = Object.entries(topicStats).map(([topic, data]) => ({
    topic,
    accuracy: Math.round((data.correct / data.total) * 100),
    total: data.total,
  }));
  const strongestTopic =
    topicAnalysis.length > 0
      ? topicAnalysis.reduce((max, curr) => (curr.accuracy > max.accuracy ? curr : max), topicAnalysis[0]!).topic
      : "None";
  const weakestTopic =
    topicAnalysis.length > 0
      ? topicAnalysis.reduce((min, curr) => (curr.accuracy < min.accuracy ? curr : min), topicAnalysis[0]!).topic
      : "None";

  const difficultyStats: Record<string, { correct: number; total: number }> = {};
  reviewItems.forEach((item) => {
    const d = String(item.difficulty || "medium");
    if (!difficultyStats[d]) difficultyStats[d] = { correct: 0, total: 0 };
    difficultyStats[d].total += 1;
    if (item.status === "correct") difficultyStats[d].correct += 1;
  });
  const difficultyAnalysis = Object.entries(difficultyStats).map(([difficulty, data]) => ({
    difficulty,
    accuracy: Math.round((data.correct / data.total) * 100),
    total: data.total,
  }));

  let mistakePattern = "Excellent performance!";
  let suggestion = "Keep practicing advanced concepts to maintain perfect recall.";
  if (percentile < 50) {
    mistakePattern = "Struggling with conceptual speed and precision under time constraints.";
    suggestion = `Review definitions and practice foundation worksheets in "${weakestTopic}".`;
  } else if (percentile < 85) {
    mistakePattern = "Minor errors on tricky options and application questions.";
    suggestion = `Focus on double-checking selected options and practice harder problems in "${weakestTopic}".`;
  }

  res.json({
    success: true,
    data: {
      attempt: {
        id: review.summary.attemptId || attemptId,
        score: review.summary.score,
        totalMarks: review.summary.maxScore,
        createdAt: review.summary.attemptDate,
        submittedAt: review.summary.submittedAt,
        accuracy: review.summary.accuracy,
        percentage: review.summary.percentage,
        correctCount: review.summary.correctCount,
        incorrectCount: review.summary.incorrectCount,
        unansweredCount: review.summary.unansweredCount,
        timeTakenMs: review.summary.timeTakenMs,
        livePoints: review.summary.livePoints,
        rank: review.summary.rank,
        sessionId: review.summary.sessionId,
        // Gamification is separate from academic marks — do not invent XP from academic score
        xpEarned: review.summary.livePoints != null ? Math.round(Number(review.summary.livePoints) * 10) : null,
        coinsEarned: review.summary.livePoints != null ? Math.round(Number(review.summary.livePoints) * 2) : null,
        livesRemaining: null,
      },
      quizTitle: review.summary.quizTitle,
      classAverage,
      highestScore,
      percentile,
      reviewItems,
      review, // full authoritative DTO for premium UI
      analytics: {
        topicAnalysis,
        difficultyAnalysis,
        strongestTopic,
        weakestTopic,
        mistakePattern,
        suggestion,
      },
    },
  });
}

function renderMarkdown(text: string, baseUrl: string): string {
  if (!text) return "";
  let html = text;

  // 1. Process Markdown media !\[(.*?)]\((.*?)\)
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (_, alt, url) => {
    let resolvedUrl = url;
    if (url.startsWith("/uploads")) {
      resolvedUrl = `${baseUrl}${url}`;
    }
    if (url.endsWith(".mp4") || url.endsWith(".webm") || url.includes("video")) {
      return `
        <div style="margin: 15px 0; max-width: 100%;">
          <video src="${resolvedUrl}" style="max-width: 100%; max-height: 280px; border-radius: 8px; display: block;" controls muted></video>
          <div style="font-size: 10px; color: #64748b; margin-top: 4px;">▶ Video: ${alt || "media resource"}</div>
        </div>
      `;
    }
    if (url.endsWith(".mp3") || url.endsWith(".wav") || url.includes("audio")) {
      return `
        <div style="margin: 15px 0; max-width: 100%;">
          <audio src="${resolvedUrl}" controls style="width: 100%; max-width: 480px;"></audio>
          <div style="font-size: 10px; color: #64748b; margin-top: 4px;">🎵 Audio: ${alt || "media resource"}</div>
        </div>
      `;
    }
    // Default to image
    return `
      <div style="margin: 15px 0; max-width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; display: inline-block;">
        <img src="${resolvedUrl}" alt="${alt}" style="max-width: 100%; max-height: 300px; display: block;" />
      </div>
    `;
  });

  // 2. Process Markdown code blocks ```lang ... ```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const l = lang || "plaintext";
    const escapedCode = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    return `<pre style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; overflow-x: auto; margin: 15px 0;"><code class="language-${l}">${escapedCode.trim()}</code></pre>`;
  });

  // 3. Process regular links \[(.*?)]\((.*?)\)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, (_, linkText, linkUrl) => {
    let resolvedUrl = linkUrl;
    if (linkUrl.startsWith("/uploads")) {
      resolvedUrl = `${baseUrl}${linkUrl}`;
    }
    return `<a href="${resolvedUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">${linkText}</a>`;
  });

  return html;
}

export async function exportAttemptPdf(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { attemptId } = req.params;

  const ownership = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      userId: true,
      quizId: true,
      quiz: { select: { title: true, authorId: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  });
  if (!ownership) throw new AppError(404, "Attempt not found");

  const isOwner = ownership.userId === req.user.id;
  const isAdmin = req.user.role === "admin" || req.user.role === "super_admin";
  const isAuthorInstructor =
    (req.user.role === "instructor" || isAdmin) &&
    (isAdmin || ownership.quiz.authorId === req.user.id);

  // Non-author instructors may still export if they hosted a linked live session.
  let isSessionHost = false;
  if (!isOwner && !isAuthorInstructor && req.user.role === "instructor") {
    const hosted = await prisma.liveParticipant.findFirst({
      where: {
        quizAttemptId: attemptId,
        session: { hostUserId: req.user.id },
      },
      select: { id: true },
    });
    isSessionHost = !!hosted;
  }

  if (!isOwner && !isAuthorInstructor && !isSessionHost && !isAdmin) {
    throw new AppError(403, "Forbidden");
  }

  const review = await buildQuizAttemptReview(attemptId);
  const {
    renderQuizAttemptPdfFromReview,
    sanitizeReportFilename,
  } = await import("../services/quizReporting/sessionReportExports.js");

  const studentName = [ownership.user?.firstName, ownership.user?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || review.summary.studentName || "Student";
  const filename = sanitizeReportFilename(
    `${ownership.quiz.title || "Quiz"}_${studentName}_Attempt_Report`,
    "pdf"
  );

  try {
    const pdf = await renderQuizAttemptPdfFromReview(review);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(pdf);
  } catch (err) {
    console.error("[exportAttemptPdf] PDF render failed, falling back to HTML", err);
    const { renderQuizAttemptHtmlFromReview } = await import(
      "../services/quizReporting/sessionReportExports.js"
    );
    const html = renderQuizAttemptHtmlFromReview(review);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/\.pdf$/i, ".html")}"`);
    res.status(200).send(html);
  }
}
