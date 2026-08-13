import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  FileText,
  ArrowLeft,
  Users,
  Award,
  Clock,
  ShieldAlert,
  Play,
  RotateCcw,
  BookOpen,
  Eye,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getLiveSessionReplayData,
  getParticipantAttemptReview,
  getQuestionResponses,
} from "@/lib/liveSession/api";
import { apiUrl } from "@/lib/api";
import { AttemptQuestionReview } from "@/components/quiz-reporting/AttemptQuestionReview";

interface ReplayEvent {
  id: string;
  eventType: string;
  timestamp: string;
  participantId: string | null;
  metadata: any;
  payload?: any;
  participant?: {
    displayName: string;
  } | null;
  displayName?: string | null;
}

type Tab = "summary" | "students" | "leaderboard" | "questions" | "analytics" | "proctoring";

function safeFormatDate(value?: string | Date | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function LiveSessionReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  
  // Timeline replay states
  const [timelineFilter, setTimelineFilter] = useState<string>("all");
  const [timelineIndex, setTimelineIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Student Detail Popup State
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentTableFilter, setStudentTableFilter] = useState<"all" | "completed" | "high" | "low" | "needs_review">("all");
  const [studentSort, setStudentSort] = useState<"score" | "accuracy" | "name">("score");
  const [questionResponses, setQuestionResponses] = useState<any | null>(null);
  const [exportBusy, setExportBusy] = useState<"csv" | "excel" | "pdf" | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Fetch Session Data & Replay logs
  const { data: analyticsData, isLoading: analyticsLoading, error: analyticsError, refetch: refetchAnalytics } = useQuery({
    queryKey: ["live-analytics", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const res = await getLiveSessionReplayData(sessionId!);
      if (res.error) throw new Error(res.error);
      return (res.data as any)?.data ?? res.data;
    },
  });

  const { data: participantReview, isLoading: reviewLoading } = useQuery({
    queryKey: ["participant-review", sessionId, selectedStudent?.id],
    enabled: !!sessionId && !!selectedStudent?.id,
    queryFn: async () => {
      const res = await getParticipantAttemptReview(sessionId!, selectedStudent.id);
      if (res.error) throw new Error(res.error);
      return (res.data as any)?.data ?? res.data;
    },
  });

  const participants: any[] = analyticsData?.participants || [];
  const session = analyticsData?.session || {};
  const report = analyticsData?.report || null;
  const reportSummary = report?.summary || analyticsData?.summary || null;
  const insights = report?.insights || analyticsData?.insights || null;
  const learningAnalytics = report?.learningAnalytics || analyticsData?.learningAnalytics || null;
  const securitySummary = report?.security || analyticsData?.security || null;
  const questionStats: any[] = analyticsData?.questionStats || report?.questionAnalysis || [];

  const fmtDuration = (ms: number | null | undefined) => {
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  };

  // Pre-process events to normalize payload/metadata
  const events = useMemo(() => {
    const rawEvents: ReplayEvent[] = analyticsData?.events || [];
    return rawEvents.map((e: ReplayEvent) => ({
      ...e,
      payload: e.payload || e.metadata || {},
      metadata: e.metadata || e.payload || {},
    }));
  }, [analyticsData?.events]);

  // Auto-play replay effect
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimelineIndex((prev) => {
        if (prev >= filteredEvents.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [isPlaying, events.length]);

  const filteredEvents = useMemo(() => {
    if (timelineFilter === "all") return events;
    return events.filter((e: ReplayEvent & { payload?: any }) => e.eventType === timelineFilter);
  }, [events, timelineFilter]);

  // Reset index when filter changes
  useEffect(() => {
    setTimelineIndex(0);
  }, [timelineFilter]);

  const avgAccuracy = reportSummary?.averageAccuracy ?? (
    participants.length === 0
      ? null
      : Math.round(
          participants.reduce((acc: number, curr: any) => acc + (Number(curr.accuracy) || 0), 0) / participants.length
        )
  );

  const totalParticipants = reportSummary?.participantCount ?? reportSummary?.totalParticipants ?? participants.length;
  const completedCount =
    reportSummary?.completedCount ??
    reportSummary?.completed ??
    participants.filter((p: any) => p.finishedAt || p.status === "submitted").length;
  const inProgressCount =
    reportSummary?.inProgressCount ?? Math.max(0, totalParticipants - completedCount);
  const totalViolations =
    securitySummary?.totalViolations ??
    participants.reduce((acc: number, curr: any) => acc + (curr.violationCount || 0), 0);
  const totalMarks =
    reportSummary?.totalMarks ??
    session.totalMarks ??
    (session.questions || []).reduce((a: number, c: any) => a + (c.marks || 0), 0);
  const avgPercentage = reportSummary?.averagePercentage ?? null;
  const highestScore = reportSummary?.highestScore ?? null;
  const lowestScore = reportSummary?.lowestScore ?? null;
  const medianScore = reportSummary?.medianScore ?? null;
  const completionRate =
    reportSummary?.completionRate ??
    (totalParticipants > 0
      ? Math.round((completedCount / totalParticipants) * 1000) / 10
      : null);
  const avgTimeMs = reportSummary?.averageTimeMs ?? null;
  const scoreDistribution = reportSummary?.scoreDistribution || [];
  const answerTotals = {
    correct: reportSummary?.totalCorrectAnswers ?? null,
    incorrect: reportSummary?.totalIncorrectAnswers ?? null,
    unanswered: reportSummary?.totalUnanswered ?? null,
  };

  // Computed averages for component display (academic marks)
  const avgScore = reportSummary?.averageScore ?? (
    participants.length > 0
      ? Math.round(
          participants.reduce((acc: number, curr: any) => acc + (curr.academicScore ?? curr.score ?? 0), 0) /
            participants.length
        )
      : null
  );
  const sortedParticipants = useMemo(() => {
    return [...participants].sort(
      (a: any, b: any) => (b.academicScore ?? b.score) - (a.academicScore ?? a.score)
    );
  }, [participants]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    let list = [...participants];
    if (q) {
      list = list.filter(
        (p) =>
          String(p.displayName || "").toLowerCase().includes(q) ||
          String(p.email || p.user?.email || "").toLowerCase().includes(q)
      );
    }
    list = list.filter((p) => {
      const pct =
        p.maxScore > 0
          ? Math.round(((p.academicScore ?? 0) / p.maxScore) * 100)
          : Number(p.accuracy) || 0;
      if (studentTableFilter === "completed") return !!(p.finishedAt || p.status === "submitted");
      if (studentTableFilter === "high") return pct >= 75;
      if (studentTableFilter === "low") return pct < 50;
      if (studentTableFilter === "needs_review") return (p.unansweredCount || 0) > 0 || pct < 40;
      return true;
    });
    list.sort((a, b) => {
      if (studentSort === "name") return String(a.displayName).localeCompare(String(b.displayName));
      if (studentSort === "accuracy") return (b.accuracy || 0) - (a.accuracy || 0);
      return (b.academicScore ?? b.score) - (a.academicScore ?? a.score);
    });
    return list;
  }, [participants, studentSearch, studentTableFilter, studentSort]);

  // Derived calculations: Topic Analytics (prefer canonical learning analytics)
  const topicAnalytics = useMemo(() => {
    if (learningAnalytics?.byTopic?.length) {
      return learningAnalytics.byTopic.map((t: any) => ({
        topic: t.topic,
        questions: t.questions,
        correctPercent: t.correctPercent,
        avgTime: t.averageTimeMs || 0,
        weakStudents: "—",
        strongStudents: "—",
      }));
    }
    const map: Record<string, { questions: number; correct: number; totalAnswers: number; timeSum: number; timeCount: number; studentScores: Record<string, { correct: number; total: number }> }> = {};
    const qList = session.questions || [];
    
    qList.forEach((q: any) => {
      const topic = q.topic || q.metadata?.topic || "General";
      if (!map[topic]) {
        map[topic] = { questions: 0, correct: 0, totalAnswers: 0, timeSum: 0, timeCount: 0, studentScores: {} };
      }
      map[topic].questions += 1;

      const qAnswers = events.filter((e: any) => e.eventType === "answer" && e.payload?.questionId === q.id);
      qAnswers.forEach((ans: any) => {
        map[topic].totalAnswers += 1;
        if (ans.payload?.isCorrect) map[topic].correct += 1;
        if (ans.payload?.responseTimeMs) {
          map[topic].timeSum += ans.payload.responseTimeMs;
          map[topic].timeCount += 1;
        }
        const p = participants.find((part) => part.id === ans.participantId);
        if (p) {
          if (!map[topic].studentScores[p.displayName]) {
            map[topic].studentScores[p.displayName] = { correct: 0, total: 0 };
          }
          map[topic].studentScores[p.displayName].total += 1;
          if (ans.payload?.isCorrect) map[topic].studentScores[p.displayName].correct += 1;
        }
      });
    });

    return Object.entries(map).map(([topic, data]) => {
      const correctPercent = data.totalAnswers > 0 ? Math.round((data.correct / data.totalAnswers) * 100) : 0;
      const avgTime = data.timeCount > 0 ? Math.round(data.timeSum / data.timeCount) : 0;

      const strongStudents: string[] = [];
      const weakStudents: string[] = [];
      Object.entries(data.studentScores).forEach(([studentName, score]) => {
        const acc = Math.round((score.correct / score.total) * 100);
        if (acc >= 75) strongStudents.push(studentName);
        if (acc < 50) weakStudents.push(studentName);
      });

      return {
        topic,
        questions: data.questions,
        correctPercent,
        avgTime,
        weakStudents: weakStudents.join(", ") || "None",
        strongStudents: strongStudents.join(", ") || "None"
      };
    });
  }, [session.questions, events, participants, learningAnalytics]);

  // Derived calculations: Bloom Analytics
  const bloomAnalytics = useMemo(() => {
    if (learningAnalytics?.byBloom?.length) {
      return learningAnalytics.byBloom.map((b: any) => ({
        level: b.level,
        questions: b.questions,
        correctPercent: b.correctPercent,
        avgTime: b.averageTimeMs || 0,
      }));
    }
    const map: Record<string, { questions: number; correct: number; totalAnswers: number; timeSum: number; timeCount: number }> = {};
    const qList = session.questions || [];

    qList.forEach((q: any) => {
      const level = q.bloomLevel || "L2";
      if (!map[level]) {
        map[level] = { questions: 0, correct: 0, totalAnswers: 0, timeSum: 0, timeCount: 0 };
      }
      map[level].questions += 1;

      const qAnswers = events.filter((e: any) => e.eventType === "answer" && e.payload?.questionId === q.id);
      qAnswers.forEach((ans: any) => {
        map[level].totalAnswers += 1;
        if (ans.payload?.isCorrect) map[level].correct += 1;
        if (ans.payload?.responseTimeMs) {
          map[level].timeSum += ans.payload.responseTimeMs;
          map[level].timeCount += 1;
        }
      });
    });

    return Object.entries(map).map(([level, data]) => {
      const correctPercent = data.totalAnswers > 0 ? Math.round((data.correct / data.totalAnswers) * 100) : 0;
      const avgTime = data.timeCount > 0 ? Math.round(data.timeSum / data.timeCount) : 0;
      return {
        level,
        questions: data.questions,
        correctPercent,
        avgTime
      };
    });
  }, [session.questions, events, learningAnalytics]);

  // Derived calculations: Difficulty Analytics
  const difficultyAnalytics = useMemo(() => {
    if (learningAnalytics?.byDifficulty?.length) {
      return learningAnalytics.byDifficulty.map((d: any) => ({
        diff: d.difficulty,
        questions: d.questions,
        correctPercent: d.correctPercent,
        avgTime: d.averageTimeMs || 0,
        avgMarks: Number(d.averageMarks ?? 0).toFixed(1),
      }));
    }
    const map: Record<string, { questions: number; correct: number; totalAnswers: number; timeSum: number; timeCount: number; marksSum: number }> = {};
    const qList = session.questions || [];

    qList.forEach((q: any) => {
      const diff = q.difficulty || "medium";
      if (!map[diff]) {
        map[diff] = { questions: 0, correct: 0, totalAnswers: 0, timeSum: 0, timeCount: 0, marksSum: 0 };
      }
      map[diff].questions += 1;

      const qAnswers = events.filter((e: any) => e.eventType === "answer" && e.payload?.questionId === q.id);
      qAnswers.forEach((ans: any) => {
        map[diff].totalAnswers += 1;
        if (ans.payload?.isCorrect) {
          map[diff].correct += 1;
          map[diff].marksSum += q.marks;
        } else {
          map[diff].marksSum -= q.negativeMarks || 0;
        }
        if (ans.payload?.responseTimeMs) {
          map[diff].timeSum += ans.payload.responseTimeMs;
          map[diff].timeCount += 1;
        }
      });
    });

    return Object.entries(map).map(([diff, data]) => {
      const correctPercent = data.totalAnswers > 0 ? Math.round((data.correct / data.totalAnswers) * 100) : 0;
      const avgTime = data.timeCount > 0 ? Math.round(data.timeSum / data.timeCount) : 0;
      const avgMarks = data.totalAnswers > 0 ? (data.marksSum / data.totalAnswers).toFixed(1) : "0.0";
      return {
        diff,
        questions: data.questions,
        correctPercent,
        avgTime,
        avgMarks
      };
    });
  }, [session.questions, events, learningAnalytics]);

  // Derived calculations: Question Analysis deep dive (prefer LiveAnswer questionStats)
  const questionAnalysis = useMemo(() => {
    const qList = session.questions || [];
    const sortedParts = [...participants].sort(
      (a, b) => (b.academicScore ?? b.score) - (a.academicScore ?? a.score)
    );
    const size = Math.max(1, Math.round(sortedParts.length * 0.27));
    const topParts = sortedParts.slice(0, size).map((p: any) => p.id);
    const bottomParts = sortedParts.slice(-size).map((p: any) => p.id);

    return qList.map((q: any) => {
      const fromStats = questionStats.find((s: any) => s.questionId === q.id);
      const participantAnswers = participants.flatMap((p: any) =>
        (p.answers || [])
          .filter((a: any) => a.questionId === q.id)
          .map((a: any) => ({ ...a, participantId: p.id }))
      );

      const corrects = fromStats?.correct ?? participantAnswers.filter((a: any) => a.isCorrect).length;
      const totalAnswersCount = fromStats?.answered ?? participantAnswers.length;
      const accuracy =
        fromStats?.correctPercent ??
        (totalAnswersCount > 0 ? Math.round((corrects / totalAnswersCount) * 100) : 0);
      const avgResponseTime =
        fromStats?.averageTimeMs ??
        (() => {
          const responseTimes = participantAnswers.map((a: any) => a.responseTimeMs || 0).filter(Boolean);
          return responseTimes.length > 0
            ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
            : 0;
        })();

      const topCorrect = participantAnswers.filter(
        (a: any) => topParts.includes(a.participantId) && a.isCorrect
      ).length;
      const bottomCorrect = participantAnswers.filter(
        (a: any) => bottomParts.includes(a.participantId) && a.isCorrect
      ).length;
      const discriminationIndex = size > 0 ? ((topCorrect - bottomCorrect) / size).toFixed(2) : "0.00";

      const optionCounts: Record<string, number> = {};
      const options = q.options || [];
      options.forEach((o: any) => {
        optionCounts[o.id] = 0;
      });
      if (fromStats?.optionDistribution) {
        for (const od of fromStats.optionDistribution) {
          optionCounts[od.optionId] = od.count || 0;
        }
      } else {
        participantAnswers.forEach((ans: any) => {
          const raw = ans.userAnswer ?? ans.answer;
          const ids = Array.isArray(raw)
            ? raw.map(String)
            : typeof raw === "string"
              ? [raw]
              : [];
          ids.forEach((id: string) => {
            if (optionCounts[id] != null) optionCounts[id] += 1;
          });
        });
      }

      let mostWrongOptionText = "None";
      let maxWrongCount = 0;
      options.forEach((o: any) => {
        if (!o.isCorrect && (optionCounts[o.id] || 0) > maxWrongCount) {
          maxWrongCount = optionCounts[o.id];
          mostWrongOptionText = o.text;
        }
      });

      return {
        ...q,
        accuracy,
        avgResponseTime,
        discriminationIndex,
        optionCounts,
        skippedCount: fromStats?.unanswered ?? Math.max(0, participants.length - totalAnswersCount),
        mostWrongOptionText,
        totalAnswersCount,
      };
    });
  }, [session.questions, participants, questionStats]);

  // Proctoring report summary
  const proctoringReport = useMemo(() => {
    const report: Record<string, {
      participantId: string;
      displayName: string;
      cameraStatus: "active" | "disabled" | "pending";
      violations: Array<{ timestamp: string; type: string; details: string; screenshot?: string }>;
      snapshots: Array<{ timestamp: string; frame: string }>;
      timeline: Array<{ timestamp: string; event: string; icon: string }>;
    }> = {};

    participants.forEach((p: any) => {
      report[p.id] = {
        participantId: p.id,
        displayName: p.displayName,
        cameraStatus: p.cameraOn ? "active" : "pending",
        violations: [],
        snapshots: [],
        timeline: [],
      };
    });

    events.forEach((ev: any) => {
      const pId = ev.participantId;
      if (!pId || !report[pId]) return;

      const type = ev.eventType || ev.type;
      const payload = ev.payload || {};

      if (type === "join") {
        report[pId].timeline.push({
          timestamp: ev.timestamp,
          event: "Joined the live session lobby",
          icon: "🚪",
        });
      } else if (type === "media_state") {
        const isCam = payload.cameraOn;
        report[pId].cameraStatus = isCam ? "active" : "disabled";
        report[pId].timeline.push({
          timestamp: ev.timestamp,
          event: isCam ? "Camera Enabled (Webcam Feed Started)" : "Camera Disabled (Webcam Feed Stopped)",
          icon: isCam ? "🟢" : "🔴",
        });
      } else if (type === "violation") {
        report[pId].violations.push({
          timestamp: ev.timestamp,
          type: payload.violationType || "Unknown",
          details: payload.details || "Suspicious behavior",
          screenshot: payload.screenshot || undefined,
        });
        report[pId].timeline.push({
          timestamp: ev.timestamp,
          event: `Proctor Violation: ${payload.details || payload.violationType}`,
          icon: "⚠️",
        });
        if (payload.violationType === "camera_blocked") {
          report[pId].cameraStatus = "disabled";
        }
      } else if (type === "snapshot" && payload.frame) {
        report[pId].snapshots.push({
          timestamp: ev.timestamp,
          frame: payload.frame,
        });
      } else if (type === "disconnect") {
        report[pId].timeline.push({
          timestamp: ev.timestamp,
          event: "Disconnected from the live session",
          icon: "🔌",
        });
      } else if (type === "reconnect") {
        report[pId].timeline.push({
          timestamp: ev.timestamp,
          event: "Reconnected to the live session",
          icon: "⚡",
        });
      }
    });

    return Object.values(report);
  }, [participants, events]);

  if (analyticsLoading) {
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

  if (analyticsError) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold">Unable to load report</h2>
        <p className="text-sm text-muted-foreground">{(analyticsError as Error).message}</p>
        <Button onClick={() => refetchAnalytics()}>Retry</Button>
      </div>
    );
  }

  const downloadExport = async (format: "csv" | "excel" | "pdf") => {
    if (!sessionId || exportBusy) return;
    setExportBusy(format);
    setExportMessage(`Generating ${format.toUpperCase()} report...`);
    try {
      const token = localStorage.getItem("lms_token") || "";
      const res = await fetch(
        apiUrl(`/api/live-sessions/${sessionId}/export-${format}?token=${encodeURIComponent(token)}`),
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename=([^;]+)/i);
      const filename = match ? match[1].replace(/"/g, "") : `QuizRoom_Report.${format === "excel" ? "xlsx" : format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMessage("Download completed.");
    } catch (err) {
      setExportMessage(`Unable to generate report. ${(err as Error).message}`);
    } finally {
      setExportBusy(null);
      setTimeout(() => setExportMessage(null), 4000);
    }
  };

  const handleExportCsv = () => { void downloadExport("csv"); };
  const handleExportExcel = () => { void downloadExport("excel"); };
  const handleExportPdf = () => { void downloadExport("pdf"); };

  const openStudentReview = (p: any) => {
    setSelectedStudent(p);
  };

  const openQuestionResponses = async (questionId: string) => {
    if (!sessionId) return;
    const res = await getQuestionResponses(sessionId, questionId);
    if (!res.error) {
      setQuestionResponses((res.data as any)?.data ?? res.data);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top action toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button variant="ghost" size="sm" asChild className="hover:bg-muted/80">
          <Link to="/instructor/quiz-room?tab=reports" className="flex items-center gap-1 text-xs font-semibold">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2 items-center">
          {exportMessage ? (
            <span className="text-[11px] font-semibold text-muted-foreground mr-1">{exportMessage}</span>
          ) : null}
          <Button variant="outline" size="sm" disabled={!!exportBusy} onClick={handleExportCsv} className="font-bold flex items-center gap-1.5 shadow-sm text-xs h-9">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> {exportBusy === "csv" ? "Generating..." : "Export CSV"}
          </Button>
          <Button variant="outline" size="sm" disabled={!!exportBusy} onClick={handleExportExcel} className="font-bold flex items-center gap-1.5 shadow-sm text-xs h-9">
            <FileSpreadsheet className="h-4 w-4 text-teal-600" /> {exportBusy === "excel" ? "Generating..." : "Export Excel"}
          </Button>
          <Button variant="outline" size="sm" disabled={!!exportBusy} onClick={handleExportPdf} className="font-bold flex items-center gap-1.5 shadow-sm text-xs h-9">
            <FileText className="h-4 w-4 text-red-500" /> {exportBusy === "pdf" ? "Generating..." : "Export PDF Report"}
          </Button>
          <Button variant="secondary" size="sm" asChild className="font-bold text-xs h-9">
            <Link to={`/instructor/quiz-room/${sessionId}/replay`}>
              Open Timeline Replay
            </Link>
          </Button>
        </div>
      </div>

      {/* Title */}
      <div>
        <p className="text-[11px] font-extrabold tracking-[0.14em] uppercase text-muted-foreground">Quiz Report</p>
        <h1 className="text-3xl font-black tracking-tight text-foreground">{report?.quiz?.title || session.title || "Session"}</h1>
        <p className="text-sm text-muted-foreground mt-1.5 font-medium">
          Room {session.roomCode || "—"}
          {report?.quiz?.instructorName ? ` · Instructor: ${report.quiz.instructorName}` : ""}
          {" · "}Hosted: {safeFormatDate(session.hostedAt || session.startedAt || session.createdAt)}
          {session.endedAt ? ` · Ended: ${safeFormatDate(session.endedAt)}` : ""}
          {session.startedAt && session.endedAt
            ? ` · Duration: ${fmtDuration(new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime())}`
            : ""}
        </p>
      </div>

      {/* Tabs list */}
      <div className="flex flex-wrap border-b border-border/80 gap-4 md:gap-6 text-xs font-extrabold tracking-wider uppercase text-muted-foreground">
        {(["summary", "students", "leaderboard", "questions", "analytics", "proctoring"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "pb-3 border-b-2 transition-all relative top-[2px]",
              activeTab === tab
                ? "border-primary text-foreground font-black"
                : "border-transparent hover:text-foreground"
            )}
          >
            {tab === "summary" ? "Session Summary" :
             tab === "students" ? "Student Responses" :
             tab === "leaderboard" ? "Leaderboard" :
             tab === "questions" ? "Question Analysis" :
             tab === "analytics" ? "Learning Analytics" :
             "Security Proctoring"}
          </button>
        ))}
      </div>

      {/* Content tabs */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {totalParticipants === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                No students have completed this quiz yet. Analytics appear after participants join and submit answers.
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            <KpiCard icon={Users} label="Total Participants" value={totalParticipants} description={`${completedCount} completed · ${inProgressCount} in progress`} />
            <KpiCard
              icon={Award}
              label="Completion Rate"
              value={completionRate == null ? "—" : `${completionRate}%`}
              description="Completed ÷ participants"
            />
            <KpiCard
              icon={Award}
              label="Average Score"
              value={avgScore == null ? "—" : `${avgScore} / ${totalMarks || "—"}`}
              description={avgPercentage == null ? "Academic marks" : `Average ${avgPercentage}%`}
            />
            <KpiCard icon={Award} label="Average %" value={avgPercentage == null ? "—" : `${avgPercentage}%`} description="Weighted score percentage" />
            <KpiCard icon={BookOpen} label="Average Accuracy" value={avgAccuracy == null ? "—" : `${avgAccuracy}%`} description="Correct ÷ attempted questions" />
            <KpiCard
              icon={Award}
              label="Highest Score"
              value={highestScore == null ? "—" : `${highestScore} / ${totalMarks || "—"}`}
              description="Best academic result"
            />
            <KpiCard
              icon={Award}
              label="Lowest Score"
              value={lowestScore == null ? "—" : `${lowestScore} / ${totalMarks || "—"}`}
              description="Lowest academic result"
            />
            <KpiCard
              icon={Award}
              label="Median Score"
              value={medianScore == null ? "—" : `${medianScore} / ${totalMarks || "—"}`}
              description="Middle academic result"
            />
            <KpiCard icon={Clock} label="Average Time" value={fmtDuration(avgTimeMs)} description="Across answered questions" />
            <KpiCard icon={ShieldAlert} label="Total Marks" value={totalMarks || "—"} description={`${reportSummary?.totalQuestions || session.questionCount || session.questions?.length || 0} questions · ${totalViolations} violations`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border shadow-md">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-extrabold">Score Distribution</CardTitle>
                <CardDescription>Percentage buckets from academic scores</CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                {scoreDistribution.length === 0 || scoreDistribution.every((b: any) => !b.count) ? (
                  <p className="text-sm text-muted-foreground">No score distribution data yet.</p>
                ) : (
                  scoreDistribution.map((bucket: any) => {
                    const max = Math.max(...scoreDistribution.map((b: any) => b.count || 0), 1);
                    const width = Math.round(((bucket.count || 0) / max) * 100);
                    return (
                      <div key={bucket.bucket} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span>{bucket.bucket}</span>
                          <span>{bucket.count || 0}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border shadow-md">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-extrabold">Answer Outcomes</CardTitle>
                <CardDescription>Correct vs incorrect vs unanswered</CardDescription>
              </CardHeader>
              <CardContent className="p-5 grid grid-cols-3 gap-3">
                {[
                  { label: "Correct", value: answerTotals.correct, className: "text-emerald-600" },
                  { label: "Incorrect", value: answerTotals.incorrect, className: "text-red-500" },
                  { label: "Unanswered", value: answerTotals.unanswered, className: "text-muted-foreground" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border bg-muted/20 p-4 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                    <p className={`mt-2 text-2xl font-black ${item.className}`}>
                      {item.value == null ? "—" : item.value}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="border shadow-md">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-extrabold">Class Performance Insights</CardTitle>
            </CardHeader>
            <CardContent className="p-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Strongest Question",
                  value: insights?.strongestQuestion
                    ? `Q${insights.strongestQuestion.number} · ${insights.strongestQuestion.correctPercent}% correct`
                    : "Insufficient data",
                },
                {
                  label: "Most Difficult",
                  value: insights?.weakestQuestion
                    ? `Q${insights.weakestQuestion.number} · ${insights.weakestQuestion.correctPercent}% correct`
                    : "Insufficient data",
                },
                {
                  label: "Fastest Question",
                  value: insights?.fastestQuestion
                    ? `Q${insights.fastestQuestion.number} · ${fmtDuration(insights.fastestQuestion.averageTimeMs)}`
                    : "Insufficient data",
                },
                {
                  label: "Slowest Question",
                  value: insights?.slowestQuestion
                    ? `Q${insights.slowestQuestion.number} · ${fmtDuration(insights.slowestQuestion.averageTimeMs)}`
                    : "Insufficient data",
                },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border p-4 bg-card">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">{card.label}</p>
                  <p className="mt-2 text-sm font-bold text-foreground">{card.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border shadow-md">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-extrabold">Question Performance</CardTitle>
              <CardDescription>Click View Responses for per-student detail</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {questionStats.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No response data available yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 font-bold border-b">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Question</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Marks</th>
                        <th className="p-3">Correct %</th>
                        <th className="p-3">Incorrect %</th>
                        <th className="p-3">Unanswered %</th>
                        <th className="p-3">Avg Time</th>
                        <th className="p-3">Difficulty</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questionStats.map((q: any, idx: number) => (
                        <tr key={q.questionId || idx} className="border-b align-top">
                          <td className="p-3 font-black">Q{q.number || idx + 1}</td>
                          <td className="p-3 max-w-[280px]">
                            <p className="font-semibold line-clamp-2">{q.text || "—"}</p>
                          </td>
                          <td className="p-3 uppercase">{q.type || "—"}</td>
                          <td className="p-3">{q.marks ?? "—"}</td>
                          <td className="p-3 text-emerald-600 font-bold">{q.correctPercent ?? 0}%</td>
                          <td className="p-3 text-red-500 font-bold">{q.incorrectPercent ?? 0}%</td>
                          <td className="p-3 text-muted-foreground font-bold">{q.unansweredPercent ?? 0}%</td>
                          <td className="p-3">{fmtDuration(q.averageTimeMs)}</td>
                          <td className="p-3 capitalize">{q.difficulty || "—"}</td>
                          <td className="p-3 text-right">
                            <Button size="sm" variant="outline" className="h-8 text-[11px] font-bold" onClick={() => openQuestionResponses(q.questionId)}>
                              View Responses
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "students" && (
        <Card className="border shadow-md">
          <CardHeader className="pb-3 border-b bg-muted/10 space-y-3">
            <div>
              <CardTitle className="text-sm font-extrabold text-foreground">Student Responses</CardTitle>
              <CardDescription>Search, filter, and open full attempt review for any participant.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student or email"
                  className="w-full h-9 rounded-md border bg-background pl-8 pr-3 text-xs"
                />
              </div>
              {(["all", "completed", "high", "low", "needs_review"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStudentTableFilter(f)}
                  className={cn(
                    "h-9 px-3 rounded-md border text-[10px] font-bold uppercase",
                    studentTableFilter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card"
                  )}
                >
                  {f.replace("_", " ")}
                </button>
              ))}
              <select
                value={studentSort}
                onChange={(e) => setStudentSort(e.target.value as any)}
                className="h-9 rounded-md border bg-background px-2 text-xs font-semibold"
              >
                <option value="score">Sort: Score</option>
                <option value="accuracy">Sort: Accuracy</option>
                <option value="name">Sort: Name</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredStudents.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">No students match this filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 font-bold border-b">
                    <tr>
                      <th className="p-4">Rank</th>
                      <th className="p-4">Student</th>
                      <th className="p-4">Score</th>
                      <th className="p-4 text-center">%</th>
                      <th className="p-4 text-center">Accuracy</th>
                      <th className="p-4 text-center">Correct</th>
                      <th className="p-4 text-center">Incorrect</th>
                      <th className="p-4 text-center">Unanswered</th>
                      <th className="p-4 text-center">Time</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((p: any) => {
                      const max = p.maxScore ?? totalMarks ?? 0;
                      const score = p.academicScore ?? 0;
                      const pct = p.percentage ?? (max > 0 ? Math.round((score / max) * 100) : 0);
                      return (
                      <tr key={p.id} className="border-b hover:bg-muted/10 font-medium">
                        <td className="p-4 font-black">#{p.rank || "—"}</td>
                        <td className="p-4">
                          <p className="font-extrabold text-foreground">{p.displayName}</p>
                          <p className="text-[10px] text-muted-foreground">{p.email || p.user?.email || "Guest"}</p>
                        </td>
                        <td className="p-4 font-bold">{score} / {max || "—"}</td>
                        <td className="p-4 text-center font-bold">{pct}%</td>
                        <td className="p-4 text-center">{Math.round(p.accuracy || 0)}%</td>
                        <td className="p-4 text-center text-emerald-600">{p.correctCount ?? 0}</td>
                        <td className="p-4 text-center text-red-500">{p.wrongCount ?? p.incorrectCount ?? 0}</td>
                        <td className="p-4 text-center text-muted-foreground">{p.unansweredCount ?? 0}</td>
                        <td className="p-4 text-center">
                          {fmtDuration(p.timeTakenMs)}
                        </td>
                        <td className="p-4 text-center capitalize">{p.finishedAt || p.status === "submitted" ? "Completed" : p.status || "—"}</td>
                        <td className="p-4 text-right">
                          <Button size="sm" variant="outline" className="h-8 text-[11px] font-bold" onClick={() => openStudentReview(p)}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> View Report
                          </Button>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "leaderboard" && (
        <Card className="border shadow-md">
          <CardHeader className="pb-3 border-b bg-muted/10">
            <CardTitle className="text-sm font-extrabold text-foreground">Leaderboard</CardTitle>
            <CardDescription>Ranked by academic marks (not live gamification points). Top 3 highlighted.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {sortedParticipants.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">No students have completed this quiz yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 font-bold border-b">
                    <tr>
                      <th className="p-4">Rank</th>
                      <th className="p-4">Student</th>
                      <th className="p-4">Score</th>
                      <th className="p-4 text-center">%</th>
                      <th className="p-4 text-center">Accuracy</th>
                      <th className="p-4 text-center">Correct</th>
                      <th className="p-4 text-center">Time</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedParticipants.map((p: any, idx: number) => {
                      const studentMarks = p.academicScore ?? 0;
                      const max = p.maxScore ?? totalMarks ?? 0;
                      const pct = p.percentage ?? (max > 0 ? Math.round((studentMarks / max) * 100) : 0);
                      const isTop3 = idx < 3;
                      return (
                        <tr
                          key={p.id}
                          className={cn(
                            "border-b hover:bg-muted/10 transition-colors font-medium cursor-pointer",
                            isTop3 && "bg-amber-500/[0.06]"
                          )}
                          onClick={() => openStudentReview(p)}
                        >
                          <td className="p-4 font-black">#{p.rank || idx + 1}</td>
                          <td className="p-4">
                            <p className="font-extrabold text-foreground">{p.displayName}</p>
                            <p className="text-[10px] text-muted-foreground">{p.user?.email || p.email || "Guest"}</p>
                          </td>
                          <td className="p-4 font-bold text-foreground">{studentMarks} / {max || "—"}</td>
                          <td className="p-4 text-center font-bold">{pct}%</td>
                          <td className="p-4 text-center">{Math.round(p.accuracy || 0)}%</td>
                          <td className="p-4 text-center text-emerald-600">{p.correctCount ?? 0}</td>
                          <td className="p-4 text-center">{fmtDuration(p.timeTakenMs)}</td>
                          <td className="p-4 text-right">
                            <Button size="icon" variant="ghost" className="h-8 w-8">
                              <Eye className="h-4 w-4 text-primary" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "questions" && (
        <Card className="border shadow-md">
          <CardHeader className="pb-3 border-b bg-muted/10">
            <CardTitle className="text-sm font-extrabold text-foreground">Question-by-Question Deep Dive</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-8">
            {questionAnalysis.map((q: any, idx: number) => (
              <div key={q.id} className="border rounded-xl p-5 bg-muted/5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3 text-xs font-semibold text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-black">Q{idx + 1} ({q.type.toUpperCase()})</span>
                    <Badge
                      className={q.accuracy >= 75 ? "bg-emerald-500 hover:bg-emerald-600 text-white" : q.accuracy >= 50 ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
                      variant={q.accuracy >= 75 ? "default" : q.accuracy >= 50 ? "secondary" : "destructive"}
                    >
                      Accuracy: {q.accuracy}%
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <span>Average Response: <strong className="text-foreground">{(q.avgResponseTime / 1000).toFixed(1)}s</strong></span>
                    <span>Marks: <strong>{q.marks}</strong> (Neg: -{q.negativeMarks})</span>
                    <Button size="sm" variant="outline" className="h-8 text-[11px] font-bold" onClick={() => openQuestionResponses(q.id)}>
                      View Responses
                    </Button>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                  {/* Stem & Correct Option Details */}
                  <div className="md:col-span-2 space-y-4">
                    <p className="font-extrabold text-sm text-foreground">{q.text}</p>
                    
                    {/* Choice options list */}
                    <div className="space-y-1.5">
                      {(q.options || []).map((o: any) => {
                        const selCount = q.optionCounts[o.id] || 0;
                        const selPercent = q.totalAnswersCount > 0 ? Math.round((selCount / q.totalAnswersCount) * 100) : 0;
                        return (
                          <div
                            key={o.id}
                            className={cn(
                              "p-2.5 rounded border text-xs font-medium space-y-1.5",
                              o.isCorrect ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700" : "bg-card border-border text-foreground"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{o.text}</span>
                              <span className="font-bold flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-muted-foreground">{selCount} ({selPercent}%)</span>
                                {o.isCorrect && <span className="text-[9px] uppercase bg-emerald-500 text-white px-1.5 py-0.5 rounded font-black">Correct</span>}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", o.isCorrect ? "bg-emerald-500" : "bg-slate-400")}
                                style={{ width: `${selPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Indices & Parameters */}
                  <div className="border-l pl-5 space-y-3 text-xs font-semibold text-muted-foreground">
                    <p className="flex justify-between"><span>Difficulty Index (Accuracy):</span> <strong className="text-foreground">{(q.accuracy / 100).toFixed(2)}</strong></p>
                    <p className="flex justify-between"><span>Discrimination Index:</span> <strong className="text-foreground">{q.discriminationIndex}</strong></p>
                    <p className="flex justify-between"><span>Topic / Area:</span> <strong className="text-foreground">{q.topic || q.metadata?.topic || "General"}</strong></p>
                    <p className="flex justify-between"><span>Bloom Cognitive Domain:</span> <strong className="text-foreground">{q.bloomLevel || "L2"}</strong></p>
                    {q.hint && <p className="text-amber-600">💡 <strong>Hint:</strong> {q.hint}</p>}
                    {q.explanation && <p className="text-muted-foreground">✍️ <strong>Explanation:</strong> {q.explanation}</p>}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === "analytics" && (
        <div className="grid gap-6">
          {/* Topic mastery breakdown table */}
          <Card className="border shadow-md">
            <CardHeader className="pb-3 border-b bg-muted/10">
              <CardTitle className="text-sm font-extrabold text-foreground">Topic Mastery Analytics</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 font-bold border-b">
                  <tr>
                    <th className="p-4">Topic</th>
                    <th className="p-4 text-center">Questions</th>
                    <th className="p-4 text-center">Accuracy (%)</th>
                    <th className="p-4 text-center">Average response time</th>
                    <th className="p-4">Weak Students (&lt;50%)</th>
                    <th className="p-4">Strong Students (&gt;=75%)</th>
                  </tr>
                </thead>
                <tbody>
                  {topicAnalytics.map((topic: any, idx: number) => (
                    <tr key={idx} className="border-b font-medium">
                      <td className="p-4 font-bold text-foreground">{topic.topic}</td>
                      <td className="p-4 text-center">{topic.questions}</td>
                      <td className="p-4 text-center font-bold text-foreground">{topic.correctPercent}%</td>
                      <td className="p-4 text-center">{(topic.avgTime / 1000).toFixed(2)}s</td>
                      <td className="p-4 text-red-500 font-bold max-w-[200px] truncate">{topic.weakStudents}</td>
                      <td className="p-4 text-emerald-600 font-bold max-w-[200px] truncate">{topic.strongStudents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Bloom Taxonomy mastery table */}
          <Card className="border shadow-md">
            <CardHeader className="pb-3 border-b bg-muted/10">
              <CardTitle className="text-sm font-extrabold text-foreground">Bloom's Taxonomy Analytics</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 font-bold border-b">
                  <tr>
                    <th className="p-4">Cognitive Domain</th>
                    <th className="p-4 text-center">Questions</th>
                    <th className="p-4 text-center">Accuracy (%)</th>
                    <th className="p-4 text-center">Average response time</th>
                  </tr>
                </thead>
                <tbody>
                  {bloomAnalytics.map((bloom: any, idx: number) => (
                    <tr key={idx} className="border-b font-medium">
                      <td className="p-4 font-bold text-foreground">{bloom.level}</td>
                      <td className="p-4 text-center">{bloom.questions}</td>
                      <td className="p-4 text-center font-bold text-foreground">{bloom.correctPercent}%</td>
                      <td className="p-4 text-center">{(bloom.avgTime / 1000).toFixed(2)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Difficulty Mastery statistics table */}
          <Card className="border shadow-md">
            <CardHeader className="pb-3 border-b bg-muted/10">
              <CardTitle className="text-sm font-extrabold text-foreground">Difficulty Analytics</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 font-bold border-b">
                  <tr>
                    <th className="p-4">Difficulty</th>
                    <th className="p-4 text-center">Questions</th>
                    <th className="p-4 text-center">Accuracy (%)</th>
                    <th className="p-4 text-center font-bold text-foreground">Average Marks</th>
                    <th className="p-4 text-center">Average response time</th>
                  </tr>
                </thead>
                <tbody>
                  {difficultyAnalytics.map((diff: any, idx: number) => (
                    <tr key={idx} className="border-b font-medium">
                      <td className="p-4 font-bold text-foreground capitalize">{diff.diff}</td>
                      <td className="p-4 text-center">{diff.questions}</td>
                      <td className="p-4 text-center font-bold text-foreground">{diff.correctPercent}%</td>
                      <td className="p-4 text-center font-bold text-purple-600">{diff.avgMarks}</td>
                      <td className="p-4 text-center">{(diff.avgTime / 1000).toFixed(2)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "proctoring" && (
        <div className="space-y-6">
          {/* Original dynamic proctoring logs widget (which displays snapshots gallery and timeline) */}
          {session.settings?.cameraRequired && (
            <Card className="border shadow-md overflow-hidden bg-card">
              <CardHeader className="border-b bg-muted/20 pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-1.5 text-foreground">
                  <ShieldAlert className="h-5 w-5 text-red-500" /> Camera Proctoring & Student Security Logs
                </CardTitle>
                <CardDescription>
                  Webcam status, violation screenshots, and continuous proctoring snapshots captured during the session.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {proctoringReport.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-8">
                    No security events recorded.
                  </div>
                ) : (
                  <div className="space-y-8">
                    {proctoringReport.map((student) => (
                      <div key={student.participantId} className="border rounded-xl p-5 bg-muted/5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3">
                          <div>
                            <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
                              {student.displayName}
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                student.cameraStatus === "active" ? "bg-emerald-500/10 text-emerald-600" :
                                student.cameraStatus === "disabled" ? "bg-red-500/10 text-red-600" :
                                "bg-amber-500/10 text-amber-600"
                              )}>
                                {student.cameraStatus === "active" ? "🟢 Camera Active" :
                                 student.cameraStatus === "disabled" ? "🔴 Camera Disabled" :
                                 "🟡 Permission Pending"}
                              </span>
                            </h3>
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                              Total violations flagged: <strong className="text-red-500">{student.violations.length}</strong>
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          {/* Snapshots Gallery */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                              📸 Camera Snapshots ({student.snapshots.length})
                            </h4>
                            {student.snapshots.length === 0 ? (
                              <div className="h-32 border border-dashed rounded-lg flex items-center justify-center text-[10px] text-muted-foreground bg-muted/15 font-semibold">
                                No snapshots captured
                              </div>
                            ) : (
                              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                {student.snapshots.map((snap, sIdx) => (
                                  <div key={sIdx} className="shrink-0 space-y-1">
                                    <div className="h-24 w-32 bg-black rounded-lg overflow-hidden border">
                                      <img src={snap.frame} alt="Webcam Snapshot" className="h-full w-full object-cover scale-x-[-1]" />
                                    </div>
                                    <p className="text-[8px] text-center text-muted-foreground font-bold">
                                      {new Date(snap.timestamp).toLocaleTimeString()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Violations Logs */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                              ⚠️ Security Violations ({student.violations.length})
                            </h4>
                            {student.violations.length === 0 ? (
                              <div className="h-32 border border-dashed rounded-lg flex items-center justify-center text-[10px] text-emerald-600 bg-emerald-500/[0.02] font-semibold">
                                Clean session (0 violations)
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                                {student.violations.map((v, vIdx) => (
                                  <div key={vIdx} className="rounded-lg border border-red-500/10 bg-red-500/5 p-2 text-[10px] space-y-1.5">
                                    <div className="flex justify-between font-bold text-red-600 uppercase">
                                      <span>{v.type.replace("_", " ")}</span>
                                      <span>{new Date(v.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-foreground leading-normal font-semibold">{v.details}</p>
                                    {v.screenshot && (
                                      <div className="h-16 w-24 bg-black rounded border overflow-hidden">
                                        <img src={v.screenshot} alt="Violation Screen" className="h-full w-full object-cover" />
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Timeline */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                              ⏳ Security Status Timeline ({student.timeline.length})
                            </h4>
                            {student.timeline.length === 0 ? (
                              <div className="h-32 border border-dashed rounded-lg flex items-center justify-center text-[10px] text-muted-foreground bg-muted/15 font-semibold">
                                No timeline records
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                                {student.timeline.map((item, tIdx) => (
                                  <div key={tIdx} className="flex gap-2 text-[10px] font-semibold items-start">
                                    <span className="shrink-0">{item.icon}</span>
                                    <div className="space-y-0.5">
                                      <p className="text-foreground leading-snug">{item.event}</p>
                                      <span className="text-[8px] text-muted-foreground font-bold">
                                        {new Date(item.timestamp).toLocaleTimeString()}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Event ledger playback scrubber */}
          <Card className="border shadow-md">
            <CardHeader className="border-b bg-muted/10 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-foreground">Timeline Ledger Playback</CardTitle>
                <CardDescription>Scrub or auto-play through the chronology of joining, violations, chat, and answers.</CardDescription>
              </div>
              <div className="flex gap-1">
                {(["all", "join", "violation", "answer", "chat"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTimelineFilter(filter)}
                    className={cn(
                      "text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded border capitalize transition-all",
                      timelineFilter === filter
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-card border-border/80 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex items-center gap-4">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={filteredEvents.length === 0}
                  className="rounded-full shadow-sm"
                >
                  {isPlaying ? <span className="text-xs font-black">Pause</span> : <Play className="h-4.5 w-4.5 text-primary ml-0.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setTimelineIndex(0)}
                  disabled={filteredEvents.length === 0}
                  className="rounded-full"
                >
                  <RotateCcw className="h-4.5 w-4.5 text-muted-foreground" />
                </Button>

                <div className="flex-1 relative py-2">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, filteredEvents.length - 1)}
                    value={timelineIndex}
                    onChange={(e) => setTimelineIndex(parseInt(e.target.value, 10))}
                    className="w-full accent-primary bg-muted rounded-lg h-2 outline-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-muted-foreground font-bold mt-1.5">
                    <span>Start Session</span>
                    <span>Ledger Event {timelineIndex + 1} of {filteredEvents.length}</span>
                    <span>Finish Session</span>
                  </div>
                </div>
              </div>

              {filteredEvents[timelineIndex] ? (
                <div className="rounded-xl border bg-muted/10 p-4 space-y-2 border-primary/10">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs font-bold text-primary uppercase tracking-widest">
                      Event: {filteredEvents[timelineIndex].eventType.replace("_", " ")}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {new Date(filteredEvents[timelineIndex].timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-foreground">
                    <p>
                      Participant:{" "}
                      <span className="font-extrabold">
                        {filteredEvents[timelineIndex].participant?.displayName || "System/Instructor"}
                      </span>
                    </p>
                    <div className="mt-2 bg-background border rounded p-2.5 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap max-h-24 overflow-y-auto">
                      {JSON.stringify(filteredEvents[timelineIndex].metadata, null, 2)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-xs text-muted-foreground py-8">
                  No events found for this filter.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* STUDENT DETAILED ATTEMPT REPORT POPUP MODAL */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-background border rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b flex justify-between items-center bg-muted/20">
              <div>
                <h2 className="text-lg font-black text-foreground">Student Attempt Review</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Student: <strong>{selectedStudent.displayName}</strong> · Email:{" "}
                  {selectedStudent.user?.email || selectedStudent.email || "Guest"}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedStudent(null)} className="h-9 w-9 rounded-full font-bold">
                ✕
              </Button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {reviewLoading ? (
                <div className="py-16 text-center text-sm text-muted-foreground animate-pulse">Loading attempt review…</div>
              ) : participantReview ? (
                <AttemptQuestionReview
                  summary={participantReview.summary}
                  questions={participantReview.questions || []}
                />
              ) : (
                <div className="py-16 text-center text-sm text-muted-foreground">Unable to load attempt review.</div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end bg-muted/10 rounded-b-2xl">
              <Button size="sm" onClick={() => setSelectedStudent(null)} className="font-bold text-xs h-9">
                Close Report View
              </Button>
            </div>
          </div>
        </div>
      )}

      {questionResponses && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-background border rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="text-base font-black">Question Responses</h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {questionResponses.question?.text || "Per-student answers"}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setQuestionResponses(null)}>✕</Button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 text-xs">
              {(questionResponses.optionDistribution || []).map((o: any) => (
                <div key={o.optionId} className="flex justify-between rounded border px-3 py-2">
                  <span className={o.isCorrect ? "text-emerald-700 font-semibold" : ""}>{o.text}</span>
                  <span className="font-bold">{o.count} selected</span>
                </div>
              ))}
              <div className="border-t pt-3 space-y-2">
                {(questionResponses.responses || []).map((r: any, idx: number) => (
                  <div key={idx} className="rounded-lg border p-3 flex justify-between gap-3">
                    <div>
                      <p className="font-bold">{r.displayName || r.studentName || "Student"}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {typeof r.selectedAnswer === "string"
                          ? r.selectedAnswer
                          : JSON.stringify(r.selectedAnswer ?? r.answer ?? "—")}
                      </p>
                    </div>
                    <Badge variant={r.isCorrect ? "default" : "destructive"}>
                      {r.isCorrect ? "Correct" : r.answered === false ? "Unanswered" : "Incorrect"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, description, className }: any) {
  return (
    <Card className={cn("border shadow-sm", className)}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
          <Icon className="h-5 w-5 text-muted-foreground/60" />
        </div>
        <p className="text-2xl font-black text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">{description}</p>
      </CardContent>
    </Card>
  );
}
