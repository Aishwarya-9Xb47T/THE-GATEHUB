import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssessmentContentRenderer } from "@/components/assessment/AssessmentContentRenderer";
import type { PlayerOption } from "./types";

interface OrderingOptionsPlayerProps {
  options: PlayerOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export function OrderingOptionsPlayer({ options, value, onChange, disabled }: OrderingOptionsPlayerProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const orderedIds =
    value.length === options.length ? value : [...options].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((o) => o.id);
  const ordered = orderedIds.map((id) => options.find((o) => o.id === id)!).filter(Boolean);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || disabled) return;
    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(orderedIds, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
        <ol className="space-y-2" aria-label="Put items in the correct order">
          {ordered.map((opt, idx) => (
            <SortableOrderingItem key={opt.id} opt={opt} index={idx} disabled={disabled} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableOrderingItem({
  opt,
  index,
  disabled,
}: {
  opt: PlayerOption;
  index: number;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opt.id,
    disabled,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border-2 border-border/70 bg-card p-3",
        isDragging && "opacity-70 shadow-lg",
        disabled && "opacity-80"
      )}
    >
      <button
        type="button"
        className={cn("cursor-grab text-muted-foreground", disabled && "cursor-not-allowed")}
        {...attributes}
        {...listeners}
        aria-label={`Drag item ${index + 1}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <AssessmentContentRenderer content={opt.text || `Item ${index + 1}`} variant="option" />
      </div>
    </li>
  );
}
