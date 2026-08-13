import type { ImportedQuestionDraft } from "./types.js";

export interface ImportValidationIssue {
  questionId: string;
  level: "error" | "warning";
  code: string;
  message: string;
}

export function validateImportedQuestions(questions: ImportedQuestionDraft[]): ImportValidationIssue[] {
  const issues: ImportValidationIssue[] = [];
  const stems = new Map<string, string>();

  for (const q of questions) {
    if (!q.stem?.trim()) {
      issues.push({ questionId: q.id, level: "error", code: "MISSING_STEM", message: "Question text is empty" });
    }

    const norm = q.stem?.toLowerCase().replace(/\s+/g, " ").trim();
    if (norm) {
      if (stems.has(norm)) {
        issues.push({
          questionId: q.id,
          level: "warning",
          code: "DUPLICATE_STEM",
          message: `Similar to another question in this import`,
        });
      }
      stems.set(norm, q.id);
    }

    const choiceTypes = new Set(["multiple_choice", "multiple_select", "true_false", "poll"]);
    if (choiceTypes.has(q.type)) {
      const opts = (q.options || []).filter((o) => o.text?.trim());
      if (opts.length < 2) {
        issues.push({ questionId: q.id, level: "error", code: "FEW_OPTIONS", message: "Needs at least 2 options" });
      }
      const correct = opts.filter((o) => o.isCorrect);
      if (q.type !== "poll" && !correct.length) {
        issues.push({ questionId: q.id, level: "error", code: "NO_CORRECT", message: "No correct answer marked" });
      }
      const texts = opts.map((o) => o.text.trim().toLowerCase());
      if (new Set(texts).size !== texts.length) {
        issues.push({ questionId: q.id, level: "warning", code: "DUPLICATE_OPTIONS", message: "Duplicate option text" });
      }
    }

    if (q.stem?.includes("$$") && !/\$[^$]+\$/.test(q.stem)) {
      issues.push({ questionId: q.id, level: "warning", code: "LATEX_SUSPECT", message: "LaTeX may be malformed" });
    }
  }

  return issues;
}

export function attachValidationWarnings(questions: ImportedQuestionDraft[]): ImportedQuestionDraft[] {
  const issues = validateImportedQuestions(questions);
  const byId = new Map<string, ImportValidationIssue[]>();
  for (const issue of issues) {
    const list = byId.get(issue.questionId) || [];
    list.push(issue);
    byId.set(issue.questionId, list);
  }
  return questions.map((q) => {
    const qIssues = byId.get(q.id) || [];
    const warnings = [
      ...(q.warnings || []),
      ...qIssues.filter((i) => i.level === "warning").map((i) => i.message),
    ];
    return warnings.length ? { ...q, warnings: [...new Set(warnings)] } : q;
  });
}
