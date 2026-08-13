import type { LuExplorerNode } from "./types";
import { normalizeLuPath } from "./paths";

/** Paths that must never auto-open in Learning Mode */
export function isTechnicalTexPath(path: string): boolean {
  return (
    path === "/main.tex" ||
    path.endsWith("/main.tex") ||
    path === "/project.json" ||
    path.includes("/legacy-backup/") ||
    path.startsWith("/output/")
  );
}

export function isEducationalTexPath(path: string): boolean {
  if (!path.endsWith(".tex") || isTechnicalTexPath(path)) return false;
  if (path.endsWith("/track.tex") || path.endsWith("/module.tex")) return true;
  if (/\/lesson[\s_-]*\d+\.tex$/i.test(path)) return true;
  if (/\/lesson[\s_-]*\d+\/[^/]+\.tex$/i.test(path)) return true;
  return false;
}

export function findFirstLessonNode(nodes: LuExplorerNode[]): LuExplorerNode | null {
  for (const n of nodes) {
    if (n.kind === "lesson" && n.filePath) return n;
    if (n.children?.length) {
      const hit = findFirstLessonNode(n.children);
      if (hit) return hit;
    }
  }
  return null;
}

export function findNodeByFilePath(nodes: LuExplorerNode[], filePath: string): LuExplorerNode | null {
  const target = normalizeLuPath(filePath);
  for (const n of nodes) {
    if (normalizeLuPath(n.filePath) === target) return n;
    if (n.children?.length) {
      const hit = findNodeByFilePath(n.children, filePath);
      if (hit) return hit;
    }
  }
  return null;
}

/** Lesson that owns the given file (lesson .tex or a component under lesson-01/). */
export function findLessonForFilePath(nodes: LuExplorerNode[], filePath: string): LuExplorerNode | null {
  const walk = (list: LuExplorerNode[], lessonAncestor: LuExplorerNode | null): LuExplorerNode | null => {
    for (const n of list) {
      const currentLesson = n.kind === "lesson" ? n : lessonAncestor;
      if (n.filePath === filePath || normalizeLuPath(n.filePath) === normalizeLuPath(filePath)) {
        return n.kind === "lesson" ? n : currentLesson;
      }
      if (n.children?.length) {
        const hit = walk(n.children, currentLesson);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(nodes, null);
}

export function findLessonContainingNode(nodes: LuExplorerNode[], nodeId: string): LuExplorerNode | null {
  const walk = (list: LuExplorerNode[], lessonAncestor: LuExplorerNode | null): LuExplorerNode | null => {
    for (const n of list) {
      const currentLesson = n.kind === "lesson" ? n : lessonAncestor;
      if (n.id === nodeId) {
        return n.kind === "lesson" ? n : currentLesson;
      }
      if (n.children?.length) {
        const hit = walk(n.children, currentLesson);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(nodes, null);
}
