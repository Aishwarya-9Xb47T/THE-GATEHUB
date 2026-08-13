import { randomUUID } from "crypto";
import type { AiAssessmentConfig, AiGeneratedQuestion } from "../assessmentStudio/aiAssessment/types.js";
import { normalizeImportQuestionType } from "../assessmentStudio/import/importQuizMaterializer.js";
import { stripMockArtifacts } from "./mockQuestionRefinement.js";

export function normalizeBloom(level?: string): string {
  if (!level) return "L2";
  const m = level.match(/L?(\d)/i);
  if (m) return `L${m[1]}`;
  const map: Record<string, string> = {
    remember: "L1", understand: "L2", apply: "L3", analyze: "L4", evaluate: "L5", create: "L6", balanced: "L3",
  };
  return map[level?.toLowerCase() || ""] || "L2";
}

export function buildAssessmentSystemPrompt(config: AiAssessmentConfig): string {
  const dist = config.questionTypeDistribution;
  const distLines = dist
    ? Object.entries(dist)
        .filter(([, n]) => n > 0)
        .map(([type, count]) => `${type} = ${count}`)
        .join("\n")
    : (config.questionTypes?.length ? config.questionTypes.join(", ") : "mixed");

  let difficultySection = "";
  if (config.difficultyMix) {
    difficultySection = `\nDifficulty distribution (percentages):\nEasy = ${config.difficultyMix.easy}%\nMedium = ${config.difficultyMix.medium}%\nHard = ${config.difficultyMix.hard}%`;
  }

  let bloomSection = "";
  if (config.bloomDistribution) {
    bloomSection = `\nBloom taxonomy distribution:\n${Object.entries(config.bloomDistribution)
      .filter(([, n]) => n > 0)
      .map(([level, pct]) => `${level} = ${pct}%`)
      .join("\n")}`;
  }

  return `You are THE GATEHUB AI Assessment Architect.

Generate EXACTLY ${config.questionCount} professional quiz questions.
Do NOT generate fewer. Do NOT generate more.

Question type distribution (mandatory — match exactly):
${distLines}${difficultySection}${bloomSection}

Quiz: ${config.quizName} | Subject: ${config.subject || "General"} | Audience: ${config.targetAudience || "students"}
Bloom focus: ${config.bloomLevel || "balanced"} | Tone: ${config.tone || "academic"}

Return JSON only: { "questions": [{ "stem", "type", "difficulty", "bloomLevel", "explanation", "topic", "options": [{"text","isCorrect"}], "confidence", "estimatedSeconds", "marks", "hints" }] }`;
}

export function mapRawQuestion(q: Record<string, unknown>, config: AiAssessmentConfig): AiGeneratedQuestion {
  const options = Array.isArray(q.options)
    ? (q.options as Array<{ text?: string; isCorrect?: boolean }>)
        .map((o) => ({ text: String(o.text || "").trim(), isCorrect: Boolean(o.isCorrect) }))
        .filter((o) => o.text)
    : undefined;
  const type = normalizeImportQuestionType(String(q.type || "multiple_choice"));
  const allowed = config.questionTypes?.length && !config.questionTypes.includes("mixed");
  const finalType = allowed && config.questionTypes.includes(type) ? type : allowed ? config.questionTypes[0]! : type;

  return {
    id: randomUUID(),
    stem: stripMockArtifacts(String(q.stem || "").trim()),
    type: finalType,
    difficulty: String(q.difficulty || config.difficulty || "medium"),
    bloomLevel: normalizeBloom(String(q.bloomLevel || config.bloomLevel || "")),
    explanation: config.generateExplanations !== false ? String(q.explanation || "").trim() || undefined : undefined,
    topic: q.topic ? String(q.topic) : config.subject,
    subtopic: q.subtopic ? String(q.subtopic) : undefined,
    tags: Array.isArray(q.tags) ? q.tags.map(String) : config.generateTags ? [config.subject || "ai-generated"] : [],
    hints: config.generateHints && Array.isArray(q.hints) ? q.hints.map(String) : undefined,
    options: options?.length ? options : finalType === "true_false" ? [{ text: "True", isCorrect: true }, { text: "False", isCorrect: false }] : undefined,
    confidence: typeof q.confidence === "number" ? q.confidence : 0.85,
    estimatedSeconds: typeof q.estimatedSeconds === "number" ? q.estimatedSeconds : 60,
    marks: typeof q.marks === "number" ? q.marks : 1,
    selected: true,
    metadata: { aiGenerated: true },
  };
}

export function parseQuestionsJson(raw: string, config: AiAssessmentConfig): AiGeneratedQuestion[] {
  let parsed: { questions?: Array<Record<string, unknown>> } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]!);
    else throw new Error("JSON_PARSE_ERROR");
  }
  return (parsed.questions || []).map((q) => mapRawQuestion(q, config)).filter((q) => q.stem.length >= 8);
}

export async function refineQuestionJson(
  action: string,
  question: AiGeneratedQuestion,
  config: AiAssessmentConfig,
  complete: (system: string, user: string) => Promise<string>
): Promise<AiGeneratedQuestion> {
  const payload = {
    id: question.id,
    stem: question.stem,
    type: question.type,
    difficulty: question.difficulty,
    bloomLevel: question.bloomLevel,
    options: question.options,
    explanation: question.explanation,
    hints: question.hints,
    topic: question.topic,
  };
  const raw = await complete(
    `You are THE GATEHUB Assessment Copilot. Apply: "${action}". Return JSON { "questions": [single updated question, preserve id] }.`,
    JSON.stringify({ quiz: config.quizName, subject: config.subject, question: payload })
  );
  const [refined] = parseQuestionsJson(raw, config);
  return refined ? { ...refined, id: question.id, selected: question.selected } : question;
}
