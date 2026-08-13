import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";
import {
  type BankQuestionFilters,
  type CreateBankQuestionInput,
  runBasicAIValidation,
  snapshotQuestion,
} from "./types.js";

const DEFAULT_PAGE_SIZE = 24;

function parseTags(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String) : [];
}

function assertAuthorOrAdmin(authorId: string, userId: string, role: string) {
  if (authorId !== userId && !isAdminRole(role)) {
    throw new AppError(403, "Forbidden");
  }
}

export async function getDashboardStats(authorId: string) {
  const base = { authorId };
  const [
    total,
    collections,
    aiCount,
    manualCount,
    codingCount,
    pendingReview,
    approved,
    archived,
    byDifficulty,
    byType,
    byBloom,
    recent,
  ] = await Promise.all([
    prisma.bankQuestion.count({ where: base }),
    prisma.bankQuestionCollection.count({ where: { authorId } }),
    prisma.bankQuestion.count({ where: { ...base, source: "ai" } }),
    prisma.bankQuestion.count({ where: { ...base, source: "manual" } }),
    prisma.bankQuestion.count({ where: { ...base, type: { in: ["coding", "debugging", "predict_output", "sql"] } } }),
    prisma.bankQuestion.count({ where: { ...base, status: "pending_review" } }),
    prisma.bankQuestion.count({ where: { ...base, status: { in: ["approved", "published"] } } }),
    prisma.bankQuestion.count({ where: { ...base, status: "archived" } }),
    prisma.bankQuestion.groupBy({ by: ["difficulty"], where: base, _count: true }),
    prisma.bankQuestion.groupBy({ by: ["type"], where: base, _count: true }),
    prisma.bankQuestion.groupBy({ by: ["bloomLevel"], where: { ...base, bloomLevel: { not: null } }, _count: true }),
    prisma.bankQuestion.findMany({
      where: base,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { analytics: true, options: { orderBy: { order: "asc" } } },
    }),
  ]);

  return {
    totals: {
      questions: total,
      collections,
      aiGenerated: aiCount,
      humanCreated: manualCount,
      codingQuestions: codingCount,
      pendingReview,
      approved,
      archived,
    },
    charts: {
      difficulty: byDifficulty.map((d) => ({ label: d.difficulty || "unknown", count: d._count })),
      types: byType.map((t) => ({ label: t.type, count: t._count })),
      bloom: byBloom.map((b) => ({ label: b.bloomLevel || "unknown", count: b._count })),
    },
    recentlyAdded: recent,
  };
}

export async function listBankQuestions(authorId: string, filters: BankQuestionFilters) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, filters.limit || DEFAULT_PAGE_SIZE);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { authorId };

  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.difficulty) where.difficulty = filters.difficulty;
  if (filters.bloomLevel) where.bloomLevel = filters.bloomLevel;
  if (filters.source) where.source = filters.source;
  if (filters.courseId) where.courseId = filters.courseId;
  if (filters.topic) where.topic = { contains: filters.topic, mode: "insensitive" };
  if (filters.language) where.language = filters.language;

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { stem: { contains: q, mode: "insensitive" } },
      { topic: { contains: q, mode: "insensitive" } },
      { subtopic: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.bankQuestion.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: {
        options: { orderBy: { order: "asc" } },
        analytics: true,
        course: { select: { id: true, title: true } },
        validations: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.bankQuestion.count({ where }),
  ]);

  let filtered = items;
  if (filters.tag) {
    filtered = items.filter((item) => parseTags(item.tags).includes(filters.tag!));
  }

  return { items: filtered, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getBankQuestion(id: string, userId: string, role: string) {
  const question = await prisma.bankQuestion.findUnique({
    where: { id },
    include: {
      options: { orderBy: { order: "asc" } },
      analytics: true,
      versions: { orderBy: { version: "desc" }, take: 10 },
      reviews: { orderBy: { createdAt: "desc" }, take: 5 },
      validations: { orderBy: { createdAt: "desc" }, take: 3 },
      course: { select: { id: true, title: true } },
    },
  });
  if (!question) throw new AppError(404, "Question not found");
  assertAuthorOrAdmin(question.authorId, userId, role);
  return question;
}

export async function createBankQuestion(authorId: string, data: CreateBankQuestionInput) {
  if (!data.stem?.trim()) throw new AppError(400, "Question stem is required");

  const options = data.options || [];
  
  console.log("=== STAGE: createBankQuestion - Input ===");
  console.log("Stem:", data.stem);
  console.log("Options input:", options);
  console.log("Options length:", options.length);
  console.log("=== END STAGE ===\n");
  
  const validation = runBasicAIValidation({
    stem: data.stem,
    type: data.type,
    options,
    explanation: data.explanation,
  });

  const status =
    data.source === "ai" && validation.status === "failed"
      ? "draft"
      : data.status || (data.source === "ai" ? "pending_review" : "draft");

  const question = await prisma.$transaction(async (tx) => {
    console.log("=== STAGE: Prisma bankQuestion.create - Options Mapping ===");
    console.log("Options to map:", options);
    console.log("Mapped options:", options.map((o, i) => ({
      text: o.text,
      isCorrect: o.isCorrect,
      order: o.order ?? i,
    })));
    console.log("=== END STAGE ===\n");
    
    const created = await tx.bankQuestion.create({
      data: {
        authorId,
        stem: data.stem.trim(),
        type: data.type,
        difficulty: data.difficulty,
        bloomLevel: data.bloomLevel,
        status,
        source: data.source || "manual",
        language: data.language || "en",
        topic: data.topic,
        subtopic: data.subtopic,
        explanation: data.explanation,
        hints: data.hints || [],
        metadata: data.metadata || {},
        tags: data.tags || [],
        references: data.references || [],
        courseId: data.courseId,
        learningUniverseId: data.learningUniverseId,
        legacyQuestionId: data.legacyQuestionId,
        estimatedSeconds: data.estimatedSeconds,
        aiConfidence: data.source === "ai" ? 0.75 : null,
        options: {
          create: options.map((o, i) => ({
            text: o.text,
            isCorrect: o.isCorrect,
            order: o.order ?? i,
          })),
        },
        analytics: { create: {} },
      },
      include: { options: true },
    });

    await tx.bankQuestionVersion.create({
      data: {
        questionId: created.id,
        version: 1,
        createdById: authorId,
        snapshot: snapshotQuestion({ ...created, hints: created.hints, metadata: created.metadata, tags: created.tags, options: created.options }),
      },
    });

    console.log("=== STAGE: Prisma bankQuestion.create - After Create ===");
    console.log("Created question ID:", created.id);
    console.log("Created options from DB:", created.options);
    console.log("=== END STAGE ===\n");

    await tx.bankQuestionAIValidation.create({
      data: {
        questionId: created.id,
        status: validation.status,
        checks: validation.checks,
      },
    });

    return created;
  });

  return question;
}

export async function updateBankQuestion(
  id: string,
  userId: string,
  role: string,
  data: Partial<CreateBankQuestionInput>
) {
  const existing = await getBankQuestion(id, userId, role);

  const options = data.options;
  const nextVersion = existing.version + 1;

  const updated = await prisma.$transaction(async (tx) => {
    if (options) {
      await tx.bankQuestionOption.deleteMany({ where: { questionId: id } });
      await tx.bankQuestionOption.createMany({
        data: options.map((o, i) => ({
          questionId: id,
          text: o.text,
          isCorrect: o.isCorrect,
          order: o.order ?? i,
        })),
      });
    }

    const question = await tx.bankQuestion.update({
      where: { id },
      data: {
        stem: data.stem?.trim(),
        type: data.type,
        difficulty: data.difficulty,
        bloomLevel: data.bloomLevel,
        status: data.status,
        topic: data.topic,
        subtopic: data.subtopic,
        explanation: data.explanation,
        hints: data.hints,
        metadata: data.metadata,
        tags: data.tags,
        references: data.references,
        estimatedSeconds: data.estimatedSeconds,
        version: nextVersion,
      },
      include: { options: { orderBy: { order: "asc" } } },
    });

    await tx.bankQuestionVersion.create({
      data: {
        questionId: id,
        version: nextVersion,
        createdById: userId,
        snapshot: snapshotQuestion({
          ...question,
          hints: question.hints,
          metadata: question.metadata,
          tags: question.tags,
          options: question.options,
        }),
      },
    });

    const validation = runBasicAIValidation({
      stem: question.stem,
      type: question.type,
      options: question.options,
      explanation: question.explanation,
    });
    await tx.bankQuestionAIValidation.create({
      data: { questionId: id, status: validation.status, checks: validation.checks },
    });

    return question;
  });

  return updated;
}

export async function deleteBankQuestion(id: string, userId: string, role: string) {
  await getBankQuestion(id, userId, role);
  await prisma.bankQuestion.delete({ where: { id } });
  return { deleted: true };
}

export async function bulkUpdateStatus(
  ids: string[],
  status: string,
  userId: string,
  role: string
) {
  const questions = await prisma.bankQuestion.findMany({ where: { id: { in: ids } } });
  for (const q of questions) assertAuthorOrAdmin(q.authorId, userId, role);
  await prisma.bankQuestion.updateMany({ where: { id: { in: ids } }, data: { status } });
  return { updated: ids.length };
}

export async function migrateCourseQuizzesToBank(authorId: string, courseId?: string) {
  const courses = await prisma.course.findMany({
    where: { instructorId: authorId, ...(courseId ? { id: courseId } : {}) },
    select: {
      id: true,
      title: true,
      sections: {
        select: {
          lectures: {
            where: { type: "quiz", quizId: { not: null } },
            select: {
              quiz: {
                include: {
                  questions: { include: { options: { orderBy: { order: "asc" } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  let imported = 0;
  let skipped = 0;

  for (const course of courses) {
    for (const section of course.sections) {
      for (const lecture of section.lectures) {
        const quiz = lecture.quiz;
        if (!quiz) continue;
        for (const q of quiz.questions) {
          const existing = await prisma.bankQuestion.findUnique({
            where: { legacyQuestionId: q.id },
          });
          if (existing) {
            skipped++;
            continue;
          }
          await createBankQuestion(authorId, {
            stem: q.text,
            type: q.type,
            difficulty: q.difficulty || undefined,
            explanation: q.explanation || undefined,
            source: "migrated",
            status: "published",
            courseId: course.id,
            legacyQuestionId: q.id,
            tags: [course.title],
            options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })),
          });
          const bankQ = await prisma.bankQuestion.findUnique({ where: { legacyQuestionId: q.id } });
          if (bankQ) {
            await prisma.question.update({
              where: { id: q.id },
              data: { bankQuestionId: bankQ.id },
            });
          }
          imported++;
        }
      }
    }
  }

  return { imported, skipped };
}

export async function materializeQuizFromBank(
  authorId: string,
  title: string,
  questionIds: string[],
  courseId?: string
) {
  if (questionIds.length === 0) throw new AppError(400, "No questions selected");

  const bankQuestions = await prisma.bankQuestion.findMany({
    where: { id: { in: questionIds }, authorId },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (bankQuestions.length === 0) throw new AppError(404, "Questions not found");

  const ordered = questionIds
    .map((id) => bankQuestions.find((q) => q.id === id))
    .filter(Boolean) as typeof bankQuestions;

  const quiz = await prisma.$transaction(async (tx) => {
    const created = await tx.quiz.create({
      data: {
        title,
        description: `Assessment Studio quiz — ${ordered.length} questions`,
        totalMarks: ordered.length,
        authorId,
      },
    });

    for (let i = 0; i < ordered.length; i++) {
      const bq = ordered[i]!;
      const question = await tx.question.create({
        data: {
          quizId: created.id,
          text: bq.stem,
          type: bq.type,
          difficulty: bq.difficulty,
          marks: 1,
          order: i,
          explanation: bq.explanation,
          bankQuestionId: bq.id,
          options: {
            create: bq.options.map((o) => ({
              text: o.text,
              isCorrect: o.isCorrect,
              order: o.order,
            })),
          },
        },
      });
      await tx.bankQuestionAnalytics.upsert({
        where: { questionId: bq.id },
        create: { questionId: bq.id, timesUsed: 1 },
        update: { timesUsed: { increment: 1 } },
      });
      void question;
    }

    return created;
  });

  return quiz;
}

// Collections
export async function listCollections(authorId: string) {
  return prisma.bankQuestionCollection.findMany({
    where: { authorId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
}

export async function createCollection(
  authorId: string,
  data: { name: string; description?: string; kind?: string; isTemplate?: boolean; templateType?: string }
) {
  return prisma.bankQuestionCollection.create({
    data: {
      authorId,
      name: data.name.trim(),
      description: data.description,
      kind: data.kind || "folder",
      isTemplate: data.isTemplate || false,
      templateType: data.templateType,
    },
  });
}

export async function addQuestionsToCollection(
  collectionId: string,
  questionIds: string[],
  userId: string,
  role: string
) {
  const collection = await prisma.bankQuestionCollection.findUnique({ where: { id: collectionId } });
  if (!collection) throw new AppError(404, "Collection not found");
  assertAuthorOrAdmin(collection.authorId, userId, role);

  const maxOrder = await prisma.bankQuestionCollectionItem.aggregate({
    where: { collectionId },
    _max: { order: true },
  });
  let order = (maxOrder._max.order ?? -1) + 1;

  for (const questionId of questionIds) {
    await prisma.bankQuestionCollectionItem.upsert({
      where: { collectionId_questionId: { collectionId, questionId } },
      create: { collectionId, questionId, order: order++ },
      update: {},
    });
  }

  return { added: questionIds.length };
}

export async function getCollectionWithQuestions(collectionId: string, userId: string, role: string) {
  const collection = await prisma.bankQuestionCollection.findUnique({
    where: { id: collectionId },
    include: {
      items: {
        orderBy: { order: "asc" },
        include: {
          question: {
            include: { options: { orderBy: { order: "asc" } }, analytics: true },
          },
        },
      },
    },
  });
  if (!collection) throw new AppError(404, "Collection not found");
  assertAuthorOrAdmin(collection.authorId, userId, role);
  return collection;
}

export async function generateAIQuestions(
  authorId: string,
  params: {
    topic: string;
    difficulty?: string;
    bloomLevel?: string;
    type?: string;
    count?: number;
    language?: string;
  }
) {
  const count = Math.min(100, Math.max(1, params.count || 3));
  const type = params.type || "multiple_choice";
  const created = [];

  for (let i = 0; i < count; i++) {
    const stem = `[AI Draft] ${params.topic} — Question ${i + 1} (${params.difficulty || "medium"}, ${params.bloomLevel || "L2"})`;
    const q = await createBankQuestion(authorId, {
      stem,
      type,
      difficulty: params.difficulty || "medium",
      bloomLevel: params.bloomLevel || "L2",
      source: "ai",
      topic: params.topic,
      language: params.language || "en",
      explanation: `AI-generated explanation for ${params.topic}. Review before publishing.`,
      tags: [params.topic, "ai-generated"],
      options: [
        { text: "Correct answer (review)", isCorrect: true },
        { text: "Distractor A", isCorrect: false },
        { text: "Distractor B", isCorrect: false },
        { text: "Distractor C", isCorrect: false },
      ],
    });
    created.push(q);
  }

  return created;
}

export async function submitForReview(questionId: string, userId: string, role: string) {
  await getBankQuestion(questionId, userId, role);
  await prisma.bankQuestion.update({
    where: { id: questionId },
    data: { status: "pending_review" },
  });
  await prisma.bankQuestionReview.create({
    data: { questionId, reviewerId: userId, status: "pending_review", comment: "Submitted for review" },
  });
  return { submitted: true };
}

export async function approveQuestion(questionId: string, userId: string, role: string) {
  await getBankQuestion(questionId, userId, role);
  await prisma.bankQuestion.update({
    where: { id: questionId },
    data: { status: "published" },
  });
  await prisma.bankQuestionReview.create({
    data: { questionId, reviewerId: userId, status: "approved", comment: "Approved for use" },
  });
  return { approved: true };
}
