import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { MediaRenderer } from "@/components/media";
import type { QuestionRendererProps } from "../types/renderer";

function ChoiceOption({
  id,
  text,
  selected,
  disabled,
  reviewMode,
  isCorrect,
  onSelect,
  multi,
}: {
  id: string;
  text: string;
  selected: boolean;
  disabled?: boolean;
  reviewMode?: boolean;
  isCorrect?: boolean;
  onSelect: () => void;
  multi?: boolean;
}) {
  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!disabled) onSelect();
      }
    },
    [disabled, onSelect]
  );

  return (
    <button
      type="button"
      id={id}
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      onKeyDown={handleKey}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-primary/5",
        reviewMode && isCorrect && "border-[var(--player-correct,hsl(142_76%_36%))]",
        reviewMode && selected && !isCorrect && "border-[var(--player-incorrect,hsl(0_84%_60%))]",
        disabled && "opacity-60 cursor-not-allowed"
      )}
      style={{ fontSize: "calc(1rem * var(--player-font-scale, 1))" }}
    >
      <MediaRenderer content={text} />
    </button>
  );
}

export const ChoiceListRenderer = memo(function ChoiceListRenderer({
  question,
  value,
  onChange,
  disabled,
  reviewMode,
  showResult,
  ariaLabel,
  multi = false,
}: QuestionRendererProps & { multi?: boolean }) {
  const groupLabel = ariaLabel ?? question.stem;

  const toggle = (choiceId: string) => {
    if (disabled) return;
    if (multi) {
      const current = new Set(Array.isArray(value) ? (value as string[]) : []);
      if (current.has(choiceId)) current.delete(choiceId);
      else current.add(choiceId);
      onChange([...current]);
    } else {
      onChange(choiceId);
    }
  };

  const selectedSet = new Set(Array.isArray(value) ? (value as string[]) : value ? [value as string] : []);
  const correctIds = new Set(showResult?.correctOptionIds ?? []);

  return (
    <div
      role={multi ? "group" : "radiogroup"}
      aria-label={groupLabel}
      className="space-y-3"
    >
      <MediaRenderer content={question.stem} className="text-base font-medium leading-relaxed" />
      <div className="space-y-2">
        {question.choices.map((choice) => (
          <ChoiceOption
            key={choice.id}
            id={`choice-${choice.id}`}
            text={choice.text}
            selected={selectedSet.has(choice.id)}
            disabled={disabled}
            reviewMode={reviewMode}
            isCorrect={correctIds.has(choice.id)}
            onSelect={() => toggle(choice.id)}
            multi={multi}
          />
        ))}
      </div>
      {showResult?.feedback && (
        <MediaRenderer content={showResult.feedback} className="text-sm text-muted-foreground" />
      )}
    </div>
  );
});
