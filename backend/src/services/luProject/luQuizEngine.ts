/**
 * Quiz authoring engine — immutable mutations on project.json.
 * Quiz is the container; questions are persistent children. Never recreate the quiz when adding questions.
 */
import type { LuProjectLessonRef } from "./luProjectSchema.js";
import type { LuLessonComponentRef } from "./luLessonComponents.js";
import { findComponentById } from "./luLessonComponents.js";
import { nextQuestionIdInLesson } from "./luLessonClone.js";
import {
  defaultQuestionConfig,
  defaultTitleForQuestionType,
  isLuQuestionType,
  type LuQuestionType,
} from "./luQuestionTypes.js";
import { assertQuizMutationValid, normalizeQuestionChild } from "./luQuizValidator.js";

export function findQuizInLesson(
  lesson: LuProjectLessonRef,
  quizId: string
): LuLessonComponentRef | null {
  return (lesson.components ?? []).find((c) => c.id === quizId && c.kind === "quiz") ?? null;
}

export function getQuizQuestions(quiz: LuLessonComponentRef): LuLessonComponentRef[] {
  return (quiz.children ?? []).map((c) =>
    normalizeQuestionChild(c, quiz.id)
  );
}

/** Add one question child — never creates or modifies the quiz container itself. */
export function addQuestionToQuiz(
  lesson: LuProjectLessonRef,
  quizId: string,
  questionType: string,
  title?: string
): LuLessonComponentRef {
  if (!quizId) throw new Error("quizId is required — add questions only to an existing Quiz");

  const quiz = findQuizInLesson(lesson, quizId);
  if (!quiz) throw new Error(`Quiz not found: ${quizId}`);

  const type = isLuQuestionType(questionType) ? questionType : "multiple-choice";
  const children = [...(quiz.children ?? [])];
  const now = new Date().toISOString();
  const qTitle = title || defaultTitleForQuestionType(type, children.length + 1);

  const question: LuLessonComponentRef = {
    id: nextQuestionIdInLesson(lesson),
    kind: "question",
    title: qTitle,
    config: {
      ...defaultQuestionConfig(type as LuQuestionType, qTitle),
      questionType: type,
      parentId: quizId,
      number: children.length + 1,
      createdAt: now,
      updatedAt: now,
    },
  };

  quiz.children = [...children, question];
  assertQuizMutationValid(lesson, quizId);
  return question;
}

export function deleteQuestionFromQuiz(
  lesson: LuProjectLessonRef,
  questionId: string
): { quiz: LuLessonComponentRef; deleted: LuLessonComponentRef } | null {
  const found = findComponentById(lesson, questionId);
  if (!found?.parent || found.parent.kind !== "quiz") return null;

  const quiz = found.parent;
  const deleted = found.component;
  quiz.children = (quiz.children ?? []).filter((c) => c.id !== questionId);
  renumberQuestions(quiz);
  assertQuizMutationValid(lesson, quiz.id);
  return { quiz, deleted };
}

export function duplicateQuestionInQuiz(
  lesson: LuProjectLessonRef,
  quizId: string,
  questionId: string
): LuLessonComponentRef | null {
  const quiz = findQuizInLesson(lesson, quizId);
  if (!quiz) return null;

  const src = (quiz.children ?? []).find((c) => c.id === questionId);
  if (!src) return null;

  const children = [...(quiz.children ?? [])];
  const now = new Date().toISOString();
  const copy: LuLessonComponentRef = {
    ...JSON.parse(JSON.stringify(src)),
    id: nextQuestionIdInLesson(lesson),
    title: `${src.title} (copy)`,
    kind: "question",
    config: {
      ...(src.config ?? {}),
      parentId: quizId,
      number: children.length + 1,
      createdAt: now,
      updatedAt: now,
    },
  };

  quiz.children = [...children, copy];
  assertQuizMutationValid(lesson, quizId);
  return copy;
}

export function moveQuestionInQuiz(
  lesson: LuProjectLessonRef,
  quizId: string,
  questionId: string,
  direction: "up" | "down"
): boolean {
  const quiz = findQuizInLesson(lesson, quizId);
  if (!quiz?.children?.length) return false;

  const children = [...quiz.children];
  const idx = children.findIndex((c) => c.id === questionId);
  if (idx < 0) return false;

  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= children.length) return false;

  [children[idx], children[swap]] = [children[swap], children[idx]];
  quiz.children = children;
  renumberQuestions(quiz);
  return true;
}

export function reorderQuestionsInQuiz(
  lesson: LuProjectLessonRef,
  quizId: string,
  orderedQuestionIds: string[]
): boolean {
  const quiz = findQuizInLesson(lesson, quizId);
  if (!quiz) return false;

  const byId = new Map((quiz.children ?? []).map((c) => [c.id, c]));
  const reordered: LuLessonComponentRef[] = [];
  for (const id of orderedQuestionIds) {
    const q = byId.get(id);
    if (q) {
      reordered.push(q);
      byId.delete(id);
    }
  }
  for (const orphan of byId.values()) reordered.push(orphan);

  quiz.children = reordered;
  renumberQuestions(quiz);
  assertQuizMutationValid(lesson, quizId);
  return true;
}

export function updateQuestionInQuiz(
  lesson: LuProjectLessonRef,
  questionId: string,
  patch: Record<string, unknown>
): LuLessonComponentRef | null {
  const found = findComponentById(lesson, questionId);
  if (!found?.parent || found.parent.kind !== "quiz") return null;

  found.component.config = {
    ...(found.component.config ?? {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (patch.title && typeof patch.title === "string") {
    found.component.title = patch.title;
  }
  if (patch.question && typeof patch.question === "string") {
    found.component.title = patch.question;
  }
  return found.component;
}

function renumberQuestions(quiz: LuLessonComponentRef): void {
  (quiz.children ?? []).forEach((q, i) => {
    q.config = { ...(q.config ?? {}), number: i + 1 };
  });
}

/** Migrate legacy quiz-q children with kind "quiz" to kind "question". */
export function normalizeQuizChildren(quiz: LuLessonComponentRef): boolean {
  let changed = false;
  if (!quiz.children?.length) return false;

  quiz.children = quiz.children.map((child) => {
    const needsFix =
      child.kind === "quiz" ||
      child.id.startsWith("quiz-q-") ||
      !child.config?.parentId;
    if (!needsFix) return child;
    changed = true;
    return normalizeQuestionChild(
      {
        ...child,
        kind: "question",
        id: child.id.startsWith("quiz-q-")
          ? child.id.replace(/^quiz-q/, "question")
          : child.id,
      },
      quiz.id
    );
  });

  return changed;
}
