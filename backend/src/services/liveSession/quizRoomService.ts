import crypto from "crypto";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import {
  DEFAULT_LIVE_SESSION_SETTINGS,
  type LiveSessionSettings,
  type QuizRoomSourceType,
  QUIZ_ROOM_SOURCE_TYPES,
  LIVE_SESSION_TYPES,
} from "./types.js";
import { assertHostOrAdmin, assertQuizHostAccess } from "./liveSessionAccessService.js";
import { extractQuizBrandingFromMetadata } from "../../utils/quizBranding.js";

const ROOM_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[bytes[i]! % ROOM_CODE_CHARS.length];
  }
  return code;
}

function generatePin(): string {
  return String(crypto.randomInt(1000, 10000));
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
    const pin = generatePin();
    const existing = await prisma.liveSession.findFirst({
      where: { pin, status: { in: ["lobby", "active", "scheduled"] } },
    });
    if (!existing) return pin;
  }
  throw new AppError(500, "Failed to generate PIN");
}

function parseSettings(raw: unknown): LiveSessionSettings {
  return { ...DEFAULT_LIVE_SESSION_SETTINGS, ...(raw as Partial<LiveSessionSettings>) };
}

export interface CreateQuizRoomInput {
  quizId: string;
  title?: string;
  sessionType?: string;
  sourceType?: QuizRoomSourceType;
  courseId?: string;
  lectureId?: string;
  learningUniverseId?: string;
  settings?: Partial<LiveSessionSettings>;
  scheduledAt?: string | Date | null;
  asDraft?: boolean;
  clonedFromId?: string;
}

export interface UpdateQuizRoomInput {
  title?: string;
  sessionType?: string;
  sourceType?: QuizRoomSourceType;
  quizId?: string;
  courseId?: string | null;
  lectureId?: string | null;
  learningUniverseId?: string | null;
  settings?: Partial<LiveSessionSettings>;
  scheduledAt?: string | Date | null;
}

export async function createQuizRoom(hostUserId: string, role: string, data: CreateQuizRoomInput) {
  await assertQuizHostAccess(hostUserId, role, data.quizId);

  const quiz = await prisma.quiz.findUnique({
    where: { id: data.quizId },
    include: { questions: { select: { id: true } } },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");
  if (quiz.questions.length === 0) throw new AppError(400, "Quiz has no questions");

  const settings = { ...DEFAULT_LIVE_SESSION_SETTINGS, ...data.settings };
  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  const isDraft = data.asDraft === true;

  if (scheduledAt && !isDraft && scheduledAt.getTime() <= Date.now()) {
    throw new AppError(400, "Scheduled time must be in the future");
  }

  const isScheduled = !isDraft && scheduledAt && scheduledAt.getTime() > Date.now();

  let roomCode: string | null = null;
  let pin: string | null = null;
  let status = "lobby";

  if (isDraft) {
    status = "draft";
  } else if (isScheduled) {
    status = "scheduled";
    roomCode = await uniqueRoomCode();
    pin = await uniquePin();
  } else {
    roomCode = await uniqueRoomCode();
    pin = await uniquePin();
    status = "lobby";
  }

  const session = await prisma.liveSession.create({
    data: {
      roomCode,
      pin,
      title: data.title || quiz.title,
      status,
      sessionType: data.sessionType || "live_classroom",
      sourceType: data.sourceType || "existing_quiz",
      quizId: data.quizId,
      hostUserId,
      courseId: data.courseId,
      lectureId: data.lectureId,
      learningUniverseId: data.learningUniverseId,
      settings,
      cameraEnabled: settings.cameraRequired ?? false,
      scheduledAt: isScheduled ? scheduledAt : null,
      clonedFromId: data.clonedFromId,
    },
    include: {
      quiz: { select: { id: true, title: true, totalMarks: true } },
      host: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { participants: true } },
    },
  });

  if (!isDraft) {
    await prisma.sessionAnalytics.create({ data: { sessionId: session.id } });
  }

  return session;
}

export async function updateQuizRoom(
  sessionId: string,
  hostUserId: string,
  role: string,
  data: UpdateQuizRoomInput
) {
  await assertHostOrAdmin(hostUserId, role, sessionId);

  const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, "Quiz room not found");
  if (!["draft", "scheduled", "lobby"].includes(session.status)) {
    throw new AppError(400, "Only draft, scheduled, or lobby rooms can be edited");
  }

  if (data.quizId && data.quizId !== session.quizId) {
    await assertQuizHostAccess(hostUserId, role, data.quizId);
    const quiz = await prisma.quiz.findUnique({
      where: { id: data.quizId },
      include: { questions: { select: { id: true } } },
    });
    if (!quiz || quiz.questions.length === 0) {
      throw new AppError(400, "Selected quiz has no questions");
    }
  }

  const currentSettings = parseSettings(session.settings);
  const settings = data.settings ? { ...currentSettings, ...data.settings } : undefined;
  const scheduledAt =
    data.scheduledAt === null ? null : data.scheduledAt ? new Date(data.scheduledAt) : undefined;

  let status = session.status;
  if (session.status === "draft" && scheduledAt && scheduledAt.getTime() > Date.now()) {
    status = "scheduled";
  }

  return prisma.liveSession.update({
    where: { id: sessionId },
    data: {
      title: data.title,
      sessionType: data.sessionType,
      sourceType: data.sourceType,
      quizId: data.quizId,
      courseId: data.courseId,
      lectureId: data.lectureId,
      learningUniverseId: data.learningUniverseId,
      settings,
      cameraEnabled: settings ? (settings.cameraRequired ?? false) : undefined,
      scheduledAt,
      status,
    },
    include: {
      quiz: { select: { id: true, title: true, totalMarks: true } },
      _count: { select: { participants: true } },
    },
  });
}

export async function launchQuizRoom(sessionId: string, hostUserId: string, role: string) {
  await assertHostOrAdmin(hostUserId, role, sessionId);

  const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, "Quiz room not found");
  if (!["draft", "scheduled"].includes(session.status)) {
    throw new AppError(400, "Only draft or scheduled rooms can be launched");
  }

  const roomCode = session.roomCode || (await uniqueRoomCode());
  const pin = session.pin || (await uniquePin());
  const settings = session.settings ? { ...(session.settings as any) } : {};
  if (settings.musicEnabled) {
    settings.musicPlaying = true;
  }

  const updated = await prisma.liveSession.update({
    where: { id: sessionId },
    data: {
      roomCode,
      pin,
      status: "lobby",
      scheduledAt: null,
      settings,
    },
    include: {
      quiz: { select: { id: true, title: true, totalMarks: true } },
      _count: { select: { participants: true } },
    },
  });

  const analytics = await prisma.sessionAnalytics.findUnique({ where: { sessionId } });
  if (!analytics) {
    await prisma.sessionAnalytics.create({ data: { sessionId } });
  }

  return updated;
}

export async function deleteQuizRoom(sessionId: string, hostUserId: string, role: string) {
  await assertHostOrAdmin(hostUserId, role, sessionId);

  const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, "Quiz room not found");
  if (session.status === "active") {
    throw new AppError(400, "Cannot delete an active session. Finish it first.");
  }

  await prisma.liveSession.delete({ where: { id: sessionId } });
  return { deleted: true };
}

export async function duplicateQuizRoom(
  sessionId: string,
  hostUserId: string,
  role: string,
  asDraft = true
) {
  await assertHostOrAdmin(hostUserId, role, sessionId);

  const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, "Quiz room not found");

  return createQuizRoom(hostUserId, role, {
    quizId: session.quizId,
    title: `${session.title} (Copy)`,
    sessionType: session.sessionType,
    sourceType: session.sourceType as QuizRoomSourceType,
    courseId: session.courseId ?? undefined,
    lectureId: session.lectureId ?? undefined,
    learningUniverseId: session.learningUniverseId ?? undefined,
    settings: parseSettings(session.settings),
    asDraft,
    clonedFromId: sessionId,
  });
}

export async function listQuizRooms(
  hostUserId: string,
  filters?: { status?: string; sourceType?: string }
) {
  const where: Record<string, unknown> = { hostUserId };
  if (filters?.status) where.status = filters.status;
  if (filters?.sourceType) where.sourceType = filters.sourceType;

  return prisma.liveSession.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      quiz: { select: { id: true, title: true, totalMarks: true } },
      course: { select: { id: true, title: true } },
      analytics: { select: { totalParticipants: true, avgAccuracy: true } },
      _count: { select: { participants: true } },
    },
  });
}

export async function getQuizRoomPreview(quizId: string, hostUserId: string, role: string) {
  await assertQuizHostAccess(hostUserId, role, quizId);

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");

  const questionTypes = [...new Set(quiz.questions.map((q) => q.type))];
  const totalMarks = quiz.questions.reduce((sum, q) => sum + q.marks, 0);
  const difficulties = quiz.questions.map((q) => q.difficulty).filter(Boolean) as string[];
  const topics = [...new Set(difficulties)];

  const typeCounts = quiz.questions.reduce<Record<string, number>>((acc, q) => {
    acc[q.type] = (acc[q.type] || 0) + 1;
    return acc;
  }, {});

  const avgDifficulty =
    difficulties.length > 0
      ? difficulties.filter((d) => d === "hard").length / difficulties.length > 0.5
        ? "hard"
        : difficulties.filter((d) => d === "easy").length / difficulties.length > 0.5
          ? "easy"
          : "medium"
      : "medium";

  return {
    quizId: quiz.id,
    title: quiz.title,
    description: quiz.description,
    questionCount: quiz.questions.length,
    totalMarks,
    estimatedMinutes: Math.ceil((quiz.questions.length * 30) / 60),
    questionTypes,
    typeCounts,
    topics,
    avgDifficulty,
    passingPercent: 60,
    ...extractQuizBrandingFromMetadata(quiz.metadata as Record<string, unknown>, quiz.id),
    questions: quiz.questions.map((q, i) => ({
      index: i + 1,
      id: q.id,
      text: q.text.slice(0, 120) + (q.text.length > 120 ? "…" : ""),
      type: q.type,
      marks: q.marks,
      difficulty: q.difficulty,
      optionCount: q.options.length,
    })),
  };
}

export async function listInstructorQuestionBank(hostUserId: string) {
  const courses = await prisma.course.findMany({
    where: { instructorId: hostUserId },
    select: {
      id: true,
      title: true,
      sections: {
        select: {
          id: true,
          title: true,
          lectures: {
            where: { type: "quiz", quizId: { not: null } },
            select: {
              id: true,
              title: true,
              quizId: true,
              quiz: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  totalMarks: true,
                  _count: { select: { questions: true } },
                  questions: { select: { type: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const items: Array<{
    quizId: string;
    quizTitle: string;
    description: string | null;
    questionCount: number;
    totalMarks: number;
    courseId: string;
    courseTitle: string;
    sectionTitle: string;
    lectureId: string;
    lectureTitle: string;
    questionTypes: string[];
  }> = [];

  for (const course of courses) {
    for (const section of course.sections) {
      for (const lecture of section.lectures) {
        if (!lecture.quiz) continue;
        items.push({
          quizId: lecture.quiz.id,
          quizTitle: lecture.quiz.title,
          description: lecture.quiz.description,
          questionCount: lecture.quiz._count.questions,
          totalMarks: lecture.quiz.totalMarks,
          courseId: course.id,
          courseTitle: course.title,
          sectionTitle: section.title,
          lectureId: lecture.id,
          lectureTitle: lecture.title,
          questionTypes: [...new Set(lecture.quiz.questions.map((q) => q.type))],
        });
      }
    }
  }

  return items;
}

export async function listQuizRoomReports(hostUserId: string) {
  return prisma.liveSession.findMany({
    where: { hostUserId, status: "finished" },
    orderBy: { endedAt: "desc" },
    take: 50,
    include: {
      quiz: { select: { title: true } },
      analytics: true,
      _count: { select: { participants: true, answers: true } },
    },
  });
}

export async function listQuizRoomTemplates(hostUserId: string) {
  return prisma.quizRoomTemplate.findMany({
    where: { hostUserId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createQuizRoomTemplate(
  hostUserId: string,
  data: {
    name: string;
    description?: string;
    sessionType?: string;
    sourceType?: string;
    settings?: Partial<LiveSessionSettings>;
  }
) {
  if (!data.name.trim()) throw new AppError(400, "Template name is required");

  return prisma.quizRoomTemplate.create({
    data: {
      hostUserId,
      name: data.name.trim(),
      description: data.description,
      sessionType: data.sessionType || "live_classroom",
      sourceType: data.sourceType || "existing_quiz",
      settings: { ...DEFAULT_LIVE_SESSION_SETTINGS, ...data.settings },
    },
  });
}

export async function deleteQuizRoomTemplate(templateId: string, hostUserId: string) {
  const template = await prisma.quizRoomTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.hostUserId !== hostUserId) {
    throw new AppError(404, "Template not found");
  }
  await prisma.quizRoomTemplate.delete({ where: { id: templateId } });
  return { deleted: true };
}

export async function getQuizRoomPreferences(userId: string) {
  const prefs = await prisma.quizRoomPreferences.findUnique({ where: { userId } });
  return parseSettings(prefs?.defaults ?? {});
}

export async function saveQuizRoomPreferences(userId: string, defaults: Partial<LiveSessionSettings>) {
  const merged = { ...DEFAULT_LIVE_SESSION_SETTINGS, ...defaults };
  return prisma.quizRoomPreferences.upsert({
    where: { userId },
    create: { userId, defaults: merged },
    update: { defaults: merged },
  });
}

export async function lookupByCodeOrPin(codeOrPin: string) {
  const normalized = codeOrPin.trim().toUpperCase();
  const isPin = /^\d{4}$/.test(codeOrPin.trim());

  const session = isPin
    ? await prisma.liveSession.findFirst({
        where: { pin: codeOrPin.trim(), status: { in: ["lobby", "active", "scheduled"] } },
        select: {
          id: true,
          roomCode: true,
          pin: true,
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
      })
    : await prisma.liveSession.findUnique({
        where: { roomCode: normalized },
        select: {
          id: true,
          roomCode: true,
          pin: true,
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

  if (!session) throw new AppError(404, "Quiz room not found. Check your code or PIN.");
  if (session.status === "draft") throw new AppError(400, "This room has not been launched yet.");
  return session;
}

export function validateSourceType(value: string): QuizRoomSourceType {
  if (!(QUIZ_ROOM_SOURCE_TYPES as readonly string[]).includes(value)) {
    throw new AppError(400, "Invalid source type");
  }
  return value as QuizRoomSourceType;
}

export function validateSessionType(value: string) {
  if (!(LIVE_SESSION_TYPES as readonly string[]).includes(value)) {
    throw new AppError(400, "Invalid session type");
  }
  return value;
}
