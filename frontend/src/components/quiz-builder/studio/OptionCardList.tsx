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
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, GripVertical, Copy, ChevronDown, ChevronUp, Check } from "lucide-react";
import type { QuizQuestion } from "@/lib/quizBuilder/types";
import { RichContentEditor } from "@/components/media";
import { QuizSection } from "./QuizSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

interface OptionCardListProps {
  question: QuizQuestion;
  onChange: (patch: Partial<QuizQuestion>) => void;
}

export function OptionCardList({ question, onChange }: OptionCardListProps) {
  const isMulti = question.type === "multiple_select";
  const isPoll = question.type === "poll";
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const addOption = () => {
    onChange({
      options: [
        ...question.options,
        { id: `o-${Date.now()}`, text: "", isCorrect: false, order: question.options.length },
      ],
    });
  };

  const removeOption = (oi: number) => {
    if (question.options.length <= 2) return;
    onChange({ options: question.options.filter((_, i) => i !== oi) });
  };

  const duplicateOption = (oi: number) => {
    const src = question.options[oi]!;
    const copy = { ...src, id: `o-${Date.now()}`, isCorrect: false };
    const options = [...question.options];
    options.splice(oi + 1, 0, copy);
    onChange({ options });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = question.options.findIndex((o) => o.id === active.id);
    const newIndex = question.options.findIndex((o) => o.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange({ options: arrayMove(question.options, oldIndex, newIndex) });
  };

  return (
    <QuizSection
      title={isPoll ? "Poll choices" : isMulti ? "Answer choices" : "Answer options"}
      description={
        isPoll
          ? "Students pick one — no correct answer required"
          : isMulti
            ? "Click the checkmark on every correct option"
            : "Click the circle to mark the single correct answer"
      }
      action={
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 rounded-full" onClick={addOption}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={question.options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2.5">
            <AnimatePresence initial={false}>
              {question.options.map((opt, oi) => (
                <SortableOptionCard
                  key={opt.id}
                  opt={opt}
                  index={oi}
                  questionId={question.id}
                  isMulti={isMulti}
                  isPoll={isPoll}
                  canRemove={question.options.length > 2}
                  onUpdate={(patch) => {
                    const options = [...question.options];
                    options[oi] = { ...options[oi]!, ...patch };
                    onChange({ options });
                  }}
                  onSetCorrect={() => {
                    const options = question.options.map((o, j) => {
                      if (isMulti) return j === oi ? { ...o, isCorrect: !o.isCorrect } : o;
                      return { ...o, isCorrect: j === oi };
                    });
                    onChange({ options });
                  }}
                  onRemove={() => removeOption(oi)}
                  onDuplicate={() => duplicateOption(oi)}
                />
              ))}
            </AnimatePresence>
          </div>
        </SortableContext>
      </DndContext>
    </QuizSection>
  );
}

function SortableOptionCard({
  opt,
  index,
  questionId,
  isMulti,
  isPoll,
  canRemove,
  onUpdate,
  onSetCorrect,
  onRemove,
  onDuplicate,
}: {
  opt: QuizQuestion["options"][number];
  index: number;
  questionId: string;
  isMulti: boolean;
  isPoll: boolean;
  canRemove: boolean;
  onUpdate: (patch: Partial<QuizQuestion["options"][number]>) => void;
  onSetCorrect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const [showExplanation, setShowExplanation] = useState(Boolean((opt as { explanation?: string }).explanation));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: opt.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const letter = LETTERS[index] ?? String(index + 1);
  const isCorrect = opt.isCorrect && !isPoll;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border-2 bg-card transition-all duration-200",
        isCorrect
          ? "border-emerald-500/60 bg-gradient-to-r from-emerald-500/8 to-transparent shadow-sm shadow-emerald-500/10"
          : "border-border/50 hover:border-border hover:shadow-md",
        isDragging && "z-10 opacity-80 shadow-xl ring-2 ring-primary/20"
      )}
    >
      <div className="flex items-stretch gap-0">
        {/* Drag handle */}
        <button
          type="button"
          className="flex w-9 shrink-0 cursor-grab items-center justify-center border-r border-border/30 text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Drag option ${letter}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Letter badge + correct toggle */}
        <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-1.5 border-r border-border/30 py-3">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold transition-colors",
              isCorrect ? "bg-emerald-500 text-white shadow-sm" : "bg-muted text-muted-foreground"
            )}
          >
            {letter}
          </span>
          {!isPoll && (
            <button
              type="button"
              onClick={onSetCorrect}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
                isCorrect
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-muted-foreground/30 hover:border-primary hover:bg-primary/5"
              )}
              aria-label={isCorrect ? "Correct answer" : "Mark as correct"}
              aria-pressed={isCorrect}
            >
              {isCorrect && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 py-2 pr-2">
          <RichContentEditor
            value={opt.text}
            onChange={(text) => onUpdate({ text })}
            placeholder={`Type option ${letter}…`}
            compact
            showTextFormats={false}
            minimalToolbar
            inputId={`option-text-${questionId}-${index}`}
          />

          {showExplanation ? (
            <div className="mt-2 border-t border-border/30 pt-2">
              <RichContentEditor
                value={String((opt as { explanation?: string }).explanation || "")}
                onChange={(explanation) => onUpdate({ explanation } as Partial<QuizQuestion["options"][number]>)}
                label="Feedback"
                placeholder="Explain why this option is right or wrong (optional)"
                compact
                showTextFormats={false}
                inputId={`option-explanation-${questionId}-${index}`}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowExplanation(true)}
              className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown className="h-3 w-3" />
              Add feedback
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col justify-center gap-0.5 border-l border-border/30 px-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} title="Duplicate">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {showExplanation && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowExplanation(false)}
              title="Hide feedback"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
          )}
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onRemove}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
