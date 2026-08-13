import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileText, FolderPlus, Copy, Trash2, Pencil, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectFile, ResearchDocument } from "../types";

interface FileTreeProps {
  doc: ResearchDocument;
  activeFileId: string | null;
  dirtyFileIds: Set<string>;
  onSelect: (fileId: string) => void;
  onCreate: () => void;
  onDelete: (fileId: string) => void;
  onRename: (fileId: string) => void;
  onDuplicate: (fileId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

function SortableFileItem({
  file,
  isActive,
  isDirty,
  isMain,
  onSelect,
  onDelete,
  onRename,
  onDuplicate,
}: {
  file: ProjectFile;
  isActive: boolean;
  isDirty: boolean;
  isMain: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: file.fileId,
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
      className={`group flex items-center gap-1 px-2 py-1.5 rounded text-xs cursor-pointer ${
        isActive ? "bg-[#388bfd26] text-[#58a6ff]" : "hover:bg-[#21262d] text-[#c9d1d9]"
      }`}
      onClick={onSelect}
    >
      <button type="button" className="p-0.5 text-[#8b949e] hover:text-white cursor-grab" {...attributes} {...listeners}>
        <GripVertical className="w-3 h-3" />
      </button>
      <FileText className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 truncate">
        {file.name}
        {isDirty && <span className="text-[#f0883e] ml-0.5">●</span>}
        {isMain && <span className="text-[#8b949e] ml-1 text-[10px]">main</span>}
      </span>
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 p-0.5"
        onClick={(e) => {
          e.stopPropagation();
          onRename();
        }}
      >
        <Pencil className="w-3 h-3" />
      </button>
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 p-0.5"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate();
        }}
      >
        <Copy className="w-3 h-3" />
      </button>
      {!isMain && (
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function FileTree({
  doc,
  activeFileId,
  dirtyFileIds,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onDuplicate,
  onReorder,
}: FileTreeProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = doc.files.findIndex((f) => f.fileId === active.id);
    const toIndex = doc.files.findIndex((f) => f.fileId === over.id);
    if (fromIndex >= 0 && toIndex >= 0) onReorder(fromIndex, toIndex);
  };

  return (
    <div className="p-2 space-y-1 h-full flex flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <p className="text-[10px] uppercase tracking-wider text-[#8b949e] font-semibold">Explorer</p>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={onCreate} title="New file">
          <FolderPlus className="w-3.5 h-3.5" />
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={doc.files.map((f) => f.fileId)} strategy={verticalListSortingStrategy}>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {doc.files.map((file) => (
              <SortableFileItem
                key={file.fileId}
                file={file}
                isActive={file.fileId === activeFileId}
                isDirty={dirtyFileIds.has(file.fileId)}
                isMain={file.fileId === doc.mainFileId}
                onSelect={() => onSelect(file.fileId)}
                onDelete={() => onDelete(file.fileId)}
                onRename={() => onRename(file.fileId)}
                onDuplicate={() => onDuplicate(file.fileId)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
