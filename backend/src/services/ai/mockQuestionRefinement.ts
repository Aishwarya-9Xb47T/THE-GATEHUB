import type { AiGeneratedQuestion } from "../assessmentStudio/aiAssessment/types.js";

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

/** Remove leaked mock/debug suffixes from stems saved during development. */
export function stripMockArtifacts(text: string): string {
  return text
    .replace(/\s*\[Mock:[^\]]*\]/gi, "")
    .replace(/\s*\(Mock:[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function applyLocalQuestionRefinement(action: string, question: AiGeneratedQuestion): AiGeneratedQuestion {
  const lower = action.toLowerCase();
  const stem = stripMockArtifacts(question.stem);

  let next: AiGeneratedQuestion = {
    ...question,
    stem,
    warnings: question.warnings?.filter((w) => !w.toLowerCase().includes("mock provider")),
    metadata: { ...question.metadata, refinedLocally: true },
  };

  if (lower.includes("hard") || lower.includes("challenging") || lower.includes("difficult")) {
    next.difficulty = bumpDifficulty(question.difficulty, true);
    next.bloomLevel = bumpBloom(question.bloomLevel, true);
    next.options = question.options?.map((o) =>
      o.isCorrect
        ? o
        : { ...o, text: o.text.endsWith("?") ? o.text : `${o.text.replace(/\.$/, "")} under advanced constraints` }
    );
  }

  if (lower.includes("easy") || lower.includes("simplif") || lower.includes("decrease difficulty")) {
    next.difficulty = bumpDifficulty(question.difficulty, false);
    next.bloomLevel = bumpBloom(question.bloomLevel, false);
    next.stem = stem.replace(/Which approach best addresses[^?]*\?/i, "Select the best answer.");
  }

  if (lower.includes("rewrite") || lower.includes("clarity") || lower.includes("grammar")) {
    next.stem = stem.charAt(0).toUpperCase() + stem.slice(1).replace(/\s+/g, " ").trim();
    if (!/[?.!]$/.test(next.stem)) next.stem += "?";
  }

  if (lower.includes("distractor") || lower.includes("plausible")) {
    next.options = question.options?.map((o, i) =>
      o.isCorrect ? o : { ...o, text: `Plausible alternative ${i + 1}: ${stripMockArtifacts(o.text)}` }
    );
  }

  if (lower.includes("explanation") && !question.explanation) {
    next.explanation = "The correct option aligns with the core concept tested in this question.";
  }

  if (lower.includes("hint") && !question.hints?.length) {
    next.hints = ["Focus on the key concept before eliminating distractors."];
  }

  if (lower.includes("translate")) {
    const lang = action.match(/to\s+(\w+)/i)?.[1] || "Hindi";
    next.metadata = { ...next.metadata, translatedTo: lang };
  }

  if (lower.includes("regenerat") || lower.includes("similar") || lower.includes("fresh")) {
    next.stem = stem.replace(/\s*\(Q\d+\)\s*$/i, "").trim();
    if (next.stem === stem) {
      next.stem = `Revised: ${stem}`;
    }
  }

  if (lower.includes("coding") || lower.includes("programming")) {
    next.type = "coding";
    next.stem = `${stem}\n\n\`\`\`python\n# Complete the function below\ndef solve():\n    pass\n\`\`\``;
  }

  if (lower.includes("scenario") || lower.includes("case study")) {
    next.type = "case_study";
    next.stem = `Scenario: ${stem.replace(/^[^:]+:\s*/i, "")}`;
  }

  return next;
}
