/**
 * Question Service — canonical question platform (Module 04).
 * Immutable versions, plugins, events, search, collections.
 */

import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { createDomainEvent } from "../domain/events.js";
import { newCorrelationId, publish } from "../infra/eventBus.js";
import {
  buildSearchText,
  type CreateQuestionInput,
  type QuestionRelationType,
  type QuestionSearchFilters,
  type UpdateQuestionInput,
} from "../domain/questionMetadata.js";
import {
  assertCanForkQuestion,
  assertCanViewQuestion,
  assertQuestionAuthorOrAdmin,
  canEditQuestion,
} from "./questionAccess.js";
import { validateQuestionSave } from "./questionValidation.js";
import {
  buildQuestionVersionSnapshot,
  ensureQuestionVersion,
} from "./snapshotBuilder.js";
import { requirePlugin } from "../infra/pluginRegistry.js";
import type { QuestionTypePlugin } from "../domain/plugins.js";

export interface QuestionSummary {
  id: string;
  authorId: string;
  typeSlug: string;
  stem: string;
  status: string;
  version: number;
  visibility: string;
  subject: string | null;
  topic: string | null;
  difficulty: string | null;
  bloomLevel: string | null;
  marks: number;
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

function toSummary(row: {
  id: string;
  authorId: string;
  stem: string;
  status: string;
  version: number;
  visibility: string;
  subject: string | null;
  topic: string | null;
  difficulty: string | null;
  bloomLevel: string | null;
  marks: number;
  aiGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
  type: { slug: string };
}): QuestionSummary {
  return {
    id: row.id,
    authorId: row.authorId,
    typeSlug: row.type.slug,
    stem: row.stem,
    status: row.status,
    version: row.version,
    visibility: row.visibility,
    subject: row.subject,
    topic: row.topic,
    difficulty: row.difficulty,
    bloomLevel: row.bloomLevel,
    marks: row.marks,
    aiGenerated: row.aiGenerated,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveTypeId(typeSlug: string): Promise<string> {
  const type = await prisma.assessQuestionType.findUnique({ where: { slug: typeSlug } });
  if (!type) throw new AppError(400, `Unknown question type: ${typeSlug}`);
  return type.id;
}

async function syncChoices(
  questionId: string,
  choices?: CreateQuestionInput["choices"]
) {
  if (!choices) return;
  await prisma.assessChoice.deleteMany({ where: { questionId } });
  await prisma.assessChoice.createMany({
    data: choices.map((c, i) => ({
      questionId,
      text: c.text,
      isCorrect: c.isCorrect ?? false,
      order: c.order ?? i,
      metadata: (c.metadata ?? {}) as object,
    })),
  });
}

function buildQuestionData(
  authorId: string,
  typeId: string,
  input: CreateQuestionInput
) {
  const stem = input.stem.trim();
  return {
    authorId,
    typeId,
    organizationId: input.organizationId,
    departmentId: input.departmentId,
    stem,
    explanation: input.explanation ?? null,
    hints: (input.hints ?? []) as object,
    difficulty: input.difficulty,
    bloomLevel: input.bloomLevel,
    estimatedSecs: input.estimatedSecs,
    marks: input.marks ?? 1,
    negativeMarks: input.negativeMarks,
    subject: input.subject,
    courseId: input.courseId,
    unit: input.unit,
    chapter: input.chapter,
    topic: input.topic,
    subtopic: input.subtopic,
    learningOutcome: input.learningOutcome,
    tags: (input.tags ?? []) as object,
    concepts: (input.concepts ?? []) as object,
    keywords: (input.keywords ?? []) as object,
    aliases: (input.aliases ?? []) as object,
    placementTags: (input.placementTags ?? []) as object,
    companyTags: (input.companyTags ?? []) as object,
    skillTags: (input.skillTags ?? []) as object,
    visibility: input.visibility ?? "private",
    permissionMode: input.permissionMode ?? "owner_only",
    language: input.language ?? "en",
    metadata: (input.metadata ?? {}) as object,
    aiGenerated: input.aiGenerated ?? false,
    aiConfidence: input.aiConfidence,
    aiHistoryId: input.aiHistoryId,
    searchText: buildSearchText({
      stem,
      subject: input.subject,
      topic: input.topic,
      tags: input.tags,
      keywords: input.keywords,
      aliases: input.aliases,
    }),
  };
}

async function emitQuestionEvent(
  type:
    | "QuestionCreated"
    | "QuestionUpdated"
    | "QuestionVersionCreated"
    | "QuestionPublished"
    | "QuestionArchived"
    | "QuestionTagged",
  questionId: string,
  actorId: string,
  payload: Record<string, unknown>,
  organizationId?: string | null
) {
  await publish(
    createDomainEvent(type, "AssessQuestion", questionId, payload, {
      correlationId: newCorrelationId(),
      actorId,
      organizationId,
    })
  );
}

async function createVersionRecord(
  questionId: string,
  actorId: string,
  emitEvent = true
) {
  const { versionId, version } = await ensureQuestionVersion(questionId, actorId);
  if (emitEvent) {
    await emitQuestionEvent(
      "QuestionVersionCreated",
      questionId,
      actorId,
      { questionId, versionId, version },
      null
    );
  }
  return { versionId, version };
}

export async function createQuestion(authorId: string, input: CreateQuestionInput) {
  const validation = await validateQuestionSave(input.typeSlug, input);
  if (!validation.valid) {
    throw new AppError(400, `Validation failed: ${validation.errors.join("; ")}`);
  }

  const plugin = requirePlugin<QuestionTypePlugin>("questionType", input.typeSlug);
  const sanitizedMeta = plugin.sanitize((input.metadata ?? {}) as Record<string, unknown>);

  const typeId = await resolveTypeId(input.typeSlug);
  const question = await prisma.assessQuestion.create({
    data: {
      ...buildQuestionData(authorId, typeId, { ...input, metadata: sanitizedMeta }),
      choices: input.choices?.length
        ? {
            create: input.choices.map((c, i) => ({
              text: c.text,
              isCorrect: c.isCorrect ?? false,
              order: c.order ?? i,
              metadata: (c.metadata ?? {}) as object,
            })),
          }
        : undefined,
      analytics: { create: {} },
    },
    include: { type: true, choices: { orderBy: { order: "asc" } } },
  });

  await createVersionRecord(question.id, authorId);

  await emitQuestionEvent("QuestionCreated", question.id, authorId, {
    questionId: question.id,
    authorId,
    typeSlug: input.typeSlug,
  });

  return { ...toSummary(question), choices: question.choices };
}

export async function updateQuestion(
  questionId: string,
  userId: string,
  role: string,
  input: UpdateQuestionInput
) {
  const existing = await prisma.assessQuestion.findUnique({
    where: { id: questionId },
    include: { type: true, choices: { orderBy: { order: "asc" } } },
  });
  if (!existing) throw new AppError(404, "Question not found");
  if (!canEditQuestion(existing, userId, role)) {
    throw new AppError(403, "Cannot edit this question");
  }

  const typeSlug = input.typeSlug ?? existing.type.slug;
  const merged: CreateQuestionInput = {
    typeSlug,
    stem: input.stem ?? existing.stem,
    explanation: input.explanation !== undefined ? input.explanation : existing.explanation,
    hints: input.hints ?? (existing.hints as string[]),
    difficulty: input.difficulty ?? existing.difficulty ?? undefined,
    bloomLevel: input.bloomLevel ?? existing.bloomLevel ?? undefined,
    estimatedSecs: input.estimatedSecs ?? existing.estimatedSecs ?? undefined,
    marks: input.marks ?? existing.marks,
    negativeMarks: input.negativeMarks ?? existing.negativeMarks ?? undefined,
    subject: input.subject ?? existing.subject ?? undefined,
    courseId: input.courseId ?? existing.courseId ?? undefined,
    unit: input.unit ?? existing.unit ?? undefined,
    chapter: input.chapter ?? existing.chapter ?? undefined,
    topic: input.topic ?? existing.topic ?? undefined,
    subtopic: input.subtopic ?? existing.subtopic ?? undefined,
    learningOutcome: input.learningOutcome ?? existing.learningOutcome ?? undefined,
    tags: input.tags ?? (existing.tags as string[]),
    concepts: input.concepts ?? (existing.concepts as string[]),
    keywords: input.keywords ?? (existing.keywords as string[]),
    aliases: input.aliases ?? (existing.aliases as string[]),
    placementTags: input.placementTags ?? (existing.placementTags as string[]),
    companyTags: input.companyTags ?? (existing.companyTags as string[]),
    skillTags: input.skillTags ?? (existing.skillTags as string[]),
    visibility: (input.visibility ?? existing.visibility) as CreateQuestionInput["visibility"],
    permissionMode: (input.permissionMode ??
      existing.permissionMode) as CreateQuestionInput["permissionMode"],
    language: input.language ?? existing.language,
    metadata: input.metadata ?? (existing.metadata as CreateQuestionInput["metadata"]),
    choices:
      input.choices ??
      existing.choices.map((c) => ({
        text: c.text,
        isCorrect: c.isCorrect,
        order: c.order,
      })),
    aiGenerated: input.aiGenerated ?? existing.aiGenerated,
    aiConfidence: input.aiConfidence ?? existing.aiConfidence ?? undefined,
  };

  const validation = await validateQuestionSave(typeSlug, merged);
  if (!validation.valid) {
    throw new AppError(400, `Validation failed: ${validation.errors.join("; ")}`);
  }

  const typeId = input.typeSlug ? await resolveTypeId(typeSlug) : existing.typeId;
  const plugin = requirePlugin<QuestionTypePlugin>("questionType", typeSlug);
  const sanitizedMeta = plugin.sanitize((merged.metadata ?? {}) as Record<string, unknown>);

  const updated = await prisma.assessQuestion.update({
    where: { id: questionId },
    data: {
      ...buildQuestionData(existing.authorId, typeId, { ...merged, metadata: sanitizedMeta }),
      status: input.status ?? existing.status,
      typeId,
    },
    include: { type: true, choices: { orderBy: { order: "asc" } } },
  });

  if (input.choices) await syncChoices(questionId, input.choices);

  await createVersionRecord(questionId, userId);

  await emitQuestionEvent("QuestionUpdated", questionId, userId, {
    questionId,
    fields: Object.keys(input),
  });

  const withChoices = await prisma.assessQuestion.findUnique({
    where: { id: questionId },
    include: { type: true, choices: { orderBy: { order: "asc" } } },
  });

  return { ...toSummary(withChoices!), choices: withChoices!.choices };
}

export async function getQuestion(questionId: string, userId: string, role: string) {
  await assertCanViewQuestion(questionId, userId, role);

  const question = await prisma.assessQuestion.findUnique({
    where: { id: questionId },
    include: {
      type: true,
      choices: { orderBy: { order: "asc" } },
      analytics: true,
      childRelations: {
        orderBy: { order: "asc" },
        include: { child: { include: { type: true } } },
      },
      mediaUsages: { include: { asset: true } },
    },
  });
  if (!question) throw new AppError(404, "Question not found");

  return {
    ...toSummary(question),
    explanation: question.explanation,
    hints: question.hints,
    metadata: question.metadata,
    tags: question.tags,
    concepts: question.concepts,
    keywords: question.keywords,
    choices: question.choices,
    analytics: question.analytics,
    relations: question.childRelations.map((r) => ({
      id: r.id,
      childQuestionId: r.childQuestionId,
      relationType: r.relationType,
      order: r.order,
      childStem: r.child.stem,
      childTypeSlug: r.child.type.slug,
    })),
    media: question.mediaUsages.map((u) => ({
      assetId: u.assetId,
      role: u.role,
      mimeType: u.asset.mimeType,
      assetType: u.asset.assetType,
    })),
  };
}

export async function searchQuestions(
  userId: string,
  role: string,
  filters: QuestionSearchFilters,
  limit = 50,
  offset = 0
) {
  const where: Record<string, unknown> = {};

  if (filters.authorId) where.authorId = filters.authorId;
  else if (!role || role === "student") where.authorId = userId;
  else where.OR = [{ authorId: userId }, { visibility: { in: ["public", "shared", "organization"] } }];

  if (filters.typeSlug) {
    where.type = { slug: filters.typeSlug };
  }
  if (filters.subject) where.subject = filters.subject;
  if (filters.topic) where.topic = { contains: filters.topic, mode: "insensitive" };
  if (filters.difficulty) where.difficulty = filters.difficulty;
  if (filters.bloomLevel) where.bloomLevel = filters.bloomLevel;
  if (filters.visibility) where.visibility = filters.visibility;
  if (filters.status) where.status = filters.status;
  if (filters.aiGenerated !== undefined) where.aiGenerated = filters.aiGenerated;
  if (filters.language) where.language = filters.language;
  if (filters.q) {
    where.searchText = { contains: filters.q, mode: "insensitive" };
  }
  if (filters.hasMedia) {
    where.mediaUsages = { some: {} };
  }
  if (filters.collectionId) {
    where.collectionItems = { some: { collectionId: filters.collectionId } };
  }
  if (filters.minHealthScore !== undefined) {
    where.analytics = { healthScore: { gte: filters.minHealthScore } };
  }

  const [rows, total] = await Promise.all([
    prisma.assessQuestion.findMany({
      where,
      include: { type: true, analytics: { select: { healthScore: true, avgAccuracy: true } } },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.assessQuestion.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      ...toSummary(r),
      healthScore: r.analytics?.healthScore,
      avgAccuracy: r.analytics?.avgAccuracy,
    })),
    total,
    limit,
    offset,
  };
}

export async function publishQuestion(questionId: string, userId: string, role: string) {
  await assertQuestionAuthorOrAdmin(questionId, userId, role);

  const question = await prisma.assessQuestion.findUnique({ where: { id: questionId } });
  if (!question) throw new AppError(404, "Question not found");
  if (question.status === "archived") {
    throw new AppError(400, "Cannot publish archived question");
  }

  const { versionId, version } = await createVersionRecord(questionId, userId, false);

  const updated = await prisma.assessQuestion.update({
    where: { id: questionId },
    data: { status: "published" },
    include: { type: true },
  });

  await emitQuestionEvent("QuestionPublished", questionId, userId, {
    questionId,
    versionId,
    version,
  });

  return toSummary(updated);
}

export async function archiveQuestion(questionId: string, userId: string, role: string) {
  await assertQuestionAuthorOrAdmin(questionId, userId, role);

  const updated = await prisma.assessQuestion.update({
    where: { id: questionId },
    data: { status: "archived" },
    include: { type: true },
  });

  await emitQuestionEvent("QuestionArchived", questionId, userId, { questionId });

  return toSummary(updated);
}

export async function listQuestionVersions(
  questionId: string,
  userId: string,
  role: string
) {
  await assertCanViewQuestion(questionId, userId, role);

  const versions = await prisma.assessQuestionVersion.findMany({
    where: { questionId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      createdAt: true,
      createdById: true,
    },
  });

  return versions.map((v) => ({
    id: v.id,
    version: v.version,
    createdAt: v.createdAt.toISOString(),
    createdById: v.createdById,
  }));
}

export async function getQuestionVersion(
  questionId: string,
  versionId: string,
  userId: string,
  role: string
) {
  await assertCanViewQuestion(questionId, userId, role);

  const version = await prisma.assessQuestionVersion.findFirst({
    where: { id: versionId, questionId },
  });
  if (!version) throw new AppError(404, "Question version not found");

  return {
    id: version.id,
    questionId: version.questionId,
    version: version.version,
    snapshot: version.snapshot,
    createdAt: version.createdAt.toISOString(),
    createdById: version.createdById,
  };
}

export async function forkQuestion(
  questionId: string,
  userId: string,
  role: string
) {
  await assertCanForkQuestion(questionId, userId, role);

  const source = await prisma.assessQuestion.findUnique({
    where: { id: questionId },
    include: { choices: { orderBy: { order: "asc" } }, type: true },
  });
  if (!source) throw new AppError(404, "Question not found");

  const forked = await prisma.assessQuestion.create({
    data: {
      authorId: userId,
      typeId: source.typeId,
      organizationId: source.organizationId,
      stem: source.stem,
      explanation: source.explanation,
      hints: source.hints as object,
      difficulty: source.difficulty,
      bloomLevel: source.bloomLevel,
      estimatedSecs: source.estimatedSecs,
      marks: source.marks,
      negativeMarks: source.negativeMarks,
      subject: source.subject,
      topic: source.topic,
      metadata: source.metadata as object,
      tags: source.tags as object,
      concepts: source.concepts as object,
      keywords: source.keywords as object,
      visibility: "private",
      permissionMode: "owner_only",
      forkedFromId: source.id,
      searchText: source.searchText,
      choices: {
        create: source.choices.map((c) => ({
          text: c.text,
          isCorrect: c.isCorrect,
          order: c.order,
          metadata: c.metadata as object,
        })),
      },
      analytics: { create: {} },
    },
    include: { type: true },
  });

  await createVersionRecord(forked.id, userId);

  await emitQuestionEvent("QuestionCreated", forked.id, userId, {
    questionId: forked.id,
    authorId: userId,
    typeSlug: source.type.slug,
    forkedFromId: source.id,
  });

  return toSummary(forked);
}

export async function addQuestionRelation(
  parentQuestionId: string,
  childQuestionId: string,
  relationType: QuestionRelationType,
  userId: string,
  role: string,
  order = 0
) {
  await assertQuestionAuthorOrAdmin(parentQuestionId, userId, role);
  if (parentQuestionId === childQuestionId) {
    throw new AppError(400, "Cannot relate question to itself");
  }

  const relation = await prisma.assessQuestionRelation.upsert({
    where: {
      parentQuestionId_childQuestionId_relationType: {
        parentQuestionId,
        childQuestionId,
        relationType,
      },
    },
    create: { parentQuestionId, childQuestionId, relationType, order },
    update: { order },
  });

  return relation;
}

export async function removeQuestionRelation(
  relationId: string,
  userId: string,
  role: string
) {
  const relation = await prisma.assessQuestionRelation.findUnique({
    where: { id: relationId },
  });
  if (!relation) throw new AppError(404, "Relation not found");
  await assertQuestionAuthorOrAdmin(relation.parentQuestionId, userId, role);
  await prisma.assessQuestionRelation.delete({ where: { id: relationId } });
  return { deleted: true };
}

export async function tagQuestion(
  questionId: string,
  tags: string[],
  userId: string,
  role: string
) {
  await assertQuestionAuthorOrAdmin(questionId, userId, role);

  const updated = await prisma.assessQuestion.update({
    where: { id: questionId },
    data: { tags: tags as object },
    include: { type: true },
  });

  await emitQuestionEvent("QuestionTagged", questionId, userId, { questionId, tags });

  return toSummary(updated);
}

export async function validateQuestionDraft(
  questionId: string,
  userId: string,
  role: string
) {
  await assertCanViewQuestion(questionId, userId, role);

  const question = await prisma.assessQuestion.findUnique({
    where: { id: questionId },
    include: { type: true, choices: { orderBy: { order: "asc" } }, mediaUsages: true },
  });
  if (!question) throw new AppError(404, "Question not found");

  return validateQuestionSave(
    question.type.slug,
    {
      typeSlug: question.type.slug,
      stem: question.stem,
      choices: question.choices.map((c) => ({
        text: c.text,
        isCorrect: c.isCorrect,
        order: c.order,
      })),
      metadata: question.metadata as CreateQuestionInput["metadata"],
      marks: question.marks,
    },
    question.mediaUsages.map((u) => u.assetId)
  );
}

export async function evaluateQuestionAnswer(
  questionVersionId: string,
  answer: unknown
) {
  const version = await prisma.assessQuestionVersion.findUnique({
    where: { id: questionVersionId },
  });
  if (!version) throw new AppError(404, "Question version not found");

  const snapshot = version.snapshot as import("../domain/types.js").QuestionVersionSnapshot;
  const plugin = requirePlugin<QuestionTypePlugin>("questionType", snapshot.typeSlug);
  const result = await plugin.evaluate(answer, snapshot);
  const feedback = plugin.feedback(result, snapshot);
  const metrics = plugin.analytics(result);

  return { result, feedback, metrics };
}

export { buildQuestionVersionSnapshot };
