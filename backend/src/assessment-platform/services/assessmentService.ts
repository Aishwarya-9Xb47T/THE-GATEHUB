/**
 * Assessment Service — CRUD, lifecycle, immutable publish (Module 03).
 * @see docs/ASSESSMENT-PLATFORM-ARCHITECTURE.md Sections 19–20
 */

import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";
import type { AssessmentKind, AssessmentLifecycle } from "../domain/constants.js";
import {
  canTransition,
  isContentFrozen,
  nextLifecycleState,
  type LifecycleTransition,
} from "../domain/lifecycle.js";
import { createDomainEvent } from "../domain/events.js";
import { newCorrelationId, publish } from "../infra/eventBus.js";
import {
  assertAssessmentAuthorOrAdmin,
  assertCanViewAssessment,
} from "./assessmentAccess.js";
import {
  buildAssessmentVersionSnapshot,
  ensureQuestionVersion,
} from "./snapshotBuilder.js";
import type { AssessmentSummary, AssessmentVersionSnapshot } from "../domain/types.js";

export interface CreateAssessmentInput {
  title: string;
  kind?: AssessmentKind;
  description?: string;
  subject?: string;
  organizationId?: string;
}

export interface UpdateAssessmentInput {
  title?: string;
  description?: string | null;
  subject?: string | null;
  kind?: AssessmentKind;
  visibility?: string;
  metadata?: Record<string, unknown>;
}

function toSummary(row: {
  id: string;
  organizationId: string | null;
  authorId: string;
  kind: string;
  lifecycle: string;
  title: string;
  description: string | null;
  totalMarks: number;
  publishedVersionId: string | null;
  legacyQuizId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AssessmentSummary {
  return {
    id: row.id,
    organizationId: row.organizationId,
    authorId: row.authorId,
    kind: row.kind as AssessmentKind,
    lifecycle: row.lifecycle as AssessmentLifecycle,
    title: row.title,
    description: row.description,
    totalMarks: row.totalMarks,
    publishedVersionId: row.publishedVersionId,
    legacyQuizId: row.legacyQuizId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createAssessment(authorId: string, input: CreateAssessmentInput) {
  const assessment = await prisma.assessment.create({
    data: {
      authorId,
      organizationId: input.organizationId,
      title: input.title.trim() || "Untitled Assessment",
      description: input.description,
      subject: input.subject,
      kind: input.kind ?? "formative",
      lifecycle: "draft",
      sections: {
        create: { title: "Section 1", order: 0 },
      },
    },
    include: { sections: true },
  });

  const correlationId = newCorrelationId();
  await publish(
    createDomainEvent(
      "AssessmentCreated",
      "Assessment",
      assessment.id,
      {
        assessmentId: assessment.id,
        authorId,
        kind: assessment.kind,
        title: assessment.title,
      },
      { correlationId, actorId: authorId, organizationId: assessment.organizationId }
    )
  );

  return toSummary(assessment);
}

export async function listAssessments(
  userId: string,
  role: string,
  filters?: { lifecycle?: string; kind?: string; q?: string }
) {
  const where: Record<string, unknown> = isAdminRole(role) ? {} : { authorId: userId };
  if (filters?.lifecycle) where.lifecycle = filters.lifecycle;
  if (filters?.kind) where.kind = filters.kind;
  if (filters?.q?.trim()) {
    where.title = { contains: filters.q.trim(), mode: "insensitive" };
  }

  const rows = await prisma.assessment.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return rows.map(toSummary);
}

export async function getAssessment(assessmentId: string, userId: string, role: string) {
  await assertCanViewAssessment(assessmentId, userId, role);

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          items: {
            orderBy: { order: "asc" },
            include: {
              question: {
                include: {
                  type: { select: { slug: true, label: true } },
                  choices: { orderBy: { order: "asc" } },
                },
              },
            },
          },
        },
      },
      versions: { orderBy: { version: "desc" }, take: 5, select: { id: true, version: true, publishedAt: true, createdAt: true } },
    },
  });

  if (!assessment) throw new AppError(404, "Assessment not found");
  return assessment;
}

export async function updateAssessment(
  assessmentId: string,
  userId: string,
  role: string,
  input: UpdateAssessmentInput
) {
  await assertAssessmentAuthorOrAdmin(assessmentId, userId, role);

  const current = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!current) throw new AppError(404, "Assessment not found");

  if (isContentFrozen(current.lifecycle as AssessmentLifecycle)) {
    throw new AppError(
      400,
      "Published assessment content is frozen. Create a new draft version instead."
    );
  }

  const updated = await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      title: input.title?.trim(),
      description: input.description,
      subject: input.subject,
      kind: input.kind,
      visibility: input.visibility,
      metadata: input.metadata,
    },
  });

  return toSummary(updated);
}

export async function transitionAssessmentLifecycle(
  assessmentId: string,
  userId: string,
  role: string,
  action: LifecycleTransition
) {
  await assertAssessmentAuthorOrAdmin(assessmentId, userId, role);

  const current = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!current) throw new AppError(404, "Assessment not found");

  const from = current.lifecycle as AssessmentLifecycle;
  if (!canTransition(from, action)) {
    throw new AppError(400, `Cannot ${action} from lifecycle state "${from}"`);
  }

  if (action === "approve" && !isAdminRole(role) && current.authorId !== userId) {
    throw new AppError(403, "Only the author or admin can approve");
  }

  const lifecycle = nextLifecycleState(from, action);

  const updated = await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      lifecycle,
      archivedAt: lifecycle === "archived" ? new Date() : undefined,
    },
  });

  if (lifecycle === "archived") {
    await publish(
      createDomainEvent(
        "AssessmentArchived",
        "Assessment",
        assessmentId,
        { assessmentId },
        {
          correlationId: newCorrelationId(),
          actorId: userId,
          organizationId: updated.organizationId,
        }
      )
    );
  }

  return toSummary(updated);
}

export async function publishAssessment(
  assessmentId: string,
  userId: string,
  role: string,
  changeLog?: string
) {
  await assertAssessmentAuthorOrAdmin(assessmentId, userId, role);

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      sections: {
        include: { items: { include: { question: true } } },
      },
    },
  });
  if (!assessment) throw new AppError(404, "Assessment not found");

  const lifecycle = assessment.lifecycle as AssessmentLifecycle;
  if (!["approved", "draft"].includes(lifecycle)) {
    throw new AppError(400, "Assessment must be in draft or approved state to publish");
  }

  const questionIds = [
    ...new Set(assessment.sections.flatMap((s) => s.items.map((i) => i.questionId))),
  ];
  if (questionIds.length === 0) {
    throw new AppError(400, "Add at least one question before publishing");
  }

  const questionVersionMap = new Map<
    string,
    { versionId: string; snapshot: import("../domain/types.js").QuestionVersionSnapshot }
  >();

  for (const questionId of questionIds) {
    const qv = await ensureQuestionVersion(questionId, userId);
    questionVersionMap.set(questionId, { versionId: qv.versionId, snapshot: qv.snapshot });
  }

  const lastVersion = await prisma.assessmentVersion.findFirst({
    where: { assessmentId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (lastVersion?.version ?? 0) + 1;

  const versionRow = await prisma.assessmentVersion.create({
    data: {
      assessmentId,
      version: nextVersion,
      snapshot: {} as object,
      changeLog,
      createdById: userId,
      publishedAt: new Date(),
    },
  });

  const snapshot = await buildAssessmentVersionSnapshot(
    assessmentId,
    versionRow.id,
    nextVersion,
    questionVersionMap
  );

  const totalMarks = snapshot.totalMarks;

  const published = await prisma.$transaction(async (tx) => {
    await tx.assessmentVersion.update({
      where: { id: versionRow.id },
      data: { snapshot: snapshot as object },
    });
    return tx.assessment.update({
      where: { id: assessmentId },
      data: {
        lifecycle: "published",
        publishedVersionId: versionRow.id,
        totalMarks,
      },
    });
  });

  const correlationId = newCorrelationId();
  await publish(
    createDomainEvent(
      "AssessmentPublished",
      "Assessment",
      assessmentId,
      {
        assessmentId,
        versionId: versionRow.id,
        version: nextVersion,
      },
      {
        correlationId,
        actorId: userId,
        organizationId: assessment.organizationId,
      }
    )
  );

  return {
    assessment: toSummary({
      ...assessment,
      lifecycle: "published",
      publishedVersionId: versionRow.id,
      totalMarks,
      updatedAt: new Date(),
    }),
    version: {
      id: versionRow.id,
      version: nextVersion,
      publishedAt: versionRow.publishedAt?.toISOString() ?? new Date().toISOString(),
      snapshot,
    },
  };
}

export async function listAssessmentVersions(
  assessmentId: string,
  userId: string,
  role: string
) {
  await assertCanViewAssessment(assessmentId, userId, role);

  return prisma.assessmentVersion.findMany({
    where: { assessmentId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      changeLog: true,
      publishedAt: true,
      createdAt: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function getAssessmentVersion(
  assessmentId: string,
  versionId: string,
  userId: string,
  role: string
): Promise<{ id: string; version: number; snapshot: AssessmentVersionSnapshot; publishedAt: string | null }> {
  await assertCanViewAssessment(assessmentId, userId, role);

  const row = await prisma.assessmentVersion.findFirst({
    where: { id: versionId, assessmentId },
  });
  if (!row) throw new AppError(404, "Assessment version not found");

  return {
    id: row.id,
    version: row.version,
    snapshot: row.snapshot as AssessmentVersionSnapshot,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

export async function archiveAssessment(assessmentId: string, userId: string, role: string) {
  return transitionAssessmentLifecycle(assessmentId, userId, role, "archive");
}
