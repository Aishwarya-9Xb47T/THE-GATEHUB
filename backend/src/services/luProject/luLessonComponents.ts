/**
 * Learning Universe lesson components — explicit educational hierarchy.
 */

import type { LuProjectLessonRef } from "./luProjectSchema.js";
import { nextChildId, nextComponentId } from "./luIdUtils.js";
import { cloneComponentWithNewIds } from "./luLessonClone.js";
import { nextResourceItemIdInLesson } from "./luLessonClone.js";
import { listMarkersInContent, componentMarker } from "./luTexMarkers.js";
import {
  type LuLessonComponentKind,
  COMPONENT_TITLES,
  TEX_PATTERNS,
  SINGLETON_COMPONENTS,
  CHILD_CONTAINER_KINDS,
  defaultConfigForKind,
  inferKindFromComponentId,
} from "./luComponentRegistry.js";

export type { LuLessonComponentKind };

export type LuChildComponentKind = "question" | "resource-item";

export interface LuLessonComponentRef {
  id: string;
  kind: LuLessonComponentKind | LuChildComponentKind;
  title: string;
  file?: string;
  config?: Record<string, unknown>;
  order?: number;
  children?: LuLessonComponentRef[];
}

export { COMPONENT_TITLES, SINGLETON_COMPONENTS, TEX_PATTERNS, componentMarker };

export function lessonHasComponent(lesson: LuProjectLessonRef, kind: LuLessonComponentKind): boolean {
  return (lesson.components ?? []).some((c) => c.kind === kind);
}

export function findComponentById(
  lesson: LuProjectLessonRef,
  componentId: string
): { component: LuLessonComponentRef; parent: LuLessonComponentRef | null } | null {
  for (const comp of lesson.components ?? []) {
    if (comp.id === componentId) return { component: comp, parent: null };
    for (const child of comp.children ?? []) {
      if (child.id === componentId) return { component: child, parent: comp };
    }
  }
  return null;
}

export function syncLessonComponentsFromTex(
  lesson: LuProjectLessonRef,
  content: string
): LuProjectLessonRef {
  const markerIds = listMarkersInContent(content);
  const components: LuLessonComponentRef[] = [...(lesson.components ?? [])];

  // project.json is authoritative — only reorder from markers when present
  if (components.length > 0) {
    if (markerIds.length === 0) return lesson;
    const byId = new Map(components.map((c) => [c.id, c]));
    const ordered: LuLessonComponentRef[] = [];
    for (const id of markerIds) {
      const existing = byId.get(id);
      if (existing) {
        ordered.push(existing);
        byId.delete(id);
      }
    }
    for (const orphan of byId.values()) {
      if (!ordered.some((c) => c.id === orphan.id)) ordered.push(orphan);
    }
    return { ...lesson, components: ordered.length ? ordered : components };
  }

  if (markerIds.length > 0) {
    const byId = new Map(components.map((c) => [c.id, c]));
    const ordered: LuLessonComponentRef[] = [];
    for (const id of markerIds) {
      const existing = byId.get(id);
      if (existing) {
        ordered.push(existing);
        byId.delete(id);
      } else {
        const kind = inferKindFromComponentId(id);
        ordered.push({
          id,
          kind,
          title: defaultTitleForKind(kind, ordered.length + 1),
          config: defaultConfigForKind(kind, defaultTitleForKind(kind, ordered.length + 1)),
          children: CHILD_CONTAINER_KINDS.has(kind) ? [] : undefined,
        });
      }
    }
    for (const orphan of byId.values()) {
      if (!ordered.some((c) => c.id === orphan.id)) ordered.push(orphan);
    }
    return { ...lesson, components: ordered };
  }

  if (components.length > 0) return lesson;

  for (const kind of Object.keys(TEX_PATTERNS) as LuLessonComponentKind[]) {
    if (TEX_PATTERNS[kind].test(content)) {
      const id = nextComponentId(components, kind);
      const t = COMPONENT_TITLES[kind];
      components.push({
        id,
        kind,
        title: t,
        config: defaultConfigForKind(kind, t),
        children: CHILD_CONTAINER_KINDS.has(kind) ? [] : undefined,
      });
    }
  }
  return { ...lesson, components };
}

function defaultTitleForKind(kind: LuLessonComponentKind, n: number): string {
  if (kind === "overview") return COMPONENT_TITLES[kind];
  return `${COMPONENT_TITLES[kind]} ${n}`;
}

export function addComponentToLesson(
  lesson: LuProjectLessonRef,
  kind: LuLessonComponentKind,
  title?: string
): LuLessonComponentRef {
  const components = [...(lesson.components ?? [])];
  if (SINGLETON_COMPONENTS.has(kind) && components.some((c) => c.kind === kind)) {
    return components.find((c) => c.kind === kind)!;
  }
  const compTitle = title || defaultTitleForKind(kind, components.filter((c) => c.kind === kind).length + 1);
  const id = SINGLETON_COMPONENTS.has(kind) ? kind : nextComponentId(components, kind);
  const comp: LuLessonComponentRef = {
    id,
    kind,
    title: compTitle,
    config: defaultConfigForKind(kind, compTitle),
    order: components.length,
    children: CHILD_CONTAINER_KINDS.has(kind) ? [] : undefined,
  };
  components.push(comp);
  lesson.components = components;
  return comp;
}

export function removeComponentFromLesson(
  lesson: LuProjectLessonRef,
  componentId: string
): LuLessonComponentKind | null {
  const components = lesson.components ?? [];
  const idx = components.findIndex((c) => c.id === componentId);
  if (idx >= 0) {
    const kind = components[idx].kind;
    lesson.components = components.filter((c) => c.id !== componentId);
    reindexComponentOrder(lesson);
    return kind;
  }
  for (const comp of components) {
    if (comp.children?.some((c) => c.id === componentId)) {
      comp.children = comp.children.filter((c) => c.id !== componentId);
      return comp.kind;
    }
  }
  return null;
}

export function moveComponentInLesson(
  lesson: LuProjectLessonRef,
  componentId: string,
  direction: "up" | "down"
): boolean {
  const components = lesson.components ?? [];
  const idx = components.findIndex((c) => c.id === componentId);
  if (idx < 0) return false;
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= components.length) return false;
  [components[idx], components[swap]] = [components[swap], components[idx]];
  reindexComponentOrder(lesson);
  return true;
}

export function duplicateComponentInLesson(
  lesson: LuProjectLessonRef,
  componentId: string
): LuLessonComponentRef | null {
  const found = findComponentById(lesson, componentId);
  if (!found || found.parent) return null;
  const components = lesson.components ?? [];
  const src = found.component;
  if (SINGLETON_COMPONENTS.has(src.kind)) return null;
  const copy = cloneComponentWithNewIds(lesson, src);
  components.push(copy);
  lesson.components = components;
  return copy;
}

export function updateComponentConfigInLesson(
  lesson: LuProjectLessonRef,
  componentId: string,
  config: Record<string, unknown>
): LuLessonComponentRef | null {
  const found = findComponentById(lesson, componentId);
  if (!found) return null;
  found.component.config = { ...found.component.config, ...config };
  return found.component;
}

function reindexComponentOrder(lesson: LuProjectLessonRef) {
  (lesson.components ?? []).forEach((c, i) => {
    c.order = i;
  });
}

/** @deprecated use addQuestionToQuiz from luQuizEngine */
export { addQuestionToQuiz as addQuizQuestion } from "./luQuizEngine.js";

export function addResourceItem(
  lesson: LuProjectLessonRef,
  resourcesComponentId: string,
  title: string,
  resourceType: string
): LuLessonComponentRef | null {
  const res = (lesson.components ?? []).find((c) => c.id === resourcesComponentId && c.kind === "resources");
  if (!res) return null;
  if (!res.children) res.children = [];
  const item: LuLessonComponentRef = {
    id: nextResourceItemIdInLesson(lesson),
    kind: "resources",
    title: `${title} (${resourceType})`,
    config: {
      type: resourceType,
      title,
      url: resourceType === "link" ? "https://example.com" : "",
    },
  };
  res.children.push(item);
  return item;
}

export function renameComponentInLesson(
  lesson: LuProjectLessonRef,
  componentId: string,
  title: string
): boolean {
  const found = findComponentById(lesson, componentId);
  if (!found) return false;
  found.component.title = title;
  return true;
}

export function repairLegacyComponentIds(lesson: LuProjectLessonRef): boolean {
  const components = lesson.components ?? [];
  let changed = false;
  const kindCounts = new Map<string, number>();
  for (const comp of components) {
    kindCounts.set(comp.kind, (kindCounts.get(comp.kind) ?? 0) + 1);
  }
  for (const comp of components) {
    if (comp.id === comp.kind && (kindCounts.get(comp.kind) ?? 0) > 1) {
      comp.id = nextComponentId(
        components.filter((c) => c !== comp),
        comp.kind
      );
      changed = true;
    }
    if (!comp.config) {
      comp.config = defaultConfigForKind(comp.kind, comp.title);
      changed = true;
    }
  }
  const seen = new Set<string>();
  for (const comp of components) {
    if (seen.has(comp.id)) {
      comp.id = nextComponentId(components.filter((c) => c.id !== comp.id || c === comp), comp.kind);
      changed = true;
    }
    seen.add(comp.id);
  }
  lesson.components = components;
  return changed;
}
