import type { LuExplorerNode } from "@/lib/luAuthoring/types";
import {
  executeMenuItem,
  getContextMenuItems,
  type LuMenuHandlers,
} from "@/lib/luAuthoring/luExplorerMenu";

interface LuContextMenuProps {
  node: LuExplorerNode;
  position: { x: number; y: number };
  onClose: () => void;
  handlers: LuMenuHandlers;
}

export function LuContextMenu({ node, position, onClose, handlers }: LuContextMenuProps) {
  const items = getContextMenuItems(node).filter((i) => !i.separator);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[200px] rounded-md border border-slate-700 bg-[#252526] shadow-xl py-1 text-sm max-h-[70vh] overflow-y-auto"
        style={{ left: position.x, top: position.y }}
      >
        {getContextMenuItems(node).map((item) =>
          item.separator ? (
            <div key={item.id} className="h-px bg-slate-700 my-1 mx-2" />
          ) : (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              title={item.disabledReason}
              className={`w-full text-left px-3 py-1.5 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed ${
                item.danger ? "text-red-400" : "text-slate-200"
              }`}
              onClick={() => {
                if (!item.disabled) {
                  executeMenuItem(item.id, node, handlers);
                  onClose();
                }
              }}
            >
              {item.label}
            </button>
          )
        )}
        {items.length === 0 && (
          <div className="px-3 py-2 text-slate-500 text-xs">No actions available</div>
        )}
      </div>
    </>
  );
}
