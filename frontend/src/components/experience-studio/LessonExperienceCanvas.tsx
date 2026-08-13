import { useMemo } from "react";
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
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { LuExplorerNode, LuLessonComponentKind, StructureAction } from "@/lib/luAuthoring/types";
import { COMPONENT_MENU_ITEMS } from "@/lib/luAuthoring/componentRegistry";
import { NODE_ICONS } from "@/lib/luAuthoring/nodeMeta";
import { cn } from "@/lib/utils";

const QUICK_BLOCKS = [
  { block: "overview" as const, label: "Overview", desc: "Welcome students to this lesson" },
  { block: "topics" as const, label: "Theory", desc: "Explain concepts clearly" },
  { block: "practice" as const, label: "Practice", desc: "Hands-on try-it-yourself" },
  { block: "quiz" as const, label: "Quiz", desc: "Check understanding" },
  { block: "project" as const, label: "Project", desc: "Applied learning workspace" },
  { block: "resources" as const, label: "Resources", desc: "Downloads and links" },
];

interface LessonExperienceCanvasProps {
  lessonNode: LuExplorerNode | null;
  selectedComponentId: string | null;
  onSelectComponent: (node: LuExplorerNode) => void;
  onMutate: (action: StructureAction) => Promise<unknown>;
}

function SortableBlockRow({
  node,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  node: LuExplorerNode;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.componentId!,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-pointer transition-shadow border-l-4",
        selected ? "border-l-primary shadow-md ring-1 ring-primary/20" : "border-l-muted-foreground/30 hover:border-l-primary/50"
      )}
      onClick={onSelect}
    >
      <CardHeader className="py-3 flex flex-row items-center gap-2">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none shrink-0"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
        <span className="text-lg shrink-0">{NODE_ICONS[node.kind] ?? "📄"}</span>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-sm font-medium truncate">{node.title}</CardTitle>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{node.kind.replace(/-/g, " ")}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onDuplicate}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

export function LessonExperienceCanvas({
  lessonNode,
  selectedComponentId,
  onSelectComponent,
  onMutate,
}: LessonExperienceCanvasProps) {
  const [addOpen, setAddOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const components = useMemo(
    () => (lessonNode?.children ?? []).filter((c) => c.componentId && c.kind !== "lesson"),
    [lessonNode?.children]
  );

  const componentIds = components.map((c) => c.componentId!);

  if (!lessonNode || lessonNode.kind !== "lesson") {
    return null;
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !lessonNode.trackId || !lessonNode.moduleId || !lessonNode.lessonId) return;

    const oldIndex = componentIds.indexOf(String(active.id));
    const newIndex = componentIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const componentId = String(active.id);
    const direction = newIndex < oldIndex ? "up" : "down";
    const steps = Math.abs(newIndex - oldIndex);
    for (let i = 0; i < steps; i++) {
      await onMutate({
        action: "moveComponent",
        trackId: lessonNode.trackId,
        moduleId: lessonNode.moduleId,
        lessonId: lessonNode.lessonId,
        componentId,
        direction,
      });
    }
  };

  const addBlock = async (block: LuLessonComponentKind) => {
    if (!lessonNode.trackId || !lessonNode.moduleId || !lessonNode.lessonId) return;
    const result = await onMutate({
      action: "appendLessonBlock",
      trackId: lessonNode.trackId,
      moduleId: lessonNode.moduleId,
      lessonId: lessonNode.lessonId,
      block,
    });
    const createdId = (result as { createdComponentId?: string })?.createdComponentId;
    if (createdId) {
      const child = lessonNode.children?.find((c) => c.componentId === createdId);
      if (child) onSelectComponent(child);
    }
    setAddOpen(false);
  };

  const duplicateBlock = async (node: LuExplorerNode) => {
    if (!node.trackId || !node.moduleId || !node.lessonId || !node.componentId) return;
    await onMutate({
      action: "duplicateComponent",
      trackId: node.trackId,
      moduleId: node.moduleId,
      lessonId: node.lessonId,
      componentId: node.componentId,
    });
  };

  const deleteBlock = async (node: LuExplorerNode) => {
    if (!node.trackId || !node.moduleId || !node.lessonId || !node.componentId) return;
    await onMutate({
      action: "removeLessonComponent",
      trackId: node.trackId,
      moduleId: node.moduleId,
      lessonId: node.lessonId,
      componentId: node.componentId,
    });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b shrink-0 bg-muted/20">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Lesson</p>
        <h1 className="text-xl font-semibold">{lessonNode.title}</h1>
        <p className="text-xs text-muted-foreground mt-1">{components.length} learning blocks</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium">Experience blocks</p>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button type="button" size="sm" className="gap-1.5">
                  <Plus className="w-4 h-4" />
                  Add block
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add learning block</DialogTitle>
                </DialogHeader>
                <div className="flex flex-wrap gap-2 pt-2">
                  {COMPONENT_MENU_ITEMS.map((item) => (
                    <Button key={item.block} type="button" variant="outline" size="sm" onClick={() => void addBlock(item.block)}>
                      {item.label}
                    </Button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {components.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center mb-6">
                Start building this lesson — pick your first content type:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {QUICK_BLOCKS.map((item) => (
                  <button
                    key={item.block}
                    type="button"
                    onClick={() => void addBlock(item.block)}
                    className="text-left p-5 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all group"
                  >
                    <span className="text-2xl mb-2 block">{NODE_ICONS[item.block] ?? "📄"}</span>
                    <p className="font-semibold text-sm group-hover:text-primary">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                  </button>
                ))}
              </div>
              <div className="text-center pt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  More block types…
                </Button>
              </div>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
              <SortableContext items={componentIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {components.map((node) => (
                    <SortableBlockRow
                      key={node.componentId}
                      node={node}
                      selected={selectedComponentId === node.componentId}
                      onSelect={() => onSelectComponent(node)}
                      onDuplicate={() => void duplicateBlock(node)}
                      onDelete={() => void deleteBlock(node)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
}
