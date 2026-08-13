/**
 * Quiz LaTeX emitters — quiz container owns metadata + \\input{question-XX} only.
 * Each question file contains a single \\question{...} block.
 *
 * Complex values must never contain raw `{` `}` inside the outer \\question{...} block.
 */
import type { LuLessonComponentRef } from "./luLessonComponents.js";
import { isLuQuestionType } from "./luQuestionTypes.js";
import { escQuizField as esc } from "./luTexEscape.js";

function fieldScalar(key: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return `${key}={${value ? "true" : "false"}},`;
  if (typeof value === "number") return `${key}={${value}},`;
  return `${key}={${esc(String(value))}},`;
}

/** Base64 JSON — safe inside LaTeX brace arguments (no nested `{` `}`). */
export function fieldJsonB64(key: string, value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value) && value.length === 0) return "";
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) {
    return "";
  }
  const json = typeof value === "string" ? value : JSON.stringify(value);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return `${key}B64={${b64}},`;
}

function fieldPipeList(key: string, items: string[]): string {
  if (!items.length) return "";
  return fieldScalar(key, items.map((s) => String(s).replace(/\|/g, "\\|")).join("|"));
}

function emitFillBlankFields(parts: string[], cfg: Record<string, unknown>): void {
  const blanks = Array.isArray(cfg.blanks)
    ? (cfg.blanks as Array<{ id?: string; answer?: string; caseSensitive?: boolean }>)
    : [];
  if (!blanks.length) {
    parts.push(fieldScalar("b1Answer", ""));
    parts.push(fieldScalar("b1Case", "false"));
    parts.push(fieldScalar("blankIds", "b1"));
    return;
  }
  const ids: string[] = [];
  blanks.forEach((b, i) => {
    const id = String(b.id ?? `b${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, "") || `b${i + 1}`;
    ids.push(id);
    parts.push(fieldScalar(`${id}Answer`, b.answer ?? ""));
    parts.push(fieldScalar(`${id}Case`, b.caseSensitive ? "true" : "false"));
  });
  parts.push(fieldScalar("blankIds", ids.join("|")));
}

function emitMatchingFields(parts: string[], cfg: Record<string, unknown>): void {
  const pairs = Array.isArray(cfg.pairs)
    ? (cfg.pairs as Array<{ left?: string; right?: string }>)
    : [];
  if (!pairs.length) return;
  parts.push(
    fieldPipeList(
      "matchLeft",
      pairs.map((p) => p.left ?? "")
    )
  );
  parts.push(
    fieldPipeList(
      "matchRight",
      pairs.map((p) => p.right ?? "")
    )
  );
}

function emitOrderingFields(parts: string[], cfg: Record<string, unknown>): void {
  const items = Array.isArray(cfg.items) ? (cfg.items as string[]) : [];
  if (!items.length) return;
  parts.push(fieldPipeList("orderItems", items));
  const order = Array.isArray(cfg.correctOrder) ? (cfg.correctOrder as number[]).join(",") : "";
  if (order) parts.push(fieldScalar("correctOrder", order));
}

/** Quiz container: metadata block only (children added via surgical \\input lines). */
export function emitQuizContainerTex(quiz: LuLessonComponentRef): string {
  const title = String(quiz.config?.title ?? quiz.title);
  const settings = quiz.config?.settings as Record<string, unknown> | undefined;
  const lines = [
    `\\quiz{`,
    fieldScalar("title", title),
    fieldScalar("shuffle", settings?.shuffleQuestions ?? quiz.config?.shuffleQuestions ?? false),
    fieldScalar("timeLimitSec", settings?.timeLimitSec ?? quiz.config?.timeLimitSec ?? 0),
    fieldScalar("passingScore", settings?.passingScore ?? quiz.config?.passingScore ?? 70),
    `}`,
  ];
  return lines.filter(Boolean).join("\n").trim() + "\n";
}

/** One question file — never a \\quiz block. */
export function emitQuestionTex(comp: LuLessonComponentRef): string {
  const cfg = comp.config ?? {};
  const questionType = String(cfg.questionType ?? "multiple-choice");
  const type = isLuQuestionType(questionType) ? questionType : "multiple-choice";

  const parts = [
    `\\question{`,
    fieldScalar("type", type),
    fieldScalar("text", cfg.question ?? comp.title),
    fieldScalar("marks", cfg.marks ?? 1),
    fieldScalar("difficulty", cfg.difficulty ?? "medium"),
    fieldScalar("shuffle", cfg.shuffle ?? false),
    fieldScalar("required", cfg.required ?? true),
    fieldScalar("explanation", cfg.explanation ?? ""),
    fieldScalar("image", cfg.image ?? cfg.imageUrl ?? ""),
    fieldScalar("video", cfg.video ?? cfg.videoUrl ?? ""),
    fieldScalar("audio", cfg.audio ?? cfg.audioUrl ?? ""),
    fieldScalar("timeLimitSec", cfg.timeLimitSec ?? 0),
  ];

  switch (type) {
    case "multiple-choice":
      parts.push(
        fieldScalar("optionA", cfg.optionA),
        fieldScalar("optionB", cfg.optionB),
        fieldScalar("optionC", cfg.optionC),
        fieldScalar("optionD", cfg.optionD),
        fieldScalar("correct", cfg.correct)
      );
      break;
    case "multiple-select": {
      const opts = Array.isArray(cfg.options) ? (cfg.options as string[]) : [];
      if (opts.length) parts.push(fieldPipeList("options", opts));
      const correct = Array.isArray(cfg.correct)
        ? (cfg.correct as string[]).join(",")
        : cfg.correct;
      parts.push(fieldScalar("correct", correct));
      break;
    }
    case "true-false":
      parts.push(fieldScalar("correct", cfg.correct ?? "true"));
      break;
    case "fill-blank":
      emitFillBlankFields(parts, cfg);
      break;
    case "short-answer":
      parts.push(fieldScalar("maxLength", cfg.maxLength), fieldScalar("sampleAnswer", cfg.sampleAnswer));
      break;
    case "long-answer":
    case "essay":
      parts.push(
        fieldScalar("minWords", cfg.minWords),
        fieldScalar("maxWords", cfg.maxWords),
        fieldScalar("rubric", cfg.rubric)
      );
      break;
    case "matching":
      emitMatchingFields(parts, cfg);
      break;
    case "ordering":
      emitOrderingFields(parts, cfg);
      break;
    case "numerical":
      parts.push(
        fieldScalar("answer", cfg.answer),
        fieldScalar("tolerance", cfg.tolerance),
        fieldScalar("unit", cfg.unit)
      );
      break;
    case "coding":
      parts.push(
        fieldScalar("language", cfg.language),
        fieldScalar("starterCode", cfg.starterCode),
        fieldScalar("timeLimitMs", cfg.timeLimitMs)
      );
      if (cfg.tests) parts.push(fieldJsonB64("tests", cfg.tests));
      break;
    case "file-upload":
      parts.push(
        fieldScalar("allowedTypes", Array.isArray(cfg.allowedTypes) ? (cfg.allowedTypes as string[]).join(",") : cfg.allowedTypes),
        fieldScalar("maxSizeMb", cfg.maxSizeMb)
      );
      break;
    case "case-study":
      parts.push(fieldScalar("scenario", cfg.scenario));
      if (cfg.subQuestions) parts.push(fieldJsonB64("subQuestions", cfg.subQuestions));
      break;
    case "image-based":
      parts.push(fieldScalar("imageUrl", cfg.imageUrl ?? cfg.image));
      if (cfg.hotspot) parts.push(fieldJsonB64("hotspot", cfg.hotspot));
      break;
    case "audio-based":
      parts.push(fieldScalar("audioUrl", cfg.audioUrl ?? cfg.audio), fieldScalar("transcript", cfg.transcript));
      break;
    case "video-based":
      parts.push(fieldScalar("videoUrl", cfg.videoUrl ?? cfg.video), fieldScalar("timestamp", cfg.timestamp));
      break;
    default:
      break;
  }

  const hints = cfg.hints as string[] | undefined;
  if (hints?.length) parts.push(fieldPipeList("hints", hints));

  const feedback = cfg.feedback as { correct?: string; incorrect?: string } | undefined;
  if (feedback?.correct) parts.push(fieldScalar("feedbackCorrect", feedback.correct));
  if (feedback?.incorrect) parts.push(fieldScalar("feedbackIncorrect", feedback.incorrect));

  parts.push(`}`);
  return parts.join("\n").trim() + "\n";
}

/** Verify outer \\question{...} brace balance (compile safety). */
export function assertQuestionTexBalanced(tex: string): void {
  const open = tex.indexOf("\\question{");
  if (open < 0) return;
  const braceStart = tex.indexOf("{", open);
  let depth = 0;
  for (let i = braceStart; i < tex.length; i++) {
    if (tex[i] === "{") depth++;
    else if (tex[i] === "}") {
      depth--;
      if (depth === 0) return;
    }
  }
  throw new Error("Unbalanced braces in question tex");
}
