import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Save, CheckCircle } from "lucide-react";
import {
  getBankQuestion,
  createBankQuestion,
  updateBankQuestion,
  submitQuestionForReview,
  approveQuestion,
} from "@/lib/assessmentStudio/api";
import { QUESTION_TYPE_LABELS } from "@/lib/assessmentStudio/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToastStore } from "@/store/toastStore";
import { questionBankPath, questionEditorPath } from "@/lib/assessment/migrationLog";

export function QuestionEditorPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const isNew = questionId === "new";
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);

  const [stem, setStem] = useState("");
  const [type, setType] = useState("multiple_choice");
  const [difficulty, setDifficulty] = useState("medium");
  const [bloomLevel, setBloomLevel] = useState("L2");
  const [explanation, setExplanation] = useState("");
  const [topic, setTopic] = useState("");
  const [tags, setTags] = useState("");
  const [options, setOptions] = useState([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);
  const [saving, setSaving] = useState(false);

  const { data: question } = useQuery({
    queryKey: ["bank-question", questionId],
    enabled: !isNew && !!questionId,
    queryFn: async () => {
      const res = await getBankQuestion(questionId!);
      return res.data?.data;
    },
  });

  useEffect(() => {
    if (!question) return;
    setStem(question.stem);
    setType(question.type);
    setDifficulty(question.difficulty || "medium");
    setBloomLevel(question.bloomLevel || "L2");
    setExplanation(question.explanation || "");
    setTopic(question.topic || "");
    setTags(Array.isArray(question.tags) ? question.tags.join(", ") : "");
    if (question.options?.length) {
      setOptions(question.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })));
    }
  }, [question]);

  const payload = () => ({
    stem,
    type,
    difficulty,
    bloomLevel,
    explanation,
    topic: topic || undefined,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    options: options.filter((o) => o.text.trim()).map((o, i) => ({ ...o, order: i })),
  });

  const handleSave = async () => {
    if (!stem.trim()) {
      toast({ title: "Question stem required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = isNew
      ? await createBankQuestion(payload())
      : await updateBankQuestion(questionId!, payload());
    setSaving(false);
    if (res.error) return toast({ title: "Save failed", description: res.error, variant: "destructive" });
    toast({ title: "Question saved", variant: "success" });
    if (isNew && res.data?.data.id) navigate(questionEditorPath(res.data.data.id), { replace: true });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={questionBankPath()}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="page-title">{isNew ? "New Question" : "Edit Question"}</h1>
          {question && <Badge variant="outline" className="mt-1">{question.status}</Badge>}
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <>
              <Button variant="outline" onClick={async () => {
                await submitQuestionForReview(questionId!);
                toast({ title: "Submitted for review", variant: "success" });
              }}>
                Submit Review
              </Button>
              <Button variant="secondary" onClick={async () => {
                await approveQuestion(questionId!);
                toast({ title: "Published", variant: "success" });
              }}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve
              </Button>
            </>
          )}
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Stem (Markdown supported)</Label>
            <Textarea value={stem} onChange={(e) => setStem(e.target.value)} rows={4} placeholder="Enter the question…" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(QUESTION_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Bloom Level</Label>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={bloomLevel} onChange={(e) => setBloomLevel(e.target.value)}>
                {["L1", "L2", "L3", "L4", "L5", "L6"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Topic</Label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Arrays" />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma-separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="graphs, BFS, interview" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="radio"
                name="correct"
                checked={opt.isCorrect}
                onChange={() => setOptions(options.map((o, j) => ({ ...o, isCorrect: j === i })))}
              />
              <Input
                value={opt.text}
                onChange={(e) => {
                  const next = [...options];
                  next[i] = { ...next[i]!, text: e.target.value };
                  setOptions(next);
                }}
                placeholder={`Option ${i + 1}`}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
                disabled={options.length <= 2}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setOptions([...options, { text: "", isCorrect: false }])}>
            <Plus className="mr-2 h-4 w-4" />
            Add Option
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Explanation</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3} placeholder="Why is this the correct answer?" />
        </CardContent>
      </Card>

      {question?.validations?.[0] && (
        <Card>
          <CardHeader>
            <CardTitle>AI Validation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Badge variant={question.validations[0].status === "passed" ? "default" : "destructive"}>
              {question.validations[0].status}
            </Badge>
            {Object.entries(question.validations[0].checks || {}).map(([key, check]) => (
              <p key={key} className={check.passed ? "text-emerald-600" : "text-destructive"}>
                {key}: {check.passed ? "✓" : check.message}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
