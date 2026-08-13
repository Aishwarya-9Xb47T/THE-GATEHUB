import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RichContentEditor } from "@/components/media";
import { Badge } from "@/components/ui/badge";
import type { QuizEditorData, QuizQuestion } from "@/lib/quizBuilder/types";
import { BUILDER_QUESTION_TYPES } from "@/lib/quizBuilder/types";
import { changeQuestionType } from "@/lib/quizBuilder/questionTypeUtils";
import { LiveValidationPanel } from "./LiveValidationPanel";
import type { LiveValidationIssue } from "@/lib/quizBuilder/questionLiveValidation";
import type { QuizValidationResult } from "@/lib/quizBuilder/types";

interface QuestionPropertiesPanelProps {
  quiz: QuizEditorData;
  question: QuizQuestion;
  liveIssues: LiveValidationIssue[];
  validation: QuizValidationResult | null | undefined;
  onUpdateQuestion: (patch: Partial<QuizQuestion>) => void;
  onUpdateQuiz: (patch: Partial<QuizEditorData>) => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function QuestionPropertiesPanel({
  quiz,
  question,
  liveIssues,
  validation,
  onUpdateQuestion,
  onUpdateQuiz,
}: QuestionPropertiesPanelProps) {
  const meta = question.metadata as Record<string, unknown>;

  const updateMeta = (patch: Record<string, unknown>) =>
    onUpdateQuestion({ metadata: { ...meta, ...patch } });

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-border/40 p-3">
        <h2 className="text-sm font-semibold">Properties</h2>
        <p className="text-[10px] text-muted-foreground">Question & quiz metadata</p>
      </div>

      <div className="space-y-4 p-3">
        <section className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Question</p>
          <Field label="Type">
            <select
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              value={question.type}
              onChange={(e) => onUpdateQuestion(changeQuestionType(question, e.target.value))}
            >
              {BUILDER_QUESTION_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Difficulty">
            <select
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              value={question.difficulty || "medium"}
              onChange={(e) => onUpdateQuestion({ difficulty: e.target.value })}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </Field>
          <Field label="Bloom level">
            <select
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              value={question.bloomLevel || "L2"}
              onChange={(e) => onUpdateQuestion({ bloomLevel: e.target.value })}
            >
              {["L1", "L2", "L3", "L4", "L5", "L6"].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Estimated time (sec)">
            <Input
              type="number"
              className="h-9"
              value={question.estimatedSeconds || 45}
              onChange={(e) => onUpdateQuestion({ estimatedSeconds: Number(e.target.value) })}
            />
          </Field>
          <Field label="Marks">
            <Input
              type="number"
              className="h-9"
              value={question.marks}
              onChange={(e) => onUpdateQuestion({ marks: Number(e.target.value) })}
            />
          </Field>
          <Field label="Negative marks">
            <Input
              type="number"
              className="h-9"
              step="0.25"
              min="0"
              value={question.negativeMarks ?? 0}
              onChange={(e) => onUpdateQuestion({ negativeMarks: Number(e.target.value) })}
            />
          </Field>
          <Field label="Hint">
            <Input
              className="h-9"
              value={question.hint || ""}
              onChange={(e) => onUpdateQuestion({ hint: e.target.value })}
              placeholder="e.g. Look at the coefficients"
            />
          </Field>
          <Field label="Explanation">
            <RichContentEditor
              compact
              value={question.explanation || ""}
              onChange={(text) => onUpdateQuestion({ explanation: text })}
              inputId={`explanation-${question.id}`}
            />
          </Field>
          <Field label="Reference link / URL">
            <Input
              className="h-9"
              value={question.referenceLinks || ""}
              onChange={(e) => onUpdateQuestion({ referenceLinks: e.target.value })}
              placeholder="https://example.com/notes"
            />
          </Field>
          <Field label="Tags">
            <Input
              className="h-9"
              value={question.tags.join(", ")}
              onChange={(e) =>
                onUpdateQuestion({
                  tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                })
              }
              placeholder="algebra, week-3"
            />
          </Field>
          <Field label="Topic">
            <Input
              className="h-9"
              value={String(meta.topic || "")}
              onChange={(e) => updateMeta({ topic: e.target.value })}
            />
          </Field>
          <Field label="Subtopic">
            <Input
              className="h-9"
              value={String(meta.subtopic || "")}
              onChange={(e) => updateMeta({ subtopic: e.target.value })}
            />
          </Field>
          <Field label="Learning outcome">
            <RichContentEditor
              compact
              value={String(meta.learningOutcome || "")}
              onChange={(text) => updateMeta({ learningOutcome: text })}
              inputId={`learning-outcome-${question.id}`}
            />
          </Field>
          <Field label="Language">
            <Input
              className="h-9"
              value={String(meta.language || "en")}
              onChange={(e) => updateMeta({ language: e.target.value })}
            />
          </Field>
          <Field label="Review status">
            <select
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              value={String(meta.reviewStatus || "draft")}
              onChange={(e) => updateMeta({ reviewStatus: e.target.value })}
            >
              <option value="draft">Draft</option>
              <option value="pending">Pending review</option>
              <option value="approved">Approved</option>
            </select>
          </Field>
        </section>

        <section className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quiz</p>
          <Field label="Subject">
            <Input
              className="h-9"
              value={quiz.subject || ""}
              onChange={(e) => onUpdateQuiz({ subject: e.target.value })}
            />
          </Field>
          <Field label="Visibility">
            <select
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              value={quiz.visibility}
              onChange={(e) => onUpdateQuiz({ visibility: e.target.value })}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </Field>
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Live validation</p>
          <LiveValidationPanel issues={liveIssues} />
        </section>

        {validation && (
          <section className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="mb-2 font-semibold text-foreground">Quiz analytics</p>
            <p>{validation.summary.questionCount} questions · ~{validation.summary.estimatedMinutes} min</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(validation.summary.typeCounts).map(([t, c]) => (
                <Badge key={t} variant="outline" className="text-[9px]">{t}: {c}</Badge>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
