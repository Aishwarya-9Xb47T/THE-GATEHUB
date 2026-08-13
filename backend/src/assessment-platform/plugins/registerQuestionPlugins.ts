/**
 * Built-in question type plugins (Phase 1 subset).
 */

import type { QuestionTypePlugin } from "../domain/plugins.js";
import type { LearningGradeResult, QuestionVersionSnapshot } from "../domain/types.js";
import { registerPlugin } from "../infra/pluginRegistry.js";

function choiceGrade(
  answer: unknown,
  question: QuestionVersionSnapshot,
  multi: boolean
): LearningGradeResult {
  const correctIds = question.choices.filter((c) => c.isCorrect).map((c) => c.id);
  if (multi) {
    const submitted = new Set(Array.isArray(answer) ? answer : []);
    const isCorrect =
      correctIds.length === submitted.size && correctIds.every((id) => submitted.has(id));
    return {
      isCorrect,
      marksAwarded: isCorrect ? 1 : 0,
      correctOptionIds: correctIds,
      gradedBy: "auto",
    };
  }
  const isCorrect = typeof answer === "string" && correctIds.includes(answer);
  return {
    isCorrect,
    marksAwarded: isCorrect ? 1 : 0,
    correctOptionIds: correctIds,
    gradedBy: "auto",
  };
}

function baseChoicePlugin(
  key: string,
  label: string,
  multi: boolean
): QuestionTypePlugin {
  return {
    key,
    version: "1.0.0",
    label,
    category: "questionType",
    typeSlug: key,
    validate(q) {
      const errors: string[] = [];
      if (!q.stem?.trim()) errors.push("Stem is required");
      if (!q.choices?.length) errors.push("At least one choice is required");
      const correct = q.choices?.filter((c) => c.isCorrect) ?? [];
      if (multi) {
        if (correct.length < 1) errors.push("At least one correct option required");
      } else if (correct.length !== 1) {
        errors.push("Exactly one correct option required");
      }
      return errors;
    },
    sanitize: (m) => m,
    toSnapshot: () => ({}),
    async evaluate(answer, question) {
      return choiceGrade(answer, question, multi);
    },
    feedback(result) {
      if (result.isCorrect === null) return null;
      return result.isCorrect ? "Correct!" : "Incorrect.";
    },
    analytics(result) {
      return [{ name: "question.correct", value: result.isCorrect ? 1 : 0 }];
    },
  };
}

const trueFalsePlugin: QuestionTypePlugin = {
  ...baseChoicePlugin("true_false", "True / False", false),
  validate(q) {
    const errors = baseChoicePlugin("true_false", "True / False", false).validate(q);
    if ((q.choices?.length ?? 0) !== 2) errors.push("True/False requires exactly 2 options");
    return errors;
  },
};

const pollPlugin: QuestionTypePlugin = {
  key: "poll",
  version: "1.0.0",
  label: "Poll",
  category: "questionType",
  typeSlug: "poll",
  validate(q) {
    const errors: string[] = [];
    if (!q.stem?.trim()) errors.push("Stem is required");
    if (!q.choices?.length) errors.push("At least one poll option required");
    return errors;
  },
  sanitize: (m) => m,
  toSnapshot: () => ({}),
  async evaluate() {
    return { isCorrect: null, marksAwarded: 0, gradedBy: "auto" };
  },
  feedback: () => "Response recorded",
  analytics: () => [{ name: "poll.submitted", value: 1 }],
};

const essayPlugin: QuestionTypePlugin = {
  key: "essay",
  version: "1.0.0",
  label: "Essay",
  category: "questionType",
  typeSlug: "essay",
  validate(q) {
    if (!q.stem?.trim()) return ["Stem is required"];
    return [];
  },
  sanitize: (m) => m,
  toSnapshot: () => ({}),
  async evaluate() {
    return { isCorrect: null, marksAwarded: 0, gradedBy: "manual" };
  },
  feedback: () => null,
  analytics: () => [{ name: "essay.submitted", value: 1 }],
};

const PLUGINS: QuestionTypePlugin[] = [
  baseChoicePlugin("multiple_choice", "MCQ", false),
  baseChoicePlugin("multiple_select", "Multiple Select", true),
  trueFalsePlugin,
  pollPlugin,
  essayPlugin,
];

export function registerBuiltinQuestionPlugins(): void {
  for (const p of PLUGINS) registerPlugin(p);
}
