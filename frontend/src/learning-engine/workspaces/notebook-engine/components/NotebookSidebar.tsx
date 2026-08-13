import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NotebookCell } from "../types";

interface NotebookSidebarProps {
  cells: NotebookCell[];
  activeCellId: string | null;
  onSelect: (cellId: string) => void;
  onAdd: (type: "code" | "markdown") => void;
  onDelete: (cellId: string) => void;
  onDuplicate: (cellId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onMoveUp: (cellId: string) => void;
  onMoveDown: (cellId: string) => void;
  onCopy: (cellId: string) => void;
  onPaste: (afterId: string) => void;
}

interface ContextMenuState {
  cellId: string;
  x: number;
  y: number;
}

function SortableCellItem({
  cell,
  index,
  isActive,
  onSelect,
  onDelete,
  onDuplicate,
  onContextMenu,
  canDelete,
}: {
  cell: NotebookCell;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  canDelete: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cell.cellId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 px-1 py-0.5 rounded text-xs cursor-pointer ${
        isActive ? "bg-[#388bfd26] text-[#58a6ff]" : "hover:bg-[#21262d] text-[#c9d1d9]"
      }`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <button type="button" className="p-0.5 text-[#8b949e] hover:text-white cursor-grab" {...attributes} {...listeners}>
        <GripVertical className="w-3 h-3" />
      </button>
      <span className="flex-1 truncate">
        {index + 1}. {cell.cellType === "code" ? "Code" : "Markdown"}
      </span>
      <button
        type="button"
        className="opacity-70 group-hover:opacity-100 p-0.5 text-[#8b949e] hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate();
        }}
      >
        <Copy className="w-3 h-3" />
      </button>
      <button
        type="button"
        className="opacity-70 group-hover:opacity-100 p-0.5 text-red-400 disabled:opacity-30"
        disabled={!canDelete}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export function NotebookSidebar({
  cells,
  activeCellId,
  onSelect,
  onAdd,
  onDelete,
  onDuplicate,
  onReorder,
  onMoveUp,
  onMoveDown,
  onCopy,
  onPaste,
}: NotebookSidebarProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = cells.findIndex((c) => c.cellId === active.id);
    const toIndex = cells.findIndex((c) => c.cellId === over.id);
    if (fromIndex >= 0 && toIndex >= 0) onReorder(fromIndex, toIndex);
  };

  const openMenu = useCallback((cellId: string, e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ cellId, x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const menuCellIndex = menu ? cells.findIndex((c) => c.cellId === menu.cellId) : -1;

  return (
    <div className="p-2 space-y-1 text-xs h-full flex flex-col relative">
      <p className="px-2 py-1 text-[#8b949e] uppercase tracking-wider font-semibold">Notebook</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cells.map((c) => c.cellId)} strategy={verticalListSortingStrategy}>
          <div className="flex-1 space-y-0.5 overflow-y-auto">
            {cells.map((cell, i) => (
              <SortableCellItem
                key={cell.cellId}
                cell={cell}
                index={i}
                isActive={cell.cellId === activeCellId}
                onSelect={() => onSelect(cell.cellId)}
                onDelete={() => onDelete(cell.cellId)}
                onDuplicate={() => onDuplicate(cell.cellId)}
                onContextMenu={(e) => openMenu(cell.cellId, e)}
                canDelete={cells.length > 1}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="pt-2 space-y-1 border-t border-[#30363d] mt-2">
        <Button type="button" size="sm" variant="ghost" className="w-full justify-start h-8 text-xs" onClick={() => onAdd("code")}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Code cell
        </Button>
        <Button type="button" size="sm" variant="ghost" className="w-full justify-start h-8 text-xs" onClick={() => onAdd("markdown")}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Markdown cell
        </Button>
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-md border border-[#30363d] bg-[#161b22] shadow-lg py-1"
          style={{ left: menu.x, top: menu.y }}
        >
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-[#21262d]" onClick={() => { onDuplicate(menu.cellId); setMenu(null); }}>
            Duplicate
          </button>
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-[#21262d]" onClick={() => { onCopy(menu.cellId); setMenu(null); }}>
            Copy
          </button>
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-[#21262d]" onClick={() => { onPaste(menu.cellId); setMenu(null); }}>
            Paste below
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-[#21262d] flex items-center gap-2 disabled:opacity-40"
            disabled={menuCellIndex <= 0}
            onClick={() => { onMoveUp(menu.cellId); setMenu(null); }}
          >
            <ArrowUp className="w-3 h-3" /> Move up
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-[#21262d] flex items-center gap-2 disabled:opacity-40"
            disabled={menuCellIndex < 0 || menuCellIndex >= cells.length - 1}
            onClick={() => { onMoveDown(menu.cellId); setMenu(null); }}
          >
            <ArrowDown className="w-3 h-3" /> Move down
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-[#21262d] text-red-400 disabled:opacity-40"
            disabled={cells.length <= 1}
            onClick={() => { onDelete(menu.cellId); setMenu(null); }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
