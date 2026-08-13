import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToastStore } from "@/store/toastStore";
import { Search, Loader2 } from "lucide-react";
import { listBankQuestions, materializeQuizFromBank } from "@/lib/assessmentStudio/api";
import { QUESTION_TYPE_LABELS } from "@/lib/assessmentStudio/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuizIdentity } from "@/lib/quizBranding/types";
import { applyIdentityToQuiz } from "@/lib/quizBranding/identityApi";
import { cn } from "@/lib/utils";

interface BankReuseStepProps {
  quizTitle: string;
  onTitleChange: (title: string) => void;
  onQuizCreated: (quizId: string, title: string) => void;
  identity?: QuizIdentity;
}

export function BankReuseStep({ quizTitle, onTitleChange, onQuizCreated, identity }: BankReuseStepProps) {
  const toast = useToastStore((s) => s.add);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["bank-reuse", search],
    queryFn: async () => {
      const res = await listBankQuestions({ q: search, limit: 48, status: "published" });
      return res.data?.data?.items || [];
    },
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleCreate = async () => {
    if (!quizTitle.trim()) {
      toast({ title: "Enter a quiz title", variant: "destructive" });
      return;
    }
    if (selected.size === 0) {
      toast({ title: "Select at least one question", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = await materializeQuizFromBank(quizTitle.trim(), [...selected]);
    setSaving(false);
    if (res.error || !res.data?.data?.id) {
      toast({ title: "Failed to create quiz", description: res.error, variant: "destructive" });
      return;
    }
    const quizId = res.data.data.id;
    if (identity) {
      await applyIdentityToQuiz(quizId, { ...identity, title: quizTitle.trim() });
    }
    onQuizCreated(quizId, quizTitle.trim());
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Reuse from Question Bank</h2>
        <p className="mt-1 text-white/60">Select questions to bundle into a new quiz.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-white/80">Quiz title</Label>
        <Input
          value={quizTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Arrays Review Quiz"
          className="border-white/10 bg-white/5 text-white"
        />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <Input
          className="border-white/10 bg-white/5 pl-10 text-white"
          placeholder="Search questions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="max-h-[40vh] space-y-2 overflow-y-auto">
          {(data || []).map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => toggle(q.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                selected.has(q.id)
                  ? "border-primary/50 bg-primary/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              )}
            >
              <Checkbox checked={selected.has(q.id)} className="mt-1" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium text-white">{q.stem}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="outline" className="border-white/20 text-[10px] text-white/70">
                    {QUESTION_TYPE_LABELS[q.type] || q.type}
                  </Badge>
                  {q.difficulty && (
                    <Badge variant="outline" className="border-white/20 text-[10px] text-white/70">
                      {q.difficulty}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Button onClick={handleCreate} disabled={saving || selected.size === 0}>
        {saving ? "Creating quiz…" : `Create quiz with ${selected.size} question${selected.size !== 1 ? "s" : ""}`}
      </Button>
    </div>
  );
}
