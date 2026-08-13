import { randomUUID } from "crypto";
import OpenAI from "openai";
import type { ImportedQuestionDraft, ImportPreviewSummary } from "./types.js";

const getOpenAi = (): OpenAI | null => {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k ? new OpenAI({ apiKey: k }) : null;
};

const VALID_TYPES = new Set([
  "multiple_choice",
  "multiple_select",
  "true_false",
  "fill_blank",
  "numerical",
  "matching",
  "ordering",
  "essay",
  "case_study",
  "scenario",
  "coding",
  "debugging",
  "predict_output",
  "sql",
  "diagram",
  "image_based",
  "research_analysis",
]);

function normalizeBloom(level?: string): string | undefined {
  if (!level) return undefined;
  const m = level.match(/L?(\d)/i);
  if (m) return `L${m[1]}`;
  const map: Record<string, string> = {
    remember: "L1",
    understand: "L2",
    apply: "L3",
    analyze: "L4",
    evaluate: "L5",
    create: "L6",
  };
  return map[level.toLowerCase()] || "L2";
}

function normalizeType(raw?: string): string {
  if (!raw) return "multiple_choice";
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    mcq: "multiple_choice",
    multiple_choice: "multiple_choice",
    multiple_select: "multiple_select",
    true_false: "true_false",
    "true/false": "true_false",
    fill_blank: "fill_blank",
    "fill_in_blank": "fill_blank",
    short_answer: "fill_blank",
    numerical: "numerical",
    matching: "matching",
    match_following: "matching",
    ordering: "ordering",
    essay: "essay",
    case_study: "case_study",
    scenario: "scenario",
    coding: "coding",
    code: "coding",
    debugging: "debugging",
    predict_output: "predict_output",
    sql: "sql",
    diagram: "diagram",
    image_based: "image_based",
    research_analysis: "research_analysis",
  };
  const mapped = aliases[key] || key;
  return VALID_TYPES.has(mapped) ? mapped : "multiple_choice";
}

function heuristicExtractGoogleForms(content: string): ImportedQuestionDraft[] {
  const drafts: ImportedQuestionDraft[] = [];
  const blocks = content.split(/\n(?=Question:\s*)/i).filter((b) => b.trim().length > 10);

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const stemLine = lines.find((l) => /^Question:\s*/i.test(l));
    if (!stemLine) continue;
    const stem = stemLine.replace(/^Question:\s*/i, "").trim();
    if (stem.length < 3) continue;

    const optionsLine = lines.find((l) => /^Options:\s*/i.test(l));
    const correctLine = lines.find((l) => /^Correct:\s*/i.test(l));
    const correctValues = correctLine
      ? correctLine.replace(/^Correct:\s*/i, "").split(/[,|]/).map((s) => s.trim().toLowerCase())
      : [];

    let options: Array<{ text: string; isCorrect: boolean }> | undefined;
    if (optionsLine) {
      const optTexts = optionsLine
        .replace(/^Options:\s*/i, "")
        .split(/\s*\|\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (optTexts.length >= 2) {
        options = optTexts.map((text) => ({
          text,
          isCorrect: correctValues.some((c) => text.toLowerCase().includes(c) || c.includes(text.toLowerCase().slice(0, 12))),
        }));
        if (!options.some((o) => o.isCorrect) && correctValues.length) {
          options[0]!.isCorrect = true;
        }
      }
    }

    const typeLine = lines.find((l) => /^Type:\s*/i.test(l));
    const isParagraph = typeLine?.toLowerCase().includes("paragraph");
    const isShort = typeLine?.toLowerCase().includes("short");

    let type = "multiple_choice";
    if (options?.length === 2 && options.every((o) => ["true", "false"].includes(o.text.toLowerCase()))) {
      type = "true_false";
    } else if (!options?.length && isParagraph) type = "essay";
    else if (!options?.length && isShort) type = "fill_blank";

    drafts.push({
      id: randomUUID(),
      stem,
      type,
      difficulty: "medium",
      bloomLevel: "L2",
      options: options || (type === "fill_blank" ? [{ text: "", isCorrect: true }] : undefined),
      tags: ["imported", "google_forms"],
      selected: true,
      warnings: ["Extracted from Google Form structure ΓÇö review recommended"],
    });
  }

  return drafts;
}

function heuristicExtract(content: string): ImportedQuestionDraft[] {
  const drafts: ImportedQuestionDraft[] = [];
  const blocks = content.split(/\n(?=\d+[\.\)]\s|Q\d+[:.\s])/i);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.length < 15) continue;

    const stemMatch = trimmed.match(/^(?:\d+[\.\)]|Q\d+[:.\s])\s*(.+?)(?:\n|$)/i);
    const stem = (stemMatch?.[1] || trimmed.split("\n")[0] || "").trim();
    if (stem.length < 10) continue;

    const optionLines = [...trimmed.matchAll(/^[A-Da-d][\.\)]\s*(.+)$/gm)].map((m) => m[1]!.trim());
    const answerMatch = trimmed.match(/(?:answer|correct)[:\s]+(.+)/i);

    const options =
      optionLines.length >= 2
        ? optionLines.map((text, i) => ({
            text,
            isCorrect: answerMatch
              ? text.toLowerCase().includes(answerMatch[1]!.trim().toLowerCase().slice(0, 20))
              : i === 0,
          }))
        : [
            { text: "True", isCorrect: true },
            { text: "False", isCorrect: false },
          ];

    drafts.push({
      id: randomUUID(),
      stem,
      type: optionLines.length >= 2 ? "multiple_choice" : "true_false",
      difficulty: "medium",
      bloomLevel: "L2",
      explanation: "",
      options,
      tags: ["imported"],
      selected: true,
      warnings: ["Extracted with basic parser ΓÇö review recommended"],
    });
  }

  return drafts.slice(0, 50);
}

async function extractWithAISingleChunk(
  snippet: string,
  context: { source: string; fileName?: string; sourceUrl?: string }
): Promise<ImportedQuestionDraft[]> {
  if (!openai) return heuristicExtract(snippet);

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert assessment content extractor for THE GATEHUB Assessment Studio.
Extract every assessment question from the provided content. Return JSON:
{
  "questions": [
    {
      "stem": "question text (markdown ok)",
      "type": "multiple_choice|multiple_select|true_false|fill_blank|numerical|matching|ordering|essay|case_study|scenario|coding|debugging|predict_output|sql|diagram|research_analysis",
      "difficulty": "easy|medium|hard",
      "bloomLevel": "L1-L6",
      "explanation": "detailed explanation",
      "topic": "topic",
      "subtopic": "subtopic",
      "tags": ["tag1"],
      "learningObjectives": ["objective"],
      "hints": ["hint"],
      "options": [{ "text": "option", "isCorrect": true|false }],
      "warnings": ["optional warning"]
    }
  ]
}
Rules:
- Identify question boundaries accurately
- Infer type from structure
- Generate missing explanations
- Improve grammar
- Mark correct answers when detectable
- For slides/videos, create questions from concepts when no explicit questions exist
- Never invent placeholder "Question 1" text
- Max 40 questions per import`,
        },
        {
          role: "user",
          content: `Source: ${context.source}
${context.fileName ? `File: ${context.fileName}` : ""}
${context.sourceUrl ? `URL: ${context.sourceUrl}` : ""}

Content:
${snippet}`,
        },
      ],
    });

    const raw = res.choices[0]?.message?.content || "{}";
    let parsed: { questions?: Array<Record<string, unknown>> } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return heuristicExtract(snippet);
    }

    const questions = parsed.questions || [];
    if (!questions.length) return heuristicExtract(snippet);

    return questions.map((q) => {
      const options = Array.isArray(q.options)
        ? (q.options as Array<{ text?: string; isCorrect?: boolean }>).map((o) => ({
            text: String(o.text || "").trim(),
            isCorrect: Boolean(o.isCorrect),
          }))
        : undefined;

      const type = normalizeType(String(q.type || ""));
      const normalizedOptions =
        options?.filter((o) => o.text) ||
        (type === "true_false"
          ? [
              { text: "True", isCorrect: true },
              { text: "False", isCorrect: false },
            ]
          : []);

      return {
        id: randomUUID(),
        stem: String(q.stem || "").trim(),
        type,
        difficulty: String(q.difficulty || "medium"),
        bloomLevel: normalizeBloom(String(q.bloomLevel || "")),
        explanation: String(q.explanation || "").trim() || undefined,
        topic: q.topic ? String(q.topic) : undefined,
        subtopic: q.subtopic ? String(q.subtopic) : undefined,
        tags: Array.isArray(q.tags) ? q.tags.map(String) : ["imported"],
        learningObjectives: Array.isArray(q.learningObjectives) ? q.learningObjectives.map(String) : undefined,
        hints: Array.isArray(q.hints) ? q.hints.map(String) : undefined,
        options: normalizedOptions.length ? normalizedOptions : undefined,
        warnings: Array.isArray(q.warnings) ? q.warnings.map(String) : undefined,
        selected: true,
        metadata: { importSource: context.source },
      };
    }).filter((q) => q.stem.length >= 5);
  } catch (err) {
    console.warn("[questionExtractorAI] AI extraction failed, falling back to heuristic:", err);
    return heuristicExtract(snippet);
  }
}

async function extractWithAI(
  content: string,
  context: { source: string; fileName?: string; sourceUrl?: string }
): Promise<ImportedQuestionDraft[]> {
  if (!openai) return heuristicExtract(content);

  const chunkSize = 12000;
  if (content.length <= chunkSize) {
    return extractWithAISingleChunk(content, context);
  }

  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > 0 && chunks.length < 5) {
    if (remaining.length <= chunkSize) {
      chunks.push(remaining);
      break;
    }
    let cutIdx = remaining.lastIndexOf("\n\n", chunkSize);
    if (cutIdx <= chunkSize / 2) cutIdx = remaining.lastIndexOf("\n", chunkSize);
    if (cutIdx <= chunkSize / 2) cutIdx = chunkSize;
    chunks.push(remaining.slice(0, cutIdx));
    remaining = remaining.slice(cutIdx).trimStart();
  }

  const allQuestions: ImportedQuestionDraft[] = [];
  for (const chunk of chunks) {
    const chunkQuestions = await extractWithAISingleChunk(chunk, context);
    allQuestions.push(...chunkQuestions);
  }

  return allQuestions.length ? allQuestions : heuristicExtract(content);
}

function normalizeStem(stem: string): string {
  return stem.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export function markDuplicates(
  drafts: ImportedQuestionDraft[],
  existingStems: string[]
): ImportedQuestionDraft[] {
  const seen = new Set<string>();
  const existing = new Set(existingStems.map(normalizeStem));

  return drafts.map((d) => {
    const norm = normalizeStem(d.stem);
    let isDuplicate = false;
    let duplicateReason: string | undefined;

    if (existing.has(norm)) {
      isDuplicate = true;
      duplicateReason = "Similar question already in your bank";
    } else if (seen.has(norm)) {
      isDuplicate = true;
      duplicateReason = "Duplicate within this import";
    }
    seen.add(norm);

    return { ...d, isDuplicate, duplicateReason };
  });
}

export function buildPreviewSummary(questions: ImportedQuestionDraft[]): ImportPreviewSummary {
  const byType: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  let withAnswers = 0;
  const warnings: string[] = [];

  for (const q of questions) {
    byType[q.type] = (byType[q.type] || 0) + 1;
    const diff = q.difficulty || "unknown";
    byDifficulty[diff] = (byDifficulty[diff] || 0) + 1;
    if (q.options?.some((o) => o.isCorrect) || q.type === "essay" || q.type === "fill_blank") {
      withAnswers++;
    }
    if (q.warnings?.length) warnings.push(...q.warnings);
  }

  const duplicateCount = questions.filter((q) => q.isDuplicate).length;
  if (duplicateCount) warnings.push(`${duplicateCount} potential duplicate(s) detected`);

  return {
    totalQuestions: questions.length,
    byType,
    byDifficulty,
    withAnswers,
    warnings: [...new Set(warnings)].slice(0, 20),
    duplicateCount,
  };
}

export async function extractQuestionsFromContent(
  content: string,
  context: { source: string; fileName?: string; sourceUrl?: string },
  existingStems: string[] = []
): Promise<ImportedQuestionDraft[]> {
  let raw: ImportedQuestionDraft[];
  if (context.source === "google_forms") {
    const gf = heuristicExtractGoogleForms(content);
    raw = gf.length ? gf : await extractWithAI(content, context);
  } else {
    raw = await extractWithAI(content, context);
  }
  if (!raw.length) {
    const fallback = heuristicExtract(content);
    raw = fallback;
  }
  return markDuplicates(raw, existingStems);
}
