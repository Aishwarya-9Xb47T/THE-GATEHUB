import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { createBankQuestion, materializeQuizFromBank } from "@/lib/assessmentStudio/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToastStore } from "@/store/toastStore";

interface ManualQuestion {
  stem: string;
  options: string[];
  correctIndex: number;
}

interface ManualQuizStepProps {
  onQuizCreated: (quizId: string, title: string) => void;
}

export function ManualQuizStep({ onQuizCreated }: ManualQuizStepProps) {
  const toast = useToastStore((s) => s.add);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<ManualQuestion[]>([
    { stem: "", options: ["", "", "", ""], correctIndex: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const updateQuestion = (index: number, patch: Partial<ManualQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Quiz title required", variant: "destructive" });
      return;
    }
    const valid = questions.filter((q) => q.stem.trim() && q.options.filter((o) => o.trim()).length >= 2);
    if (!valid.length) {
      toast({ title: "Add at least one complete question", variant: "destructive" });
      return;
    }

    setSaving(true);
    const questionIds: string[] = [];

    for (const q of valid) {
      const opts = q.options.filter((o) => o.trim()).map((text, i) => ({
        text: text.trim(),
        isCorrect: i === q.correctIndex,
        order: i,
      }));
      const res = await createBankQuestion({
        stem: q.stem.trim(),
        type: "multiple_choice",
        difficulty: "medium",
        bloomLevel: "L2",
        source: "manual",
        status: "published",
        options: opts,
        tags: ["manual"],
      });
      if (res.data?.data?.id) questionIds.push(res.data.data.id);
    }

    if (!questionIds.length) {
      setSaving(false);
      toast({ title: "Failed to save questions", variant: "destructive" });
      return;
    }

    const quizRes = await materializeQuizFromBank(title.trim(), questionIds);
    setSaving(false);

    if (quizRes.error || !quizRes.data?.data?.id) {
      toast({ title: "Failed to create quiz", description: quizRes.error, variant: "destructive" });
      return;
    }

    onQuizCreated(quizRes.data.data.id, title.trim());
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Create manually</h2>
        <p className="mt-1 text-white/60">Add questions one by one. They are saved to your library for reuse.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-white/80">Quiz title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Week 3 Review"
          className="border-white/10 bg-white/5 text-white"
        />
      </div>

      <div className="space-y-4">
        {questions.map((q, qi) => (
          <div key={qi} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white/70">Question {qi + 1}</span>
              {questions.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/50"
                  onClick={() => setQuestions(questions.filter((_, i) => i !== qi))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Textarea
              value={q.stem}
              onChange={(e) => updateQuestion(qi, { stem: e.target.value })}
              placeholder="Question text…"
              rows={2}
              className="border-white/10 bg-white/5 text-white"
            />
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex gap-2">
                <input
                  type="radio"
                  name={`correct-${qi}`}
                  checked={q.correctIndex === oi}
                  onChange={() => updateQuestion(qi, { correctIndex: oi })}
                  className="mt-3"
                />
                <Input
                  value={opt}
                  onChange={(e) => {
                    const options = [...q.options];
                    options[oi] = e.target.value;
                    updateQuestion(qi, { options });
                  }}
                  placeholder={`Option ${oi + 1}`}
                  className="border-white/10 bg-white/5 text-white"
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
          onClick={() =>
            setQuestions([...questions, { stem: "", options: ["", "", "", ""], correctIndex: 0 }])
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Question
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save Quiz"
          )}
        </Button>
      </div>
    </div>
  );
}
