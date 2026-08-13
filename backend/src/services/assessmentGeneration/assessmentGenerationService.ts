import { randomUUID } from "crypto";
import type { AiAssessmentConfig, AiGeneratedQuestion } from "../assessmentStudio/aiAssessment/types.js";
import { generateQuestionsFromContent } from "../assessmentStudio/aiAssessment/aiAssessmentGenerator.js";
import { generateOfflineDemoQuestions } from "../assessmentStudio/aiAssessment/aiOfflineGenerator.js";
import { isOfflineFallbackError } from "../assessmentStudio/aiAssessment/ApiError.js";
import { mapOpenAiError } from "../assessmentStudio/aiAssessment/ErrorMapper.js";
import { normalizeImportQuestionType } from "../assessmentStudio/import/importQuizMaterializer.js";
import type {
  AssessmentGenerationResult,
  GenerationCoverage,
  GenerationValidationResult,
  QuizGenerationConfiguration,
} from "./types.js";

/** Per-call cap — real providers often return ~8 questions per JSON response. */
const BATCH_SIZE = 10;
const MAX_FILL_RETRIES = 5;

export function computeMaxTokensForQuestionCount(count: number): number {
  return Math.min(16384, 800 + count * 500);
}

export function resolveTypeDistribution(config: AiAssessmentConfig): Record<string, number> {
  if (config.questionTypeDistribution && Object.keys(config.questionTypeDistribution).length > 0) {
    return { ...config.questionTypeDistribution };
  }
  const types = (config.questionTypes || []).filter((t) => t && t !== "mixed");
  if (!types.length) return { multiple_choice: config.questionCount };
  if (types.length === 1) return { [types[0]!]: config.questionCount };
  const perType = Math.floor(config.questionCount / types.length);
  const dist: Record<string, number> = {};
  types.forEach((t, i) => {
    dist[t] = i === types.length - 1 ? config.questionCount - perType * (types.length - 1) : perType;
  });
  return dist;
}

export function expandTypeSequence(config: AiAssessmentConfig): string[] {
  const dist = resolveTypeDistribution(config);
  const sequence: string[] = [];
  for (const [type, count] of Object.entries(dist)) {
    for (let i = 0; i < count; i++) sequence.push(type);
  }
  return sequence.slice(0, config.questionCount);
}

export function validateQuizGenerationConfiguration(config: AiAssessmentConfig): GenerationValidationResult {
  if (!config.questionCount || config.questionCount < 1) {
    return { valid: false, error: "questionCount required" };
  }
  if (config.questionCount > 100) {
    return { valid: false, error: "Maximum 100 questions per generation" };
  }
  const dist = resolveTypeDistribution(config);
  const sum = Object.values(dist).reduce((a, b) => a + b, 0);
  if (sum !== config.questionCount) {
    return {
      valid: false,
      error: `Question distribution (${sum}) must equal total (${config.questionCount})`,
    };
  }
  return { valid: true };
}

export function toQuizGenerationConfiguration(config: AiAssessmentConfig): QuizGenerationConfiguration {
  return {
    ...config,
    questionTypeDistribution: resolveTypeDistribution(config),
    bloomDistribution: config.bloomDistribution,
  };
}

function countByType(questions: AiGeneratedQuestion[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of questions) {
    const t = normalizeImportQuestionType(q.type);
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

function countByField(questions: AiGeneratedQuestion[], field: "difficulty" | "bloomLevel"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of questions) {
    const key = field === "difficulty" ? q.difficulty || "medium" : q.bloomLevel || "L2";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

export function buildGenerationCoverage(
  config: AiAssessmentConfig,
  questions: AiGeneratedQuestion[]
): GenerationCoverage {
  const requested = config.questionCount;
  const generated = questions.length;
  return {
    requested,
    generated,
    coveragePercent: requested > 0 ? Math.round((generated / requested) * 100) : 0,
    isComplete: generated === requested,
    byTypeRequested: resolveTypeDistribution(config),
    byTypeGenerated: countByType(questions),
    byDifficultyRequested: config.difficultyMix
      ? {
          easy: config.difficultyMix.easy,
          medium: config.difficultyMix.medium,
          hard: config.difficultyMix.hard,
        }
      : undefined,
    byDifficultyGenerated: countByField(questions, "difficulty"),
    byBloomRequested: config.bloomDistribution,
    byBloomGenerated: countByField(questions, "bloomLevel"),
  };
}

export function alignQuestionsToSpec(
  questions: AiGeneratedQuestion[],
  config: AiAssessmentConfig
): AiGeneratedQuestion[] {
  const typeSequence = expandTypeSequence(config);
  const target = config.questionCount;

  const aligned = questions.slice(0, target).map((q, i) => ({
    ...q,
    type: normalizeImportQuestionType(typeSequence[i] || q.type),
    selected: q.selected !== false,
  }));

  return aligned;
}

export function assembleQuestionsFromTypeBuckets(
  byType: Record<string, AiGeneratedQuestion[]>,
  config: AiAssessmentConfig
): AiGeneratedQuestion[] {
  const typeSequence = expandTypeSequence(config);
  const indexes: Record<string, number> = {};
  const ordered: AiGeneratedQuestion[] = [];

  for (const type of typeSequence) {
    const idx = indexes[type] ?? 0;
    indexes[type] = idx + 1;
    const q = byType[type]?.[idx];
    if (q) ordered.push({ ...q, type: normalizeImportQuestionType(type) });
  }

  return alignQuestionsToSpec(ordered, config);
}

function missingTypeDistribution(
  config: AiAssessmentConfig,
  existing: AiGeneratedQuestion[]
): Record<string, number> {
  const requested = resolveTypeDistribution(config);
  const generated = countByType(existing);
  const missing: Record<string, number> = {};
  for (const [type, count] of Object.entries(requested)) {
    const gap = count - (generated[type] || 0);
    if (gap > 0) missing[type] = gap;
  }
  return missing;
}

function buildFillPrompt(
  content: string,
  config: AiAssessmentConfig,
  existing: AiGeneratedQuestion[],
  missingCount: number,
  missingTypes: Record<string, number>
): string {
  const stems = existing.map((q) => q.stem.slice(0, 80)).join("; ");
  const typeLines = Object.entries(missingTypes)
    .map(([t, n]) => `${t} = ${n}`)
    .join(", ");
  return `${content}\n\nGenerate exactly ${missingCount} additional questions. Types: ${typeLines}. Do not duplicate: ${stems}`;
}

async function generateBatch(
  content: string,
  config: AiAssessmentConfig,
  context?: { jobId?: string; requestId?: string; signal?: AbortSignal }
): Promise<{ questions: AiGeneratedQuestion[]; demoMode: boolean }> {
  try {
    const gen = await generateQuestionsFromContent(content, config, context);
    return { questions: gen.questions, demoMode: Boolean(gen.meta?.devMode) };
  } catch (err) {
    const aiErr = mapOpenAiError(err, context);
    if (isOfflineFallbackError(aiErr.payload.type)) {
      return { questions: generateOfflineDemoQuestions(config), demoMode: true };
    }
    throw err;
  }
}

async function generateTypeQuestions(
  content: string,
  type: string,
  targetCount: number,
  fullConfig: QuizGenerationConfiguration,
  context?: { jobId?: string; requestId?: string; signal?: AbortSignal },
  startOffset = 0
): Promise<{ questions: AiGeneratedQuestion[]; demoMode: boolean }> {
  let demoMode = false;
  const collected: AiGeneratedQuestion[] = [];
  const existingStems = new Set<string>();
  const maxAttempts = MAX_FILL_RETRIES + Math.ceil(targetCount / BATCH_SIZE);

  let attempts = 0;
  while (collected.length < targetCount && attempts < maxAttempts) {
    const need = targetCount - collected.length;
    const batchSize = Math.min(BATCH_SIZE, need);
    const batchConfig: AiAssessmentConfig = {
      ...fullConfig,
      questionCount: batchSize,
      questionTypeDistribution: { [type]: batchSize },
      questionTypes: [type],
      generationStartIndex: startOffset + collected.length,
    };
    const batchContent =
      attempts === 0
        ? content
        : buildFillPrompt(content, fullConfig, collected, batchSize, { [type]: batchSize });
    const batch = await generateBatch(batchContent, batchConfig, {
      ...context,
      requestId: context?.requestId || randomUUID(),
    });
    demoMode = demoMode || batch.demoMode;
    const aligned = alignQuestionsToSpec(batch.questions, batchConfig);

    for (const q of aligned) {
      if (collected.length >= targetCount) break;
      const key = q.stem.trim().toLowerCase();
      if (existingStems.has(key)) continue;
      existingStems.add(key);
      collected.push({ ...q, type: normalizeImportQuestionType(type) });
    }

    attempts++;
    if (aligned.length === 0 && batch.demoMode) break;
  }

  return { questions: collected.slice(0, targetCount), demoMode };
}

async function generateByTypePlan(
  content: string,
  config: QuizGenerationConfiguration,
  context?: { jobId?: string; requestId?: string; signal?: AbortSignal },
  seedByType?: Record<string, AiGeneratedQuestion[]>
): Promise<{ questions: AiGeneratedQuestion[]; demoMode: boolean }> {
  let demoMode = false;
  const byType: Record<string, AiGeneratedQuestion[]> = {};

  for (const [type, count] of Object.entries(config.questionTypeDistribution)) {
    if (count <= 0) continue;
    const seeded = (seedByType?.[type] || []).slice(0, count);
    const gap = count - seeded.length;

    if (gap <= 0) {
      byType[type] = seeded;
      continue;
    }

    const result = await generateTypeQuestions(content, type, gap, config, context, seeded.length);
    demoMode = demoMode || result.demoMode;
    byType[type] = [...seeded, ...result.questions].slice(0, count);
  }

  return { questions: assembleQuestionsFromTypeBuckets(byType, config), demoMode };
}

export async function generateAssessment(
  content: string,
  config: AiAssessmentConfig,
  context?: { jobId?: string; requestId?: string; signal?: AbortSignal }
): Promise<AssessmentGenerationResult> {
  const validation = validateQuizGenerationConfiguration(config);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid generation configuration");
  }

  const normalizedConfig = toQuizGenerationConfiguration(config);
  const { questions, demoMode } = await generateByTypePlan(content, normalizedConfig, context);
  const coverage = buildGenerationCoverage(normalizedConfig, questions);

  return {
    questions,
    coverage,
    partial: !coverage.isComplete,
    demoMode,
  };
}

export async function generateRemainingQuestions(
  content: string,
  config: AiAssessmentConfig,
  existing: AiGeneratedQuestion[],
  context?: { jobId?: string; requestId?: string; signal?: AbortSignal }
): Promise<AiGeneratedQuestion[]> {
  const validation = validateQuizGenerationConfiguration(config);
  if (!validation.valid) throw new Error(validation.error);

  const normalizedConfig = toQuizGenerationConfiguration(config);
  const aligned = alignQuestionsToSpec(existing, normalizedConfig);
  if (aligned.length >= normalizedConfig.questionCount) {
    return aligned;
  }

  const seedByType: Record<string, AiGeneratedQuestion[]> = {};
  for (const q of aligned) {
    const t = normalizeImportQuestionType(q.type);
    if (!seedByType[t]) seedByType[t] = [];
    seedByType[t].push(q);
  }

  const { questions } = await generateByTypePlan(content, normalizedConfig, context, seedByType);
  return questions;
}
