/**
 * Quiz structure validation — no duplicate IDs, orphans, or broken parent links.
 */
import type { LuProjectLessonRef } from "./luProjectSchema.js";
import type { LuLessonComponentRef } from "./luLessonComponents.js";
import { findComponentById } from "./luLessonComponents.js";

export interface QuizValidationIssue {
  code: string;
  message: string;
  questionId?: string;
  quizId?: string;
}

export function validateQuizInLesson(
  lesson: LuProjectLessonRef,
  quizId: string
): QuizValidationIssue[] {
  const issues: QuizValidationIssue[] = [];
  const quiz = (lesson.components ?? []).find((c) => c.id === quizId && c.kind === "quiz");
  if (!quiz) {
    issues.push({ code: "QUIZ_NOT_FOUND", message: `Quiz ${quizId} not found`, quizId });
    return issues;
  }

  const children = quiz.children ?? [];
  const seenIds = new Set<string>();
  const seenNumbers = new Set<number>();

  for (let i = 0; i < children.length; i++) {
    const q = children[i];
    const num = i + 1;

    if (seenIds.has(q.id)) {
      issues.push({
        code: "DUPLICATE_QUESTION_ID",
        message: `Duplicate question id: ${q.id}`,
        questionId: q.id,
        quizId,
      });
    }
    seenIds.add(q.id);

    if (q.kind !== "question" && q.kind !== "quiz") {
      issues.push({
        code: "INVALID_QUESTION_KIND",
        message: `Question ${q.id} has invalid kind "${q.kind}" (expected "question")`,
        questionId: q.id,
        quizId,
      });
    }

    const parentId = String((q.config as { parentId?: string })?.parentId ?? "");
    if (parentId && parentId !== quizId) {
      issues.push({
        code: "BROKEN_PARENT_ID",
        message: `Question ${q.id} parentId ${parentId} does not match quiz ${quizId}`,
        questionId: q.id,
        quizId,
      });
    }

    const configNum = Number((q.config as { number?: number })?.number);
    const qNum = Number.isFinite(configNum) && configNum > 0 ? configNum : num;
    if (seenNumbers.has(qNum)) {
      issues.push({
        code: "DUPLICATE_QUESTION_NUMBER",
        message: `Duplicate question number ${qNum}`,
        questionId: q.id,
        quizId,
      });
    }
    seenNumbers.add(qNum);
  }

  return issues;
}

export function validateAllQuizzesInLesson(lesson: LuProjectLessonRef): QuizValidationIssue[] {
  const issues: QuizValidationIssue[] = [];
  const quizIds = new Set<string>();
  const allChildIds = new Set<string>();

  for (const comp of lesson.components ?? []) {
    if (comp.kind !== "quiz") continue;
    if (quizIds.has(comp.id)) {
      issues.push({ code: "DUPLICATE_QUIZ_ID", message: `Duplicate quiz id: ${comp.id}`, quizId: comp.id });
    }
    quizIds.add(comp.id);
    issues.push(...validateQuizInLesson(lesson, comp.id));

    for (const child of comp.children ?? []) {
      if (allChildIds.has(child.id)) {
        issues.push({
          code: "DUPLICATE_QUESTION_ID",
          message: `Duplicate question id across lesson ${lesson.id}: ${child.id}`,
          questionId: child.id,
          quizId: comp.id,
        });
      }
      allChildIds.add(child.id);

      const parentId = String((child.config as { parentId?: string })?.parentId ?? "");
      if (parentId && parentId !== comp.id) {
        issues.push({
          code: "BROKEN_PARENT_ID",
          message: `Question ${child.id} belongs to ${parentId} but is under quiz ${comp.id}`,
          questionId: child.id,
          quizId: comp.id,
        });
      }
    }
  }

  // Orphan questions attached to lesson root (lesson must never own questions)
  for (const comp of lesson.components ?? []) {
    if (comp.kind === "question") {
      issues.push({
        code: "ORPHAN_QUESTION",
        message: `Question ${comp.id} is attached to lesson instead of a quiz`,
        questionId: comp.id,
      });
    }
  }

  return issues;
}

export function assertQuizMutationValid(
  lesson: LuProjectLessonRef,
  quizId: string
): void {
  const issues = validateAllQuizzesInLesson(lesson).filter((i) =>
    [
      "DUPLICATE_QUESTION_ID",
      "DUPLICATE_QUIZ_ID",
      "ORPHAN_QUESTION",
      "BROKEN_PARENT_ID",
    ].includes(i.code)
  );
  if (issues.length > 0) {
    throw new Error(issues[0].message);
  }
}

export function isQuestionComponent(
  comp: LuLessonComponentRef
): boolean {
  return comp.kind === "question" || comp.id.startsWith("question-") || comp.id.startsWith("quiz-q-");
}

export function normalizeQuestionChild(comp: LuLessonComponentRef, quizId: string): LuLessonComponentRef {
  const config = { ...(comp.config ?? {}) };
  if (!config.parentId) config.parentId = quizId;
  if (!config.questionType) config.questionType = "multiple-choice";
  if (!config.createdAt) config.createdAt = new Date().toISOString();
  config.updatedAt = new Date().toISOString();
  return {
    ...comp,
    kind: "question",
    config,
  };
}
