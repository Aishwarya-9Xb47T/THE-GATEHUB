import type { LuExplorerNode } from "./types";

export function findNodeByComponentId(
  nodes: LuExplorerNode[],
  componentId: string
): LuExplorerNode | null {
  for (const n of nodes) {
    if (n.componentId === componentId) return n;
    if (n.children) {
      const hit = findNodeByComponentId(n.children, componentId);
      if (hit) return hit;
    }
  }
  return null;
}

/** Find the quiz container that owns a question node. */
export function findParentQuizNode(
  nodes: LuExplorerNode[],
  questionNode: LuExplorerNode
): LuExplorerNode | null {
  if (!questionNode.componentId) return null;
  function walk(list: LuExplorerNode[]): LuExplorerNode | null {
    for (const n of list) {
      if (n.kind === "quiz" && n.children?.some((c) => c.componentId === questionNode.componentId)) {
        return n;
      }
      if (n.children) {
        const hit = walk(n.children);
        if (hit) return hit;
      }
    }
    return null;
  }
  return walk(nodes);
}
