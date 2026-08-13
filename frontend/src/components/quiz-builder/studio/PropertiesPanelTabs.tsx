import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichContentEditor } from "@/components/media";
import type { QuizEditorData, QuizQuestion } from "@/lib/quizBuilder/types";
import { LiveValidationPanel } from "./LiveValidationPanel";
import { AiStudioPanel } from "./AiStudioPanel";
import { QuestionTypeSelect } from "./QuestionTypeSelect";
import type { LiveValidationIssue } from "@/lib/quizBuilder/questionLiveValidation";
import type { QuizValidationResult } from "@/lib/quizBuilder/types";

interface PropertiesPanelTabsProps {
  quiz: QuizEditorData;
  question: QuizQuestion;
  liveIssues: LiveValidationIssue[];
  validation: QuizValidationResult | null | undefined;
  onUpdateQuestion: (patch: Partial<QuizQuestion>) => void;
  onUpdateQuiz: (patch: Partial<QuizEditorData>) => void;
}

export function PropertiesPanelTabs({
  quiz,
  question,
  liveIssues,
  validation,
  onUpdateQuestion,
  onUpdateQuiz,
}: PropertiesPanelTabsProps) {
  const meta = question.metadata as Record<string, unknown>;
  const updateMeta = (patch: Record<string, unknown>) =>
    onUpdateQuestion({ metadata: { ...meta, ...patch } });

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-bold">Properties</h2>
        <p className="text-[11px] text-muted-foreground">Question & quiz metadata</p>
      </div>

      <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-3 grid h-auto shrink-0 grid-cols-3 gap-1 bg-muted/50 p-1">
          <TabsTrigger value="general" className="px-2 py-1.5 text-[11px]">General</TabsTrigger>
          <TabsTrigger value="scoring" className="px-2 py-1.5 text-[11px]">Scoring</TabsTrigger>
          <TabsTrigger value="metadata" className="px-2 py-1.5 text-[11px]">Metadata</TabsTrigger>
          <TabsTrigger value="ai" className="px-2 py-1.5 text-[11px]">AI</TabsTrigger>
          <TabsTrigger value="accessibility" className="px-2 py-1.5 text-[11px]">A11y</TabsTrigger>
          <TabsTrigger value="validation" className="px-2 py-1.5 text-[11px]">Valid</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          <TabsContent value="general" className="mt-0 space-y-4">
            <Field label="Question type">
              <QuestionTypeSelect question={question} onChange={onUpdateQuestion} size="md" />
            </Field>
            <Field label="Difficulty">
              <select className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" value={question.difficulty || "medium"} onChange={(e) => onUpdateQuestion({ difficulty: e.target.value })}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </Field>
            <Field label="Bloom level">
              <select className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" value={question.bloomLevel || "L2"} onChange={(e) => onUpdateQuestion({ bloomLevel: e.target.value })}>
                {["L1", "L2", "L3", "L4", "L5", "L6"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Estimated time (sec)">
              <Input type="number" className="h-9" value={question.estimatedSeconds || 45} onChange={(e) => onUpdateQuestion({ estimatedSeconds: Number(e.target.value) })} />
            </Field>
            <Field label="Marks (points for this question)">
              <Input
                type="number"
                min={0}
                step={1}
                className="h-9 font-semibold"
                value={question.marks ?? 1}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onUpdateQuestion({ marks: Number.isFinite(n) && n >= 0 ? n : 0 });
                }}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Weighted score uses these marks. Quiz total updates automatically.
              </p>
            </Field>
            <Field label="Language">
              <Input className="h-9" value={String(meta.language || "en")} onChange={(e) => updateMeta({ language: e.target.value })} />
            </Field>
            <Field label="Hint">
              <Input className="h-9" value={(question as any).hint || question.hints?.[0] || ""} onChange={(e) => {
                const val = e.target.value;
                onUpdateQuestion({ hint: val, hints: [val] } as any);
              }} />
            </Field>
            <Field label="Explanation">
              <RichContentEditor
                compact
                value={question.explanation || ""}
                onChange={(text) => onUpdateQuestion({ explanation: text })}
                inputId={`tab-explanation-${question.id}`}
              />
            </Field>
            <Field label="Quiz visibility">
              <select className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" value={quiz.visibility} onChange={(e) => onUpdateQuiz({ visibility: e.target.value })}>
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </Field>
          </TabsContent>

          <TabsContent value="scoring" className="mt-0 space-y-4">
            <Field label="Marks">
              <Input
                type="number"
                min={0}
                step={1}
                className="h-9 text-base font-bold"
                value={question.marks ?? 1}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onUpdateQuestion({ marks: Number.isFinite(n) && n >= 0 ? n : 0 });
                }}
              />
            </Field>
            <Field label="Negative Marks">
              <Input type="number" step="0.25" min={0} className="h-9" value={(question as any).negativeMarks ?? 0} onChange={(e) => onUpdateQuestion({ negativeMarks: Number(e.target.value) } as any)} />
            </Field>
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Scoring note</p>
              <p className="mt-1">
                Academic score = sum of marks for correct answers. Leaderboard points may include speed/streak bonuses separately.
              </p>
            </div>
            <Field label="Passing score %">
              <Input type="number" className="h-9" value={quiz.settings.passingScore} onChange={(e) => onUpdateQuiz({ settings: { ...quiz.settings, passingScore: Number(e.target.value) } })} />
            </Field>
          </TabsContent>

          <TabsContent value="metadata" className="mt-0 space-y-4">
            <Field label="Subject">
              <Input className="h-9" value={quiz.subject || ""} onChange={(e) => onUpdateQuiz({ subject: e.target.value })} />
            </Field>
            <Field label="Topic">
              <Input className="h-9" value={String(meta.topic || "")} onChange={(e) => updateMeta({ topic: e.target.value })} />
            </Field>
            <Field label="Chapter">
              <Input className="h-9" value={String(meta.chapter || "")} onChange={(e) => updateMeta({ chapter: e.target.value })} />
            </Field>
            <Field label="Tags">
              <Input className="h-9" value={question.tags.join(", ")} onChange={(e) => onUpdateQuestion({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
            </Field>
            <Field label="Learning outcome">
              <RichContentEditor
                compact
                value={String(meta.learningOutcome || "")}
                onChange={(text) => updateMeta({ learningOutcome: text })}
                inputId={`tab-learning-outcome-${question.id}`}
              />
            </Field>
          </TabsContent>

          <TabsContent value="ai" className="mt-0">
            <AiStudioPanel question={question} onApply={onUpdateQuestion} />
          </TabsContent>

          <TabsContent value="accessibility" className="mt-0 space-y-4">
            <Field label="Alt text for media">
              <Input className="h-9" value={String(meta.altText || "")} onChange={(e) => updateMeta({ altText: e.target.value })} />
            </Field>
          </TabsContent>

          <TabsContent value="validation" className="mt-0 space-y-4">
            <LiveValidationPanel issues={liveIssues} />
            {validation && (
              <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Quiz summary</p>
                <p className="mt-1">{validation.summary.questionCount} questions · {validation.summary.missingExplanations} missing explanations</p>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      {children}
    </div>
  );
}
