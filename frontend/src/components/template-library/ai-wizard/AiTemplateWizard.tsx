import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import {
  AI_AUDIENCES,
  AI_QUESTION_TYPES,
  compositionTotal,
  defaultAiWizardState,
  loadAiTemplatePreferences,
  saveAiTemplatePreferences,
  type AiWizardState,
} from "@/lib/templateLibrary/aiWizardTypes";
import { generateAiTemplate, fillRemainingAiTemplate } from "@/lib/templateLibrary/api";
import { GenerationCoverageReview, isGenerationComplete } from "@/components/ai-quiz-designer/GenerationCoverageReview";
import type { AiGenerationPreview } from "@/lib/aiAssessmentStudio/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/toastStore";
import { scaleComposition } from "@/lib/aiQuizDesigner/defaultState";

const STEPS = [
  "Basics",
  "Difficulty",
  "Count",
  "Composition",
  "Bloom",
  "Media",
  "Modes",
  "Timer",
  "Scoring",
  "Generate",
  "Review",
  "Edit",
  "Save",
  "Done",
];

const GEN_STAGES = [
  "Thinking…",
  "Generating questions…",
  "Creating explanations…",
  "Generating images…",
  "Building template…",
  "Validating…",
];

const fieldClass =
  "border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:border-primary/50 focus-visible:ring-primary/30";

export function AiTemplateWizard() {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<AiWizardState>(() => defaultAiWizardState(loadAiTemplatePreferences()));
  const [genStage, setGenStage] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<AiGenerationPreview | null>(null);
  const [result, setResult] = useState<{ templateId?: string; quizId?: string } | null>(null);
  const [filling, setFilling] = useState(false);

  const compTotal = useMemo(() => compositionTotal(state.composition), [state.composition]);
  const compValid = compTotal === state.questionCount;
  const generationComplete = preview ? isGenerationComplete(preview, state.questionCount) : false;

  const patch = (p: Partial<AiWizardState>) => setState((s) => ({ ...s, ...p }));

  const setComposition = (type: string, value: number) => {
    setState((s) => ({
      ...s,
      composition: { ...s.composition, [type]: Math.max(0, value) },
    }));
  };

  const runGenerate = useCallback(async () => {
    setGenerating(true);
    setGenStage(0);
    const interval = window.setInterval(() => {
      setGenStage((g) => Math.min(g + 1, GEN_STAGES.length - 1));
    }, 1200);

    saveAiTemplatePreferences({
      audience: state.audience,
      difficulty: state.difficulty,
      questionCount: state.questionCount,
      composition: state.composition,
      bloomLevel: state.bloomLevel,
      media: state.media,
      modes: state.modes,
      timerMode: state.timerMode,
      scoring: state.scoring,
    });

    const res = await generateAiTemplate({
      title: state.title,
      subject: state.subject,
      description: state.description,
      audience: state.audience,
      difficulty: state.difficulty,
      questionCount: state.questionCount,
      composition: state.composition,
      bloomLevel: state.bloomLevel,
      media: state.media,
      modes: state.modes,
      timerMode: state.timerMode,
      scoring: state.scoring,
      saveAs: "quiz",
      category: state.category,
    });

    clearInterval(interval);
    setGenerating(false);

    if (res.error || !res.data?.data) {
      toast({ title: "Generation failed", description: res.error, variant: "destructive" });
      return;
    }

    const previewData = res.data.data.preview as any;
    setPreview({
      jobId: "template",
      config: { quizName: state.title, questionCount: state.questionCount, questionTypes: [], questionTypeDistribution: state.composition },
      source: "topic",
      questions: (previewData.questions || []).map((q: any) => ({ ...q, selected: true })),
      summary: {
        totalQuestions: previewData.summary?.totalQuestions ?? 0,
        requestedQuestions: previewData.summary?.requestedQuestions ?? state.questionCount,
        generatedQuestions: previewData.summary?.generatedQuestions ?? previewData.summary?.totalQuestions ?? 0,
        coveragePercent: previewData.summary?.coveragePercent ?? 100,
        isComplete: previewData.summary?.isComplete ?? true,
        byType: previewData.summary?.byType ?? {},
        byTypeRequested: previewData.summary?.byTypeRequested ?? state.composition,
        byDifficulty: {},
        byBloom: {},
        withAnswers: 0,
        averageConfidence: 0,
        qualityScore: 0,
        estimatedMinutes: previewData.summary?.estimatedMinutes ?? 0,
        warnings: res.data.data.partial ? [`AI generated ${previewData.summary?.generatedQuestions} of ${state.questionCount} requested questions`] : [],
        topicCoverage: [],
      },
    });
    setResult({ templateId: res.data.data.templateId, quizId: res.data.data.quizId });
    setStep(10);
  }, [state, toast]);

  const handleFillRemaining = useCallback(async () => {
    if (!preview) return;
    setFilling(true);
    const res = await fillRemainingAiTemplate({
      input: {
        title: state.title,
        subject: state.subject,
        description: state.description,
        audience: state.audience,
        difficulty: state.difficulty,
        questionCount: state.questionCount,
        composition: state.composition,
        bloomLevel: state.bloomLevel,
        media: state.media,
        modes: state.modes,
        timerMode: state.timerMode,
        scoring: state.scoring,
        saveAs: "quiz",
        category: state.category,
      },
      questions: preview.questions,
    });
    setFilling(false);
    if (res.error || !res.data?.data) {
      toast({ title: "Could not generate remaining", description: res.error, variant: "destructive" });
      return;
    }
    const data = res.data.data;
    const summary = data.preview?.summary as AiGenerationPreview["summary"] | undefined;
    setPreview({
      jobId: "template",
      config: { quizName: state.title, questionCount: state.questionCount, questionTypes: [], questionTypeDistribution: state.composition },
      source: "topic",
      questions: (data.questions || []).map((q) => ({ ...q, selected: true })),
      summary: {
        totalQuestions: summary?.totalQuestions ?? data.questions.length,
        requestedQuestions: state.questionCount,
        generatedQuestions: summary?.generatedQuestions ?? data.questions.length,
        coveragePercent: summary?.coveragePercent ?? 100,
        isComplete: summary?.isComplete ?? data.questions.length === state.questionCount,
        byType: (summary?.byType as Record<string, number>) ?? {},
        byTypeRequested: state.composition,
        byDifficulty: {},
        byBloom: {},
        withAnswers: 0,
        averageConfidence: 0,
        qualityScore: 0,
        estimatedMinutes: (summary?.estimatedMinutes as number) ?? 0,
        warnings: data.partial ? [`AI generated ${data.questions.length} of ${state.questionCount} requested questions`] : [],
        topicCoverage: [],
      },
    });
  }, [preview, state, toast]);

  const handleSave = async (saveAs: AiWizardState["saveAs"]) => {
    if (!generationComplete) {
      toast({
        title: "Incomplete generation",
        description: `Expected ${state.questionCount} questions. Generate remaining or retry.`,
        variant: "destructive",
      });
      return;
    }
    const res = await generateAiTemplate({ ...state, saveAs });
    if (res.error || !res.data?.data) {
      toast({ title: "Save failed", description: res.error, variant: "destructive" });
      return;
    }
    const { quizId, templateId } = res.data.data;
    toast({ title: "Template saved!", variant: "success" });
    if (quizId) navigate(`/instructor/quiz-room/quizzes/${quizId}/edit`);
    else if (templateId) navigate("/instructor/quiz-room/templates");
  };

  const canNext = () => {
    if (step === 0) return state.title.trim() && state.subject.trim();
    if (step === 3) return compValid;
    return true;
  };

  const goBack = () => {
    if (step === 0) navigate("/instructor/quiz-room/templates");
    else setStep((s) => s - 1);
  };

  return (
    <div className="flex min-h-full flex-col gap-6 pb-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-white/55">
            Step {step + 1} of {STEPS.length} — <span className="text-white/80">{STEPS[step]}</span>
          </p>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Template title">
              <Input value={state.title} onChange={(e) => patch({ title: e.target.value })} className={fieldClass} placeholder="e.g. Python Basics Midterm" />
            </Field>
            <Field label="Subject">
              <Input value={state.subject} onChange={(e) => patch({ subject: e.target.value })} className={fieldClass} placeholder="e.g. Computer Science" />
            </Field>
            <Field label="Description">
              <Textarea value={state.description} onChange={(e) => patch({ description: e.target.value })} className={fieldClass} rows={3} placeholder="What should this assessment cover?" />
            </Field>
            <Field label="Audience">
              <div className="flex flex-wrap gap-2">
                {AI_AUDIENCES.map((a) => (
                  <Chip key={a} active={state.audience === a} onClick={() => patch({ audience: a })}>{a}</Chip>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-wrap gap-2">
            {["easy", "medium", "hard", "mixed"].map((d) => (
              <Chip key={d} active={state.difficulty === d} onClick={() => patch({ difficulty: d })} className="capitalize">{d}</Chip>
            ))}
          </div>
        )}

        {step === 2 && (
          <Field label="How many questions?">
            <Input
              type="number"
              min={5}
              max={60}
              value={state.questionCount}
              onChange={(e) => {
                const n = Math.max(5, Math.min(60, Number(e.target.value) || 5));
                patch({
                  questionCount: n,
                  composition: scaleComposition(state.composition, n),
                });
              }}
              className={cn("max-w-xs", fieldClass)}
            />
          </Field>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className={cn("text-sm font-medium", compValid ? "text-emerald-400" : "text-amber-400")}>
              Total: {compTotal} / {state.questionCount}{" "}
              {compValid ? "✓" : "— Question distribution does not equal total questions"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {AI_QUESTION_TYPES.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="text-sm text-white/85">{t.label}</span>
                  <Input
                    type="number"
                    min={0}
                    className={cn("h-8 w-16 text-center", fieldClass)}
                    value={state.composition[t.id] ?? 0}
                    onChange={(e) => setComposition(t.id, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-wrap gap-2">
            {["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create", "Mixed"].map((b) => (
              <Chip key={b} active={state.bloomLevel === b} onClick={() => patch({ bloomLevel: b })}>{b}</Chip>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(state.media).map(([k, v]) => (
              <label key={k} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white/80 capitalize">
                <input type="checkbox" className="accent-primary" checked={v} onChange={(e) => patch({ media: { ...state.media, [k]: e.target.checked } })} />
                Generate {k.replace(/([A-Z])/g, " $1").trim()}
              </label>
            ))}
          </div>
        )}

        {step === 6 && (
          <div className="flex flex-wrap gap-2">
            {["live", "homework", "practice", "mock_test", "assignment"].map((m) => (
              <Chip
                key={m}
                active={state.modes.includes(m)}
                onClick={() => patch({ modes: state.modes.includes(m) ? state.modes.filter((x) => x !== m) : [...state.modes, m] })}
                className="capitalize"
              >
                {m.replace("_", " ")}
              </Chip>
            ))}
          </div>
        )}

        {step === 7 && (
          <div className="flex flex-wrap gap-2">
            {(["per_question", "whole_quiz", "none"] as const).map((t) => (
              <Chip key={t} active={state.timerMode === t} onClick={() => patch({ timerMode: t })} className="capitalize">
                {t.replace("_", " ")}
              </Chip>
            ))}
          </div>
        )}

        {step === 8 && (
          <div className="space-y-3">
            {["default", "negative marking", "custom", "xp", "leaderboard"].map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm capitalize text-white/80">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={
                    state.scoring.mode === s ||
                    (s === "negative marking" && state.scoring.negativeMarking) ||
                    (s === "xp" && state.scoring.xp) ||
                    (s === "leaderboard" && state.scoring.leaderboard)
                  }
                  onChange={() => {
                    if (s === "negative marking") patch({ scoring: { ...state.scoring, negativeMarking: !state.scoring.negativeMarking } });
                    else if (s === "xp") patch({ scoring: { ...state.scoring, xp: !state.scoring.xp } });
                    else if (s === "leaderboard") patch({ scoring: { ...state.scoring, leaderboard: !state.scoring.leaderboard } });
                    else patch({ scoring: { ...state.scoring, mode: s } });
                  }}
                />
                {s}
              </label>
            ))}
          </div>
        )}

        {step === 9 && (
          <div className="py-6 text-center">
            {generating ? (
              <div className="space-y-4">
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
                <p className="text-lg font-medium text-white/90">{GEN_STAGES[genStage]}</p>
              </div>
            ) : (
              <>
                <p className="mb-6 text-white/70">
                  Ready to generate {state.questionCount} questions for &ldquo;{state.title}&rdquo;
                </p>
                <Button size="lg" disabled={!compValid} onClick={runGenerate}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Template
                </Button>
              </>
            )}
          </div>
        )}

        {step === 10 && preview && (
          <div className="space-y-4">
            <GenerationCoverageReview
              preview={preview}
              requestedCount={state.questionCount}
              composition={state.composition}
              filling={filling}
              onFillRemaining={() => void handleFillRemaining()}
              onRetry={() => { setStep(9); void runGenerate(); }}
              onEditConfig={() => setStep(3)}
            />
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {preview.questions.map((q, i) => (
                <div key={q.id || i} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <span className="text-white/40">Q{i + 1} · {q.type}</span>
                  <p className="mt-1 text-white/85">{q.stem}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 11 && preview && (
          <p className="text-sm text-white/70">
            Edit questions in the Quiz Builder after saving. You can refine stems, options, media, and explanations there.
          </p>
        )}

        {step === 12 && (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => handleSave("template")}>Save as Template</Button>
            <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => handleSave("quiz")}>
              Save as Quiz
            </Button>
            <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => handleSave("both")}>
              Save Both
            </Button>
          </div>
        )}

        {step === 13 && result?.quizId && (
          <div className="py-4 text-center">
            <Check className="mx-auto mb-4 h-12 w-12 text-emerald-400" />
            <p className="mb-4 text-white/85">Your AI template is ready!</p>
            <Button onClick={() => navigate(`/instructor/quiz-room/quizzes/${result.quizId}/edit`)}>Open Quiz Builder</Button>
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 border-t border-white/10 pt-4">
        <Button variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={goBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {step < 9 && (
          <Button disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
        {step === 10 && (
          <Button disabled={!generationComplete} onClick={() => setStep(12)}>
            Continue to Save
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-white/70">{label}</Label>
      {children}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
  className,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70 hover:bg-white/15",
        className
      )}
    >
      {children}
    </button>
  );
}
