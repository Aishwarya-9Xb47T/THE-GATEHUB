import { randomUUID } from "crypto";
import type { AiAssessmentConfig, AiGeneratedQuestion } from "./types.js";
import { parseCopilotCommand, type CopilotIntent } from "./aiCopilotCommandParser.js";
import { normalizeImportQuestionType } from "../import/importQuizMaterializer.js";
import { AiRouter } from "../../ai/AiRouter.js";
import {
  generateAssessment,
} from "../../assessmentGeneration/assessmentGenerationService.js";

export type CopilotProgressEvent =
  | { type: "stage"; message: string }
  | { type: "token"; content: string }
  | { type: "question_updated"; questionId: string; question: AiGeneratedQuestion; original?: AiGeneratedQuestion }
  | { type: "questions_replaced"; questions: AiGeneratedQuestion[] }
  | { type: "message"; text: string }
  | { type: "done"; summary: string; modifiedIds: string[] };

const DIFFICULTY_ORDER = ["very_easy", "easy", "medium", "hard", "expert"];

function bumpDifficulty(d?: string, up = true): string {
  const cur = d || "medium";
  const idx = DIFFICULTY_ORDER.indexOf(cur);
  const base = idx >= 0 ? idx : 2;
  const next = Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, base + (up ? 1 : -1)));
  return DIFFICULTY_ORDER[next]!;
}

function bumpBloom(level?: string, up = true): string {
  const m = level?.match(/L?(\d)/i);
  const n = m ? Number(m[1]) : 2;
  const next = Math.max(1, Math.min(6, n + (up ? 1 : -1)));
  return `L${next}`;
}

function stemSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

export function removeDuplicateQuestions(questions: AiGeneratedQuestion[]): {
  questions: AiGeneratedQuestion[];
  removedIds: string[];
} {
  const kept: AiGeneratedQuestion[] = [];
  const removedIds: string[] = [];
  for (const q of questions) {
    const dup = kept.some((k) => stemSimilarity(k.stem, q.stem) > 0.72);
    if (dup) removedIds.push(q.id);
    else kept.push(q);
  }
  return { questions: kept, removedIds };
}

export function shuffleQuestions(questions: AiGeneratedQuestion[]): AiGeneratedQuestion[] {
  const copy = [...questions];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function resolveTargetIds(
  questions: AiGeneratedQuestion[],
  indices: number[],
  explicitIds: string[]
): string[] {
  if (explicitIds.length) return explicitIds;
  if (indices.length) return indices.map((i) => questions[i]?.id).filter(Boolean) as string[];
  return questions.map((q) => q.id);
}

async function refineWithAi(
  action: string,
  questions: AiGeneratedQuestion[],
  config: AiAssessmentConfig,
  onStage?: (msg: string) => void
): Promise<AiGeneratedQuestion[]> {
  onStage?.("Analyzing questions…");
  const refined = await AiRouter.improveQuestions(action, questions, config, { onStage });
  onStage?.("Validating output…");
  return refined;
}

import { applyLocalQuestionRefinement } from "../../ai/mockQuestionRefinement.js";

function applyLocalFallback(action: string, questions: AiGeneratedQuestion[]): AiGeneratedQuestion[] {
  return questions.map((q) => applyLocalQuestionRefinement(action, q));
}

async function refineSingleQuestion(
  intent: CopilotIntent,
  question: AiGeneratedQuestion,
  config: AiAssessmentConfig,
  opts?: { language?: string }
): Promise<AiGeneratedQuestion> {
  const actionLabels: Partial<Record<CopilotIntent, string>> = {
    harder: "Increase difficulty — make stem and distractors more challenging",
    easier: "Decrease difficulty — simplify language and concepts",
    rewrite: "Rewrite for clarity while preserving meaning",
    simplify: "Simplify wording for easier reading",
    improve_grammar: "Fix grammar and spelling",
    improve_distractors: "Improve wrong answer options to be more plausible",
    generate_similar: "Generate a similar question on the same topic",
    generate_opposite: "Generate an opposite/contrasting question",
    generate_numerical: "Convert to a numerical problem",
    generate_coding: "Convert to a coding/programming question",
    generate_scenario: "Convert to a scenario-based case study",
    generate_explanation: "Write a clear correct-answer explanation",
    generate_hint: "Add a helpful hint without revealing the answer",
    translate: `Translate entire question to ${opts?.language || "Hindi"}`,
    regenerate: "Regenerate this question with fresh content on same topic",
    convert_case_study: "Convert to a case study format",
  };

  const action = actionLabels[intent] || `Apply: ${intent}`;
  return AiRouter.refineQuestion({ action, question, config, options: { onStage: undefined } });
}

export async function executeCopilotCommand(params: {
  command: string;
  questions: AiGeneratedQuestion[];
  config: AiAssessmentConfig;
  questionIds?: string[];
  intent?: CopilotIntent;
  onProgress?: (e: CopilotProgressEvent) => void;
}): Promise<{ questions: AiGeneratedQuestion[]; message: string; modifiedIds: string[] }> {
  const parsed = params.intent
    ? { intent: params.intent, questionIndices: [], questionIds: params.questionIds || [], raw: params.command, confidence: 1 }
    : parseCopilotCommand(params.command);

  const send = params.onProgress;
  send?.({ type: "stage", message: `Understanding: "${parsed.raw.slice(0, 80)}…"` });

  let questions = [...params.questions];
  const targetIds = resolveTargetIds(questions, parsed.questionIndices, [
    ...parsed.questionIds,
    ...(params.questionIds || []),
  ]);
  const modifiedIds: string[] = [];

  const updateTargets = async (intent: CopilotIntent, actionLabel: string) => {
    send?.({ type: "stage", message: actionLabel });
    for (const id of targetIds) {
      const idx = questions.findIndex((q) => q.id === id);
      if (idx < 0) continue;
      const original = questions[idx]!;
      send?.({ type: "stage", message: `Improving question ${idx + 1}…` });
      const refined = await refineSingleQuestion(intent, original, params.config, { language: parsed.language });
      questions[idx] = refined;
      modifiedIds.push(id);
      send?.({ type: "question_updated", questionId: id, question: refined, original });
    }
  };

  switch (parsed.intent) {
    case "harder":
      await updateTargets("harder", "Increasing difficulty…");
      break;
    case "easier":
      await updateTargets("easier", "Decreasing difficulty…");
      break;
    case "improve_grammar":
      await updateTargets("improve_grammar", "Checking grammar…");
      break;
    case "improve_distractors":
      await updateTargets("improve_distractors", "Generating distractors…");
      break;
    case "generate_explanations_all":
    case "generate_explanation":
      await updateTargets("generate_explanation", "Creating explanations…");
      break;
    case "generate_hints_all":
    case "generate_hint":
      await updateTargets("generate_hint", "Creating hints…");
      break;
    case "translate":
      await updateTargets("translate", `Translating to ${parsed.language || "target language"}…`);
      break;
    case "regenerate":
    case "rewrite":
    case "simplify":
    case "generate_similar":
    case "generate_opposite":
    case "generate_numerical":
    case "generate_coding":
    case "generate_scenario":
    case "convert_case_study":
      await updateTargets(parsed.intent, "Refining questions…");
      break;
    case "remove_duplicates":
    case "detect_duplicates": {
      send?.({ type: "stage", message: "Detecting duplicates…" });
      const { questions: deduped, removedIds } = removeDuplicateQuestions(questions);
      questions = deduped;
      modifiedIds.push(...removedIds);
      send?.({ type: "questions_replaced", questions });
      break;
    }
    case "shuffle": {
      questions = shuffleQuestions(questions);
      send?.({ type: "questions_replaced", questions });
      break;
    }
    case "balance_difficulty": {
      send?.({ type: "stage", message: "Balancing difficulty…" });
      const levels = ["easy", "medium", "hard"];
      questions = questions.map((q, i) => ({ ...q, difficulty: levels[i % levels.length] }));
      modifiedIds.push(...questions.map((q) => q.id));
      break;
    }
    case "reduce_duration": {
      questions = questions.map((q) => ({
        ...q,
        estimatedSeconds: Math.max(30, Math.round((q.estimatedSeconds || 60) * 0.7)),
      }));
      modifiedIds.push(...questions.map((q) => q.id));
      break;
    }
    case "increase_bloom":
      questions = questions.map((q) =>
        targetIds.includes(q.id) ? { ...q, bloomLevel: bumpBloom(q.bloomLevel, true) } : q
      );
      modifiedIds.push(...targetIds);
      break;
    case "placement_test":
      await refineWithAi(
        "Convert tone to placement interview style — practical, concise, industry-relevant",
        targetIds.length ? questions.filter((q) => targetIds.includes(q.id)) : questions,
        params.config,
        (m) => send?.({ type: "stage", message: m })
      ).then((refined) => {
        const map = new Map(refined.map((q) => [q.id, q]));
        questions = questions.map((q) => map.get(q.id) || q);
        modifiedIds.push(...refined.map((q) => q.id));
      });
      break;
    case "add_coding": {
      const count = parsed.count || 2;
      send?.({ type: "stage", message: `Generating ${count} coding questions…` });
      const newQs = await generateAdditionalQuestions(params.config, "coding", count, params.questions);
      questions = [...questions, ...newQs];
      modifiedIds.push(...newQs.map((q) => q.id));
      send?.({ type: "questions_replaced", questions });
      break;
    }
    case "replace_theory": {
      const theory = questions.filter(
        (q) => q.type === "essay" || q.type === "multiple_choice" || !q.options?.length
      );
      const ids = theory.slice(0, Math.min(3, theory.length)).map((q) => q.id);
      for (const id of ids) {
        const idx = questions.findIndex((q) => q.id === id);
        if (idx < 0) continue;
        questions[idx] = await refineSingleQuestion("generate_scenario", questions[idx]!, params.config);
        modifiedIds.push(id);
      }
      break;
    }
    case "custom":
    default: {
      send?.({ type: "stage", message: "Processing command…" });
      const targets = targetIds.length
        ? questions.filter((q) => targetIds.includes(q.id))
        : questions.slice(0, Math.min(5, questions.length));
      const refined = await refineWithAi(parsed.raw, targets, params.config, (m) =>
        send?.({ type: "stage", message: m })
      );
      const map = new Map(refined.map((q) => [q.id, q]));
      questions = questions.map((q) => map.get(q.id) || q);
      modifiedIds.push(...refined.map((q) => q.id));
      break;
    }
  }

  send?.({ type: "stage", message: "Done." });
  const message = buildResultMessage(parsed.intent, modifiedIds.length, parsed.raw);
  send?.({ type: "done", summary: message, modifiedIds });
  return { questions, message, modifiedIds };
}

async function generateAdditionalQuestions(
  config: AiAssessmentConfig,
  type: string,
  count: number,
  existing: AiGeneratedQuestion[]
): Promise<AiGeneratedQuestion[]> {
  const content = `Generate ${count} new ${type} questions. Avoid duplicating: ${existing.map((q) => q.stem.slice(0, 60)).join("; ")}. Subject: ${config.subject || config.topic || "general"}`;
  const genConfig: AiAssessmentConfig = {
    ...config,
    questionCount: count,
    questionTypes: [type],
    questionTypeDistribution: { [type]: count },
  };
  const result = await generateAssessment(content, genConfig);
  return result.questions.map((q) => ({ ...q, id: randomUUID(), selected: true }));
}

function buildResultMessage(intent: CopilotIntent, count: number, raw: string): string {
  if (intent === "remove_duplicates" || intent === "detect_duplicates") {
    return count ? `Removed ${count} duplicate question(s).` : "No duplicates found.";
  }
  if (intent === "shuffle") return "Questions shuffled.";
  if (count === 0) return "No changes were needed.";
  return `Updated ${count} question(s) for: "${raw.slice(0, 60)}${raw.length > 60 ? "…" : ""}"`;
}

export async function* streamCopilotStages(
  command: string
): AsyncGenerator<{ type: "stage"; message: string }> {
  yield { type: "stage", message: "Parsing command…" };
  const parsed = parseCopilotCommand(command);
  yield { type: "stage", message: `Intent: ${parsed.intent.replace(/_/g, " ")}` };
  yield { type: "stage", message: "Preparing assessment context…" };
}
