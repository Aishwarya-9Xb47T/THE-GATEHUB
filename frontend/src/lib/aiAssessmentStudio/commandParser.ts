import type { CopilotIntent, ParsedCopilotCommand } from "./copilotTypes";

const PATTERNS: Array<{ intent: CopilotIntent; re: RegExp }> = [
  { intent: "harder", re: /\b(make|increase|raise).*(harder|difficult|difficulty)\b/i },
  { intent: "easier", re: /\b(make|decrease|lower|reduce).*(easier|easy|simpler)\b/i },
  { intent: "generate_explanations_all", re: /\b(generate|add|create).*(explanations?|answer explanations?)\b/i },
  { intent: "generate_hints_all", re: /\b(generate|add|create).*(hints?)\b/i },
  { intent: "remove_duplicates", re: /\b(remove|delete|detect).*(duplicate|repeated)\b/i },
  { intent: "detect_duplicates", re: /\bdetect.*duplicate\b/i },
  { intent: "balance_difficulty", re: /\b(balance|even|normalize).*(difficulty|difficult)\b/i },
  { intent: "reduce_duration", re: /\b(reduce|shorten|lower).*(time|duration|minutes|completion)\b/i },
  { intent: "add_coding", re: /\b(more|add|generate|increase).*(coding|code|programming|sql)\b/i },
  { intent: "convert_case_study", re: /\b(convert|change|transform).*(case stud|mcq|multiple choice)\b/i },
  { intent: "replace_theory", re: /\b(replace|swap|remove).*(theor|theoretical)\b/i },
  { intent: "placement_test", re: /\b(placement|interview|recruitment)\b/i },
  { intent: "increase_bloom", re: /\b(increase|raise|higher).*(bloom|taxonomy|application)\b/i },
  { intent: "improve_distractors", re: /\b(improve|fix|better).*(distractor|options?|choices)\b/i },
  { intent: "improve_grammar", re: /\b(improve|fix|correct).*(grammar|spelling|language)\b/i },
  { intent: "shuffle", re: /\b(shuffle|randomize|reorder)\b/i },
  { intent: "translate", re: /\btranslate\b.*\b(to|into)\s+(\w+)/i },
  { intent: "generate_scenario", re: /\b(scenario|case stud|real.?world)\b/i },
  { intent: "generate_coding", re: /\b(coding|programming|sql)\b/i },
  { intent: "rewrite", re: /\b(rewrite|rephrase|improve)\b/i },
  { intent: "simplify", re: /\b(simplify|simpler|easier to read)\b/i },
  { intent: "regenerate", re: /\b(regenerate|redo|replace)\b/i },
];

function extractQuestionRefs(text: string): number[] {
  const indices: number[] = [];
  const qRe = /\bquestion\s*#?\s*(\d+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = qRe.exec(text))) {
    indices.push(Number(m[1]) - 1);
  }
  const onlyRe = /\bq\s*(\d+)\b/gi;
  while ((m = onlyRe.exec(text))) {
    const n = Number(m[1]) - 1;
    if (!indices.includes(n)) indices.push(n);
  }
  return indices;
}

function extractCount(text: string): number | undefined {
  const m = text.match(/\b(\d+)\s+(coding|sql|questions?|mcq)/i);
  if (m) return Number(m[1]);
  const m2 = text.match(/\bgenerate\s+(\d+)\b/i);
  if (m2) return Number(m2[1]);
  return undefined;
}

function extractLanguage(text: string): string | undefined {
  const m = text.match(/\b(?:to|into)\s+(hindi|telugu|tamil|spanish|french|german|english|kannada|malayalam|bengali|marathi)\b/i);
  return m?.[1]?.toLowerCase();
}

export function parseCopilotCommand(text: string): ParsedCopilotCommand {
  const raw = text.trim();
  const questionIndices = extractQuestionRefs(raw);
  const count = extractCount(raw);
  const language = extractLanguage(raw);

  for (const { intent, re } of PATTERNS) {
    if (re.test(raw)) {
      return {
        intent,
        questionIndices,
        questionIds: [],
        count,
        language,
        raw,
        confidence: questionIndices.length ? 0.95 : 0.85,
      };
    }
  }

  if (/\bfirst.?year|beginner|introductory\b/i.test(raw)) {
    return { intent: "easier", questionIndices, questionIds: [], targetAudience: "first-year", raw, confidence: 0.8 };
  }

  if (/\bpractical|application.?based\b/i.test(raw)) {
    return { intent: "add_coding", questionIndices, questionIds: [], raw, confidence: 0.75 };
  }

  return { intent: "custom", questionIndices, questionIds: [], count, language, raw, confidence: 0.6 };
}
