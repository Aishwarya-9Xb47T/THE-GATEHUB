import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
  Trash2,
  FileText,
} from "lucide-react";
import {
  BLOOM_LEVELS,
  CONTENT_SOURCES,
  EDUCATION_LEVELS,
  GENERATION_STAGES,
  PURPOSES,
  QUESTION_TYPES,
  QUIZ_BEHAVIORS,
  SUBJECTS,
  WIZARD_STEP_LABELS,
} from "@/lib/aiQuizDesigner/constants";
import {
  bloomTotal,
  compositionTotal,
  defaultDesignerState,
  resolvedLevel,
  resolvedSubject,
  scaleComposition,
} from "@/lib/aiQuizDesigner/defaultState";
import { saveDesignerDraft, loadDesignerDraft, clearDesignerDraft } from "@/lib/aiQuizDesigner/draft";
import { saveDesignerPreferences } from "@/lib/aiQuizDesigner/preferences";
import { buildDesignerPromptSummary, validateDesignerStep } from "@/lib/aiQuizDesigner/promptBuilder";
import {
  canGenerate,
  commitDesignerQuiz,
  logDesignerAnalytics,
  startDesignerGeneration,
} from "@/lib/aiQuizDesigner/api";
import { fillRemainingQuestions } from "@/lib/aiAssessmentStudio/api";
import { GenerationCoverageReview, isGenerationComplete } from "./GenerationCoverageReview";
import type { AiQuizDesignerState } from "@/lib/aiQuizDesigner/types";
import type { AiGeneratedQuestion, AiGenerationPreview } from "@/lib/aiAssessmentStudio/types";
import { MiniBarChart } from "./DesignerCharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/toastStore";

const fieldClass =
  "border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:border-primary/50";

const ANALYSIS_STAGES = [
  "Reading document…",
  "Extracting concepts…",
  "Finding learning outcomes…",
  "Generating question map…",
];

interface AiQuizDesignerWizardProps {
  embedded?: boolean;
  onBack?: () => void;
  identityContext?: import("@/lib/quizBranding/types").QuizIdentity;
}

export function AiQuizDesignerWizard({ embedded, onBack, identityContext }: AiQuizDesignerWizardProps) {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<AiQuizDesignerState>(() => {
    const base = defaultDesignerState();
    if (!identityContext) return base;
    const diff = identityContext.difficulty;
    const mappedDiff = diff === "easy" || diff === "hard" || diff === "mixed" ? diff : "medium";
    return {
      ...base,
      title: identityContext.title || base.title,
      subject: identityContext.subject || base.subject,
      difficulty: mappedDiff as AiQuizDesignerState["difficulty"],
      topicDetail: identityContext.description || identityContext.subtitle || base.topicDetail,
      rules: { ...base.rules, passingScore: identityContext.passingScore || base.rules.passingScore },
    };
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genStage, setGenStage] = useState(0);
  const [genMessage, setGenMessage] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<AiGenerationPreview | null>(null);
  const [questions, setQuestions] = useState<AiGeneratedQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  const compTotal = useMemo(() => compositionTotal(state.composition), [state.composition]);
  const generationComplete = preview ? isGenerationComplete(preview, state.questionCount) : false;
  const bloomSum = useMemo(() => bloomTotal(state.bloomDistribution), [state.bloomDistribution]);
  const summary = useMemo(() => buildDesignerPromptSummary(state), [state]);

  const patch = (p: Partial<AiQuizDesignerState>) => setState((s) => ({ ...s, ...p }));

  useEffect(() => {
    const draft = loadDesignerDraft();
    if (draft && !draftLoaded) {
      setState((s) => ({ ...s, ...draft.state, files: s.files }));
      setStep(draft.step);
      setDraftLoaded(true);
      toast({ title: "Draft resumed", description: "Continuing where you left off.", variant: "success" });
    }
  }, [draftLoaded, toast]);

  useEffect(() => {
    if (step < 11) saveDesignerDraft(step, state);
  }, [step, state]);

  const setComposition = (type: string, value: number) => {
    patch({ composition: { ...state.composition, [type]: Math.max(0, value) } });
  };

  const toggleSource = (id: string) => {
    patch({
      contentSources: state.contentSources.includes(id)
        ? state.contentSources.filter((s) => s !== id)
        : [...state.contentSources, id],
    });
  };

  const togglePurpose = (p: string) => {
    patch({
      purposes: state.purposes.includes(p) ? state.purposes.filter((x) => x !== p) : [...state.purposes, p],
    });
  };

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    for (let i = 0; i < ANALYSIS_STAGES.length; i++) {
      setAnalysisStage(i);
      await new Promise((r) => setTimeout(r, 700));
    }
    setAnalyzing(false);
    setStep(3);
  }, []);

  const runGenerate = useCallback(async () => {
    if (!canGenerate(state)) {
      toast({ title: "Complete required fields", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setGenStage(0);
    const interval = window.setInterval(() => setGenStage((g) => Math.min(g + 1, GENERATION_STAGES.length - 1)), 1400);

    saveDesignerPreferences({
      difficulty: state.difficulty,
      composition: state.composition,
      questionCount: state.questionCount,
      bloomDistribution: state.bloomDistribution,
      contentOptions: state.contentOptions,
      mediaPreferences: state.mediaPreferences,
      behaviors: state.behaviors,
      educationLevel: state.educationLevel,
    });

    void logDesignerAnalytics("generate_started", { title: state.title, questionCount: state.questionCount });

    const res = await startDesignerGeneration(state, setGenMessage);
    clearInterval(interval);
    setGenerating(false);

    if (res.error || !res.preview) {
      toast({ title: "Generation failed", description: res.error, variant: "destructive" });
      return;
    }

    setJobId(res.jobId ?? null);
    setPreview(res.preview);
    setQuestions(res.preview.questions.map((q) => ({ ...q, selected: true })));
    setStep(12);
    void logDesignerAnalytics("generate_complete", { count: res.preview.questions.length });
  }, [state, toast]);

  const handleFillRemaining = useCallback(async () => {
    if (!jobId) return;
    setFilling(true);
    const res = await fillRemainingQuestions(jobId);
    setFilling(false);
    if (res.error || !res.preview) {
      toast({ title: "Could not generate remaining", description: String(res.error), variant: "destructive" });
      return;
    }
    setPreview(res.preview);
    setQuestions(res.preview.questions.map((q) => ({ ...q, selected: true })));
  }, [jobId, toast]);

  const handleSave = async (saveAs: "quiz" | "template" | "both") => {
    if (!generationComplete) {
      toast({
        title: "Incomplete generation",
        description: `Expected ${state.questionCount} questions. Generate remaining or retry.`,
        variant: "destructive",
      });
      return;
    }
    if (!jobId) {
      toast({ title: "Nothing to save", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = await commitDesignerQuiz(jobId, state, questions, saveAs);
    setSaving(false);
    if (res.error || !res.quizId) {
      toast({ title: "Save failed", description: res.error, variant: "destructive" });
      return;
    }
    if (identityContext) {
      const { applyIdentityToQuiz } = await import("@/lib/quizBranding/identityApi");
      await applyIdentityToQuiz(res.quizId, identityContext);
    }
    clearDesignerDraft();
    toast({ title: "Assessment saved!", variant: "success" });
    setStep(15);
    navigate(`/instructor/quiz-room/quizzes/${res.quizId}/edit`, { state: { fromAiDesigner: true } });
  };

  const stepError = validateDesignerStep(step, state);

  const goNext = async () => {
    const err = validateDesignerStep(step, state);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    if (step === 2 && state.files.length > 0) {
      await runAnalysis();
      return;
    }
    if (step === 10) {
      setStep(11);
      return;
    }
    setStep((s) => Math.min(s + 1, WIZARD_STEP_LABELS.length - 1));
  };

  const goBack = () => {
    if (step === 0) {
      if (onBack) onBack();
      else navigate("/instructor/quiz-room/create");
      return;
    }
    setStep((s) => s - 1);
  };

  const deleteQuestion = (id: string) => setQuestions((qs) => qs.filter((q) => q.id !== id));

  const toggleQuestion = (id: string) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, selected: !q.selected } : q)));

  return (
    <div className={cn("flex flex-col gap-6", embedded ? "pb-4" : "min-h-full pb-8")}>
      {/* Hero */}
      <div className="text-center sm:text-left">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          AI Quiz Designer
        </div>
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Design your perfect assessment</h2>
        <p className="mt-2 text-sm text-white/55">
          An expert instructional designer guides you step-by-step — no manual prompts required.
        </p>
      </div>

      {/* Stepper */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>
            Step {step + 1} of {WIZARD_STEP_LABELS.length} — {WIZARD_STEP_LABELS[step]}
          </span>
          {loadDesignerDraft() && step < 11 && (
            <button type="button" className="text-primary hover:underline" onClick={() => {
              const d = loadDesignerDraft();
              if (d) { setState((s) => ({ ...s, ...d.state })); setStep(d.step); }
            }}>
              Resume draft
            </button>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((step + 1) / WIZARD_STEP_LABELS.length) * 100}%` }} />
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Quiz title"><Input className={fieldClass} value={state.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Computer Networks Midterm" /></Field>
            <Field label="Subject">
              <div className="flex flex-wrap gap-2 mb-2">{SUBJECTS.map((s) => <Chip key={s} active={state.subject === s} onClick={() => patch({ subject: s })}>{s}</Chip>)}</div>
              {state.subject === "Custom" && <Input className={fieldClass} value={state.customSubject} onChange={(e) => patch({ customSubject: e.target.value })} placeholder="Your subject" />}
            </Field>
            <Field label="Educational level">
              <div className="flex flex-wrap gap-2">{EDUCATION_LEVELS.map((l) => <Chip key={l} active={state.educationLevel === l} onClick={() => patch({ educationLevel: l })}>{l}</Chip>)}</div>
            </Field>
            <Field label="Purpose (choose all that apply)">
              <div className="flex flex-wrap gap-2">{PURPOSES.map((p) => <Chip key={p} active={state.purposes.includes(p)} onClick={() => togglePurpose(p)}>{p}</Chip>)}</div>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {CONTENT_SOURCES.map((src) => (
              <button key={src.id} type="button" onClick={() => toggleSource(src.id)} className={cn("rounded-xl border p-3 text-left text-sm transition-colors", state.contentSources.includes(src.id) ? "border-primary bg-primary/10 text-white" : "border-white/10 text-white/70 hover:bg-white/5")}>
                {src.label}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {analyzing ? (
              <div className="py-8 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-white/80">{ANALYSIS_STAGES[analysisStage]}</p>
              </div>
            ) : (
              <>
                {state.contentSources.includes("topic") && (
                  <Field label="What topic should AI cover?">
                    <Textarea className={fieldClass} rows={3} value={state.topicDetail} onChange={(e) => patch({ topicDetail: e.target.value })} placeholder="e.g. Subnetting, OOP in Java, Database Normalization" />
                  </Field>
                )}
                {state.contentSources.some((s) => ["pdf", "docx", "pptx", "image", "notes", "syllabus"].includes(s)) && (
                  <Field label="Upload documents">
                    <input type="file" multiple className="text-sm text-white/70" onChange={(e) => patch({ files: Array.from(e.target.files ?? []) })} />
                    {state.files.length > 0 && <p className="text-xs text-white/50">{state.files.length} file(s) selected</p>}
                  </Field>
                )}
                {state.contentSources.includes("text") && (
                  <Field label="Paste text"><Textarea className={fieldClass} rows={4} value={state.pastedText} onChange={(e) => patch({ pastedText: e.target.value })} /></Field>
                )}
                {state.contentSources.includes("website") && (
                  <Field label="Website URL"><Input className={fieldClass} value={state.websiteUrl} onChange={(e) => patch({ websiteUrl: e.target.value })} placeholder="https://..." /></Field>
                )}
                {state.contentSources.includes("youtube") && (
                  <Field label="YouTube URL"><Input className={fieldClass} value={state.youtubeUrl} onChange={(e) => patch({ youtubeUrl: e.target.value })} placeholder="https://youtube.com/..." /></Field>
                )}
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Field label="How many questions?">
              <Input
                type="number"
                min={5}
                max={60}
                className={cn("max-w-xs", fieldClass)}
                value={state.questionCount}
                onChange={(e) => {
                  const n = Math.max(5, Math.min(60, Number(e.target.value) || 5));
                  patch({
                    questionCount: n,
                    composition: scaleComposition(state.composition, n),
                  });
                }}
              />
            </Field>
            <p className={cn("text-sm font-medium", compTotal === state.questionCount ? "text-emerald-400" : "text-amber-400")}>
              {compTotal} / {state.questionCount} questions allocated
              {compTotal !== state.questionCount && " — Question distribution does not equal total questions"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {QUESTION_TYPES.map((t) => (
                <div key={t.id} className="space-y-1 rounded-lg border border-white/10 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>{t.label}</span>
                    <Input type="number" min={0} className={cn("h-8 w-16 text-center", fieldClass)} value={state.composition[t.id] ?? 0} onChange={(e) => setComposition(t.id, Number(e.target.value))} />
                  </div>
                  <input type="range" min={0} max={state.questionCount} value={state.composition[t.id] ?? 0} onChange={(e) => setComposition(t.id, Number(e.target.value))} className="w-full accent-primary" />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["easy", "medium", "hard", "mixed"] as const).map((d) => (
                <Chip key={d} active={state.difficulty === d} onClick={() => patch({ difficulty: d })} className="capitalize">{d}</Chip>
              ))}
            </div>
            {state.difficulty === "mixed" && (
              <div className="space-y-3 pt-2">
                {(["easy", "medium", "hard"] as const).map((d) => (
                  <div key={d} className="flex items-center gap-3">
                    <span className="w-16 capitalize text-sm text-white/70">{d}</span>
                    <input type="range" min={0} max={100} className="flex-1 accent-primary" value={state.difficultyMix[d]} onChange={(e) => patch({ difficultyMix: { ...state.difficultyMix, [d]: Number(e.target.value) } })} />
                    <span className="w-10 text-right text-sm tabular-nums">{state.difficultyMix[d]}%</span>
                  </div>
                ))}
                <MiniBarChart data={state.difficultyMix as unknown as Record<string, number>} />
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">Total: {bloomSum}% (aim for 100%)</p>
            {BLOOM_LEVELS.map((b) => (
              <div key={b} className="flex items-center gap-3">
                <span className="w-24 text-sm text-white/70">{b}</span>
                <input type="range" min={0} max={50} className="flex-1 accent-primary" value={state.bloomDistribution[b] ?? 0} onChange={(e) => patch({ bloomDistribution: { ...state.bloomDistribution, [b]: Number(e.target.value) } })} />
                <span className="w-10 text-right text-sm tabular-nums">{state.bloomDistribution[b] ?? 0}%</span>
              </div>
            ))}
            <MiniBarChart data={state.bloomDistribution} />
          </div>
        )}

        {step === 6 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.keys(state.contentOptions).map((k) => (
              <label key={k} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm capitalize text-white/80">
                <input type="checkbox" className="accent-primary" checked={state.contentOptions[k]} onChange={(e) => patch({ contentOptions: { ...state.contentOptions, [k]: e.target.checked } })} />
                {k.replace(/([A-Z])/g, " $1")}
              </label>
            ))}
          </div>
        )}

        {step === 7 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.keys(state.mediaPreferences).map((k) => (
              <label key={k} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm capitalize text-white/80">
                <input type="checkbox" className="accent-primary" checked={state.mediaPreferences[k]} onChange={(e) => patch({ mediaPreferences: { ...state.mediaPreferences, [k]: e.target.checked } })} />
                {k.replace(/([A-Z])/g, " $1")}
              </label>
            ))}
          </div>
        )}

        {step === 8 && (
          <div className="flex flex-wrap gap-2">
            {QUIZ_BEHAVIORS.map((b) => (
              <Chip key={b} active={state.behaviors.includes(b)} onClick={() => patch({ behaviors: state.behaviors.includes(b) ? state.behaviors.filter((x) => x !== b) : [...state.behaviors, b] })}>{b}</Chip>
            ))}
          </div>
        )}

        {step === 9 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["questionTimer", "Question timer"],
              ["wholeQuizTimer", "Whole quiz timer"],
              ["randomizeQuestions", "Randomize questions"],
              ["randomizeOptions", "Randomize options"],
              ["showExplanations", "Show explanations"],
              ["leaderboard", "Leaderboard"],
              ["negativeMarking", "Negative marking"],
              ["xp", "XP"],
              ["streaks", "Streaks"],
              ["retake", "Allow retake"],
              ["certificate", "Certificate"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" className="accent-primary" checked={state.rules[key as keyof typeof state.rules] as boolean} onChange={(e) => patch({ rules: { ...state.rules, [key]: e.target.checked } })} />
                {label}
              </label>
            ))}
            <Field label="Passing score %">
              <Input type="number" className={cn("max-w-xs", fieldClass)} value={state.rules.passingScore} onChange={(e) => patch({ rules: { ...state.rules, passingScore: Number(e.target.value) } })} />
            </Field>
          </div>
        )}

        {step === 10 && (
          <div className="space-y-4 text-sm">
            <h3 className="text-lg font-semibold text-white">Review your design plan</h3>
            <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <Row label="Title" value={summary.title} />
              <Row label="Subject" value={summary.subject} />
              <Row label="Level" value={summary.level} />
              <Row label="Questions" value={String(summary.questionCount)} />
              <Row label="Mix" value={summary.composition} />
              <Row label="Difficulty" value={summary.difficulty} />
              <Row label="Bloom" value={summary.bloom} />
              <Row label="Media" value={summary.media} />
              <Row label="Est. duration" value={`${summary.estimatedMinutes} min`} />
            </div>
          </div>
        )}

        {step === 11 && (
          <div className="py-8 text-center">
            {generating ? (
              <div className="space-y-4">
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                <p className="text-lg font-medium text-white">{GENERATION_STAGES[genStage]}</p>
                {genMessage && <p className="text-sm text-white/50">{genMessage}</p>}
              </div>
            ) : (
              <>
                <Sparkles className="mx-auto mb-4 h-12 w-12 text-primary" />
                <p className="mb-6 text-white/70">AI will build {state.questionCount} questions for &ldquo;{state.title}&rdquo;</p>
                <Button size="lg" disabled={!canGenerate(state)} onClick={runGenerate}>Generate Assessment</Button>
              </>
            )}
          </div>
        )}

        {step === 12 && preview && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Assessment overview</h3>
            <GenerationCoverageReview
              preview={preview}
              requestedCount={state.questionCount}
              composition={state.composition}
              difficultyMix={state.difficulty === "mixed" ? state.difficultyMix : undefined}
              filling={filling}
              onFillRemaining={jobId ? handleFillRemaining : undefined}
              onRetry={() => { setStep(11); void runGenerate(); }}
              onEditConfig={() => setStep(4)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <MiniBarChart data={preview.summary.byType} />
              <MiniBarChart data={preview.summary.byDifficulty} />
              <MiniBarChart data={preview.summary.byBloom} />
            </div>
            <p className="text-sm text-white/60">
              ~{preview.summary.estimatedMinutes} min · Quality {preview.summary.qualityScore}%
            </p>
            {preview.summary.warnings.length > 0 && (
              <p className="text-sm text-amber-400">{preview.summary.warnings.join(" ")}</p>
            )}
          </div>
        )}

        {step === 13 && (
          <div className="space-y-3">
            <p className="text-sm text-white/60">Review, remove, or lock questions before saving.</p>
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {questions.map((q, i) => (
                <div key={q.id} className={cn("rounded-lg border p-3 text-sm", q.selected ? "border-white/15 bg-white/[0.03]" : "border-white/5 opacity-50")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-white/40">Q{i + 1} · {q.type} · {q.difficulty}</span>
                      <p className="mt-1 text-white/85">{q.stem}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-white/60" onClick={() => toggleQuestion(q.id)} title="Toggle include">
                        <Check className={cn("h-4 w-4", q.selected && "text-emerald-400")} />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => deleteQuestion(q.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 14 && (
          <div className="flex flex-wrap gap-3">
            <Button disabled={saving || !generationComplete} onClick={() => handleSave("quiz")}><FileText className="mr-2 h-4 w-4" />Save as Quiz</Button>
            <Button variant="outline" className="border-white/20 bg-transparent text-white" disabled={saving || !generationComplete} onClick={() => handleSave("template")}>Save as Template</Button>
            <Button variant="outline" className="border-white/20 bg-transparent text-white" disabled={saving || !generationComplete} onClick={() => handleSave("both")}>Save Both</Button>
            {!generationComplete && (
              <p className="w-full text-xs text-amber-400">Complete generation ({preview?.summary.generatedQuestions ?? preview?.summary.totalQuestions}/{state.questionCount}) before saving.</p>
            )}
            <p className="w-full text-xs text-white/40">PDF / QTI / Moodle export coming soon — save to Quiz Builder first.</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      {step !== 11 && step < 15 && (
        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4">
          <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={goBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back
          </Button>
          {step < 10 && (
            <Button disabled={Boolean(stepError) || analyzing} onClick={goNext}>
              Continue<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          {step === 10 && (
            <Button disabled={!canGenerate(state)} onClick={() => setStep(11)}>
              Continue to Generate<Sparkles className="ml-2 h-4 w-4" />
            </Button>
          )}
          {step === 12 && (
            <Button disabled={!generationComplete} onClick={() => setStep(13)}>
              Review Questions
            </Button>
          )}
          {step === 13 && (
            <Button disabled={!generationComplete} onClick={() => setStep(14)}>
              Continue to Save
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="text-white/70">{label}</Label>{children}</div>;
}

function Chip({ children, active, onClick, className }: { children: React.ReactNode; active: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70 hover:bg-white/15", className)}>
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 py-1.5 last:border-0">
      <span className="text-white/50">{label}</span>
      <span className="text-right text-white/85">{value}</span>
    </div>
  );
}
