/**
 * Builds immutable version snapshots for assessments and questions.
 */

import { prisma } from "../../utils/prisma.js";
import type {
  AssessmentSectionVersionSnapshot,
  AssessmentVersionSnapshot,
  ChoiceSnapshot,
  MediaUsageRef,
  QuestionVersionSnapshot,
} from "../domain/types.js";

type QuestionWithRelations = Awaited<ReturnType<typeof loadQuestionForSnapshot>>;

async function loadQuestionForSnapshot(questionId: string) {
  return prisma.assessQuestion.findUnique({
    where: { id: questionId },
    include: {
      type: true,
      choices: { orderBy: { order: "asc" } },
      mediaUsages: { include: { asset: { include: { variants: true } } } },
    },
  });
}

function choiceToSnapshot(c: { id: string; text: string; isCorrect: boolean; order: number; metadata: unknown }): ChoiceSnapshot {
  return {
    id: c.id,
    text: c.text,
    isCorrect: c.isCorrect,
    order: c.order,
    metadata: (c.metadata as Record<string, unknown>) ?? {},
  };
}

function mediaToRefs(
  usages: NonNullable<QuestionWithRelations>["mediaUsages"]
): MediaUsageRef[] {
  return usages.map((u) => ({
    assetId: u.assetId,
    role: u.role,
    variant: u.asset.variants[0]?.variant,
    signedUrl: u.asset.variants.find((v) => v.variant === "original")?.url ?? u.asset.variants[0]?.url ?? undefined,
  }));
}

export function buildQuestionVersionSnapshot(
  question: NonNullable<QuestionWithRelations>,
  versionId: string,
  version: number
): QuestionVersionSnapshot {
  return {
    id: versionId,
    questionId: question.id,
    version,
    typeSlug: question.type.slug,
    stem: question.stem,
    explanation: question.explanation,
    hints: (question.hints as string[]) ?? [],
    difficulty: question.difficulty,
    bloomLevel: question.bloomLevel,
    concepts: (question.concepts as string[]) ?? [],
    tags: (question.tags as string[]) ?? [],
    metadata: (question.metadata as Record<string, unknown>) ?? {},
    choices: question.choices.map(choiceToSnapshot),
    media: mediaToRefs(question.mediaUsages),
  };
}

export async function ensureQuestionVersion(
  questionId: string,
  createdById: string
): Promise<{ versionId: string; version: number; snapshot: QuestionVersionSnapshot }> {
  const question = await loadQuestionForSnapshot(questionId);
  if (!question) throw new Error(`Question not found: ${questionId}`);

  const snapshot = buildQuestionVersionSnapshot(question, "", question.version);
  const latest = await prisma.assessQuestionVersion.findFirst({
    where: { questionId },
    orderBy: { version: "desc" },
  });

  if (latest) {
    const existing = latest.snapshot as QuestionVersionSnapshot;
    const sameStem =
      existing.stem === snapshot.stem &&
      JSON.stringify(existing.choices) === JSON.stringify(snapshot.choices);
    if (sameStem && latest.version === question.version) {
      return {
        versionId: latest.id,
        version: latest.version,
        snapshot: { ...snapshot, id: latest.id },
      };
    }
  }

  const nextVersion = (latest?.version ?? 0) + 1;
  const created = await prisma.assessQuestionVersion.create({
    data: {
      questionId,
      version: nextVersion,
      snapshot: snapshot as object,
      createdById,
    },
  });

  await prisma.assessQuestion.update({
    where: { id: questionId },
    data: { version: nextVersion },
  });

  return {
    versionId: created.id,
    version: nextVersion,
    snapshot: { ...snapshot, id: created.id },
  };
}

export async function buildAssessmentVersionSnapshot(
  assessmentId: string,
  versionId: string,
  version: number,
  questionVersionMap: Map<string, { versionId: string; snapshot: QuestionVersionSnapshot }>
): Promise<AssessmentVersionSnapshot> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          items: {
            orderBy: { order: "asc" },
            include: { question: true },
          },
        },
      },
    },
  });

  if (!assessment) throw new Error(`Assessment not found: ${assessmentId}`);

  const sections: AssessmentSectionVersionSnapshot[] = assessment.sections.map((section) => ({
    id: section.id,
    title: section.title,
    order: section.order,
    items: section.items.map((item) => {
      const qv = questionVersionMap.get(item.questionId);
      if (!qv) throw new Error(`Missing question version for ${item.questionId}`);
      return {
        questionVersionId: qv.versionId,
        order: item.order,
        marks: item.marks,
        required: item.required,
        metadata: (item.metadata as Record<string, unknown>) ?? {},
      };
    }),
  }));

  const totalMarks = sections.reduce(
    (sum, s) => sum + s.items.reduce((is, i) => is + i.marks, 0),
    0
  );

  return {
    id: versionId,
    assessmentId,
    version,
    title: assessment.title,
    description: assessment.description,
    totalMarks,
    sections,
    publishedAt: new Date().toISOString(),
  };
}
