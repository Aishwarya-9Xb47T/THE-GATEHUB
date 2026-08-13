import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { QUIZ_QUESTION_TYPES } from "@/lib/visualBuilder/blockToolbar";
import type { LuQuizQuestion } from "@/lib/learningUniverseSchema";

interface QuizContent {
  title?: string;
  questions?: LuQuizQuestion[];
}

interface QuizBlockEditorProps {
  content: QuizContent;
  onChange: (content: QuizContent) => void;
}

function emptyQuestion(type = "single"): LuQuizQuestion {
  if (type === "true_false") {
    return {
      text: "",
      type: "true_false",
      options: [{ text: "True", isCorrect: true }, { text: "False", isCorrect: false }],
      explanation: "",
      points: 1,
    };
  }
  return {
    text: "",
    type,
    options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }],
    explanation: "",
    points: 1,
  };
}

export function QuizBlockEditor({ content, onChange }: QuizBlockEditorProps) {
  const questions = content.questions || [emptyQuestion()];

  const updateQuestion = (qi: number, patch: Partial<LuQuizQuestion>) => {
    const next = [...questions];
    next[qi] = { ...next[qi], ...patch };
    onChange({ ...content, questions: next });
  };

  const addQuestion = () => {
    onChange({ ...content, questions: [...questions, emptyQuestion()] });
  };

  const removeQuestion = (qi: number) => {
    onChange({ ...content, questions: questions.filter((_, i) => i !== qi) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Quiz Title</Label>
        <Input value={content.title || ""} onChange={(e) => onChange({ ...content, title: e.target.value })} />
      </div>

      {questions.map((q, qi) => (
        <Card key={qi} className="p-4 space-y-3 border-l-2 border-l-primary/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Question {qi + 1}</span>
            {questions.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeQuestion(qi)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>

          <Textarea
            value={q.text}
            onChange={(e) => updateQuestion(qi, { text: e.target.value })}
            placeholder="Question text..."
            className="min-h-16"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                value={q.type || "single"}
                onValueChange={(v) => updateQuestion(qi, { ...emptyQuestion(v), text: q.text, explanation: q.explanation, points: q.points })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUIZ_QUESTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Marks</Label>
              <Input
                type="number"
                min={1}
                value={q.points ?? 1}
                onChange={(e) => updateQuestion(qi, { points: Number(e.target.value) || 1 })}
              />
            </div>
          </div>

          {(q.type === "single" || q.type === "multiple" || q.type === "true_false" || !q.type) && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Options</Label>
              {(q.options || []).map((opt, oi) => (
                <div key={oi} className="flex gap-2 items-center">
                  <Input
                    value={opt.text}
                    disabled={q.type === "true_false"}
                    onChange={(e) => {
                      const opts = [...(q.options || [])];
                      opts[oi] = { ...opts[oi], text: e.target.value };
                      updateQuestion(qi, { options: opts });
                    }}
                    placeholder={`Option ${oi + 1}`}
                  />
                  <label className="text-xs flex items-center gap-1 shrink-0 whitespace-nowrap">
                    <input
                      type={q.type === "multiple" ? "checkbox" : "radio"}
                      name={`q-${qi}-correct`}
                      checked={opt.isCorrect}
                      onChange={() => {
                        const opts = [...(q.options || [])];
                        if (q.type === "multiple") {
                          opts[oi] = { ...opts[oi], isCorrect: !opt.isCorrect };
                        } else {
                          opts.forEach((o, i) => { opts[i] = { ...o, isCorrect: i === oi }; });
                        }
                        updateQuestion(qi, { options: opts });
                      }}
                    />
                    Correct
                  </label>
                </div>
              ))}
              {q.type !== "true_false" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateQuestion(qi, { options: [...(q.options || []), { text: "", isCorrect: false }] })}
                >
                  Add option
                </Button>
              )}
            </div>
          )}

          {(q.type === "fill_blank" || q.type === "code_output" || q.type === "ordering") && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Correct Answer</Label>
              <Input
                value={(q.options?.[0]?.text) || ""}
                onChange={(e) => updateQuestion(qi, { options: [{ text: e.target.value, isCorrect: true }] })}
                placeholder={q.type === "ordering" ? "item1, item2, item3" : "Expected answer"}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Explanation</Label>
            <Textarea
              value={q.explanation || ""}
              onChange={(e) => updateQuestion(qi, { explanation: e.target.value })}
              placeholder="Shown after submission..."
              className="min-h-16"
            />
          </div>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={addQuestion} className="gap-1">
        <Plus className="w-4 h-4" /> Add Question
      </Button>
    </div>
  );
}
