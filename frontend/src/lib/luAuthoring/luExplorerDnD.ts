import type { LuExplorerNode, StructureAction } from "./types";
import { isComponentKind } from "./componentNavigation";

export function isExplorerDraggable(node: LuExplorerNode): boolean {
  if (node.kind === "universe") return false;
  if (node.kind === "track" || node.kind === "module" || node.kind === "lesson") return true;
  if (node.kind === "question") return true;
  return isComponentKind(node.kind);
}

export function sortableNodeId(node: LuExplorerNode): string {
  return node.id;
}

export function structuralId(node: LuExplorerNode): string {
  if (node.kind === "track") return node.trackId ?? node.id;
  if (node.kind === "module") return node.moduleId ?? node.id;
  if (node.kind === "lesson") return node.lessonId ?? node.id;
  return node.componentId ?? node.id;
}

export function findExplorerParent(
  roots: LuExplorerNode[],
  childId: string,
  parent: LuExplorerNode | null = null
): LuExplorerNode | null {
  for (const n of roots) {
    if (n.id === childId) return parent;
    if (n.children?.length) {
      const found = findExplorerParent(n.children, childId, n);
      if (found) return found;
    }
  }
  return null;
}

export function findExplorerNode(roots: LuExplorerNode[], id: string): LuExplorerNode | null {
  for (const n of roots) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findExplorerNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function orderedAfterDrag(ids: string[], activeId: string, overId: string): string[] | null {
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return null;
  const next = [...ids];
  const [moved] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, moved);
  return next;
}

/** Build structure actions to reorder siblings after a drag-and-drop gesture. */
export function buildExplorerReorderActions(
  active: LuExplorerNode,
  over: LuExplorerNode,
  parent: LuExplorerNode
): StructureAction[] {
  const siblings = parent.children ?? [];
  const activeKey = structuralId(active);
  const siblingKeys = siblings.map(structuralId);
  const ordered = orderedAfterDrag(siblingKeys, activeKey, structuralId(over));
  if (!ordered) return [];

  const trackId = active.trackId ?? parent.trackId;
  const moduleId = active.moduleId ?? parent.moduleId;
  const lessonId = active.lessonId ?? parent.lessonId;

  if (active.kind === "question" && parent.kind === "quiz") {
    if (!trackId || !moduleId || !lessonId || !parent.componentId) return [];
    return [
      {
        action: "reorderQuizQuestions",
        trackId,
        moduleId,
        lessonId,
        quizId: parent.componentId,
        orderedQuestionIds: ordered,
      },
    ];
  }

  if (isComponentKind(active.kind) && parent.kind === "lesson") {
    if (!trackId || !moduleId || !lessonId) return [];
    const oldIndex = siblingKeys.indexOf(activeKey);
    const newIndex = ordered.indexOf(activeKey);
    if (oldIndex < 0 || newIndex < 0) return [];
    const direction: "up" | "down" = newIndex > oldIndex ? "down" : "up";
    const steps = Math.abs(newIndex - oldIndex);
    return Array.from({ length: steps }, () => ({
      action: "moveComponent" as const,
      trackId,
      moduleId,
      lessonId,
      componentId: activeKey,
      direction,
    }));
  }

  if (active.kind === "lesson" && parent.kind === "module") {
    if (!trackId || !moduleId) return [];
    const oldIndex = siblingKeys.indexOf(activeKey);
    const newIndex = ordered.indexOf(activeKey);
    const direction: "up" | "down" = newIndex > oldIndex ? "down" : "up";
    const steps = Math.abs(newIndex - oldIndex);
    return Array.from({ length: steps }, () => ({
      action: "moveLesson" as const,
      trackId,
      moduleId,
      lessonId: activeKey,
      direction,
    }));
  }

  if (active.kind === "module" && parent.kind === "track") {
    if (!trackId) return [];
    const oldIndex = siblingKeys.indexOf(activeKey);
    const newIndex = ordered.indexOf(activeKey);
    const direction: "up" | "down" = newIndex > oldIndex ? "down" : "up";
    const steps = Math.abs(newIndex - oldIndex);
    return Array.from({ length: steps }, () => ({
      action: "moveModule" as const,
      trackId,
      moduleId: activeKey,
      direction,
    }));
  }

  if (active.kind === "track" && parent.kind === "universe") {
    const oldIndex = siblingKeys.indexOf(activeKey);
    const newIndex = ordered.indexOf(activeKey);
    const direction: "up" | "down" = newIndex > oldIndex ? "down" : "up";
    const steps = Math.abs(newIndex - oldIndex);
    return Array.from({ length: steps }, () => ({
      action: "moveTrack" as const,
      trackId: activeKey,
      direction,
    }));
  }

  return [];
}
