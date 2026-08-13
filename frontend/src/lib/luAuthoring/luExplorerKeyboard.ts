import type { LuExplorerNode } from "./types";
import type { LuMenuHandlers } from "./luExplorerMenu";
import { executeMenuItem } from "./luExplorerMenu";

/** Duplicate the selected explorer node (same as context menu duplicate). */
export function duplicateExplorerNode(node: LuExplorerNode, handlers: LuMenuHandlers): void {
  switch (node.kind) {
    case "track":
    case "module":
    case "lesson":
      executeMenuItem("duplicate", node, handlers);
      break;
    case "question":
      executeMenuItem("duplicate-question", node, handlers);
      break;
    default:
      if (node.componentId) {
        executeMenuItem("duplicate-component", node, handlers);
      }
      break;
  }
}
