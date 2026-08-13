import type { QuizQuestion } from "@/lib/quizBuilder/types";
import { BUILDER_QUESTION_TYPES } from "@/lib/quizBuilder/types";
import { changeQuestionType } from "@/lib/quizBuilder/questionTypeUtils";
import { cn } from "@/lib/utils";

interface QuestionTypeSelectProps {
  question: QuizQuestion;
  onChange: (patch: Partial<QuizQuestion>) => void;
  className?: string;
  size?: "sm" | "md";
}

export function QuestionTypeSelect({ question, onChange, className, size = "sm" }: QuestionTypeSelectProps) {
  return (
    <select
      className={cn(
        "rounded-lg border border-border/60 bg-background font-medium shadow-sm transition-colors hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
        size === "sm" ? "h-8 max-w-[min(100%,220px)] truncate px-2 text-xs" : "h-9 w-full px-3 text-sm",
        className
      )}
      value={question.type}
      onChange={(e) => {
        e.stopPropagation();
        onChange(changeQuestionType(question, e.target.value));
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Question type"
    >
      {BUILDER_QUESTION_TYPES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
