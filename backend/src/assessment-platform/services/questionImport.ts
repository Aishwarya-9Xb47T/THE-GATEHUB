/**
 * Question import normalization pipeline (Module 04).
 * All external sources converge here before createQuestion.
 */

import type { CreateQuestionInput } from "../domain/questionMetadata.js";
import { createQuestion } from "./questionService.js";
import { createDomainEvent } from "../domain/events.js";
import { newCorrelationId, publish } from "../infra/eventBus.js";

export type ImportSource =
  | "excel"
  | "csv"
  | "json"
  | "moodle"
  | "canvas"
  | "quizizz"
  | "google_forms"
  | "ai_generated"
  | "question_bank"
  | "legacy_quiz";

export interface NormalizedImportQuestion {
  source: ImportSource;
  sourceId?: string;
  typeSlug: string;
  stem: string;
  explanation?: string;
  choices?: Array<{ text: string; isCorrect: boolean; order?: number }>;
  difficulty?: string;
  bloomLevel?: string;
  tags?: string[];
  subject?: string;
  topic?: string;
  marks?: number;
  metadata?: Record<string, unknown>;
}

export interface ImportBatchResult {
  batchId: string;
  imported: number;
  failed: number;
  questionIds: string[];
  errors: Array<{ index: number; message: string }>;
}

export function normalizeImportPayload(
  source: ImportSource,
  raw: unknown[]
): NormalizedImportQuestion[] {
  return raw.map((item, index) => {
    const row = item as Record<string, unknown>;
    const typeSlug =
      typeof row.typeSlug === "string"
        ? row.typeSlug
        : typeof row.type === "string"
          ? row.type
          : "multiple_choice";

    const stem = String(row.stem ?? row.question ?? row.text ?? "").trim();
    if (!stem) throw new Error(`Row ${index}: missing stem`);

    const choices = Array.isArray(row.choices)
      ? (row.choices as Array<Record<string, unknown>>).map((c, i) => ({
          text: String(c.text ?? c.label ?? ""),
          isCorrect: Boolean(c.isCorrect ?? c.correct),
          order: typeof c.order === "number" ? c.order : i,
        }))
      : undefined;

    return {
      source,
      sourceId: typeof row.id === "string" ? row.id : undefined,
      typeSlug,
      stem,
      explanation: typeof row.explanation === "string" ? row.explanation : undefined,
      choices,
      difficulty: typeof row.difficulty === "string" ? row.difficulty : undefined,
      bloomLevel: typeof row.bloomLevel === "string" ? row.bloomLevel : undefined,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
      subject: typeof row.subject === "string" ? row.subject : undefined,
      topic: typeof row.topic === "string" ? row.topic : undefined,
      marks: typeof row.marks === "number" ? row.marks : undefined,
      metadata: {
        import: { source, sourceId: row.id, importedAt: new Date().toISOString() },
        ...(typeof row.metadata === "object" && row.metadata ? (row.metadata as object) : {}),
      },
    };
  });
}

export async function importQuestions(
  authorId: string,
  source: ImportSource,
  raw: unknown[]
): Promise<ImportBatchResult> {
  const batchId = crypto.randomUUID();
  const normalized = normalizeImportPayload(source, raw);
  const questionIds: string[] = [];
  const errors: Array<{ index: number; message: string }> = [];

  for (let i = 0; i < normalized.length; i++) {
    try {
      const n = normalized[i]!;
      const input: CreateQuestionInput = {
        typeSlug: n.typeSlug,
        stem: n.stem,
        explanation: n.explanation,
        choices: n.choices,
        difficulty: n.difficulty,
        bloomLevel: n.bloomLevel,
        tags: n.tags,
        subject: n.subject,
        topic: n.topic,
        marks: n.marks,
        metadata: n.metadata,
        aiGenerated: source === "ai_generated",
      };
      const created = await createQuestion(authorId, input);
      questionIds.push(created.id);

      await publish(
        createDomainEvent(
          "QuestionImported",
          "AssessQuestion",
          created.id,
          { questionId: created.id, source, batchId },
          { correlationId: newCorrelationId(), actorId: authorId }
        )
      );
    } catch (err) {
      errors.push({
        index: i,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    batchId,
    imported: questionIds.length,
    failed: errors.length,
    questionIds,
    errors,
  };
}
