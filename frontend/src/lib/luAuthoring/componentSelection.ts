import type { LuExplorerNode, StructureAction } from "./types";

export interface LuComponentSelection {
  node: LuExplorerNode;
  config?: Record<string, unknown>;
  /** When editing a question, keep quiz editor open with this question selected. */
  selectedQuestionId?: string;
}

export function dispatchComponentSelected(
  node: LuExplorerNode,
  config?: Record<string, unknown>,
  selectedQuestionId?: string
) {
  window.dispatchEvent(
    new CustomEvent<LuComponentSelection>("lu-component-selected", {
      detail: { node, config, selectedQuestionId },
    })
  );
}

export function buildUpdateConfigAction(node: LuExplorerNode, config: Record<string, unknown>): StructureAction | null {
  if (!node.trackId || !node.moduleId || !node.lessonId || !node.componentId) return null;
  return {
    action: "updateComponentConfig",
    trackId: node.trackId,
    moduleId: node.moduleId,
    lessonId: node.lessonId,
    componentId: node.componentId,
    config,
  };
}
