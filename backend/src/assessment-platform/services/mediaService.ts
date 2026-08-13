/**
 * Media attachment — questions never own files; MediaAsset + MediaUsage.
 */

import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { createDomainEvent } from "../domain/events.js";
import { newCorrelationId, publish } from "../infra/eventBus.js";
import { assertQuestionAuthorOrAdmin } from "./questionAccess.js";
import { ensureQuestionVersion } from "./snapshotBuilder.js";

export interface AttachMediaInput {
  assetId: string;
  role: string;
  pinToVersion?: boolean;
}

export async function attachMediaToQuestion(
  questionId: string,
  userId: string,
  role: string,
  input: AttachMediaInput
) {
  await assertQuestionAuthorOrAdmin(questionId, userId, role);

  const asset = await prisma.mediaAsset.findUnique({ where: { id: input.assetId } });
  if (!asset) throw new AppError(404, "Media asset not found");

  let questionVersionId: string | undefined;
  if (input.pinToVersion) {
    const { versionId } = await ensureQuestionVersion(questionId, userId);
    questionVersionId = versionId;
  }

  const usage = await prisma.mediaUsage.create({
    data: {
      assetId: input.assetId,
      entityType: "question",
      entityId: questionId,
      role: input.role,
      questionId,
      questionVersionId,
    },
    include: { asset: true },
  });

  await publish(
    createDomainEvent(
      "MediaAttached",
      "AssessQuestion",
      questionId,
      { questionId, assetId: input.assetId, role: input.role },
      { correlationId: newCorrelationId(), actorId: userId }
    )
  );

  return {
    id: usage.id,
    assetId: usage.assetId,
    role: usage.role,
    questionVersionId: usage.questionVersionId,
    mimeType: usage.asset.mimeType,
    assetType: usage.asset.assetType,
  };
}

export async function detachMediaFromQuestion(
  usageId: string,
  userId: string,
  role: string
) {
  const usage = await prisma.mediaUsage.findUnique({ where: { id: usageId } });
  if (!usage?.questionId) throw new AppError(404, "Media usage not found");

  await assertQuestionAuthorOrAdmin(usage.questionId, userId, role);
  await prisma.mediaUsage.delete({ where: { id: usageId } });
  return { deleted: true };
}
