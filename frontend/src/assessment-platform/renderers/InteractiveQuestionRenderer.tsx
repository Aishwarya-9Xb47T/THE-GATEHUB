import { memo } from "react";
import { QuestionPlayerBody, toPlayerQuestion } from "@/components/media/questionPlayer";
import { MediaRenderer } from "@/components/media";
import type { QuestionRendererProps } from "../types/renderer";
import type { SanitizedQuestionSnapshot } from "../types";

function snapshotToPlayer(question: SanitizedQuestionSnapshot) {
  return toPlayerQuestion({
    id: question.id,
    text: question.stem,
    type: question.typeSlug,
    options: question.choices.map((c) => ({ id: c.id, text: c.text, order: c.order })),
    metadata: question.metadata,
  });
}

export const InteractiveQuestionRenderer = memo(function InteractiveQuestionRenderer({
  question,
  value,
  onChange,
  disabled,
  reviewMode,
  showResult,
}: QuestionRendererProps) {
  const playerQuestion = snapshotToPlayer(question);

  return (
    <div className="space-y-4">
      <QuestionPlayerBody
        question={playerQuestion}
        value={value}
        onChange={onChange}
        disabled={disabled || reviewMode}
      />
      {showResult?.feedback && (
        <MediaRenderer content={showResult.feedback} className="text-sm text-muted-foreground" />
      )}
    </div>
  );
});

function validateOrdering(value: unknown, question: SanitizedQuestionSnapshot): string[] {
  if (!Array.isArray(value) || value.length !== question.choices.length) {
    return ["Arrange all items"];
  }
  return [];
}

function validateMatching(value: unknown, question: SanitizedQuestionSnapshot): string[] {
  const pairCount = Math.floor(question.choices.length / 2);
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Complete all matches"];
  const map = value as Record<string, string>;
  const filled = Object.values(map).filter(Boolean).length;
  if (filled < pairCount) return ["Complete all matches"];
  return [];
}

export const orderingValidators = { validateOrdering, validateMatching };
