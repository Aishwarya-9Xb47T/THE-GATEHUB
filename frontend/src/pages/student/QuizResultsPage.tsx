import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpCircle } from "lucide-react";
import { QuizCard } from "@/components/common/QuizCard";
import { Button } from "@/components/ui/button";
import { subscribeQuizAttemptEvents } from "@/lib/realtime/quizAttemptEvents";

interface Attempt {
  id: string;
  quizId: string;
  score: number;
  totalMarks: number;
  percentage: number;
  accuracy: number;
  attemptType: "live" | "course";
  livePoints: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  rank: number | null;
  createdAt: string;
  quizName: string;
  courseName: string;
  courseId: string | null;
  bannerUrl?: string | null;
  thumbnailUrl?: string | null;
  coverImageUrl?: string | null;
  coverGradient?: string | null;
  theme?: string | null;
}

export function QuizResultsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["quiz-attempts"],
    queryFn: async () => {
      const res = await api<{ success?: boolean; attempts: Attempt[] }>("/quizzes/my/attempts");
      if (res.error) throw new Error(res.error);
      return res.data?.attempts ?? [];
    },
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["quiz-attempts"] });
    };
    const streamOff = subscribeQuizAttemptEvents(refresh);
    window.addEventListener("gatehub:quiz-attempt-submitted", refresh);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      streamOff();
      window.removeEventListener("gatehub:quiz-attempt-submitted", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [queryClient]);

  const attempts = data ?? [];

  const groupedAttempts = attempts.reduce((acc: Record<string, Attempt[]>, attempt: Attempt) => {
    const courseName =
      attempt.courseName === "Standalone Quiz" ? "Standalone Quiz" : attempt.courseName || "Other Quizzes";
    if (!acc[courseName]) acc[courseName] = [];
    acc[courseName].push(attempt);
    return acc;
  }, {} as Record<string, Attempt[]>);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading results...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center text-muted-foreground">
          <p className="text-lg font-semibold text-foreground">Could not load quiz results</p>
          <p className="mt-2 text-sm">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-8">
      <div>
        <h1 className="page-title tracking-tight">Quiz Results</h1>
        <p className="mt-2 text-muted-foreground">
          Review scores, accuracy, and question-level answers for every quiz attempt.
        </p>
      </div>

      {attempts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-16 text-center text-muted-foreground">
            <HelpCircle className="mx-auto mb-4 h-12 w-12 opacity-20" />
            <p className="text-lg font-semibold text-foreground">No completed quizzes yet.</p>
            <p className="mt-2 text-sm">Finish a Quiz Room or course quiz to see premium results here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-8">
          {Object.entries(groupedAttempts).map(([courseName, courseAttempts]) => (
            <section key={courseName} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full bg-primary" />
                <h2 className="text-xl font-bold text-foreground">{courseName}</h2>
                <Badge variant="secondary" className="ml-2">
                  {courseAttempts.length} {courseAttempts.length === 1 ? "Attempt" : "Attempts"}
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                {courseAttempts.map((a) => (
                  <QuizCard
                    key={a.id}
                    quiz={{
                      id: a.id,
                      quizId: a.quizId,
                      title: a.quizName,
                      courseName: a.courseName,
                      score: a.score,
                      totalMarks: a.totalMarks,
                      percentage: a.percentage,
                      accuracy: a.accuracy,
                      attemptType: a.attemptType,
                      livePoints: a.livePoints,
                      correctCount: a.correctCount,
                      wrongCount: a.wrongCount,
                      unansweredCount: a.unansweredCount,
                      rank: a.rank,
                      createdAt: a.createdAt,
                      bannerUrl: a.bannerUrl,
                      thumbnailUrl: a.thumbnailUrl,
                      coverImageUrl: a.coverImageUrl,
                      coverGradient: a.coverGradient,
                      theme: a.theme,
                    }}
                    action={
                      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                        <Button asChild size="sm" variant="outline" className="font-bold text-xs h-9">
                          <Link to={`/student/quiz-attempt/${a.id}/report`}>View Result</Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-bold text-xs h-9 text-red-500 border-red-500/20 hover:bg-red-500/5 hover:text-red-600"
                          onClick={() => {
                            const token = localStorage.getItem("lms_token") || "";
                            const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
                            window.open(
                              `${baseUrl}/api/quizzes/attempts/${a.id}/export-pdf?token=${encodeURIComponent(token)}`,
                              "_blank"
                            );
                          }}
                        >
                          Download PDF
                        </Button>
                        {a.courseId ? (
                          <Button asChild size="sm" className="font-bold text-xs h-9">
                            <Link to={`/student/course/${a.courseId}/learn`}>Retake</Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" className="font-bold text-xs h-9">
                            <Link to="/student/join-quiz">Retake</Link>
                          </Button>
                        )}
                      </div>
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
