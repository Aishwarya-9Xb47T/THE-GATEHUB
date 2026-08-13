import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { QuizQuestion } from "@/lib/quizBuilder/types";
import { QuestionWorkspaceCard } from "./QuestionWorkspaceCard";
import { InsertQuestionDivider } from "./InsertQuestionDivider";

interface QuizQuestionsCanvasProps {
  questions: QuizQuestion[];
  focusedId: string | null;
  collapsedIds: Set<string>;
  onFocus: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onChange: (id: string, patch: Partial<QuizQuestion>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onInsertAt: (afterIndex: number) => void;
  onOpenAi: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
}

export function QuizQuestionsCanvas({
  questions,
  focusedId,
  collapsedIds,
  onFocus,
  onToggleCollapse,
  onChange,
  onDuplicate,
  onDelete,
  onInsertAt,
  onOpenAi,
  onReorder,
}: QuizQuestionsCanvasProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div className="mx-auto w-full max-w-none space-y-3 px-3 py-4 sm:px-5 lg:px-6">
          <InsertQuestionDivider onInsert={() => onInsertAt(-1)} />
          {questions.map((q, index) => (
            <div key={q.id}>
              <SortableQuestionCard
                question={q}
                index={index}
                isFocused={focusedId === q.id}
                isCollapsed={collapsedIds.has(q.id)}
                onFocus={() => onFocus(q.id)}
                onToggleCollapse={() => onToggleCollapse(q.id)}
                onChange={(patch) => onChange(q.id, patch)}
                onDuplicate={() => onDuplicate(q.id)}
                onDelete={() => onDelete(q.id)}
                onAddBelow={() => onInsertAt(index)}
                onOpenAi={() => onOpenAi(q.id)}
              />
              <InsertQuestionDivider onInsert={() => onInsertAt(index)} />
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableQuestionCard(props: Parameters<typeof QuestionWorkspaceCard>[0] & { question: QuizQuestion }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: props.question.id });
  return (
    <div ref={setNodeRef} style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined, transition }}>
      <QuestionWorkspaceCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

/** Scroll helper used by navigator */
export function scrollToQuestionCard(id: string) {
  document.getElementById(`question-card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
