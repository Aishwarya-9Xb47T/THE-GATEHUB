import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { assertLegacyQuizAccess } from "../quiz/quizAccess.js";
import { validateQuizContent } from "./quizValidation.js";

const GRADIENTS = [
  "from-violet-600 via-purple-500 to-fuchsia-500",
  "from-blue-600 via-cyan-500 to-teal-400",
  "from-amber-500 via-orange-500 to-rose-500",
  "from-emerald-600 via-green-500 to-lime-400",
  "from-indigo-600 via-blue-500 to-sky-400",
  "from-rose-600 via-pink-500 to-orange-400",
];

function gradientForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % GRADIENTS.length;
  return GRADIENTS[hash]!;
}

async function assertQuizAccess(quizId: string, userId: string, role: string) {
  return assertLegacyQuizAccess(quizId, userId, role);
}

export function mapQuestion(q: {
  id: string;
  text: string;
  type: string;
  difficulty: string | null;
  marks: number;
  negativeMarks?: number;
  hint?: string | null;
  bloomLevel?: string | null;
  order: number;
  explanation: string | null;
  metadata: unknown;
  options: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
}) {
  const meta = (q.metadata || {}) as Record<string, unknown>;
  const resolvedMediaUrl = (meta.mediaUrl as string) || (meta.media as any)?.url || (meta.diagram as any)?.url || (meta.diagram as any)?.dataUrl || (Array.isArray(meta.images) ? (meta.images[0] as any)?.url || (meta.images[0] as any)?.dataUrl : undefined);
  const mediaObj = meta.media || (resolvedMediaUrl ? { url: resolvedMediaUrl, kind: 'image' } : null);

  const starterCode = (meta.starterCode as string) || (meta.code as any)?.content || (meta.code as any)?.code || (q as any).starterCode || null;
  const codeObj = meta.code || (q as any).code || (q as any).codeBlock || null;
  const tableObj = meta.table || (q as any).table || null;
  const formulasArr = meta.formulas || (q as any).formulas || null;
  const equationsArr = meta.equations || (q as any).equations || null;
  const hyperlinksArr = meta.hyperlinks || (q as any).hyperlinks || null;
  const listsArr = meta.lists || (q as any).lists || null;

  return {
    id: q.id,
    text: q.text,
    type: q.type,
    difficulty: q.difficulty,
    marks: q.marks,
    negativeMarks: q.negativeMarks ?? 0,
    hint: q.hint || (Array.isArray(meta.hints) ? meta.hints[0] : null) || null,
    bloomLevel: q.bloomLevel || (meta.bloomLevel as string) || null,
    order: q.order,
    explanation: q.explanation,
    hints: q.hint ? [q.hint] : (Array.isArray(meta.hints) ? meta.hints : []),
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    estimatedSeconds: (meta.estimatedSeconds as number) || null,
    sectionId: (meta.sectionId as string) || null,
    media: mediaObj,
    starterCode,
    code: codeObj,
    table: tableObj,
    formulas: formulasArr,
    equations: equationsArr,
    hyperlinks: hyperlinksArr,
    lists: listsArr,
    metadata: {
      ...meta,
      mediaUrl: resolvedMediaUrl || meta.mediaUrl,
      media: mediaObj,
      starterCode,
      code: codeObj,
      table: tableObj,
      formulas: formulasArr,
      equations: equationsArr,
      hyperlinks: hyperlinksArr,
      lists: listsArr,
    },
    options: q.options.map((o) => ({
      id: o.id,
      text: o.text,
      isCorrect: o.isCorrect,
      order: o.order,
    })),
  };
}

const DEFAULT_QUIZ_SETTINGS = {
  shuffleQuestions: false,
  shuffleOptions: true,
  randomSubset: 0,
  timePerQuestion: 30,
  showExplanations: true,
  passingScore: 60,
  maxAttempts: 0,
  negativeMarking: false,
};

export interface CreateQuizInput {
  title?: string;
  description?: string;
  subject?: string;
  visibility?: string;
  metadata?: Record<string, unknown>;
  withPlaceholder?: boolean;
}

export async function createEmptyQuiz(userId: string, input?: string | CreateQuizInput) {
  const opts: CreateQuizInput = typeof input === "string" ? { title: input } : input ?? {};
  const meta = (opts.metadata && typeof opts.metadata === "object" ? opts.metadata : {}) as Record<string, unknown>;
  const settings = (meta.settings && typeof meta.settings === "object" ? meta.settings : DEFAULT_QUIZ_SETTINGS) as Record<string, unknown>;

  // Ensure authorId exists in DB (fallback to first available user if needed)
  let authorId = userId;
  const authorExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!authorExists) {
    const fallbackUser = await prisma.user.findFirst({ select: { id: true } });
    if (fallbackUser) authorId = fallbackUser.id;
  }

  const quiz = await prisma.quiz.create({
    data: {
      title: opts.title?.trim() || "Untitled Quiz",
      description: opts.description?.trim() || null,
      subject: opts.subject?.trim() || null,
      authorId,
      visibility: opts.visibility || "private",
      metadata: { version: 1, settings, sections: [], ...meta } as any,
    },
  });

  if (opts.withPlaceholder !== false) {
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        text: "",
        type: "multiple_choice",
        difficulty: "medium",
        order: 0,
        metadata: { bloomLevel: "L2", estimatedSeconds: 45, hints: [], tags: [] },
        options: {
          create: [
            { text: "", isCorrect: true, order: 0 },
            { text: "", isCorrect: false, order: 1 },
            { text: "", isCorrect: false, order: 2 },
            { text: "", isCorrect: false, order: 3 },
          ],
        },
      },
    });
  }

  return { id: quiz.id, title: quiz.title };
}

export async function applyQuizIdentity(
  quizId: string,
  userId: string,
  role: string,
  metadata: Record<string, unknown>,
  fields?: { title?: string; description?: string; subject?: string; visibility?: string }
) {
  await assertQuizAccess(quizId, userId, role);
  const existing = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!existing) throw new AppError(404, "Quiz not found");
  const prevMeta = (existing.metadata || {}) as Record<string, unknown>;
  await prisma.quiz.update({
    where: { id: quizId },
    data: {
      title: fields?.title?.trim() || existing.title,
      description: fields?.description ?? existing.description,
      subject: fields?.subject ?? existing.subject,
      visibility: fields?.visibility ?? existing.visibility,
      metadata: { ...prevMeta, ...metadata } as any,
    },
  });
  return { id: quizId };
}

export async function listInstructorQuizzes(
  userId: string,
  filters?: { q?: string; sort?: string; visibility?: string; archived?: boolean }
) {
  const quizIds = new Set<string>();

  const [authored, fromSessions, fromCourses] = await Promise.all([
    prisma.quiz.findMany({ where: { authorId: userId }, select: { id: true } }),
    prisma.liveSession.findMany({ where: { hostUserId: userId }, select: { quizId: true } }),
    prisma.quiz.findMany({
      where: { lectures: { some: { section: { course: { instructorId: userId } } } } },
      select: { id: true },
    }),
  ]);

  [...authored, ...fromSessions.map((s) => ({ id: s.quizId })), ...fromCourses].forEach((q) =>
    quizIds.add(q.id)
  );

  const where: Record<string, unknown> = { id: { in: [...quizIds] } };
  if (filters?.archived) where.archivedAt = { not: null };
  else where.archivedAt = null;
  if (filters?.visibility) where.visibility = filters.visibility;
  if (filters?.q?.trim()) {
    where.OR = [
      { title: { contains: filters.q.trim(), mode: "insensitive" } },
      { description: { contains: filters.q.trim(), mode: "insensitive" } },
      { subject: { contains: filters.q.trim(), mode: "insensitive" } },
    ];
  }

  let orderBy: Record<string, string> = { updatedAt: "desc" };
  if (filters?.sort === "title") orderBy = { title: "asc" };
  if (filters?.sort === "questions") orderBy = { totalMarks: "desc" };
  if (filters?.sort === "created") orderBy = { createdAt: "desc" };

  const quizzes = await prisma.quiz.findMany({
    where,
    orderBy,
    include: {
      questions: { select: { type: true, difficulty: true, metadata: true } },
      attempts: { select: { score: true, totalMarks: true, answers: true } },
      liveSessions: { where: { hostUserId: userId }, select: { id: true, status: true } },
      lectures: {
        take: 1,
        select: { title: true, section: { select: { course: { select: { id: true, title: true } } } } },
      },
      _count: { select: { questions: true, attempts: true, liveSessions: true } },
    },
  });

  return quizzes.map((quiz) => {
    const meta = (quiz.metadata || {}) as Record<string, unknown>;
    const typeSet = new Set(quiz.questions.map((q) => q.type));
    const difficulties = quiz.questions.map((q) => q.difficulty || "medium");
    const avgScore =
      quiz.attempts.length > 0
        ? quiz.attempts.reduce((s, a) => {
            const payload = typeof a.answers === "string" ? JSON.parse(a.answers) : a.answers;
            const isLive = payload && typeof payload === "object" && "liveSessionId" in payload;
            if (isLive && payload.correctCount != null && payload.wrongCount != null) {
              const attempted = Number(payload.correctCount) + Number(payload.wrongCount);
              return s + (attempted > 0 ? (Number(payload.correctCount) / attempted) * 100 : 0);
            }
            return s + (Number(a.score) / Math.max(a.totalMarks, 1)) * 100;
          }, 0) / quiz.attempts.length
        : 0;

    const bloomLevels = quiz.questions.map((q) => {
      const m = (q.metadata || {}) as Record<string, unknown>;
      return String(m.bloomLevel || "L2");
    });
    const bloomSummary = [...new Set(bloomLevels)].slice(0, 4).join(", ");

    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      subject: quiz.subject,
      visibility: quiz.visibility,
      pinned: quiz.pinned,
      favorited: quiz.favorited,
      archivedAt: quiz.archivedAt,
      coverGradient: (meta.coverGradient as string) || gradientForId(quiz.id),
      bannerUrl: (meta.bannerUrl as string) || (meta.coverImageUrl as string) || null,
      coverImageUrl: (meta.coverImageUrl as string) || (meta.bannerUrl as string) || null,
      thumbnailUrl: (meta.thumbnailUrl as string) || null,
      theme: ((meta.identity as Record<string, unknown>)?.theme as string) || null,
      questionCount: quiz._count.questions,
      estimatedMinutes: Math.max(1, Math.ceil(quiz._count.questions * 0.75)),
      difficulty: difficulties.includes("hard") ? "hard" : difficulties.includes("medium") ? "medium" : "easy",
      bloomSummary,
      questionTypes: [...typeSet],
      timesUsed: quiz._count.liveSessions,
      studentAttempts: quiz._count.attempts,
      averageScore: Math.round(avgScore),
      updatedAt: quiz.updatedAt,
      createdAt: quiz.createdAt,
      course: quiz.lectures[0]?.section?.course || null,
      settings: meta.settings || {},
    };
  });
}

export function buildQuizEditorSnapshot(quiz: {
  id: string;
  title: string;
  description?: string | null;
  subject?: string | null;
  visibility: string;
  pinned?: boolean;
  favorited?: boolean;
  metadata: unknown;
  questions: Array<{
    id: string;
    text: string;
    type: string;
    difficulty: string | null;
    marks: number;
    order: number;
    explanation: string | null;
    metadata: unknown;
    options: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
  }>;
}) {
  const meta = (quiz.metadata || {}) as Record<string, unknown>;
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    subject: quiz.subject,
    visibility: quiz.visibility,
    pinned: quiz.pinned ?? false,
    favorited: quiz.favorited ?? false,
    metadata: meta,
    settings: meta.settings || {
      shuffleQuestions: false,
      shuffleOptions: true,
      randomSubset: 0,
      timePerQuestion: 30,
      showExplanations: true,
      passingScore: 70,
      maxAttempts: 0,
      negativeMarking: false,
    },
    sections: Array.isArray(meta.sections) ? meta.sections : [],
    course: null,
    questions: quiz.questions.map(mapQuestion),
    version: typeof meta.version === "number" ? meta.version : 1,
  };
}

export async function getQuizEditor(quizId: string, userId: string, role: string) {
  await assertQuizAccess(quizId, userId, role);
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
      lectures: { take: 1, select: { section: { select: { course: { select: { id: true, title: true } } } } } },
    },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");

  const meta = (quiz.metadata || {}) as Record<string, unknown>;
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    subject: quiz.subject,
    visibility: quiz.visibility,
    pinned: quiz.pinned,
    favorited: quiz.favorited,
    metadata: meta,
    settings: meta.settings || {
      shuffleQuestions: false,
      shuffleOptions: false,
      randomSubset: 0,
      timePerQuestion: 30,
      showExplanations: true,
      passingScore: 70,
      maxAttempts: 0,
      negativeMarking: false,
    },
    sections: Array.isArray(meta.sections) ? meta.sections : [],
    course: quiz.lectures[0]?.section?.course || null,
    questions: quiz.questions.map(mapQuestion),
    version: typeof meta.version === "number" ? meta.version : 1,
  };
}

export async function saveQuizEditor(
  quizId: string,
  userId: string,
  role: string,
  payload: {
    title?: string;
    description?: string;
    subject?: string;
    visibility?: string;
    pinned?: boolean;
    favorited?: boolean;
    settings?: Record<string, unknown>;
    sections?: unknown[];
    questions?: Array<{
      id?: string;
      text: string;
      type: string;
      difficulty?: string;
      marks?: number;
      negativeMarks?: number;
      hint?: string;
      bloomLevel?: string;
      order?: number;
      explanation?: string;
      hints?: string[];
      tags?: string[];
      estimatedSeconds?: number;
      sectionId?: string;
      media?: unknown;
      metadata?: Record<string, unknown>;
      options?: Array<{ id?: string; text: string; isCorrect: boolean; order?: number }>;
    }>;
  }
) {
  await assertQuizAccess(quizId, userId, role);

  const existing = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { include: { options: true } } },
  });
  if (!existing) throw new AppError(404, "Quiz not found");

  const prevMeta = (existing.metadata || {}) as Record<string, unknown>;
  const nextVersion = (typeof prevMeta.version === "number" ? prevMeta.version : 0) + 1;

  const nextMeta = {
    ...prevMeta,
    version: nextVersion,
    settings: payload.settings ?? prevMeta.settings,
    sections: payload.sections ?? prevMeta.sections ?? [],
  };

  await prisma.$transaction(async (tx) => {
    await tx.quiz.update({
      where: { id: quizId },
      data: {
        title: payload.title?.trim() ?? existing.title,
        description: payload.description ?? existing.description,
        subject: payload.subject ?? existing.subject,
        visibility: payload.visibility ?? existing.visibility,
        pinned: payload.pinned ?? existing.pinned,
        favorited: payload.favorited ?? existing.favorited,
        metadata: nextMeta as any,
        authorId: existing.authorId || userId,
      },
    });

    if (payload.questions) {
      await tx.option.deleteMany({ where: { question: { quizId } } });
      await tx.question.deleteMany({ where: { quizId } });

      for (const [index, q] of payload.questions.entries()) {
        const qMeta: Record<string, unknown> = {
          ...(q.metadata || {}),
          hints: q.hints || (q.hint ? [q.hint] : []),
          tags: q.tags || [],
          bloomLevel: q.bloomLevel || "L2",
          estimatedSeconds: q.estimatedSeconds || 45,
          sectionId: q.sectionId || null,
          media: q.media || null,
        };

        const created = await tx.question.create({
          data: {
            quizId,
            text: q.text,
            type: q.type,
            difficulty: q.difficulty || "medium",
            marks: q.marks ?? 1,
            negativeMarks: q.negativeMarks ?? 0,
            hint: q.hint || q.hints?.[0] || null,
            bloomLevel: q.bloomLevel || "L2",
            order: q.order ?? index,
            explanation: q.explanation || null,
            metadata: qMeta as any,
          },
        });

        if (q.options?.length) {
          await tx.option.createMany({
            data: q.options.map((o, oi) => ({
              questionId: created.id,
              text: o.text,
              isCorrect: o.isCorrect,
              order: o.order ?? oi,
            })),
          });
        }
      }

      const totalMarks = await tx.question.aggregate({ where: { quizId }, _sum: { marks: true } });
      await tx.quiz.update({ where: { id: quizId }, data: { totalMarks: totalMarks._sum.marks ?? 0 } });
    }

    const snapshot = await tx.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { include: { options: true } } },
    });

    await tx.quizVersion.create({
      data: {
        quizId,
        version: nextVersion,
        createdById: userId,
        snapshot: snapshot as object,
      },
    });
  });

  return getQuizEditor(quizId, userId, role);
}

export async function validateQuiz(quizId: string, userId: string, role: string) {
  const editor = await getQuizEditor(quizId, userId, role);
  return validateQuizContent({
    title: editor.title,
    questions: editor.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      difficulty: q.difficulty,
      explanation: q.explanation,
      metadata: q.metadata,
      options: q.options,
    })),
  });
}

export async function duplicateQuiz(
  quizId: string,
  userId: string,
  role: string,
  options?: { keepOriginalBranding?: boolean; identity?: Record<string, unknown>; title?: string }
) {
  const editor = await getQuizEditor(quizId, userId, role);
  let metadata = editor.metadata as Record<string, unknown>;
  const title = options?.title?.trim() || `${editor.title} (Copy)`;

  if (options?.keepOriginalBranding === false && options.identity) {
    metadata = { ...metadata, ...options.identity };
  }

  const created = await prisma.quiz.create({
    data: {
      title,
      description: editor.description,
      subject: editor.subject,
      authorId: userId,
      visibility: (options?.identity?.visibility as string) || "private",
      metadata: metadata as object,
      totalMarks: editor.questions.reduce((s, q) => s + q.marks, 0),
    },
  });

  for (const [index, q] of editor.questions.entries()) {
    const question = await prisma.question.create({
      data: {
        quizId: created.id,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        hint: q.hint,
        bloomLevel: q.bloomLevel,
        order: index,
        explanation: q.explanation,
        metadata: q.metadata as object,
      },
    });
    if (q.options.length) {
      await prisma.option.createMany({
        data: q.options.map((o, oi) => ({
          questionId: question.id,
          text: o.text,
          isCorrect: o.isCorrect,
          order: oi,
        })),
      });
    }
  }

  return { id: created.id, title: created.title };
}

export async function archiveQuiz(quizId: string, userId: string, role: string, archived: boolean) {
  await assertQuizAccess(quizId, userId, role);
  await prisma.quiz.update({
    where: { id: quizId },
    data: { archivedAt: archived ? new Date() : null },
  });
  return { archived };
}

export async function listQuizVersions(quizId: string, userId: string, role: string) {
  await assertQuizAccess(quizId, userId, role);
  return prisma.quizVersion.findMany({
    where: { quizId },
    orderBy: { version: "desc" },
    take: 20,
    select: { id: true, version: true, createdAt: true, createdById: true },
  });
}

export async function restoreQuizVersion(
  quizId: string,
  version: number,
  userId: string,
  role: string
) {
  await assertQuizAccess(quizId, userId, role);
  const row = await prisma.quizVersion.findUnique({
    where: { quizId_version: { quizId, version } },
  });
  if (!row) throw new AppError(404, "Version not found");

  const snapshot = row.snapshot as {
    title: string;
    description: string | null;
    subject: string | null;
    metadata: unknown;
    questions: Array<{
      text: string;
      type: string;
      difficulty: string | null;
      marks: number;
      order: number;
      explanation: string | null;
      metadata: unknown;
      options: Array<{ text: string; isCorrect: boolean; order: number }>;
    }>;
  };

  return saveQuizEditor(quizId, userId, role, {
    title: snapshot.title,
    description: snapshot.description || undefined,
    subject: snapshot.subject || undefined,
    settings: (snapshot.metadata as Record<string, unknown>)?.settings as Record<string, unknown>,
    sections: (snapshot.metadata as Record<string, unknown>)?.sections as unknown[],
    questions: snapshot.questions.map((q) => ({
      text: q.text,
      type: q.type,
      difficulty: q.difficulty || undefined,
      marks: q.marks,
      order: q.order,
      explanation: q.explanation || undefined,
      metadata: (q.metadata || {}) as Record<string, unknown>,
      options: q.options,
    })),
  });
}

export async function deleteQuiz(quizId: string, userId: string, role: string) {
  await assertQuizAccess(quizId, userId, role);
  const sessions = await prisma.liveSession.count({
    where: { quizId, status: { in: ["lobby", "active"] } },
  });
  if (sessions > 0) throw new AppError(400, "Cannot delete quiz with active live sessions");
  await prisma.quiz.delete({ where: { id: quizId } });
  return { deleted: true };
}
