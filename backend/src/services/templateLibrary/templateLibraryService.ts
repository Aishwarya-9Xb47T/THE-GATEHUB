import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { OFFICIAL_TEMPLATE_CATALOG, catalogEntryToSnapshot } from "./seedCatalog.js";
import { DEFAULT_LIVE_SESSION_SETTINGS, type LiveSessionSettings } from "../liveSession/types.js";

let seedPromise: Promise<void> | null = null;

export interface TemplateListFilters {
  q?: string;
  category?: string;
  subject?: string;
  difficulty?: string;
  source?: string;
  section?: string;
  questionTypes?: string[];
  supportsHomework?: boolean;
  supportsLive?: boolean;
  supportsAi?: boolean;
  supportsMedia?: boolean;
  language?: string;
  sort?: "newest" | "popular" | "rating" | "trending";
  page?: number;
  pageSize?: number;
  userId?: string;
}

export async function ensureOfficialTemplatesSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const count = await prisma.quizLibraryTemplate.count({ where: { isOfficial: true } });
      if (count >= OFFICIAL_TEMPLATE_CATALOG.length) return;

      for (const entry of OFFICIAL_TEMPLATE_CATALOG) {
        const existing = await prisma.quizLibraryTemplate.findUnique({ where: { slug: entry.slug } });
        if (existing) continue;

        await prisma.quizLibraryTemplate.create({
          data: {
            slug: entry.slug,
            title: entry.title,
            description: entry.description,
            coverGradient: entry.coverGradient,
            coverImageUrl: `https://picsum.photos/seed/${entry.slug}/800/450`,
            category: entry.category,
            subject: entry.subject,
            gradeLevel: entry.gradeLevel,
            difficulty: entry.difficulty,
            tags: entry.tags,
            questionCount: entry.questionCount,
            durationMinutes: entry.durationMinutes,
            questionTypes: entry.questionTypes,
            visibility: "public",
            source: "official",
            status: "published",
            isFeatured: entry.isFeatured,
            isOfficial: true,
            authorName: entry.authorName,
            quizSnapshot: catalogEntryToSnapshot(entry),
            sessionSettings: DEFAULT_LIVE_SESSION_SETTINGS,
            learningObjectives: entry.learningObjectives,
            supportsHomework: entry.supportsHomework,
            supportsLive: entry.supportsLive,
            supportsAi: entry.supportsAi,
            supportsMedia: entry.supportsMedia,
            ratingAvg: entry.ratingAvg,
            ratingCount: 12 + Math.floor(entry.useCount / 10),
            useCount: entry.useCount,
            bookmarkCount: Math.floor(entry.useCount / 5),
            publishedAt: new Date(),
          },
        });
      }
    })().catch((err) => {
      seedPromise = null;
      console.warn("[TemplateLibrary] Seed failed (run prisma migrate):", err?.message || err);
    });
  }
  await seedPromise;
}

function mapTemplate(row: NonNullable<Awaited<ReturnType<typeof prisma.quizLibraryTemplate.findFirst>>>, favorited?: boolean) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    coverGradient: row.coverGradient,
    coverImageUrl: row.coverImageUrl,
    category: row.category,
    subject: row.subject,
    gradeLevel: row.gradeLevel,
    difficulty: row.difficulty,
    tags: row.tags,
    questionCount: row.questionCount,
    durationMinutes: row.durationMinutes,
    questionTypes: row.questionTypes,
    visibility: row.visibility,
    source: row.source,
    status: row.status,
    isFeatured: row.isFeatured,
    isOfficial: row.isOfficial,
    version: row.version,
    authorUserId: row.authorUserId,
    authorName: row.authorName,
    learningObjectives: row.learningObjectives,
    supportsHomework: row.supportsHomework,
    supportsLive: row.supportsLive,
    supportsAi: row.supportsAi,
    supportsMedia: row.supportsMedia,
    language: row.language,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    useCount: row.useCount,
    bookmarkCount: row.bookmarkCount,
    favorited: favorited ?? false,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  };
}

export async function listTemplates(filters: TemplateListFilters) {
  await ensureOfficialTemplatesSeeded();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(48, Math.max(12, filters.pageSize ?? 24));
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { status: { in: ["published", "draft"] } };

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { subject: { contains: q, mode: "insensitive" } },
      { authorName: { contains: q, mode: "insensitive" } },
      { tags: { hasSome: [q] } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }
  if (filters.category) where.category = filters.category;
  if (filters.subject) where.subject = filters.subject;
  if (filters.difficulty) where.difficulty = filters.difficulty;
  if (filters.supportsHomework !== undefined) where.supportsHomework = filters.supportsHomework;
  if (filters.supportsLive !== undefined) where.supportsLive = filters.supportsLive;
  if (filters.supportsAi !== undefined) where.supportsAi = filters.supportsAi;
  if (filters.supportsMedia !== undefined) where.supportsMedia = filters.supportsMedia;
  if (filters.language) where.language = filters.language;

  if (filters.section === "featured") where.isFeatured = true;
  if (filters.section === "official") where.isOfficial = true;
  if (filters.section === "my" && filters.userId) {
    where.authorUserId = filters.userId;
  }
  if (filters.section === "trending") where.useCount = { gte: 50 };
  if (filters.source) where.source = filters.source;

  let orderBy: Record<string, string> = { useCount: "desc" };
  if (filters.sort === "newest" || filters.section === "new") orderBy = { publishedAt: "desc" };
  if (filters.sort === "rating") orderBy = { ratingAvg: "desc" };

  const [rows, total, categoryGroups, featured] = await Promise.all([
    prisma.quizLibraryTemplate.findMany({ where, orderBy, skip, take: pageSize }),
    prisma.quizLibraryTemplate.count({ where }),
    prisma.quizLibraryTemplate.groupBy({ by: ["category"], _count: true, orderBy: { _count: { category: "desc" } } }),
    prisma.quizLibraryTemplate.findMany({
      where: { isFeatured: true, status: "published" },
      orderBy: { useCount: "desc" },
      take: 12,
    }),
  ]);

  let favoriteIds = new Set<string>();
  if (filters.userId) {
    const favs = await prisma.quizLibraryTemplateFavorite.findMany({
      where: { userId: filters.userId },
      select: { templateId: true },
    });
    favoriteIds = new Set(favs.map((f) => f.templateId));
  }

  const items = rows.map((r) => mapTemplate(r, favoriteIds.has(r.id)));

  let recentlyUsed: ReturnType<typeof mapTemplate>[] = [];
  if (filters.userId) {
    const usages = await prisma.quizLibraryTemplateUsage.findMany({
      where: { userId: filters.userId },
      orderBy: { usedAt: "desc" },
      take: 8,
      distinct: ["templateId"],
      include: { template: true },
    });
    recentlyUsed = usages
      .map((u) => mapTemplate(u.template, favoriteIds.has(u.templateId)))
      .filter(Boolean) as ReturnType<typeof mapTemplate>[];
  }

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: skip + items.length < total,
    categories: categoryGroups.map((c) => ({ name: c.category, count: c._count })),
    featured: featured.map((f) => mapTemplate(f, favoriteIds.has(f.id))),
    recentlyUsed,
  };
}

export async function getTemplateById(templateId: string, userId?: string) {
  await ensureOfficialTemplatesSeeded();
  const row = await prisma.quizLibraryTemplate.findFirst({
    where: { OR: [{ id: templateId }, { slug: templateId }] },
    include: { versions: { orderBy: { version: "desc" }, take: 5 } },
  });
  if (!row) throw new AppError(404, "Template not found");

  let favorited = false;
  if (userId) {
    const fav = await prisma.quizLibraryTemplateFavorite.findUnique({
      where: { userId_templateId: { userId, templateId: row.id } },
    });
    favorited = Boolean(fav);
  }

  return {
    ...mapTemplate(row, favorited),
    quizSnapshot: row.quizSnapshot,
    sessionSettings: row.sessionSettings as LiveSessionSettings | null,
    versions: row.versions.map((v) => ({
      version: v.version,
      changelog: v.changelog,
      createdAt: v.createdAt,
    })),
  };
}

export async function toggleTemplateFavorite(userId: string, templateId: string) {
  const tpl = await prisma.quizLibraryTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) throw new AppError(404, "Template not found");

  const existing = await prisma.quizLibraryTemplateFavorite.findUnique({
    where: { userId_templateId: { userId, templateId } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.quizLibraryTemplateFavorite.delete({ where: { userId_templateId: { userId, templateId } } }),
      prisma.quizLibraryTemplate.update({ where: { id: templateId }, data: { bookmarkCount: { decrement: 1 } } }),
    ]);
    return { favorited: false };
  }

  await prisma.$transaction([
    prisma.quizLibraryTemplateFavorite.create({ data: { userId, templateId } }),
    prisma.quizLibraryTemplate.update({ where: { id: templateId }, data: { bookmarkCount: { increment: 1 } } }),
  ]);
  return { favorited: true };
}

export async function applyTemplate(
  userId: string,
  templateId: string,
  options?: {
    mergeMode?: "merge" | "replace";
    identity?: Record<string, unknown>;
    title?: string;
    description?: string;
    subject?: string;
    visibility?: string;
  }
) {
  await ensureOfficialTemplatesSeeded();
  const tpl = await prisma.quizLibraryTemplate.findFirst({
    where: { OR: [{ id: templateId }, { slug: templateId }] },
  });
  if (!tpl) throw new AppError(404, "Template not found");

  const sessionSettings = (tpl.sessionSettings as LiveSessionSettings) || DEFAULT_LIVE_SESSION_SETTINGS;
  const snap = tpl.quizSnapshot as {
    title: string;
    description?: string;
    subject?: string;
    metadata?: Record<string, unknown>;
    questions: Array<{
      text: string;
      type: string;
      difficulty?: string;
      marks?: number;
      order: number;
      explanation?: string;
      metadata?: unknown;
      options?: Array<{ text: string; isCorrect: boolean; order: number }>;
    }>;
  } | null;

  if (!snap?.questions?.length) {
    throw new AppError(400, "Template has no questions to apply");
  }

  const baseMeta = (snap.metadata && typeof snap.metadata === "object" ? snap.metadata : {}) as Record<string, unknown>;
  const baseSettings = (baseMeta.settings && typeof baseMeta.settings === "object"
    ? baseMeta.settings
    : {}) as Record<string, unknown>;

  const mergeMode = options?.mergeMode ?? "replace";
  const instructorMeta = (options?.identity && typeof options.identity === "object" ? options.identity : {}) as Record<string, unknown>;
  const instructorIdBlock = (instructorMeta.identity && typeof instructorMeta.identity === "object" ? instructorMeta.identity : {}) as Record<string, unknown>;
  const instructorTags = Array.isArray(instructorIdBlock.tags) ? (instructorIdBlock.tags as string[]) : [];

  const instructorBranding =
    options?.identity
      ? {
          ...instructorMeta,
          coverImageUrl: instructorMeta.coverImageUrl || instructorMeta.bannerUrl,
          coverGradient: instructorMeta.coverGradient || baseMeta.coverGradient,
          bannerUrl: instructorMeta.bannerUrl,
          thumbnailUrl: instructorMeta.thumbnailUrl,
          identity: instructorIdBlock,
        }
      : {};

  const quizMetadata =
    mergeMode === "merge" && options?.identity
      ? {
          ...baseMeta,
          ...instructorBranding,
          fromTemplateId: tpl.id,
          fromTemplateSlug: tpl.slug,
          templateVersion: tpl.version,
          tags: [...new Set([...instructorTags, ...tpl.tags])],
          sessionSettings,
          settings: {
            ...baseSettings,
            ...(instructorMeta.settings as object),
            timePerQuestion: sessionSettings.timePerQuestion ?? baseSettings.timePerQuestion ?? 30,
            shuffleQuestions: sessionSettings.shuffleQuestions ?? baseSettings.shuffleQuestions ?? true,
            shuffleOptions: sessionSettings.shuffleOptions ?? baseSettings.shuffleOptions ?? true,
            showExplanations: sessionSettings.showExplanations ?? baseSettings.showExplanations ?? true,
            passingScore: sessionSettings.passingScore ?? baseSettings.passingScore,
          },
        }
      : {
          ...baseMeta,
          ...instructorBranding,
          fromTemplateId: tpl.id,
          fromTemplateSlug: tpl.slug,
          templateVersion: tpl.version,
          tags: tpl.tags,
          coverGradient: instructorBranding.coverGradient || tpl.coverGradient || baseMeta.coverGradient,
          coverImageUrl: instructorBranding.coverImageUrl || tpl.coverImageUrl || baseMeta.coverImageUrl,
          bannerUrl: instructorBranding.bannerUrl || tpl.coverImageUrl || baseMeta.bannerUrl,
          thumbnailUrl: instructorBranding.thumbnailUrl || baseMeta.thumbnailUrl,
          sessionSettings,
          settings: {
            ...baseSettings,
            timePerQuestion: sessionSettings.timePerQuestion ?? baseSettings.timePerQuestion ?? 30,
            shuffleQuestions: sessionSettings.shuffleQuestions ?? baseSettings.shuffleQuestions ?? true,
            shuffleOptions: sessionSettings.shuffleOptions ?? baseSettings.shuffleOptions ?? true,
            showExplanations: sessionSettings.showExplanations ?? baseSettings.showExplanations ?? true,
            passingScore: sessionSettings.passingScore ?? baseSettings.passingScore,
          },
        };

  const created = await prisma.quiz.create({
    data: {
      title: mergeMode === "merge" && options?.title?.trim() ? options.title.trim() : snap.title || tpl.title,
      description: mergeMode === "merge" && options?.description !== undefined ? options.description : snap.description || tpl.description,
      subject: mergeMode === "merge" && options?.subject ? options.subject : snap.subject || tpl.subject,
      authorId: userId,
      visibility: mergeMode === "merge" && options?.visibility ? options.visibility : "private",
      metadata: quizMetadata as object,
      totalMarks: snap.questions.reduce((s, q) => s + (q.marks ?? 1), 0),
    },
  });

  for (const [index, q] of snap.questions.entries()) {
    const question = await prisma.question.create({
      data: {
        quizId: created.id,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty || tpl.difficulty,
        marks: q.marks ?? 1,
        order: q.order ?? index,
        explanation: q.explanation,
        metadata: (q.metadata || {}) as object,
      },
    });
    if (q.options?.length) {
      await prisma.option.createMany({
        data: q.options.map((o, oi) => ({
          questionId: question.id,
          text: o.text,
          isCorrect: o.isCorrect,
          order: o.order ?? oi,
        })),
      });
    }
  }

  const quizId = created.id;

  await prisma.$transaction([
    prisma.quizLibraryTemplateUsage.create({ data: { userId, templateId: tpl.id, quizId } }),
    prisma.quizLibraryTemplate.update({ where: { id: tpl.id }, data: { useCount: { increment: 1 } } }),
  ]);

  return {
    quizId,
    templateId: tpl.id,
    title: tpl.title,
    sessionSettings,
  };
}

export async function saveQuizAsTemplate(
  userId: string,
  quizId: string,
  input: {
    title: string;
    description?: string;
    category: string;
    subject?: string;
    gradeLevel?: string;
    difficulty?: string;
    tags?: string[];
    visibility?: string;
  }
) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, authorId: userId },
    include: {
      questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
    },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");

  const slug = `${slugify(input.title)}-${Date.now().toString(36)}`;
  const questionTypes = [...new Set(quiz.questions.map((q) => q.type))];

  const snapshot = {
    title: quiz.title,
    description: quiz.description,
    subject: quiz.subject,
    metadata: quiz.metadata,
    questions: quiz.questions.map((q) => ({
      text: q.text,
      type: q.type,
      difficulty: q.difficulty,
      marks: q.marks,
      order: q.order,
      explanation: q.explanation,
      metadata: q.metadata,
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })),
    })),
  };

  const tpl = await prisma.quizLibraryTemplate.create({
    data: {
      slug,
      title: input.title,
      description: input.description || quiz.description,
      category: input.category,
      subject: input.subject || quiz.subject,
      gradeLevel: input.gradeLevel,
      difficulty: input.difficulty || "medium",
      tags: input.tags || [],
      questionCount: quiz.questions.length,
      durationMinutes: Math.max(5, Math.ceil(quiz.questions.length * 0.75)),
      questionTypes,
      visibility: input.visibility || "private",
      source: "user",
      status: input.visibility === "draft" ? "draft" : "published",
      authorUserId: userId,
      authorName: "You",
      quizId: quiz.id,
      quizSnapshot: snapshot,
      publishedAt: input.visibility === "draft" ? null : new Date(),
      coverGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      coverImageUrl: `https://picsum.photos/seed/${slug}/800/450`,
    },
  });

  return mapTemplate(tpl, true);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function deleteUserTemplate(userId: string, templateId: string) {
  const tpl = await prisma.quizLibraryTemplate.findFirst({
    where: { id: templateId, authorUserId: userId, isOfficial: false },
  });
  if (!tpl) throw new AppError(404, "Template not found or not deletable");
  await prisma.quizLibraryTemplate.delete({ where: { id: templateId } });
  return { deleted: true };
}

export async function duplicateTemplateToLibrary(userId: string, templateId: string) {
  await ensureOfficialTemplatesSeeded();
  const tpl = await prisma.quizLibraryTemplate.findFirst({
    where: { OR: [{ id: templateId }, { slug: templateId }] },
  });
  if (!tpl) throw new AppError(404, "Template not found");

  const slug = `${slugify(tpl.title)}-my-${Date.now().toString(36)}`;
  const copy = await prisma.quizLibraryTemplate.create({
    data: {
      slug,
      title: `${tpl.title} (My Copy)`,
      description: tpl.description,
      coverGradient: tpl.coverGradient,
      coverImageUrl: tpl.coverImageUrl,
      category: tpl.category,
      subject: tpl.subject,
      gradeLevel: tpl.gradeLevel,
      difficulty: tpl.difficulty,
      tags: [...tpl.tags, "duplicated"],
      questionCount: tpl.questionCount,
      durationMinutes: tpl.durationMinutes,
      questionTypes: tpl.questionTypes,
      visibility: "private",
      source: "user",
      status: "published",
      authorUserId: userId,
      authorName: "You",
      quizSnapshot: tpl.quizSnapshot ?? undefined,
      sessionSettings: (tpl.sessionSettings ?? DEFAULT_LIVE_SESSION_SETTINGS) as Prisma.InputJsonValue,
      learningObjectives: tpl.learningObjectives,
      supportsHomework: tpl.supportsHomework,
      supportsLive: tpl.supportsLive,
      supportsAi: tpl.supportsAi,
      supportsMedia: tpl.supportsMedia,
      language: tpl.language,
      publishedAt: new Date(),
    },
  });

  return mapTemplate(copy, true);
}

export const TEMPLATE_CATEGORIES = [
  "Midterm", "Final Exam", "Weekly Quiz", "Coding", "Programming", "Mathematics",
  "Physics", "Chemistry", "Biology", "AI", "Data Structures", "Aptitude", "Placement",
  "Interview", "General Knowledge", "Languages", "Computer Science", "University",
  "School", "Corporate", "Training", "Certification",
];
