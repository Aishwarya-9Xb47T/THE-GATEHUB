import { useState } from "react";
import { CheckCircle, AlertCircle, HelpCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/toastStore";
import { gradeQuizLocally } from "@/lib/quizPreview";

interface CourseLectureQuizBlockProps {
  quiz: {
    id: string;
    title: string;
    questions: Array<{
      id: string;
      text: string;
      type: string;
      marks: number;
      explanation?: string | null;
      options: Array<{ id: string; text: string; isCorrect: boolean }>;
    }>;
  };
  lectureId: string;
  isPreviewMode?: boolean;
  onComplete?: () => void;
}

export function CourseLectureQuizBlock({
  quiz,
  lectureId,
  isPreviewMode = false,
  onComplete,
}: CourseLectureQuizBlockProps) {
  const toast = useToastStore((s) => s.add);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, unknown>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<{
    score: number;
    totalMarks: number;
    results: Array<{ questionId: string; isCorrect: boolean }>;
  } | null>(null);

  const submitQuiz = async () => {
    if (isPreviewMode) {
      const local = gradeQuizLocally(quiz, quizAnswers);
      setQuizResult(local);
      setQuizSubmitted(true);
      toast({
        title: "Preview mode",
        description: "Quiz graded locally — attempts are not saved during instructor preview.",
      });
      onComplete?.();
      return;
    }

    try {
      const res = await api<{
        attempt: { score: number };
        totalMarks: number;
        results: Array<{ questionId: string; isCorrect: boolean }>;
      }>(`/quizzes/${quiz.id}/submit`, {
        method: "POST",
        body: { answers: quizAnswers },
      });
      if (res.error) throw new Error(res.error);
      setQuizResult({
        score: res.data!.attempt.score,
        totalMarks: res.data!.totalMarks,
        results: res.data!.results,
      });
      setQuizSubmitted(true);
      window.dispatchEvent(new CustomEvent("gatehub:quiz-attempt-submitted"));
      toast({ title: "Quiz submitted successfully!", variant: "success" });
      onComplete?.();
    } catch (e: any) {
      toast({
        title: "Failed to submit quiz",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-3xl space-y-8 w-full">
      <h2 className="text-2xl font-bold">{quiz.title}</h2>
      {quiz.questions.map((q, i) => (
        <Card key={q.id} className="border-2 shadow-sm">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                {i + 1}
              </div>
              <div className="space-y-4 flex-1 min-w-0">
                <h3 className="text-lg font-medium">{q.text}</h3>
                <p className="text-sm text-muted-foreground">
                  Marks: {q.marks}
                </p>

                {q.type === "multiple_choice" || q.type === "true_false" ? (
                  <div className="space-y-2">
                    {q.options.map((opt) => (
                      <div
                        key={opt.id}
                        className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                        onClick={() =>
                          !quizSubmitted && setQuizAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                        }
                      >
                        <input
                          type="radio"
                          name={`question-${q.id}`}
                          checked={quizAnswers[q.id] === opt.id}
                          onChange={() =>
                            !quizSubmitted && setQuizAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                          }
                          disabled={quizSubmitted}
                          className="w-4 h-4"
                        />
                        <Label className="flex-1 cursor-pointer">{opt.text}</Label>
                      </div>
                    ))}
                  </div>
                ) : q.type === "multiple_select" ? (
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const selected = (quizAnswers[q.id] as string[]) || [];
                      return (
                        <div key={opt.id} className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50">
                          <Checkbox
                            disabled={quizSubmitted}
                            checked={selected.includes(opt.id)}
                            onCheckedChange={(checked) => {
                              setQuizAnswers((prev) => {
                                const prevArr = (prev[q.id] as string[]) || [];
                                const next = checked
                                  ? [...prevArr, opt.id]
                                  : prevArr.filter((id) => id !== opt.id);
                                return { ...prev, [q.id]: next };
                              });
                            }}
                          />
                          <Label className="flex-1 cursor-pointer">{opt.text}</Label>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    disabled={quizSubmitted}
                    className="w-full min-h-[100px] border rounded-md p-3 focus:ring-2 focus:ring-primary"
                    placeholder="Type your answer here..."
                    value={(quizAnswers[q.id] as string) || ""}
                    onChange={(e) => setQuizAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  />
                )}

                {quizSubmitted && (
                  <div
                    className={cn(
                      "p-4 rounded-lg flex items-start gap-3 text-sm border",
                      quizResult?.results?.find((r) => r.questionId === q.id)?.isCorrect
                        ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400"
                        : "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400"
                    )}
                  >
                    {quizResult?.results?.find((r) => r.questionId === q.id)?.isCorrect ? (
                      <CheckCircle className="w-5 h-5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold block mb-1">
                        {quizResult?.results?.find((r) => r.questionId === q.id)?.isCorrect
                          ? "Correct!"
                          : "Incorrect"}
                      </span>
                    </div>
                  </div>
                )}

                {quizSubmitted && q.explanation && (
                  <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20 flex gap-3 text-sm">
                    <HelpCircle className="w-5 h-5 shrink-0" />
                    <div>
                      <span className="font-bold block mb-1">Explanation:</span>
                      {q.explanation}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="pt-6 border-t flex items-center justify-between">
        {quizResult ? (
          <div className="flex items-center gap-3 text-lg font-bold text-green-600 dark:text-green-500">
            <CheckCircle className="w-6 h-6" />
            Score: {quizResult.score} / {quizResult.totalMarks}
          </div>
        ) : (
          <div />
        )}
        {!quizSubmitted && (
          <Button size="lg" onClick={submitQuiz}>
            Submit Quiz
          </Button>
        )}
      </div>
    </div>
  );
}
