import { AssessmentQuestionStem } from "@/components/assessment/AssessmentContentRenderer";
import { ChoiceOptionsPlayer } from "./ChoiceOptionsPlayer";
import { HotspotOptionsPlayer } from "./HotspotOptionsPlayer";
import { MatchingOptionsPlayer } from "./MatchingOptionsPlayer";
import { OrderingOptionsPlayer } from "./OrderingOptionsPlayer";
import { TextAnswerPlayer } from "./TextAnswerPlayer";
import {
  isChoiceType,
  isHotspotType,
  isMatchingType,
  isOrderingType,
  isTextAnswerType,
  type PlayerQuestion,
} from "./types";

export interface QuestionPlayerBodyProps {
  question: PlayerQuestion;
  value?: unknown;
  onChange?: (value: unknown) => void;
  disabled?: boolean;
}

export function QuestionPlayerBody({ question, value, onChange, disabled }: QuestionPlayerBodyProps) {
  const handleChange = onChange ?? (() => {});

  return (
    <div className="space-y-6">
      <AssessmentQuestionStem
        text={question.text}
        metadata={question.metadata}
        className="prose prose-sm max-w-none dark:prose-invert"
      />

      {renderAnswerArea(question, value, handleChange, disabled)}
    </div>
  );
}

function renderAnswerArea(
  question: PlayerQuestion,
  value: unknown,
  onChange: (value: unknown) => void,
  disabled?: boolean
) {
  if (isChoiceType(question.type)) {
    return (
      <ChoiceOptionsPlayer
        type={question.type}
        options={question.options}
        value={(value as string | string[]) ?? (question.type === "multiple_select" ? [] : "")}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (isOrderingType(question.type)) {
    const ids = Array.isArray(value) ? (value as string[]) : [];
    return (
      <OrderingOptionsPlayer
        options={question.options}
        value={ids}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (isMatchingType(question.type)) {
    const map = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
    return (
      <MatchingOptionsPlayer
        options={question.options}
        value={map}
        onChange={onChange}
        disabled={disabled}
        isMatrix={question.type === "matrix"}
        metadata={question.metadata}
      />
    );
  }

  if (isTextAnswerType(question.type)) {
    return (
      <TextAnswerPlayer
        type={question.type}
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (isHotspotType(question.type)) {
    return (
      <HotspotOptionsPlayer
        question={question}
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (question.type === "essay") {
    return (
      <TextAnswerPlayer
        type="short_answer"
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Preview for question type &quot;{question.type}&quot; is not available in this player yet.
    </p>
  );
}

export function toPlayerQuestion(q: {
  id: string;
  text: string;
  type: string;
  options?: Array<{ id: string; text: string; order?: number }>;
  metadata?: Record<string, unknown> | null;
}): PlayerQuestion {
  return {
    id: q.id,
    text: q.text,
    type: q.type,
    options: q.options ?? [],
    metadata: q.metadata ?? null,
  };
}
