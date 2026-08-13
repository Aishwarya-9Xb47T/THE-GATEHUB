/**
 * Question validation pipeline — structure, plugin, media, scoring.
 */

import { prisma } from "../../utils/prisma.js";
import type { CreateQuestionInput } from "../domain/questionMetadata.js";
import { requirePlugin } from "../infra/pluginRegistry.js";
import type { QuestionTypePlugin } from "../domain/plugins.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function pluginForType(typeSlug: string): QuestionTypePlugin {
  return requirePlugin<QuestionTypePlugin>("questionType", typeSlug);
}

export function validateQuestionStructure(
  typeSlug: string,
  input: Pick<CreateQuestionInput, "stem" | "choices" | "metadata" | "marks">
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const plugin = pluginForType(typeSlug);
  const pluginErrors = plugin.validate({
    stem: input.stem ?? "",
    typeSlug,
    choices: input.choices?.map((c, i) => ({
      text: c.text,
      isCorrect: c.isCorrect ?? false,
      order: c.order ?? i,
    })),
    metadata: input.metadata as Record<string, unknown>,
    marks: input.marks,
  });
  errors.push(...pluginErrors);

  if (!input.stem?.trim()) errors.push("Stem is required");
  if ((input.marks ?? 1) < 0) errors.push("Marks cannot be negative");

  return { valid: errors.length === 0, errors, warnings };
}

export async function validateQuestionTypeExists(typeSlug: string): Promise<string | null> {
  const type = await prisma.assessQuestionType.findUnique({ where: { slug: typeSlug } });
  if (!type) return `Unknown question type: ${typeSlug}`;
  if (!type.enabled) return `Question type disabled: ${typeSlug}`;
  return null;
}

export async function validateMediaIntegrity(
  assetIds: string[]
): Promise<ValidationResult> {
  const errors: string[] = [];
  if (!assetIds.length) return { valid: true, errors, warnings: [] };

  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true },
  });
  const found = new Set(assets.map((a) => a.id));
  for (const id of assetIds) {
    if (!found.has(id)) errors.push(`Media asset not found: ${id}`);
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

export async function validateQuestionSave(
  typeSlug: string,
  input: CreateQuestionInput,
  mediaAssetIds: string[] = []
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const typeError = await validateQuestionTypeExists(typeSlug);
  if (typeError) errors.push(typeError);

  const structural = validateQuestionStructure(typeSlug, input);
  errors.push(...structural.errors);
  warnings.push(...structural.warnings);

  const media = await validateMediaIntegrity(mediaAssetIds);
  errors.push(...media.errors);

  return { valid: errors.length === 0, errors, warnings };
}
