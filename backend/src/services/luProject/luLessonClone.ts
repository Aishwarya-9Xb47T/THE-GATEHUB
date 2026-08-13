/**
 * Deep clone lesson/component trees with fresh IDs — no shared children across parents.
 */
import type { LuProjectLessonRef } from "./luProjectSchema.js";
import type { LuLessonComponentRef } from "./luLessonComponents.js";
import { nextComponentId, nextChildId } from "./luIdUtils.js";
import { CHILD_CONTAINER_KINDS, type LuLessonComponentKind } from "./luComponentRegistry.js";

function collectAllChildIdsInLesson(lesson: LuProjectLessonRef, prefix: string): string[] {
  const ids: string[] = [];
  for (const comp of lesson.components ?? []) {
    for (const child of comp.children ?? []) {
      if (child.id.startsWith(`${prefix}-`)) ids.push(child.id);
    }
  }
  return ids;
}

export function nextQuestionIdInLesson(lesson: LuProjectLessonRef): string {
  const ids = collectAllChildIdsInLesson(lesson, "question");
  return nextChildId(ids.map((id) => ({ id, kind: "question", title: "" })), "question");
}

export function nextResourceItemIdInLesson(lesson: LuProjectLessonRef): string {
  const ids = collectAllChildIdsInLesson(lesson, "resource");
  return nextChildId(ids.map((id) => ({ id, kind: "resource-item", title: "" })), "resource");
}

function remapQuestionChildren(
  lesson: LuProjectLessonRef,
  quiz: LuLessonComponentRef,
  newQuizId: string
): LuLessonComponentRef[] {
  const usedIds = new Set(collectAllChildIdsInLesson(lesson, "question"));
  const remapped: LuLessonComponentRef[] = [];
  for (const child of quiz.children ?? []) {
    const newId = nextChildId(
      [...usedIds].map((id) => ({ id, kind: "question", title: "" })),
      "question"
    );
    usedIds.add(newId);
    remapped.push({
      ...JSON.parse(JSON.stringify(child)),
      id: newId,
      kind: "question",
      title: child.title,
      file: undefined,
      config: {
        ...(child.config ?? {}),
        parentId: newQuizId,
      },
    });
  }
  return remapped;
}

function remapResourceChildren(
  lesson: LuProjectLessonRef,
  res: LuLessonComponentRef
): LuLessonComponentRef[] {
  const usedIds = new Set(collectAllChildIdsInLesson(lesson, "resource"));
  const remapped: LuLessonComponentRef[] = [];
  for (const child of res.children ?? []) {
    const newId = nextChildId(
      [...usedIds].map((id) => ({ id, kind: "resource-item", title: "" })),
      "resource"
    );
    usedIds.add(newId);
    remapped.push({
      ...JSON.parse(JSON.stringify(child)),
      id: newId,
      kind: "resources",
      title: child.title,
      file: undefined,
    });
  }
  return remapped;
}

/** Clone one top-level component with new id; quiz/resource children get new ids too. */
export function cloneComponentWithNewIds(
  lesson: LuProjectLessonRef,
  src: LuLessonComponentRef
): LuLessonComponentRef {
  const components = lesson.components ?? [];
  const newId = nextComponentId(components, src.kind);
  const copy: LuLessonComponentRef = {
    ...JSON.parse(JSON.stringify(src)),
    id: newId,
    title: `${src.title} (copy)`,
    file: undefined,
    order: components.length,
    children: undefined,
  };

  if (CHILD_CONTAINER_KINDS.has(src.kind as LuLessonComponentKind)) {
    if (src.kind === "quiz") {
      copy.children = remapQuestionChildren(lesson, src, newId);
    } else if (src.kind === "resources") {
      copy.children = remapResourceChildren(lesson, src);
    } else {
      copy.children = src.children ? JSON.parse(JSON.stringify(src.children)) : [];
    }
  }

  return copy;
}

/** Clone entire lesson component tree with fresh ids (caller assigns new lesson id/file). */
export function cloneLessonComponentsWithNewIds(
  srcLesson: LuProjectLessonRef
): LuLessonComponentRef[] {
  const working: LuProjectLessonRef = { ...srcLesson, components: [] };
  const result: LuLessonComponentRef[] = [];
  for (const comp of srcLesson.components ?? []) {
    const copy = cloneComponentWithNewIds(working, comp);
    result.push(copy);
    working.components = [...(working.components ?? []), copy];
  }
  return result;
}
