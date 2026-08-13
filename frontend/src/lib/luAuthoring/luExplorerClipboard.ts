import type { LuExplorerNode } from "./types";

/** In-memory clipboard for explorer node duplicate/paste (same session). */
let clipboard: LuExplorerNode | null = null;

export function copyExplorerNode(node: LuExplorerNode): void {
  clipboard = { ...node };
}

export function peekExplorerClipboard(): LuExplorerNode | null {
  return clipboard;
}

export function clearExplorerClipboard(): void {
  clipboard = null;
}

/** Collect node ids that can expand in the tree. */
export function collectExpandableNodeIds(nodes: LuExplorerNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: LuExplorerNode[]) => {
    for (const n of list) {
      const canExpand =
        (n.children && n.children.length > 0) ||
        n.kind === "track" ||
        n.kind === "module" ||
        n.kind === "lesson" ||
        n.kind === "quiz" ||
        n.kind === "resources";
      if (canExpand) ids.push(n.id);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}
