import { useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ExperienceRendererProps } from "./ExperienceRenderer";
import { buildComponentScopeKey, usePersistedStepState } from "../hooks/useComponentState";

interface QuizQuestion {
  id?: string;
  text: string;
  type?: string;
  explanation?: string;
  options: Array<{ id?: string; text: string; isCorrect: boolean }>;
}

function dedupeQuestions(raw: QuizQuestion[]): QuizQuestion[] {
  const seen = new Set<string>();
  const result: QuizQuestion[] = [];
  for (const q of raw) {
    const key = q.id ?? `${q.text}::${q.options.map((o) => o.text).join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(q);
  }
  return result;
}

interface QuizState {
  answers: Record<number, number>;
  currentQuestion: number;
  submitted: boolean;
  score: number | null;
}

const DEFAULT_QUIZ_STATE: QuizState = {
  answers: {},
  currentQuestion: 0,
  submitted: false,
  score: null,
};

export function QuizAssessment({ step, universeId, lessonId, publishVersionId, onProgress }: ExperienceRendererProps) {
  const rawQuestions = (step.payload.questions as QuizQuestion[]) ?? [];
  const questions = useMemo(() => dedupeQuestions(rawQuestions), [rawQuestions]);
  const passingScore = Number(step.payload.passingScore ?? 70);

  const scopeKey = buildComponentScopeKey(universeId, publishVersionId || "preview", lessonId, step.id);
  const [quizState, setQuizState] = usePersistedStepState<QuizState>(scopeKey, "quiz", DEFAULT_QUIZ_STATE);
  const { answers, currentQuestion, submitted, score } = quizState;

  const qIndex = Math.min(currentQuestion, Math.max(0, questions.length - 1));
  const currentQ = questions[qIndex];
  const hasPrevious = qIndex > 0;
  const hasNext = qIndex < questions.length - 1;

  const setAnswer = (questionIndex: number, optionIndex: number) => {
    setQuizState((prev) => ({
      ...prev,
      answers: { ...prev.answers, [questionIndex]: optionIndex },
    }));
  };

  const submit = () => {
    let correct = 0;
    questions.forEach((q, qi) => {
      const selected = answers[qi];
      if (selected === undefined) return;
      const opt = q.options[selected];
      if (opt?.isCorrect) correct++;
    });
    const pct = questions.length ? Math.round((correct / questions.length) * 100) : 0;
    setQuizState((prev) => ({ ...prev, submitted: true, score: pct }));
    if (pct >= passingScore) onProgress(step.id, "score");
  };

  const reset = () => {
    setQuizState(DEFAULT_QUIZ_STATE);
  };

  useEffect(() => {
    if (submitted && score !== null && score >= passingScore) {
      onProgress(step.id, "score");
    }
  }, [step.id, submitted, score, passingScore, onProgress]);

  if (questions.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <p>No questions in this quiz yet.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 md:p-8 border-0 shadow-md w-full">
      <div className="mb-6">
        <h2 className="text-xl font-bold">{step.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">Passing score: {passingScore}%</p>
      </div>

      {!submitted ? (
        <>
          <div className="flex items-center justify-between mb-4 text-sm text-muted-foreground">
            <span>
              Question {qIndex + 1} of {questions.length}
            </span>
            <div className="flex gap-1">
              {questions.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setQuizState((prev) => ({ ...prev, currentQuestion: i }))}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === qIndex ? "bg-primary" : answers[i] !== undefined ? "bg-primary/40" : "bg-muted-foreground/30"
                  }`}
                  aria-label={`Go to question ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {currentQ && (
            <div className="space-y-4">
              <p className="font-medium text-lg">{currentQ.text}</p>
              <div className="space-y-2">
                {currentQ.options.map((opt, oi) => {
                  const selected = answers[qIndex] === oi;
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => setAnswer(qIndex, oi)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      {opt.text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" disabled={!hasPrevious} onClick={() => setQuizState((p) => ({ ...p, currentQuestion: qIndex - 1 }))}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>

            {qIndex === questions.length - 1 ? (
              <Button type="button" onClick={submit}>
                Submit assessment
              </Button>
            ) : (
              <Button type="button" disabled={!hasNext} onClick={() => setQuizState((p) => ({ ...p, currentQuestion: qIndex + 1 }))}>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="space-y-6">
            {questions.map((q, qi) => (
              <div key={qi} className="space-y-3 pb-6 border-b last:border-0">
                <p className="font-medium">
                  {qi + 1}. {q.text}
                </p>
                <div className="space-y-2">
                  {q.options.map((opt, oi) => {
                    const selected = answers[qi] === oi;
                    const isCorrect = opt.isCorrect;
                    return (
                      <div
                        key={oi}
                        className={`px-4 py-3 rounded-lg border ${
                          isCorrect ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : ""
                        } ${selected && !isCorrect ? "border-red-500 bg-red-50 dark:bg-red-950/20" : ""}
                        ${!selected && !isCorrect ? "border-border opacity-60" : ""}`}
                      >
                        <span className="flex items-center gap-2">
                          {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                          {selected && !isCorrect && <XCircle className="w-4 h-4 text-red-600" />}
                          {opt.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {q.explanation && (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">{q.explanation}</p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-8 p-4 rounded-xl bg-muted/50 text-center">
            <p className="text-2xl font-bold">{score}%</p>
            <p className="text-sm text-muted-foreground mb-4">
              {score !== null && score >= passingScore ? "Passed!" : "Review and try again"}
            </p>
            {score !== null && score < passingScore && (
              <Button type="button" variant="outline" onClick={reset}>
                Try again
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
