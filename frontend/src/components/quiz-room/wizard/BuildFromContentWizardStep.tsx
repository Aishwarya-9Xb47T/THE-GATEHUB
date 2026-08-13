import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Chrome, AlignLeft, Upload, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  analyzeFile,
  analyzePaste,
  commitQuestions,
  mergeExtractionPayloads,
  patchJobQuestions,
} from "@/lib/contentBuilder/api";
import type { ContentBuilderReviewPayload, ReviewQuestion } from "@/lib/contentBuilder/types";
import { GoogleWorkspaceFlow } from "@/components/google-workspace/GoogleWorkspaceFlow";
import { ProcessingScreen } from "@/components/build-from-content/AnalyzingScreen";
import { ExtractionSummaryPanel } from "@/components/content-builder/ExtractionSummaryPanel";
import { AssessmentReviewWorkspace } from "@/components/assessment-review/AssessmentReviewWorkspace";
import type { AssessmentDocument } from "@/lib/assessment/types";

type ContentSource = "learning_material" | "google_workspace" | "paste_text";
type Step = "source-select" | "upload" | "extracting" | "review";

function toAssessmentDocument(payload: ContentBuilderReviewPayload, sourceType: string): AssessmentDocument {
  const now = new Date();
  const questions = payload.questions.map((q, idx) => {
    const children = (q as any).children ?? q.metadata?.children;
    return {
      id: q.id,
      type: normalizeQuestionType(q.type),
      text: q.text,
      options: (q.options || []).map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: Boolean(o.isCorrect),
        order: o.order,
      })),
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      sectionId: "default-section",
      order: idx,
      confidence: q.confidence <= 1 ? Math.round(q.confidence * 100) : q.confidence,
      metadata: {
        ...(q.metadata || {}),
        sourcePage: (q as any).sourcePage ?? q.metadata?.sourcePage,
        sourceSlide: q.metadata?.sourceSlide,
        children,
        // Preserve code/table for editor after review → commit
        code: q.metadata?.code,
        starterCode: q.metadata?.starterCode,
        language: q.metadata?.language,
        table: q.metadata?.table ?? (q as any).table,
        tables: q.metadata?.tables ?? (q as any).tables,
      },
      ...(children ? { children } : {}),
    };
  });

  return {
    metadata: {
      provider: "local",
      sourceType: sourceType as "pdf" | "docx" | "txt",
      title: payload.diagnostics?.fileName || "Extracted Questions",
      createdAt: now,
      processedAt: now,
    },
    sections: [
      {
        id: "default-section",
        title: "All Questions",
        questionIds: questions.map((q) => q.id),
        order: 0,
      },
    ],
    questions,
    images: [],
    tables: [],
    confidence: {
      overall: questions.length
        ? Math.round(questions.reduce((acc, q) => acc + (q.confidence ?? 90), 0) / questions.length)
        : 100,
      byQuestion: questions.map((q) => q.confidence ?? 90),
    },
    validation: {
      valid: true,
      issues: payload.diagnostics?.warnings?.map((w) => ({
        type: "format-error" as const,
        message: w,
        severity: "warning" as const,
      })) ?? [],
    },
  };
}

function normalizeQuestionType(type: string): AssessmentDocument["questions"][number]["type"] {
  const map: Record<string, AssessmentDocument["questions"][number]["type"]> = {
    multiple_choice: "multiple-choice",
    multiple_select: "multiple-select",
    true_false: "true-false",
    short_answer: "short-answer",
    long_answer: "essay",
    fill_blank: "fill-blank",
    matching: "matching",
    matrix: "matching",
    essay: "essay",
  };
  return map[type] ?? "multiple-choice";
}

function reviewQuestionsToPatchPayload(questions: AssessmentDocument["questions"]) {
  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    explanation: q.explanation,
    options: Array.isArray(q.options)
      ? q.options.map((opt, i) => ({
          id: typeof opt === 'object' && opt && 'id' in opt ? String((opt as any).id) : undefined,
          text: typeof opt === 'string' ? opt : String((opt as any).text ?? opt),
          isCorrect: typeof opt === 'object' && opt && 'isCorrect' in opt ? Boolean((opt as any).isCorrect) : undefined,
          order: i,
        }))
      : undefined,
    correctAnswer: (q as any).correctAnswer,
    metadata: {
      ...((q.metadata as object) || {}),
      children: (q as any).children ?? (q.metadata as any)?.children,
    },
  }));
}

interface BuildFromContentWizardStepProps {
  quizId?: string;
  quizTitle?: string;
  onBack: () => void;
  onQuizCreated: (quizId: string, quizTitle: string) => void;
}

export function BuildFromContentWizardStep({ quizId, quizTitle, onBack, onQuizCreated }: BuildFromContentWizardStepProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("source-select");
  const [selectedSource, setSelectedSource] = useState<ContentSource | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ContentBuilderReviewPayload | null>(null);
  const [reviewDocument, setReviewDocument] = useState<AssessmentDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const SOURCES = [
    {
      id: "learning_material" as ContentSource,
      label: "Learning Material",
      description: "Upload files and GateHub will extract quizzes automatically.",
      icon: BookOpen,
      formats: ["PDF", "DOCX", "PPTX", "TXT"],
    },
    {
      id: "google_workspace" as ContentSource,
      label: "Google Workspace",
      description: "Pull from Google Docs, Slides, Drive PDFs, PPT, DOCX.",
      icon: Chrome,
      formats: ["Google Docs", "Google Slides", "Google Drive"],
    },
    {
      id: "paste_text" as ContentSource,
      label: "Paste Text",
      description: "Paste lecture notes, book content, markdown, plain text.",
      icon: AlignLeft,
      formats: ["Notes", "Book Content", "Markdown"],
    },
  ];

  const handleSourceSelect = (sourceId: ContentSource) => {
    setSelectedSource(sourceId);
    setStep("upload");
  };

  const handleGoogleImportComplete = (
    jobId: string,
    questions: ReviewQuestion[],
    statistics: ContentBuilderReviewPayload['statistics'],
    diagnostics?: ContentBuilderReviewPayload['diagnostics'],
  ) => {
    const payload: ContentBuilderReviewPayload = { jobId, questions, statistics, diagnostics };
    setExtractionResult(payload);
    setReviewDocument(toAssessmentDocument(payload, "google_workspace"));
    setStep("review");
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files || []));
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setFiles(Array.from(e.dataTransfer.files));
  };

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleQuestionsChange = useCallback((questions: AssessmentDocument["questions"]) => {
    setReviewDocument((prev) => (prev ? { ...prev, questions } : prev));
  }, []);

  const handleExtract = async () => {
    if (selectedSource === "learning_material" && files.length === 0) {
      setError("Please upload at least one file");
      return;
    }
    if (selectedSource === "paste_text" && !pasteText.trim()) {
      setError("Please paste some text");
      return;
    }

    setExtracting(true);
    setError(null);
    setExtractProgress(0);
    setStep("extracting");

    try {
      const payloads: ContentBuilderReviewPayload[] = [];

      if (selectedSource === "learning_material") {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]!;
          const result = await analyzeFile(file, (s) => setExtractProgress(s));
          if (result.error || !result.data?.data) {
            throw new Error(result.error || `Failed to extract ${file.name}`);
          }
          payloads.push(result.data.data);
        }
      } else if (selectedSource === "paste_text") {
        const result = await analyzePaste(pasteText, (s) => setExtractProgress(s));
        if (result.error || !result.data?.data) {
          throw new Error(result.error || "Extraction failed");
        }
        payloads.push(result.data.data);
      }

      const merged = mergeExtractionPayloads(payloads);
      if (!merged || merged.questions.length === 0) {
        throw new Error(
          selectedSource === "paste_text"
            ? "We couldn't identify any quiz questions in this content. Try including clear question numbers (Question 1 / 1.), options (A. B. C.), and answers (Correct Answer: A)."
            : "No questions could be extracted from the content",
        );
      }

      setExtractionResult(merged);
      setReviewDocument(toAssessmentDocument(merged, selectedSource || "docs"));
      setStep("review");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Extraction failed";
      if (/failed to fetch|unreachable|network/i.test(message)) {
        setError("Could not reach the extraction service. Check that the backend is running and try again.");
      } else {
        setError(message);
      }
      setStep("upload");
    } finally {
      setExtracting(false);
    }
  };

  const handleReviewContinue = async (approvedIds: string[]) => {
    if (!extractionResult || !reviewDocument) return;

    setSubmitting(true);
    setError(null);

    try {
      const patchRes = await patchJobQuestions(
        extractionResult.jobId,
        reviewQuestionsToPatchPayload(reviewDocument.questions),
      );
      if (patchRes.error) {
        setError(patchRes.error);
        setSubmitting(false);
        return;
      }

      const res = await commitQuestions(
        extractionResult.jobId,
        quizTitle || "Quiz from Content",
        approvedIds,
        undefined,
        quizId,
      );

      if (res.error || !res.data?.data) {
        setError(res.error || "Failed to update quiz");
        setSubmitting(false);
        return;
      }

      const targetQuizId = quizId || res.data.data.quizId;
      onQuizCreated(targetQuizId, quizTitle || "Quiz from Content");
      navigate(`/instructor/quiz-room/quizzes/${targetQuizId}/edit`, {
        state: { fromContentBuilder: true },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update quiz");
    } finally {
      setSubmitting(false);
    }
  };

  const renderSourceSelect = () => (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Build From Content</h2>
        <p className="mt-2 text-white/60">Choose where your learning material comes from.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {SOURCES.map((source) => {
          const Icon = source.icon;
          return (
            <button
              key={source.id}
              type="button"
              onClick={() => handleSourceSelect(source.id)}
              className="group relative rounded-2xl border border-white/10 bg-white/5 p-6 text-left transition-all hover:border-primary/50 hover:bg-white/10 hover:shadow-lg hover:shadow-primary/10"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <p className="text-lg font-semibold text-white">{source.label}</p>
              <p className="mt-2 text-sm text-white/50">{source.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {source.formats.map((format) => (
                  <span key={format} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/40">
                    {format}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <Button variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
    </div>
  );

  const renderUpload = () => (
    <div className="space-y-6">
      {selectedSource === "google_workspace" ? (
        <GoogleWorkspaceFlow
          onImportComplete={handleGoogleImportComplete}
          onCancel={() => setStep("source-select")}
        />
      ) : (
        <>
          <div>
            <h2 className="text-2xl font-bold text-white">
              {selectedSource === "learning_material" ? "Learning Material" : "Paste Text"}
            </h2>
            <p className="mt-2 text-white/60">
              {selectedSource === "learning_material"
                ? "Upload your files and GateHub will extract questions automatically."
                : "Paste your content and GateHub will extract questions automatically."}
            </p>
          </div>

          {selectedSource === "learning_material" && (
            <>
              <div
                className="relative rounded-2xl border-2 border-dashed border-white/20 bg-white/5 p-12 text-center transition-colors hover:border-primary/50"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto h-12 w-12 text-white/40" />
                <p className="mt-4 text-white/60">Drag & drop files here, or click to browse</p>
                <Button
                  type="button"
                  onClick={handleUploadClick}
                  variant="outline"
                  className="mt-4 border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Browse Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.pptx,.ppt,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-white/70">Uploaded files:</p>
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">{file.name}</span>
                        <span className="text-xs text-white/40">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFile(idx)}
                        className="h-6 w-6 p-0 text-white/40 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {selectedSource === "paste_text" && (
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste lecture notes, book content, markdown, or plain text here..."
              className="h-64 w-full rounded-xl border border-white/20 bg-white/5 p-4 text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none"
            />
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <Button variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setStep("source-select")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleExtract}
              disabled={extracting || (selectedSource === "learning_material" && files.length === 0) || (selectedSource === "paste_text" && !pasteText.trim())}
              className="ml-auto bg-primary hover:bg-primary/90"
            >
              {extracting ? "Extracting..." : "Extract Quiz"}
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const extractLabel =
    selectedSource === "learning_material" && files.length > 0
      ? files.length === 1
        ? files[0]!.name
        : `${files.length} files`
      : selectedSource === "paste_text"
        ? "pasted content"
        : undefined;

  return (
    <div className="min-h-[500px]">
      {step === "source-select" && renderSourceSelect()}
      {step === "upload" && renderUpload()}
      {step === "extracting" && (
        <ProcessingScreen currentStep={extractProgress} sourceLabel={extractLabel} />
      )}
      {step === "review" && extractionResult && reviewDocument && (
        <AssessmentReviewWorkspace
          assessmentDocument={reviewDocument}
          quizTitle={quizTitle || "Quiz from Content"}
          onBack={() => setStep("upload")}
          onContinue={handleReviewContinue}
          onQuestionsChange={handleQuestionsChange}
          submitting={submitting}
          summarySlot={
            <ExtractionSummaryPanel
              questions={extractionResult.questions}
              statistics={extractionResult.statistics}
              diagnostics={extractionResult.diagnostics}
            />
          }
        />
      )}
      {error && step === "review" && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
