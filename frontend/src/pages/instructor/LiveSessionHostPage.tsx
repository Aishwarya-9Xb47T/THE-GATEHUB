import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  SkipForward,
  Square,
  Monitor,
  Users,
  Shield,
  MessageSquare,
  Activity,
  AlertTriangle,
  AlertCircle,
  Send,
  UserCheck,
  Megaphone,
  Plus,
  Minus,
  Wrench,
  ExternalLink,
  RefreshCw,
  User,
  Pin,
  Volume2,
  VolumeX,
  Shuffle,
  RotateCw,
  Play,
  Pause,
  SkipBack,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getLiveAnalytics, getQuizRoomJoinUrl, postAutoFixQuiz } from "@/lib/liveSession/api";
import type { LiveQuizValidationError } from "@/lib/liveSession/api";
import { mapLiveHostError } from "@/lib/liveSession/liveErrorMessages";
import { isSelfPacedLive } from "@/lib/liveSession/paceMode";
import { useLiveSessionSocket } from "@/hooks/useLiveSessionSocket";
import { WaitingRoomPanel } from "@/components/quiz-room/WaitingRoomPanel";
import { LiveSessionAnalyticsPanel } from "@/components/live-session/LiveSessionAnalyticsPanel";
import { LiveHostSessionComplete } from "@/components/live-session/LiveHostSessionComplete";
import { LiveHostLoadingSkeleton } from "@/components/live-session/LiveHostLoadingSkeleton";
import { LiveConnectionBanner } from "@/components/live-session/LiveConnectionBanner";
import { QuizRoomStatusBadge } from "@/components/quiz-room/QuizRoomStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToastStore } from "@/store/toastStore";
import { API_BASE_URL } from "@/lib/api";
import { mediaApiBase } from "@/lib/latexEditor/projectAssetResolver";
import type { LiveSessionStatus } from "@/lib/liveSession/types";
import { LivePodium } from "@/components/live-session/LivePodium";
import { cn } from "@/lib/utils";

type Tab = "analytics" | "proctoring" | "chat";

export function LiveSessionHostPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [finished, setFinished] = useState(false);
  const [answerPulse, setAnswerPulse] = useState(0);
  const fatalToastShown = useRef(false);
  const restoredToastShown = useRef(false);
  const toast = useToastStore((s) => s.add);

  // V2 UI Elements
  const [activeTab, setActiveTab] = useState<Tab>("analytics");
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [alerts, setAlerts] = useState<Array<{ id: string; time: string; text: string; type: string; participantId?: string }>>([]);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: string; text: string; time: string; isMe: boolean }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [announcementText, setAnnouncementText] = useState("");
  
  // Synchronized countdown states
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownQuestionIdx, setCountdownQuestionIdx] = useState<number>(0);

  // Proctor overrides & Pinned states
  const [pinnedStudentId, setPinnedStudentId] = useState<string | null>(null);
  const [expandedStudent, setExpandedStudent] = useState<any | null>(null);
  const [autoFixing, setAutoFixing] = useState(false);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  const {
    connectionPhase,
    sessionState,
    leaderboard,
    actionError,
    wasRestored,
    hostStart,
    hostNextQuestion,
    hostFinish,
    send,
    clearActionError,
    clearWasRestored,
  } = useLiveSessionSocket({
    sessionId: sessionId!,
    mode: "host",
    onSessionFinished: () => setFinished(true),
    onAnswerReceived: () => {
      void refetchAnalytics();
      setAnswerPulse((n) => n + 1);
    },
    onQuestionCountdown: (questionIndex, duration) => {
      setCountdown(duration);
      setCountdownQuestionIdx(questionIndex);
    },
    onReconnected: () => {
      if (!restoredToastShown.current) {
        restoredToastShown.current = true;
        toast({ title: "Connection restored", description: "Live session reconnected." });
      }
      void refetchAnalytics();
    },
  });

  const hostAudioRef = useRef<HTMLAudioElement | null>(null);

  const [hostCurrentTime, setHostCurrentTime] = useState(0);
  const [hostDuration, setHostDuration] = useState(0);

  // Monitor hostAudioRef for time and duration updates
  useEffect(() => {
    const interval = setInterval(() => {
      const audio = hostAudioRef.current;
      if (audio) {
        setHostCurrentTime(audio.currentTime);
        setHostDuration(audio.duration || 0);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Format seconds to mm:ss format
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Automatic Event-based Music Transitions moved to after analyticsData query declaration.

  const handleStop = () => {
    const settings = (sessionState?.settings || {}) as any;
    if (hostAudioRef.current) {
      hostAudioRef.current.currentTime = 0;
      hostAudioRef.current.pause();
    }
    send({
      type: "client:update_music",
      musicEnabled: settings.musicEnabled,
      musicPlaying: false,
      musicVolume: settings.musicVolume ?? 50,
      musicLoop: settings.musicLoop !== false,
      musicShuffle: settings.musicShuffle === true,
      currentTrackIndex: settings.currentTrackIndex ?? 0,
      playlist: settings.playlist || [],
      trackOffsetMs: 0,
      sentAt: Date.now(),
    });
  };

  const handleNext = () => {
    const settings = (sessionState?.settings || {}) as any;
    const playlist = settings.playlist || [];
    if (playlist.length === 0) return;
    
    let nextIdx = (settings.currentTrackIndex ?? 0) + 1;
    if (settings.musicShuffle) {
      nextIdx = Math.floor(Math.random() * playlist.length);
    } else if (nextIdx >= playlist.length) {
      nextIdx = 0;
    }

    send({
      type: "client:update_music",
      musicEnabled: true,
      musicPlaying: true,
      musicVolume: settings.musicVolume ?? 50,
      musicLoop: settings.musicLoop !== false,
      musicShuffle: settings.musicShuffle === true,
      currentTrackIndex: nextIdx,
      playlist,
      trackOffsetMs: 0,
      sentAt: Date.now(),
    });
  };

  const handlePrev = () => {
    const settings = (sessionState?.settings || {}) as any;
    const playlist = settings.playlist || [];
    if (playlist.length === 0) return;
    
    let prevIdx = (settings.currentTrackIndex ?? 0) - 1;
    if (prevIdx < 0) {
      prevIdx = playlist.length - 1;
    }

    send({
      type: "client:update_music",
      musicEnabled: true,
      musicPlaying: true,
      musicVolume: settings.musicVolume ?? 50,
      musicLoop: settings.musicLoop !== false,
      musicShuffle: settings.musicShuffle === true,
      currentTrackIndex: prevIdx,
      playlist,
      trackOffsetMs: 0,
      sentAt: Date.now(),
    });
  };

  // Sync Host Audio
  useEffect(() => {
    const settings = (sessionState?.settings || {}) as any;
    const {
      musicEnabled = false,
      musicPlaying = false,
      musicVolume = 50,
      musicLoop = true,
      currentTrackIndex = 0,
      playlist = [],
    } = settings;

    const track = playlist[currentTrackIndex];

    if (!hostAudioRef.current) {
      hostAudioRef.current = new Audio();
      hostAudioRef.current.crossOrigin = "anonymous";
    }

    const audio = hostAudioRef.current;

    if (!musicEnabled || !track) {
      audio.pause();
      return;
    }

    let srcUrl = track.url;
    if (srcUrl.startsWith("/uploads")) {
      srcUrl = `${mediaApiBase()}${srcUrl}`;
    }

    if (audio.src !== srcUrl) {
      audio.src = srcUrl;
      audio.load();
    }

    audio.loop = musicLoop;
    audio.volume = (musicVolume / 100) * 0.15; // lower volume for host

    if (musicPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [
    sessionState?.settings?.musicEnabled,
    sessionState?.settings?.musicPlaying,
    sessionState?.settings?.musicVolume,
    sessionState?.settings?.musicLoop,
    sessionState?.settings?.currentTrackIndex,
    sessionState?.settings?.playlist,
  ]);

  // Periodic Playhead Syncer from Host
  useEffect(() => {
    if (!sessionState?.settings?.musicPlaying) return;
    const interval = setInterval(() => {
      const audio = hostAudioRef.current;
      if (audio && !audio.paused && audio.currentTime > 0) {
        const settings = sessionState.settings as any;
        send({
          type: "client:update_music",
          musicEnabled: settings.musicEnabled,
          musicPlaying: settings.musicPlaying,
          musicVolume: settings.musicVolume,
          musicLoop: settings.musicLoop,
          musicShuffle: settings.musicShuffle,
          currentTrackIndex: settings.currentTrackIndex,
          playlist: settings.playlist,
          trackOffsetMs: audio.currentTime * 1000,
          sentAt: Date.now(),
        });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [
    sessionState?.settings?.musicPlaying,
    sessionState?.settings?.musicEnabled,
    sessionState?.settings?.musicVolume,
    sessionState?.settings?.musicLoop,
    sessionState?.settings?.currentTrackIndex,
    sessionState?.settings?.playlist,
    send,
  ]);

  const parsedValidationErrors = useMemo(() => {
    if (!actionError || !actionError.startsWith("VALIDATION_ERRORS:")) return null;
    try {
      const json = actionError.substring("VALIDATION_ERRORS:".length);
      return JSON.parse(json) as LiveQuizValidationError[];
    } catch {
      return null;
    }
  }, [actionError]);

  const handleAutoFix = useCallback(async () => {
    if (!sessionId) return;
    setAutoFixing(true);
    try {
      const res = await postAutoFixQuiz(sessionId);
      if (res.data?.data?.fixed) {
        toast({ title: `Auto-fixed ${res.data.data.fixed} issue(s)`, variant: "success" });
        clearActionError();
        // Retry start after fix
        setTimeout(() => hostStart(), 500);
      } else {
        toast({ title: "No auto-fixable issues found", description: "Please fix questions manually in the Quiz Builder." });
      }
    } catch {
      toast({ title: "Auto-fix failed", variant: "destructive" });
    } finally {
      setAutoFixing(false);
    }
  }, [sessionId, clearActionError, hostStart, toast]);

  const { data: analyticsData, refetch: refetchAnalytics } = useQuery({
    queryKey: ["live-analytics", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const res = await getLiveAnalytics(sessionId!);
      return res.data?.data as {
        participants: Array<{ id: string; displayName: string; status: string; score: number }>;
        currentQuestionStats: {
          questionIndex: number;
          text: string;
          totalParticipants: number;
          answered: number;
          pending: number;
          correctPercent: number;
          wrongPercent: number;
          avgTimeMs: number;
        } | null;
      } | undefined;
    },
  });

  // Websocket listener for custom proctor/chat notifications
  useEffect(() => {
    const handleSnapshot = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSnapshots((prev) => ({ ...prev, [detail.participantId]: detail.frame }));
    };

    const handleViolation = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const participant = leaderboard.find((p) => p.participantId === detail.participantId);
      const name = participant?.displayName || "Participant";
      setAlerts((prev) => [
        {
          id: String(Math.random()),
          time: new Date(detail.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          text: `${name} violation: ${detail.violationType} (${detail.details})`,
          type: detail.violationType,
          participantId: detail.participantId,
        },
        ...prev,
      ]);
    };

    const handleChat = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setChatMessages((prev) => [
        ...prev,
        {
          sender: detail.displayName,
          text: detail.text,
          time: new Date(detail.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isMe: detail.displayName === "Host",
        },
      ]);
    };

    window.addEventListener("live-session:snapshot", handleSnapshot);
    window.addEventListener("live-session:violation", handleViolation);
    window.addEventListener("live-session:chat", handleChat);

    return () => {
      window.removeEventListener("live-session:snapshot", handleSnapshot);
      window.removeEventListener("live-session:violation", handleViolation);
      window.removeEventListener("live-session:chat", handleChat);
    };
  }, [leaderboard]);

  useEffect(() => {
    if (sessionState?.status === "active") {
      void refetchAnalytics();
    }
  }, [leaderboard, sessionState?.status, sessionState?.currentQuestionIndex, refetchAnalytics]);

  // Sync finishedAt timestamp
  useEffect(() => {
    if ((sessionState?.status === "finished" || finished) && !finishedAt) {
      setFinishedAt(Date.now());
    }
  }, [sessionState?.status, finished, finishedAt]);

  // Automatic Event-based Music Transitions
  useEffect(() => {
    const settings = (sessionState?.settings || {}) as any;
    if (!settings.musicEnabled || !settings.playlist || settings.playlist.length === 0) return;

    const resolveAssignedTrackUrl = (settingsLatest: any, key: string): string | null => {
      if (!settingsLatest.eventTracks) return null;
      const getVal = (k: string) => settingsLatest.eventTracks[k];
      
      let val = getVal(key);
      if (val) return val;

      // Fallback hierarchy
      if (key === "thinkingTime") {
        return getVal("question") || null;
      }
      if (key === "answerReveal") {
        return getVal("question") || null;
      }
      if (key === "podium" || key === "winner" || key === "quizFinished") {
        return getVal("winner") || getVal("podium") || getVal("quizFinished") || getVal("finalResults") || null;
      }
      return null;
    };

    const interval = setInterval(() => {
      const settingsLatest = (sessionState?.settings || {}) as any;
      if (!settingsLatest.musicEnabled || !settingsLatest.playlist || settingsLatest.playlist.length === 0) return;

      let targetEventKey: "lobby" | "countdown" | "question" | "thinkingTime" | "answerReveal" | "leaderboard" | "podium" | "winner" | "quizFinished" | null = null;
      const isSessionFinished = sessionState?.status === "finished" || finished;

      if (countdown !== null) {
        targetEventKey = "countdown";
      } else if (isSessionFinished) {
        // Transition finished events based on elapsed time since session ended
        const endedTime = finishedAt || Date.now();
        const elapsedSec = (Date.now() - endedTime) / 1000;
        if (elapsedSec < 5) {
          targetEventKey = "podium";
        } else if (elapsedSec < 10) {
          targetEventKey = "winner";
        } else {
          targetEventKey = "quizFinished";
        }
      } else if (sessionState?.status === "lobby") {
        targetEventKey = "lobby";
      } else if (sessionState?.status === "active") {
        if (sessionState.currentQuestionIndex >= 0) {
          const answeredCount = analyticsData?.currentQuestionStats?.answered ?? 0;
          const totalPlayers = leaderboard.length;
          const timeIsUp = sessionState.questionStartedAt && (Date.now() - new Date(sessionState.questionStartedAt).getTime() >= (sessionState.settings.questionTimerSeconds || 30) * 1000);
          const allAnswered = totalPlayers > 0 && answeredCount >= totalPlayers;
          const isAnswerReveal = timeIsUp || allAnswered;

          if (isAnswerReveal) {
            if (activeTab === "analytics" && leaderboard.length > 0) {
              targetEventKey = "leaderboard";
            } else {
              targetEventKey = "answerReveal";
            }
          } else {
            const questionElapsed = sessionState.questionStartedAt ? (Date.now() - new Date(sessionState.questionStartedAt).getTime()) : 0;
            if (questionElapsed < 3000) {
              targetEventKey = "question";
            } else {
              targetEventKey = "thinkingTime";
            }
          }
        } else {
          targetEventKey = "lobby";
        }
      }

      if (targetEventKey) {
        const assignedUrl = resolveAssignedTrackUrl(settingsLatest, targetEventKey);
        if (assignedUrl) {
          const trackIdx = settingsLatest.playlist.findIndex((t: any) => t.url === assignedUrl);
          if (trackIdx >= 0 && trackIdx !== settingsLatest.currentTrackIndex) {
            send({
              type: "client:update_music",
              musicEnabled: true,
              musicPlaying: true,
              musicVolume: settingsLatest.musicVolume ?? 50,
              musicLoop: settingsLatest.musicLoop !== false,
              musicShuffle: settingsLatest.musicShuffle === true,
              currentTrackIndex: trackIdx,
              playlist: settingsLatest.playlist,
              trackOffsetMs: 0,
              sentAt: Date.now(),
              eventKey: targetEventKey,
            });
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    sessionState?.status,
    sessionState?.currentQuestionIndex,
    countdown !== null,
    finished,
    sessionState?.settings?.eventTracks,
    analyticsData?.currentQuestionStats?.answered,
    leaderboard.length,
    activeTab,
    finishedAt,
  ]);

  useEffect(() => {
    if (connectionPhase === "failed" && !fatalToastShown.current) {
      fatalToastShown.current = true;
      toast({
        title: "Connection lost",
        description: "Could not reconnect. Refresh the page to restore the host dashboard.",
        variant: "destructive",
      });
    }
  }, [connectionPhase, toast]);

  useEffect(() => {
    if (wasRestored) {
      clearWasRestored();
    }
  }, [wasRestored, clearWasRestored]);

  // Decrement countdown on host
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      const timer = setTimeout(() => {
        setCountdown(null);
      }, 800);
      return () => clearTimeout(timer);
    }
    const interval = setInterval(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  const sortedLeaderboard = useMemo(() => {
    return [...leaderboard].sort((a, b) => {
      if (a.participantId === pinnedStudentId) return -1;
      if (b.participantId === pinnedStudentId) return 1;
      return 0;
    });
  }, [leaderboard, pinnedStudentId]);

  const handleFinish = () => {
    if (!confirm("Finish this live session? Students will see final results.")) return;
    hostFinish();
  };

  const handleHostAction = (action: string, targetId: string, message?: string) => {
    send({
      type: "host:action",
      action,
      targetId,
      payload: message ? { message } : undefined,
    });
    toast({ title: `Action "${action}" broadcasted`, variant: "success" });
  };

  const handleBroadcastAnnouncement = () => {
    if (!announcementText.trim()) return;
    send({
      type: "host:action",
      action: "announcement",
      targetId: "all",
      payload: { message: announcementText },
    });
    setAnnouncementText("");
    toast({ title: "Announcement broadcasted to everyone", variant: "success" });
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    send({ type: "client:chat", text: chatInput });
    setChatInput("");
  };

  const handleTimerAdjust = (seconds: number) => {
    const type = seconds > 0 ? "host:extend_timer" : "host:reduce_timer";
    send({ type, seconds: Math.abs(seconds) });
    toast({ title: `Timer adjusted by ${seconds}s`, variant: "success" });
  };

  if (!sessionState) {
    return <LiveHostLoadingSkeleton />;
  }

  const joinUrl = getQuizRoomJoinUrl(sessionId!);
  const isLobby = sessionState.status === "lobby";
  const isActive = sessionState.status === "active";
  const isDone = sessionState.status === "finished" || finished;
  const instructorPaced = !isSelfPacedLive(sessionState.settings, sessionState.sessionType);

  // Group Hand-raises
  const handRaisedParticipants = leaderboard.filter((p) => p.raisedHand);

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      <LiveConnectionBanner phase={connectionPhase} />

      {actionError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive space-y-4 shadow-md backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="font-bold flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              Quiz Validation Failed — Live Play Blocked
            </span>
            <button type="button" className="shrink-0 text-xs underline font-semibold text-destructive hover:opacity-85" onClick={clearActionError}>
              Dismiss
            </button>
          </div>

          {parsedValidationErrors ? (
            <>
              {/* Summary counts */}
              <div className="flex gap-3 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2.5 py-1 font-semibold text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {parsedValidationErrors.length} blocking error{parsedValidationErrors.length !== 1 ? "s" : ""}
                </span>
                {parsedValidationErrors.some((e) => (e as any).autoFixable) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs border-amber-500 text-amber-700 hover:bg-amber-50"
                    onClick={handleAutoFix}
                    disabled={autoFixing}
                  >
                    {autoFixing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                    Auto Fix
                  </Button>
                )}
              </div>

              {/* Error table */}
              <div className="overflow-x-auto border rounded-lg bg-background/60">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
                      <th className="p-2 border-r">Q#</th>
                      <th className="p-2 border-r">Rule</th>
                      <th className="p-2 border-r">Field</th>
                      <th className="p-2 border-r">Expected</th>
                      <th className="p-2 border-r">Actual</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedValidationErrors.map((err, i) => (
                      <tr key={i} className="hover:bg-destructive/5">
                        <td className="p-2 border-r font-mono text-[10px] truncate max-w-[80px]" title={err.questionId}>
                          {err.questionId ? err.questionId.slice(-8) : "—"}
                        </td>
                        <td className="p-2 border-r font-medium text-foreground">{err.rule}</td>
                        <td className="p-2 border-r text-amber-700 font-mono text-[10px]">{err.field}</td>
                        <td className="p-2 border-r text-emerald-700">{err.expected}</td>
                        <td className="p-2 border-r text-rose-700">{err.actual}</td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            {err.questionId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] gap-1"
                                onClick={() => {
                                  // Navigate to quiz builder to fix
                                  if (sessionState?.quizId) {
                                    window.open(`/instructor/quiz-room/${sessionState.quizId}/edit#${err.questionId}`, "_blank");
                                  }
                                }}
                              >
                                <ExternalLink className="h-3 w-3" />
                                Open
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                Fix the issues above in the Quiz Builder, then click Start Quiz again.
              </p>
            </>
          ) : (
            <p className="font-semibold">{mapLiveHostError(actionError)}</p>
          )}
        </div>
      )}

      {/* Title block */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{sessionState.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <QuizRoomStatusBadge status={sessionState.status as LiveSessionStatus} />
            <span className="text-muted-foreground">{sessionState.participants.length} joined</span>
            {isActive && instructorPaced && (
              <span className="text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                Question {sessionState.currentQuestionIndex + 1} of {sessionState.questionCount}
              </span>
            )}
            {sessionState.roomCode && (
              <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-full font-mono">
                ROOM: {sessionState.roomCode}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isActive && (
            <div className="flex items-center border rounded-lg overflow-hidden bg-background mr-2 shadow-sm">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none border-r" onClick={() => handleTimerAdjust(-5)} title="Subtract 5s">
                <Minus className="h-4 w-4 text-red-500" />
              </Button>
              <span className="text-xs font-bold px-3 uppercase text-muted-foreground select-none">Timer</span>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none border-l" onClick={() => handleTimerAdjust(15)} title="Add 15s">
                <Plus className="h-4 w-4 text-emerald-500" />
              </Button>
            </div>
          )}

          <Button variant="outline" asChild>
            <Link to={`/live/display/${sessionId}`} target="_blank">
              <Monitor className="mr-2 h-4 w-4" />
              Projector View
            </Link>
          </Button>
          {isActive && (
            <>
              {instructorPaced && (
                <Button variant="secondary" onClick={hostNextQuestion}>
                  <SkipForward className="mr-2 h-4 w-4" />
                  Next Question
                </Button>
              )}
              <Button variant="destructive" onClick={handleFinish}>
                <Square className="mr-2 h-4 w-4" />
                Finish Quiz
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Waiting Lobby rendering */}
      {isLobby && (
        <WaitingRoomPanel
          roomCode={sessionState.roomCode}
          pin={sessionState.pin}
          joinUrl={joinUrl}
          participants={sessionState.participants}
          onStart={hostStart}
          canStart={sessionState.participants.length > 0}
          quizTitle={sessionState.title}
          quizBranding={sessionState.quizBranding}
        />
      )}

      {/* Tabs Toolbar inside active workspace */}
      {(isActive || isDone) && (
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("analytics")}
            className={cn("flex items-center gap-1.5 px-4 py-2.5 font-bold text-sm border-b-2 transition-all", activeTab === "analytics" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            <Activity className="h-4.5 w-4.5" /> Analytics Panel
          </button>
          <button
            onClick={() => setActiveTab("proctoring")}
            className={cn("flex items-center gap-1.5 px-4 py-2.5 font-bold text-sm border-b-2 transition-all", activeTab === "proctoring" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            <Shield className="h-4.5 w-4.5" /> AI Proctoring Control
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={cn("flex items-center gap-1.5 px-4 py-2.5 font-bold text-sm border-b-2 transition-all", activeTab === "chat" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            <MessageSquare className="h-4.5 w-4.5" /> Chat & Overrides
          </button>
        </div>
      )}

      {/* TAB CONTENT 1: ANALYTICS */}
      {(isActive || isDone) && activeTab === "analytics" && (
        <div className="space-y-6 animate-fadeIn">
          {sessionState.settings.showLeaderboard && (
            <Card className="border shadow-md">
              <CardHeader className="pb-2 border-b bg-muted/20">
                <CardTitle className="flex items-center gap-2 text-base font-bold text-muted-foreground">
                  <Users className="h-4.5 w-4.5" /> Top 5 Leaderboard Standings
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <LivePodium entries={leaderboard} />
              </CardContent>
            </Card>
          )}

          {isActive && analyticsData && (
            <LiveSessionAnalyticsPanel
              key={answerPulse}
              participants={analyticsData.participants}
              leaderboard={leaderboard}
              currentQuestionStats={analyticsData.currentQuestionStats}
              questionIndex={sessionState.currentQuestionIndex}
              questionCount={sessionState.questionCount}
              answerPulse={answerPulse}
            />
          )}
        </div>
      )}

      {/* TAB CONTENT 2: AI PROCTORING */}
      {isActive && activeTab === "proctoring" && (
        <div className="grid gap-6 lg:grid-cols-3 animate-fadeIn">
          {/* Left / Middle: Student Video grid */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2 text-primary">
                <Shield className="h-5 w-5" /> Video Gallery (Snapshots)
              </h2>
              {sessionState && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const nextState = !sessionState.settings.cameraRequired;
                    send({
                      type: "host:update_settings",
                      settings: { cameraRequired: nextState }
                    });
                  }}
                  className="font-bold text-[10px]"
                >
                  {sessionState.settings.cameraRequired ? "Disable Proctor Cameras" : "Enforce Proctor Cameras"}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {sortedLeaderboard.map((student) => {
                const snapshot = snapshots[student.participantId];
                const isPinned = student.participantId === pinnedStudentId;
                const isSuspicious = student.status === "disconnected" || !student.tabFocused || (student.violationCount ?? 0) > 0;
                
                return (
                  <Card key={student.participantId} className={cn("overflow-hidden border-2 transition-all relative group", isPinned ? "border-amber-500 ring-2 ring-amber-500/20 shadow-lg scale-[1.02] z-10" : isSuspicious ? "border-red-500 shadow-md ring-2 ring-red-500/20" : "border-border/60")}>
                    {/* Media render */}
                    <div className="relative w-full aspect-video bg-black flex items-center justify-center">
                      {snapshot ? (
                        <img src={snapshot} alt={student.displayName} className="w-full h-full object-cover scale-x-[-1]" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-muted-foreground text-xs select-none">
                          {student.status === "disconnected" ? (
                            <span className="text-red-500 font-bold">DISCONNECTED</span>
                          ) : (
                            <>
                              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm mb-1.5">
                                {student.displayName.slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-[10px] text-muted-foreground font-semibold">Webcam Feed Pending</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Camera Status Overlay Badge */}
                      <div className="absolute top-2 right-2 flex gap-1 z-10">
                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded shadow", 
                          student.cameraOn ? "bg-emerald-600 text-white" :
                          alerts.some((al) => al.type === "camera_blocked" && al.participantId === student.participantId) ? "bg-red-600 text-white" :
                          "bg-amber-500 text-white animate-pulse"
                        )}>
                          {student.cameraOn ? "🟢 Camera Active" :
                           alerts.some((al) => al.type === "camera_blocked" && al.participantId === student.participantId) ? "🔴 Camera Disabled" :
                           "🟡 Permission Pending"}
                        </span>
                      </div>

                      {/* Warnings Badge overlay */}
                      <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                        {isPinned && (
                          <span className="bg-amber-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow flex items-center gap-0.5">
                            <Pin className="h-2.5 w-2.5 fill-white" /> PINNED
                          </span>
                        )}
                        {!student.tabFocused && (
                          <span className="bg-red-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow">
                            TAB OUT
                          </span>
                        )}
                        {!student.fullscreen && sessionState?.settings?.fullscreenLock && (
                          <span className="bg-orange-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow">
                            NO FULLSCREEN
                          </span>
                        )}
                        {(student.violationCount ?? 0) > 0 && (
                          <span className="bg-red-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" /> {student.violationCount ?? 0}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Student metadata */}
                    <CardContent className="p-3 space-y-1.5 bg-card/85">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs truncate max-w-[110px]">{student.displayName}</span>
                        <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded", student.status === "answered" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600")}>
                          {student.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between text-[9px] text-muted-foreground font-semibold pt-1 border-t border-border/40">
                        <span>Last Active: {student.lastSeenAt ? new Date(student.lastSeenAt).toLocaleTimeString() : "Never"}</span>
                        <span>Batt: {(student as any).batteryStatus || "—"}</span>
                      </div>
                    </CardContent>

                    {/* Remote Controls hover card overrides panel */}
                    <div className="absolute inset-0 bg-black/80 flex flex-col justify-center items-center gap-2 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-white text-xs font-bold mb-1">{student.displayName} controls</span>
                      <div className="grid grid-cols-2 gap-1.5 w-full">
                        <Button size="sm" variant="outline" className="text-[10px] h-7 font-bold border-white/20 text-white bg-transparent hover:bg-white/10" onClick={() => handleHostAction("warn", student.participantId, "Please focus on your assessment screen.")}>
                          Warn
                        </Button>
                        <Button size="sm" variant="outline" className="text-[10px] h-7 font-bold border-white/20 text-white bg-transparent hover:bg-white/10" onClick={() => handleHostAction("private_msg", student.participantId, prompt("Enter message:") || "")}>
                          Message
                        </Button>
                        <Button size="sm" variant="outline" className="text-[10px] h-7 font-bold border-white/20 text-white bg-transparent hover:bg-white/10" onClick={() => setPinnedStudentId(isPinned ? null : student.participantId)}>
                          {isPinned ? "Unpin" : "Pin Focus"}
                        </Button>
                        <Button size="sm" variant="outline" className="text-[10px] h-7 font-bold border-white/20 text-white bg-transparent hover:bg-white/10" onClick={() => setExpandedStudent(student)}>
                          Expand
                        </Button>
                        <Button size="sm" variant="outline" className="text-[10px] h-7 font-bold text-red-400 border-red-500/20 bg-transparent hover:bg-red-500/10" onClick={() => handleHostAction("disable_camera", student.participantId)}>
                          Block Cam
                        </Button>
                        <Button size="sm" variant="outline" className="text-[10px] h-7 font-bold text-red-400 border-red-500/20 bg-transparent hover:bg-red-500/10" onClick={() => handleHostAction("mute_mic", student.participantId)}>
                          Mute Mic
                        </Button>
                      </div>
                      <Button size="sm" variant="destructive" className="text-[10px] h-7 font-bold w-full mt-1.5" onClick={() => handleHostAction("kick", student.participantId)}>
                        Kick Participant
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Right: Live Proctor Alerts log */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="h-[550px] flex flex-col border shadow-md">
              <CardHeader className="pb-2 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" /> Chronological Proctor Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {alerts.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center">
                    No proctor violations flagged yet in this session.
                  </div>
                ) : (
                  alerts.map((al) => (
                    <div key={al.id} className="rounded-lg border border-red-500/10 bg-red-500/5 p-2.5 text-[11px] font-semibold text-foreground flex items-start gap-2">
                      <Shield className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[9px] text-muted-foreground font-bold">{al.time}</span>
                        <p className="mt-0.5">{al.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: CLASSROOM MANAGEMENT */}
      {isActive && activeTab === "chat" && (
        <div className="grid gap-6 lg:grid-cols-3 animate-fadeIn">
          {/* Left/Center: Classroom Chat Pane and Announcement Broadcaster */}
          <div className="lg:col-span-2 space-y-6">
            {/* Announcement Box */}
            <Card className="border shadow-sm border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-primary">
                  <Megaphone className="h-4.5 w-4.5" /> Broadcast Announcement to Students
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="E.g., Please answer carefully, negative marking is active!"
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleBroadcastAnnouncement();
                    }}
                    className="flex-1 text-sm border rounded-lg px-3 py-2 bg-background focus:border-primary outline-none"
                  />
                  <Button className="font-bold shrink-0" onClick={handleBroadcastAnnouncement}>
                    Send Alert
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Chat Pane */}
            <Card className="h-[400px] flex flex-col border shadow-md">
              <CardHeader className="pb-2 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
                  <MessageSquare className="h-4 w-4 text-primary" /> Live Classroom Group Chat
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-2">
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center mt-28">No chat messages sent yet.</p>
                ) : (
                  chatMessages.map((m, idx) => (
                    <div key={idx} className={cn("flex flex-col text-xs", m.isMe ? "items-end" : "items-start")}>
                      <span className="text-[10px] text-muted-foreground font-semibold mb-0.5">{m.sender}</span>
                      <div className={cn("rounded-xl px-3 py-1.5 max-w-[80%] break-words font-medium", m.isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted text-foreground rounded-tl-none")}>
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
              {/* Send footer */}
              <div className="border-t p-3 bg-muted/10 flex gap-2">
                <input
                  type="text"
                  placeholder="Reply to classroom chat..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendChat();
                  }}
                  className="flex-1 text-sm border rounded-lg px-3 py-1.5 bg-background outline-none"
                />
                <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSendChat}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </div>

          {/* Right: Hand Raises Queue */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="h-[490px] flex flex-col border shadow-md">
              <CardHeader className="pb-2 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
                  <UserCheck className="h-4 w-4 text-amber-500 animate-pulse" /> Hand Raises Queue
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {handRaisedParticipants.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center">
                    No active student hand raises at the moment.
                  </div>
                ) : (
                  handRaisedParticipants.map((p) => (
                    <div key={p.participantId} className="flex items-center justify-between border rounded-lg p-2.5 bg-muted/30">
                      <div>
                        <p className="font-bold text-xs">{p.displayName}</p>
                        <span className="text-[10px] text-muted-foreground font-semibold">Rank #{p.rank} · Score {p.score}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="text-[9px] h-6 font-bold" onClick={() => handleHostAction("private_msg", p.participantId, prompt(`Message to ${p.displayName}:`) || "")}>
                          Message
                        </Button>
                        <Button size="sm" variant="ghost" className="text-[9px] h-6 text-red-500" onClick={() => handleHostAction("raise_hand", p.participantId)}>
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Background Music System Card */}
            <Card className="border shadow-md mt-4 bg-card/90">
              <CardHeader className="pb-2 border-b bg-muted/20">
                <CardTitle className="text-xs font-bold flex items-center gap-2 text-muted-foreground justify-between">
                  <span className="flex items-center gap-2">
                    <Volume2 className="h-4.5 w-4.5 text-primary" /> Background Music
                  </span>
                  {sessionState?.settings?.musicEnabled ? (
                    <span className="text-[9px] bg-primary/20 text-primary font-black px-1.5 py-0.5 rounded-full">
                      {sessionState?.settings?.musicPlaying ? "Playing" : "Enabled"}
                    </span>
                  ) : (
                    <span className="text-[9px] bg-muted text-muted-foreground font-black px-1.5 py-0.5 rounded-full">
                      Off
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {(() => {
                  const settings = (sessionState?.settings || {}) as any;
                  const musicEnabled = settings.musicEnabled === true;
                  const musicPlaying = settings.musicPlaying === true;
                  const track = settings.selectedTrack || settings.playlist?.[0];

                  if (!musicEnabled) {
                    return (
                      <p className="text-xs text-muted-foreground text-center italic py-2">
                        Background Music is turned off for this room.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2 text-left">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white truncate">🎵 {track?.name || "Selected Music"}</span>
                        <span className="text-[10px] font-bold text-primary">
                          {musicPlaying ? "▶ Playing for all students" : "⏸ Auto-starts on quiz start"}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Finished state screen */}
      {isDone && (
        <LiveHostSessionComplete
          sessionId={sessionId!}
          title={sessionState.title}
          leaderboard={leaderboard}
          questionCount={sessionState.questionCount}
          participantCount={sessionState.participants.length}
        />
      )}

      {/* Synchronized Countdown Overlay */}
      {countdown !== null && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 text-white">
          <p className="text-xl font-bold uppercase tracking-widest text-primary animate-pulse">
            Question {countdownQuestionIdx + 1} of {sessionState?.questionCount}
          </p>
          <div className="mt-6 text-8xl font-black text-amber-500 animate-bounce">
            {countdown === 0 ? "GO!" : countdown}
          </div>
        </div>
      )}

      {/* Expand Student Camera Dialog Modal */}
      <Dialog open={!!expandedStudent} onOpenChange={() => setExpandedStudent(null)}>
        <DialogContent className="max-w-md bg-card border-2">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <User className="h-5 w-5 text-primary" /> Proctoring Focus: {expandedStudent?.displayName}
            </DialogTitle>
          </DialogHeader>
          {expandedStudent && (() => {
            const student = leaderboard.find(p => p.participantId === expandedStudent.participantId) || expandedStudent;
            const snapshot = snapshots[student.participantId];
            const suspicionScore = Math.min(100, (student.violationCount * 25) + (!student.tabFocused ? 30 : 0) + (!student.fullscreen ? 20 : 0));
            return (
              <div className="space-y-4 mt-2">
                {/* Large Webcam snapshot */}
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-border/80">
                  {snapshot ? (
                    <img src={snapshot} alt={student.displayName} className="w-full h-full object-cover scale-x-[-1]" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs font-semibold">Webcam Feed Pending</div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 border rounded bg-muted/20">
                    <p className="text-muted-foreground font-semibold">AI Suspicion Score</p>
                    <p className={cn("text-xl font-extrabold mt-1", suspicionScore > 50 ? "text-red-500" : suspicionScore > 20 ? "text-amber-500" : "text-emerald-500")}>
                      {suspicionScore}%
                    </p>
                  </div>
                  <div className="p-2.5 border rounded bg-muted/20">
                    <p className="text-muted-foreground font-semibold">Proctor Alerts</p>
                    <p className="text-xl font-extrabold mt-1 text-red-500">{student.violationCount} flagged</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs border rounded p-3 bg-muted/10 font-semibold">
                  <p className="flex items-center justify-between">
                    <span>Webcam Status:</span>
                    <span className={cn("font-bold", 
                      student.cameraOn ? "text-emerald-600" :
                      alerts.some((al) => al.type === "camera_blocked" && al.participantId === student.participantId) ? "text-red-500" :
                      "text-amber-500"
                    )}>
                      {student.cameraOn ? "🟢 Camera Active" :
                       alerts.some((al) => al.type === "camera_blocked" && al.participantId === student.participantId) ? "🔴 Camera Disabled" :
                       "🟡 Permission Pending"}
                    </span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Last Active:</span>
                    <span className="text-muted-foreground">{student.lastSeenAt ? new Date(student.lastSeenAt).toLocaleTimeString() : "Never"}</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Microphone Status:</span>
                    <span className={student.micOn ? "text-emerald-600" : "text-red-500"}>{student.micOn ? "ON" : "OFF"}</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Window Focus:</span>
                    <span className={student.tabFocused ? "text-emerald-600" : "text-red-500"}>{student.tabFocused ? "Focused" : "Unfocused"}</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Fullscreen Mode:</span>
                    <span className={student.fullscreen ? "text-emerald-600" : "text-red-500"}>{student.fullscreen ? "Active" : "Inactive"}</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>Connection Quality:</span>
                    <span className="text-sky-600">{student.networkStatus === "disconnected" ? "Offline" : "Good"}</span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1.5">
                  <Button size="sm" variant="outline" onClick={() => { handleHostAction("warn", student.participantId, "Please focus on your assessment screen."); setExpandedStudent(null); }} className="text-xs h-9 font-bold">Warn Student</Button>
                  <Button size="sm" variant="outline" onClick={() => { handleHostAction("private_msg", student.participantId, prompt("Enter message:") || ""); setExpandedStudent(null); }} className="text-xs h-9 font-bold">Message</Button>
                  <Button size="sm" variant="outline" className="text-red-500 text-xs h-9 font-bold" onClick={() => { handleHostAction("disable_camera", student.participantId); setExpandedStudent(null); }}>Block Cam</Button>
                  <Button size="sm" variant="destructive" onClick={() => { handleHostAction("kick", student.participantId); setExpandedStudent(null); }} className="text-xs h-9 font-bold">Kick Student</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
