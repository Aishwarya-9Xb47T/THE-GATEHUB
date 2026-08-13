import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Undo2, Redo2 } from "lucide-react";
import { useAiAssessmentStore } from "@/lib/aiAssessmentStudio/store";
import { useAiGeneration } from "@/lib/aiAssessmentStudio/useAiGeneration";
import { commitAiToQuiz } from "@/lib/aiAssessmentStudio/api";
import { AiStudioHero } from "./AiStudioHero";
import { AiSourceStep } from "./AiSourceStep";
import { AiConfigStep } from "./AiConfigStep";
import { AiGeneratingStep } from "./AiGeneratingStep";
import { AiReviewStep } from "./AiReviewStep";
import { AiCopilotPanel } from "./AiCopilotPanel";
import { AiComparisonDialog } from "./AiComparisonDialog";
import { AiErrorDialog } from "./AiErrorDialog";
import { AiGenerationErrorBoundary } from "./AiGenerationErrorBoundary";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";
import { useState } from "react";

const STEPS = ["Choose Source", "Configure AI", "Generating", "Review & Export"] as const;

interface AiAssessmentStudioProps {
  onBack?: () => void;
}

function AiAssessmentStudioInner({ onBack }: AiAssessmentStudioProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);
  const [committing, setCommitting] = useState(false);
  const [commitStage, setCommitStage] = useState("");

  const {
    step,
    source,
    config,
    url,
    text,
    file,
    preview,
    progress,
    setStep,
    setSource,
    patchConfig,
    setUrl,
    setText,
    setFile,
    setPreview,
    updateQuestion,
    toggleQuestion,
    undo,
    redo,
    undoStack,
    redoStack,
  } = useAiAssessmentStore();

  const {
    isGenerating,
    error,
    errorOpen,
    pendingDemoPreview,
    generate,
    retry,
    dismissError,
    continueOffline,
  } = useAiGeneration();

  const stepIndex = step === "sources" ? 0 : step === "config" ? 1 : step === "generating" ? 2 : 3;

  const handlePrompt = (prompt: string) => {
    setSource("topic");
    patchConfig({ quizName: prompt, topic: prompt, subject: prompt.split(" ").slice(-2)[0] });
    setText(prompt);
    setStep("config");
  };

  const handleCommit = async () => {
    if (!preview) return;
    setCommitting(true);
    setCommitStage("Creating quiz…");
    const selected = preview.questions.filter((q) => q.selected);
    const ids = selected.map((q) => q.id);
    const res = await commitAiToQuiz(preview.jobId, config.quizName, {
      questionIds: ids,
      questions: selected,
    });
    if (res.error || !res.data?.quizId) {
      setCommitting(false);
      setCommitStage("");
      toast({ title: "Save failed", description: res.error, variant: "destructive" });
      return;
    }
    if (res.data.editor) {
      queryClient.setQueryData(["quiz-editor", res.data.quizId], res.data.editor);
    }
    setCommitStage("Opening builder…");
    toast({
      title: "Quiz ready in builder",
      description: `${res.data.imported} questions — edit and publish when ready.`,
      variant: "success",
    });
    navigate(`/instructor/quiz-room/quizzes/${res.data.quizId}/edit`, { state: { fromContentBuilder: true } });
    setCommitting(false);
    setCommitStage("");
  };

  const goNext = () => {
    if (step === "sources" && source) setStep("config");
    else if (step === "config") void generate();
    else if (step === "review") void handleCommit();
  };

  const goBack = () => {
    if (step === "config") setStep("sources");
    else if (step === "review") setStep("config");
    else onBack?.();
  };

  const canNext =
    (step === "sources" && !!source) ||
    (step === "config" && config.quizName.trim() && !isGenerating) ||
    (step === "review" && preview && preview.questions.some((q) => q.selected));

  const isReview = step === "review" && preview;

  return (
    <div className="relative min-h-0 flex-1">
      {step !== "review" && (
        <AiStudioHero
          onQuickAction={(src) => {
            setSource(src);
            setStep("config");
          }}
        />
      )}

      <div className="mb-6 flex gap-2 overflow-x-auto">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              i === stepIndex ? "bg-primary text-primary-foreground" : i < stepIndex ? "bg-white/10 text-white/70" : "text-white/30"
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className={isReview ? "grid gap-6 lg:grid-cols-[1fr_340px]" : ""}>
        <div className="min-w-0">
          {step === "sources" && (
            <AiSourceStep selected={source} onSelect={setSource} onPrompt={handlePrompt} />
          )}
          {step === "config" && source && (
            <AiConfigStep
              source={source}
              config={config}
              url={url}
              text={text}
              file={file}
              onPatch={patchConfig}
              onUrl={setUrl}
              onText={setText}
              onFile={setFile}
            />
          )}
          {step === "generating" && <AiGeneratingStep progress={progress} />}
          {isReview && (
            <AiReviewStep
              preview={preview}
              onToggle={toggleQuestion}
              onUpdate={updateQuestion}
              onDelete={(id) =>
                setPreview({
                  ...preview,
                  questions: preview.questions.filter((q) => q.id !== id),
                })
              }
            />
          )}
        </div>

        {isReview && (
          <div className="lg:min-h-0">
            <AiCopilotPanel />
          </div>
        )}
      </div>

      {step !== "generating" && (
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <Button variant="ghost" className="text-white/70" onClick={goBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex gap-2">
            {isReview && (
              <>
                <Button variant="outline" size="sm" className="border-white/20" disabled={!undoStack.length} onClick={undo}>
                  <Undo2 className="mr-1 h-4 w-4" />
                  Undo
                </Button>
                <Button variant="outline" size="sm" className="border-white/20" disabled={!redoStack.length} onClick={redo}>
                  <Redo2 className="mr-1 h-4 w-4" />
                  Redo
                </Button>
              </>
            )}
            <Button onClick={goNext} disabled={!canNext || committing || isGenerating}>
              {committing || isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : step === "review" ? (
                <Sparkles className="mr-2 h-4 w-4" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              {step === "review"
                ? committing
                  ? commitStage || "Opening in Quiz Builder…"
                  : "Open in Quiz Builder"
                : step === "config"
                  ? "Generate with AI"
                  : "Continue"}
            </Button>
          </div>
        </div>
      )}

      <AiComparisonDialog />
      <AiErrorDialog
        open={errorOpen}
        error={error}
        demoMode={pendingDemoPreview || preview?.demoMode}
        onRetry={error?.retryable ? retry : undefined}
        onDismiss={dismissError}
        onContinueOffline={error?.offlineFallback && !pendingDemoPreview ? continueOffline : undefined}
      />
    </div>
  );
}

export function AiAssessmentStudio(props: AiAssessmentStudioProps) {
  return (
    <AiGenerationErrorBoundary>
      <AiAssessmentStudioInner {...props} />
    </AiGenerationErrorBoundary>
  );
}
