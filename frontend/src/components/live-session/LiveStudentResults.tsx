import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Target,
  Zap,
  Flame,
  CheckCircle2,
  XCircle,
  BarChart3,
  Award,
  Sparkles,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  BookOpen,
  Info,
  CircleDollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LivePodium } from "./LivePodium";
import { getLiveSessionReview } from "@/lib/liveSession/api";
import { AssessmentContentRenderer } from "@/components/assessment/AssessmentContentRenderer";
import type { LeaderboardEntry } from "@/lib/liveSession/types";

interface LiveStudentResultsProps {
  myEntry: LeaderboardEntry;
  leaderboard: LeaderboardEntry[];
  title: string;
  sessionId: string;
  questionCount?: number;
}

export function LiveStudentResults({ myEntry, leaderboard, title, sessionId, questionCount }: LiveStudentResultsProps) {
  const correct = myEntry.correctCount;
  const wrong = myEntry.wrongCount;
  const qCount = questionCount ?? (leaderboard[0] ? leaderboard[0].correctCount + leaderboard[0].wrongCount : correct + wrong);
  const skipped = Math.max(0, qCount - (correct + wrong));
  const total = correct + wrong + skipped;

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<any[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("gatehub:quiz-attempt-submitted"));
  }, []);

  const handleToggleReview = async () => {
    if (!reviewOpen && reviewItems.length === 0) {
      setLoadingReview(true);
      try {
        const res = (await getLiveSessionReview(sessionId)) as any;
        if (res.success && res.data) {
          setReviewItems(res.data);
        }
      } catch (err: any) {
        console.error("Failed to load review items:", err);
      } finally {
        setLoadingReview(false);
      }
    }
    setReviewOpen(!reviewOpen);
  };

  const computeAiFeedback = (items: any[]) => {
    if (!items || items.length === 0) return null;
    
    const topicStats: Record<string, { correct: number; total: number }> = {};
    for (const item of items) {
      const topic = item.topic || item.difficulty || "General";
      const isCorrect = item.studentAnswer?.isCorrect ?? false;
      if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 };
      topicStats[topic].total++;
      if (isCorrect) topicStats[topic].correct++;
    }
    
    const strongTopics: string[] = [];
    const weakTopics: string[] = [];
    
    for (const [topic, stats] of Object.entries(topicStats)) {
      const acc = (stats.correct / stats.total) * 100;
      if (acc >= 70) {
        strongTopics.push(topic);
      } else {
        weakTopics.push(topic);
      }
    }
    
    const totalCorrect = items.filter(i => i.studentAnswer?.isCorrect).length;
    const totalPct = Math.round((totalCorrect / items.length) * 100);
    let feedback = "";
    if (totalPct >= 80) {
      feedback = "Exceptional job! You've demonstrated great conceptual understanding and quick recall speed. You excel at analytical reasoning and quick retrieval.";
    } else if (totalPct >= 50) {
      feedback = "Good effort! You showed strong understanding in some areas, but have room to grow. Review explanations and use hints next time.";
    } else {
      feedback = "Keep practicing! We recommend revisiting study notes, detailed explanations, and review hints. Focus on fundamental concepts first.";
    }
    
    return {
      strongTopics,
      weakTopics,
      feedback
    };
  };

  const handleDownloadCertificate = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 1200, 800);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#1e1b4b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 800);

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 12;
    ctx.strokeRect(30, 30, 1140, 740);
    
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 3;
    ctx.strokeRect(45, 45, 1110, 710);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 54px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("THE GATEHUB", 600, 155);

    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("CERTIFICATE OF ACHIEVEMENT", 600, 205);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px sans-serif";
    ctx.fillText("This is proudly presented to", 600, 280);

    ctx.fillStyle = "#ffffff";
    ctx.font = "italic bold 52px serif";
    ctx.fillText(myEntry.displayName, 600, 350);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "18px sans-serif";
    ctx.fillText(`for outstanding performance in the live quiz:`, 600, 430);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(`"${title}"`, 600, 475);

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(200, 520, 800, 100);
    ctx.strokeStyle = "#475569";
    ctx.strokeRect(200, 520, 800, 100);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("RANK", 300, 550);
    ctx.fillText("SCORE", 500, 550);
    ctx.fillText("ACCURACY", 700, 550);
    ctx.fillText("XP EARNED", 900, 550);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(`#${myEntry.rank}`, 300, 595);
    ctx.fillText(`${Math.round(myEntry.score)} Marks`, 500, 595);
    ctx.fillText(`${myEntry.accuracy}%`, 700, 595);
    ctx.fillText(`+${myEntry.xp}`, 900, 595);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.fillText("Date of issue", 350, 705);
    ctx.fillText("Authorized Signature", 850, 705);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(new Date().toLocaleDateString(), 350, 675);
    ctx.font = "italic bold 20px serif";
    ctx.fillText("The Gatehub Admin", 850, 675);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(1020, 610, 80, 80);
    ctx.fillStyle = "#000000";
    ctx.fillRect(1025, 615, 20, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(1029, 619, 12, 12);
    ctx.fillStyle = "#000000";
    ctx.fillRect(1033, 623, 4, 4);

    ctx.fillRect(1075, 615, 20, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(1079, 619, 12, 12);
    ctx.fillStyle = "#000000";
    ctx.fillRect(1083, 623, 4, 4);

    ctx.fillRect(1025, 665, 20, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(1029, 669, 12, 12);
    ctx.fillStyle = "#000000";
    ctx.fillRect(1033, 673, 4, 4);

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (Math.random() > 0.5) {
          ctx.fillRect(1050 + r * 4, 640 + c * 4, 4, 4);
        }
      }
    }
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 8px sans-serif";
    ctx.fillText("VERIFIED CREDENTIAL", 1060, 715);

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `THE_GATEHUB_CERTIFICATE_${myEntry.displayName.replace(/\s+/g, "_")}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-500/10 via-background to-background dark:from-background dark:to-muted/10">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="relative inline-block">
            <Trophy className="mx-auto h-20 w-20 text-amber-500 drop-shadow" />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -right-1 -top-1 bg-primary text-primary-foreground rounded-full p-1 shadow"
            >
              <Sparkles className="h-4 w-4 text-amber-300 animate-spin" />
            </motion.div>
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Great job, Competitor!</h1>
          <p className="mt-2 text-muted-foreground text-lg">{title}</p>
        </motion.div>

        {/* Competitor Report Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="overflow-hidden border-2 border-primary/20 shadow-xl backdrop-blur-sm bg-card/70">
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div>
                <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  Your final rank
                </p>
                <p className="text-center text-7xl font-black text-primary drop-shadow-sm">#{myEntry.rank}</p>
                <p className="mt-2 text-center text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {myEntry.score} Marks
                </p>
              </div>

              {/* Core metrics grid */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <ResultStat icon={Target} label="Accuracy" value={`${myEntry.accuracy}%`} accent="text-primary" />
                <ResultStat icon={Zap} label="XP Earned" value={`+${myEntry.xp}`} accent="text-violet-600" />
                <ResultStat icon={Flame} label="Best Streak" value={`${myEntry.streak} 🔥`} accent="text-orange-600" />
                <ResultStat icon={CircleDollarSign} label="Coins Bonus" value="+10 🪙" accent="text-amber-500" />
              </div>

              {/* Correct / Incorrect labels */}
              {total > 0 && (
                <div className="flex items-center justify-center gap-6 text-sm font-semibold border-y py-3 flex-wrap">
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="h-4.5 w-4.5" /> {correct} correct
                  </span>
                  <span className="flex items-center gap-1.5 text-red-500">
                    <XCircle className="h-4.5 w-4.5" /> {wrong} incorrect
                  </span>
                  <span className="flex items-center gap-1.5 text-orange-500">
                    <HelpCircle className="h-4.5 w-4.5" /> {skipped} skipped
                  </span>
                </div>
              )}

              {/* Badges unlocked section */}
              {myEntry.badges && myEntry.badges.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground text-center">Badges Earned</h3>
                  <div className="flex flex-wrap justify-center gap-2">
                    {myEntry.badges.map((b) => (
                      <div
                        key={b}
                        className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/10 to-amber-600/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full text-xs font-bold shadow-sm"
                      >
                        <Award className="h-3.5 w-3.5" />
                        {b}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Podium view */}
        <LivePodium entries={leaderboard} />

        {/* AI Feedback Panel */}
        {reviewItems.length > 0 && (() => {
          const feedback = computeAiFeedback(reviewItems);
          if (!feedback) return null;
          return (
            <Card className="border-2 border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-transparent shadow-md">
              <CardContent className="p-5 space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-violet-500">
                  <Sparkles className="h-4.5 w-4.5 text-violet-500 fill-violet-500 animate-pulse" /> AI Performance Feedback
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{feedback.feedback}</p>
                <div className="grid grid-cols-2 gap-4 pt-2 text-xs">
                  <div>
                    <h4 className="font-bold text-emerald-600 mb-1 flex items-center gap-1">✓ Strong Areas</h4>
                    {feedback.strongTopics.length > 0 ? (
                      <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground capitalize">
                        {feedback.strongTopics.map(t => <li key={t}>{t} Questions</li>)}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground italic">None identified yet</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-red-500 mb-1 flex items-center gap-1">✗ Focus Areas</h4>
                    {feedback.weakTopics.length > 0 ? (
                      <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground capitalize">
                        {feedback.weakTopics.map(t => <li key={t}>{t} Questions</li>)}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground italic">None identified yet</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Interactive Question Review Accordion */}
        <div className="space-y-4">
          <Button
            onClick={handleToggleReview}
            variant="outline"
            className="w-full flex items-center justify-between p-4 h-auto border-2 border-primary/10 shadow hover:bg-muted/30"
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="font-bold text-base">Review Quiz Questions</span>
            </div>
            {reviewOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>

          <AnimatePresence>
            {reviewOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden"
              >
                {loadingReview ? (
                  <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
                    Loading answers review...
                  </div>
                ) : reviewItems.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No questions answered in this session.
                  </div>
                ) : (
                  <>
                    {/* Navigation bar at the top */}
                    <div className="flex flex-wrap gap-1.5 p-2 bg-muted/20 border rounded-xl items-center justify-between">
                      <div className="flex gap-1 overflow-x-auto max-w-[calc(100%-140px)] pr-2 py-1 scrollbar-none">
                        {reviewItems.map((item, idx) => {
                          const isItemCorrect = item.studentAnswer?.isCorrect ?? false;
                          const isSelected = idx === activeQuestionIndex;
                          return (
                            <button
                              key={item.questionId}
                              type="button"
                              onClick={() => setActiveQuestionIndex(idx)}
                              className={cn(
                                "h-8 w-8 text-xs font-bold rounded-lg border flex items-center justify-center shrink-0 transition-all",
                                isSelected
                                  ? "bg-primary border-primary text-primary-foreground scale-105"
                                  : isItemCorrect
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/20"
                                    : item.studentAnswer
                                      ? "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20"
                                      : "bg-background border-border/80 text-muted-foreground hover:bg-muted"
                              )}
                            >
                              {idx + 1}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={activeQuestionIndex === 0}
                          onClick={() => setActiveQuestionIndex(p => p - 1)}
                          className="text-xs h-8 px-2.5 font-bold animate-none"
                        >
                          Prev
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={activeQuestionIndex === reviewItems.length - 1}
                          onClick={() => setActiveQuestionIndex(p => p + 1)}
                          className="text-xs h-8 px-2.5 font-bold animate-none"
                        >
                          Next
                        </Button>
                      </div>
                    </div>

                    {/* Active Question Review Card */}
                    {(() => {
                      const item = reviewItems[activeQuestionIndex];
                      if (!item) return null;
                      const isCorrect = item.studentAnswer?.isCorrect ?? false;
                      const points = item.studentAnswer?.pointsEarned ?? 0;
                      return (
                        <Card className="border bg-card/45 backdrop-blur-sm overflow-hidden shadow-md">
                          <CardContent className="p-5 space-y-4">
                            {/* Header */}
                            <div className="flex flex-col gap-2 border-b pb-3 text-xs text-muted-foreground">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-sm text-foreground">Question {activeQuestionIndex + 1} of {reviewItems.length}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  {item.studentAnswer ? (
                                    <span className={cn("font-bold text-sm", isCorrect ? "text-emerald-600" : "text-red-500")}>
                                      {isCorrect ? `✓ Correct (+${points} Marks)` : `✗ Incorrect (${points} Marks)`}
                                    </span>
                                  ) : (
                                    <span className="text-orange-500 font-bold text-sm">Skipped</span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex flex-wrap items-center gap-1.5">
                                {item.topic && (
                                  <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/20 font-bold">
                                    {item.topic}
                                  </Badge>
                                )}
                                {item.bloomLevel && (
                                  <Badge variant="secondary" className="text-[10px] capitalize font-bold">
                                    {item.bloomLevel}
                                  </Badge>
                                )}
                                {item.difficulty && (
                                  <Badge variant="outline" className="text-[10px] capitalize font-bold">
                                    {item.difficulty}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-[10px] text-muted-foreground font-bold">Max Marks: {item.marks ?? 1}</Badge>
                                {item.negativeMarks > 0 && (
                                  <Badge variant="outline" className="text-[10px] text-red-500/80 border-red-500/20 font-bold">Neg Marks: -{item.negativeMarks}</Badge>
                                )}
                                {item.studentAnswer?.responseTimeMs != null && (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground font-bold">
                                    Time: {(item.studentAnswer.responseTimeMs / 1000).toFixed(1)}s
                                  </Badge>
                                )}
                                {item.averageClassTimeMs != null && item.averageClassTimeMs > 0 && (
                                  <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground font-bold">
                                    Class Avg: {(item.averageClassTimeMs / 1000).toFixed(1)}s
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Question text */}
                            <div className="text-sm font-semibold">
                              <AssessmentContentRenderer content={item.text} variant={"question" as any} />
                            </div>

                            {/* Question Answers Display based on question type */}
                            {(() => {
                              if (item.type === "multiple_choice" || item.type === "true_false" || item.type === "multiple_select" || item.type === "dropdown" || !item.type) {
                                return (
                                  <div className="grid gap-2">
                                    {item.options.map((opt: any) => {
                                      const isStudentPick = item.studentAnswer?.answer === opt.id || 
                                        (Array.isArray(item.studentAnswer?.answer) && item.studentAnswer.answer.includes(opt.id));
                                      const isCorrectOption = opt.isCorrect;

                                      return (
                                        <div
                                          key={opt.id}
                                          className={cn(
                                            "flex items-center gap-2.5 rounded-lg border p-3 text-sm transition-all",
                                            isCorrectOption
                                              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium"
                                              : isStudentPick
                                                ? "border-red-500/60 bg-red-500/10 text-red-800 dark:text-red-300"
                                                : "border-border/60 bg-background/30 text-muted-foreground"
                                          )}
                                        >
                                          <div className={cn(
                                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs border font-bold",
                                            isCorrectOption
                                              ? "border-emerald-500 bg-emerald-500 text-white"
                                              : isStudentPick
                                                ? "border-red-500 bg-red-500 text-white"
                                                : "border-muted-foreground/30"
                                          )}>
                                            {isCorrectOption ? "✓" : isStudentPick ? "✗" : ""}
                                          </div>
                                          <div className="flex-1">
                                            <AssessmentContentRenderer content={opt.text} variant="option" />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }

                              if (item.type === "short_answer" || item.type === "fill_blank" || item.type === "numerical" || item.type === "hotspot") {
                                return (
                                  <div className="space-y-3 rounded-lg border p-4 bg-muted/10">
                                    <div className="flex items-center justify-between text-xs border-b pb-2">
                                      <span className="font-semibold text-muted-foreground">Your Answer</span>
                                      <span className={cn("font-bold px-2 py-0.5 rounded text-[10px]", isCorrect ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500")}>
                                        {isCorrect ? "Correct" : "Incorrect"}
                                      </span>
                                    </div>
                                    <p className="text-sm font-bold text-foreground">
                                      {item.studentAnswer?.answer ? String(item.studentAnswer.answer) : <span className="text-muted-foreground italic font-normal">No Answer</span>}
                                    </p>

                                    <div className="text-xs pt-2 mt-2 border-t text-muted-foreground space-y-1">
                                      <span className="font-bold text-foreground">Accepted Correct Answer(s):</span>
                                      <div className="flex flex-wrap gap-1.5 mt-1">
                                        {item.options.filter((o: any) => o.isCorrect).map((o: any, oIdx: number) => (
                                          <Badge key={oIdx} variant="outline" className="text-xs font-semibold bg-emerald-500/5 text-emerald-600 border-emerald-500/20">
                                            {o.text}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              if (item.type === "ordering" || item.type === "sequence") {
                                const studentOrderIds = Array.isArray(item.studentAnswer?.answer) ? (item.studentAnswer.answer as string[]) : [];
                                const correctOrder = [...item.options].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
                                const studentOrder = studentOrderIds.map(id => item.options.find((o: any) => o.id === id)).filter(Boolean);

                                return (
                                  <div className="grid gap-4 md:grid-cols-2 text-xs">
                                    <div className="rounded-lg border p-3 bg-muted/10">
                                      <p className="font-bold text-muted-foreground border-b pb-1.5 mb-2">Your Ordering</p>
                                      {studentOrder.length === 0 ? (
                                        <p className="text-muted-foreground italic">No Answer</p>
                                      ) : (
                                        <ol className="list-decimal pl-5 space-y-1 text-foreground font-semibold">
                                          {studentOrder.map((o: any, oIdx: number) => (
                                            <li key={oIdx}>{o.text}</li>
                                          ))}
                                        </ol>
                                      )}
                                    </div>

                                    <div className="rounded-lg border border-emerald-500/20 p-3 bg-emerald-500/5">
                                      <p className="font-bold text-emerald-600 border-b border-emerald-500/20 pb-1.5 mb-2">Correct Ordering</p>
                                      <ol className="list-decimal pl-5 space-y-1 text-foreground font-semibold">
                                        {correctOrder.map((o: any, oIdx: number) => (
                                          <li key={oIdx}>{o.text}</li>
                                        ))}
                                      </ol>
                                    </div>
                                  </div>
                                );
                              }

                              if (item.type === "matching" || item.type === "matrix") {
                                const pairs: Array<{ left: any; right: any }> = [];
                                for (let i = 0; i < item.options.length; i += 2) {
                                  const left = item.options[i];
                                  const right = item.options[i + 1];
                                  if (left && right) pairs.push({ left, right });
                                }
                                const studentMatches = item.studentAnswer?.answer && typeof item.studentAnswer.answer === "object"
                                  ? (item.studentAnswer.answer as Record<string, string>)
                                  : {};

                                return (
                                  <div className="rounded-lg border overflow-hidden text-xs">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="bg-muted/40 border-b">
                                          <th className="p-2.5 font-bold">Prompt</th>
                                          <th className="p-2.5 font-bold">Your Match</th>
                                          <th className="p-2.5 font-bold">Correct Match</th>
                                          <th className="p-2.5 font-bold text-center">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {pairs.map((p, pIdx) => {
                                          const studentMatchId = studentMatches[p.left.id];
                                          const studentMatch = item.options.find((o: any) => o.id === studentMatchId);
                                          const isPairCorrect = studentMatchId === p.right.id;

                                          return (
                                            <tr key={pIdx} className="border-b last:border-0 hover:bg-muted/10 font-medium">
                                              <td className="p-2.5">{p.left.text}</td>
                                              <td className={cn("p-2.5 font-semibold", isPairCorrect ? "text-emerald-600" : "text-red-500")}>
                                                {studentMatch ? studentMatch.text : <span className="text-muted-foreground italic font-normal">Unmatched</span>}
                                              </td>
                                              <td className="p-2.5 text-emerald-600 font-semibold">{p.right.text}</td>
                                              <td className="p-2.5 text-center font-bold">
                                                {isPairCorrect ? <span className="text-emerald-600">✓</span> : <span className="text-red-500">✗</span>}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              }

                              return (
                                <div className="rounded-lg border p-4 bg-muted/10 text-xs">
                                  <p className="font-bold text-muted-foreground mb-1">Your Answer</p>
                                  <p className="text-sm font-semibold text-foreground">
                                    {item.studentAnswer?.answer ? String(item.studentAnswer.answer) : <span className="text-muted-foreground italic font-normal">No Answer</span>}
                                  </p>
                                </div>
                              );
                            })()}

                            {/* Explanations & Notes */}
                            {(item.explanation || item.hint || item.referenceLinks) && (
                              <div className="border-t pt-3 mt-2 space-y-2 text-xs text-muted-foreground">
                                {item.hint && (
                                  <div className="flex gap-1.5 items-start">
                                    <HelpCircle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
                                    <p><strong className="text-foreground">Hint:</strong> {item.hint}</p>
                                  </div>
                                )}
                                {item.explanation && (
                                  <div className="flex gap-1.5 items-start">
                                    <Info className="h-3.5 w-3.5 shrink-0 text-blue-500 mt-0.5" />
                                    <div>
                                      <strong className="text-foreground">Explanation:</strong>
                                      <AssessmentContentRenderer content={item.explanation} variant="explanation" />
                                    </div>
                                  </div>
                                )}
                                {item.referenceLinks && (
                                  <div className="flex gap-1.5 items-start">
                                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                                    <p>
                                      <strong className="text-foreground">Links:</strong>{" "}
                                      <a href={item.referenceLinks} target="_blank" rel="noreferrer" className="underline text-primary">
                                        Revisit reference notes
                                      </a>
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button
            onClick={handleDownloadCertificate}
            className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold"
          >
            <Award className="mr-2 h-4 w-4" />
            Download Certificate
          </Button>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link to="/student/quiz-results">
              <BarChart3 className="mr-2 h-4 w-4" />
              View quiz history
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResultStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-4 text-center border">
      <Icon className={cn("mx-auto mb-1.5 h-5 w-5", accent || "text-muted-foreground")} />
      <p className={cn("text-xl font-extrabold tabular-nums", accent)}>{value}</p>
      <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
