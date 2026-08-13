/**
 * Question collections — banks, favorites, placement sets.
 */

import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import type { CollectionKind } from "../domain/questionMetadata.js";
import { assertCanViewQuestion } from "./questionAccess.js";

export interface CreateCollectionInput {
  name: string;
  description?: string;
  kind?: CollectionKind;
  visibility?: string;
  organizationId?: string;
  departmentId?: string;
  smartRules?: Record<string, unknown>;
}

export async function createCollection(authorId: string, input: CreateCollectionInput) {
  return prisma.assessQuestionCollection.create({
    data: {
      authorId,
      name: input.name.trim() || "Untitled Collection",
      description: input.description,
      kind: input.kind ?? "folder",
      visibility: input.visibility ?? "private",
      organizationId: input.organizationId,
      departmentId: input.departmentId,
      smartRules: input.smartRules as object | undefined,
    },
  });
}

export async function listCollections(authorId: string, kind?: string) {
  return prisma.assessQuestionCollection.findMany({
    where: {
      OR: [{ authorId }, { visibility: { in: ["organization", "public", "shared"] } }],
      ...(kind ? { kind } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
}

export async function addQuestionToCollection(
  collectionId: string,
  questionId: string,
  userId: string,
  role: string,
  order = 0
) {
  const collection = await prisma.assessQuestionCollection.findUnique({
    where: { id: collectionId },
  });
  if (!collection) throw new AppError(404, "Collection not found");
  if (collection.authorId !== userId) {
    throw new AppError(403, "You do not own this collection");
  }

  await assertCanViewQuestion(questionId, userId, role);

  return prisma.assessQuestionCollectionItem.upsert({
    where: { collectionId_questionId: { collectionId, questionId } },
    create: { collectionId, questionId, order },
    update: { order },
  });
}

export async function removeQuestionFromCollection(
  collectionId: string,
  questionId: string,
  userId: string
) {
  const collection = await prisma.assessQuestionCollection.findUnique({
    where: { id: collectionId },
  });
  if (!collection) throw new AppError(404, "Collection not found");
  if (collection.authorId !== userId) {
    throw new AppError(403, "You do not own this collection");
  }

  await prisma.assessQuestionCollectionItem.deleteMany({
    where: { collectionId, questionId },
  });
  return { removed: true };
}

export async function listCollectionQuestions(
  collectionId: string,
  userId: string,
  role: string
) {
  const collection = await prisma.assessQuestionCollection.findUnique({
    where: { id: collectionId },
    include: {
      items: {
        orderBy: { order: "asc" },
        include: { question: { include: { type: true } } },
      },
    },
  });
  if (!collection) throw new AppError(404, "Collection not found");

  if (collection.authorId !== userId && collection.visibility === "private") {
    throw new AppError(403, "You do not have access to this collection");
  }

  return collection.items.map((item) => ({
    order: item.order,
    questionId: item.questionId,
    stem: item.question.stem,
    typeSlug: item.question.type.slug,
    status: item.question.status,
  }));
}
