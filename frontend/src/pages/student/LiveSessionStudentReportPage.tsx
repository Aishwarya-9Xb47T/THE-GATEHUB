import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  BookOpen,
  Download,
  AlertTriangle,
} from "lucide-react";
import { AttemptQuestionReview } from "@/components/quiz-reporting/AttemptQuestionReview";

interface AttemptReviewData {
  attempt: {
    id: string;
    score: number;
    totalMarks: number;
    createdAt: string;
    accuracy: number;
    percentage?: number;
    correctCount?: number;
    incorrectCount?: number;
    unansweredCount?: number;
    timeTakenMs?: number | null;
    livePoints?: number | null;
    rank?: number | null;
    xpEarned: number;
    coinsEarned: number;
    livesRemaining: number;
  };
  quizTitle: string;
  classAverage: number;
  highestScore: number;
  percentile: number;
  review?: {
    summary: any;
    questions: any[];
  };
  reviewItems: Array<{
    questionId: string;
    questionNumber?: number;
    text: string;
    type: string;
    status?: string;
    marks: number;
    options: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
    explanation?: string | null;
    difficulty?: string;
    selectedOptionIds?: string[];
    correctOptionIds?: string[];
    correctAnswer?: unknown;
    selectedAnswer?: unknown;
    metadata?: unknown;
    studentAnswer: {
      answer: unknown;
      isCorrect: boolean | null;
      pointsEarned: number;
      marksAwarded?: number;
      maxMarks?: number;
      responseTimeMs: number;
      status?: string;
    };
  }>;
  analytics: {
    topicAnalysis: Array<{ topic: string; accuracy: number; total: number }>;
    difficultyAnalysis: Array<{ difficulty: string; accuracy: number; total: number }>;
    strongestTopic: string;
    weakestTopic: string;
    mistakePattern: string;
    suggestion: string;
  };
}

export function LiveSessionStudentReportPage() {
  const { attemptId } = useParams<{ attemptId: string }>();

  const { data, isLoading, error } = useQuery<AttemptReviewData>({
    queryKey: ["attempt-review", attemptId],
    enabled: !!attemptId,
    queryFn: async () => {
      const res = await api<any>(`/quizzes/attempts/${attemptId}/review`);
      if (res.error) throw new Error(res.error);
      return res.data?.data ?? res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-muted rounded" />
        <div className="h-10 w-64 bg-muted rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-xl" />
          ))}
        </div>
        <div className="h-96 bg-muted rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-5xl mx-auto text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Failed to load report</h2>
        <p className="text-muted-foreground">
          {(error as Error)?.message || "Please try again or contact support."}
        </p>
        <Button asChild variant="outline">
          <Link to="/student/quiz-results">Back to Results</Link>
        </Button>
      </div>
    );
  }

  const { attempt, quizTitle, classAverage, highestScore, analytics, review, reviewItems } = data;

  const reviewQuestions =
    review?.questions ||
    reviewItems.map((item, idx) => ({
      questionId: item.questionId,
      questionNumber: item.questionNumber || idx + 1,
      questionText: item.text,
      questionType: item.type,
      options: item.options || [],
      correctAnswer: item.correctAnswer,
      selectedAnswer: item.selectedAnswer ?? item.studentAnswer?.answer,
      selectedOptionIds: item.selectedOptionIds || [],
      correctOptionIds: item.correctOptionIds || [],
      isCorrect: item.studentAnswer?.isCorrect,
      status:
        item.status ||
        item.studentAnswer?.status ||
        (item.studentAnswer?.answer == null || item.studentAnswer?.answer === ""
          ? "unanswered"
          : item.studentAnswer?.isCorrect
            ? "correct"
            : "incorrect"),
      marksAwarded: item.studentAnswer?.marksAwarded ?? item.studentAnswer?.pointsEarned ?? 0,
      maxMarks: item.studentAnswer?.maxMarks ?? item.marks,
      explanation: item.explanation,
      difficulty: item.difficulty,
      timeTakenMs: item.studentAnswer?.responseTimeMs ?? null,
      metadata: item.metadata,
    }));

  const summary = review?.summary || {
    score: attempt.score,
    maxScore: attempt.totalMarks,
    percentage: attempt.percentage ?? Math.round((attempt.score / Math.max(1, attempt.totalMarks)) * 100),
    accuracy: attempt.accuracy,
    correctCount: attempt.correctCount ?? reviewQuestions.filter((q: any) => q.status === "correct").length,
    incorrectCount:
      attempt.incorrectCount ?? reviewQuestions.filter((q: any) => q.status === "incorrect").length,
    unansweredCount:
      attempt.unansweredCount ?? reviewQuestions.filter((q: any) => q.status === "unanswered").length,
    timeTakenMs: attempt.timeTakenMs,
    rank: attempt.rank,
    livePoints: attempt.livePoints,
    quizTitle,
    attemptDate: attempt.createdAt,
  };

  const handleDownloadPdf = () => {
    const token = localStorage.getItem("lms_token") || "";
    window.open(
      apiUrl(`/api/quizzes/attempts/${attemptId}/export-pdf?token=${encodeURIComponent(token)}`),
      "_blank"
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="hover:bg-muted/80">
          <Link to="/student/quiz-results" className="flex items-center gap-1 text-xs font-semibold">
            <ArrowLeft className="h-4 w-4" /> Back to Results
          </Link>
        </Button>
        <Button
          onClick={handleDownloadPdf}
          className="font-bold flex items-center gap-1.5 shadow-sm text-xs h-9 bg-red-600 hover:bg-red-700 text-white"
        >
          <Download className="h-4 w-4" /> Download PDF Report
        </Button>
      </div>

      <div>
        <p className="text-[11px] font-extrabold tracking-[0.14em] uppercase text-muted-foreground">Quiz Result</p>
        <h1 className="text-3xl font-black tracking-tight text-foreground">{quizTitle}</h1>
        <p className="text-sm text-muted-foreground mt-1.5 font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Attempted on{" "}
          {attempt.createdAt ? new Date(attempt.createdAt).toLocaleString() : "—"}
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border shadow-sm lg:col-span-2">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Score</span>
            <span className="text-4xl font-black text-foreground mt-2 tabular-nums">
              {summary.score}{" "}
              <span className="text-lg font-semibold text-muted-foreground">/ {summary.maxScore}</span>
            </span>
            <span className="mt-2 text-2xl font-black text-primary">{summary.percentage}%</span>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Accuracy</span>
            <span className="text-2xl font-black text-emerald-600 mt-1.5 tabular-nums">{summary.accuracy}%</span>
            <span className="text-[10px] text-muted-foreground mt-1">Correct ÷ attempted</span>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Time</span>
            <span className="text-2xl font-black text-foreground mt-1.5 tabular-nums">
              {summary.timeTakenMs != null
                ? `${Math.max(1, Math.round(summary.timeTakenMs / 60000))}m`
                : "—"}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border shadow-md">
          <CardHeader className="border-b bg-muted/10 pb-3">
            <CardTitle className="text-xs font-bold text-muted-foreground">Answer Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4 font-semibold text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Correct
              </span>
              <span>{summary.correctCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-red-500">
                <XCircle className="h-4 w-4" /> Incorrect
              </span>
              <span>{summary.incorrectCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <HelpCircle className="h-4 w-4" /> Unanswered
              </span>
              <span>{summary.unansweredCount}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-md">
          <CardHeader className="border-b bg-muted/10 pb-3">
            <CardTitle className="text-xs font-bold text-muted-foreground">Class Benchmarks</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4 font-semibold text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Your Score</span>
              <span className="font-extrabold">{summary.score}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Class Average</span>
              <span className="font-bold text-muted-foreground">{classAverage}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Class Highest</span>
              <span className="font-bold">{highestScore}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-md">
          <CardHeader className="border-b bg-muted/10 pb-3">
            <CardTitle className="text-xs font-bold flex items-center gap-1">
              <Sparkles className="h-4 w-4" /> Performance Feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-2 text-xs">
            <p className="font-bold text-foreground">Pattern:</p>
            <p className="text-muted-foreground leading-relaxed">{analytics.mistakePattern}</p>
            <p className="font-bold text-foreground mt-4">Suggestion:</p>
            <p className="text-muted-foreground leading-relaxed font-medium">{analytics.suggestion}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-md">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-primary" /> Topic Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {analytics.topicAnalysis.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-6">No topics available</div>
          ) : (
            analytics.topicAnalysis.map((topic, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="truncate max-w-[200px]">{topic.topic}</span>
                  <span>
                    {topic.accuracy}% ({topic.total} Qs)
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      topic.accuracy >= 75 ? "bg-emerald-500" : topic.accuracy >= 50 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${topic.accuracy}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border shadow-md">
        <CardHeader className="border-b bg-muted/10 pb-3">
          <CardTitle className="text-sm font-bold">Question-by-Question Review</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <AttemptQuestionReview summary={summary} questions={reviewQuestions} showSummary={false} />
        </CardContent>
      </Card>
    </div>
  );
}
