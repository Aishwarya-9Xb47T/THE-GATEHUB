import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Play,
  Pause,
  RotateCcw,
  Trophy,
  Activity,
  ArrowLeft,
  Calendar,
  Clock,
  HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { LiveLeaderboard } from "@/components/live-session/LiveLeaderboard";
import { cn } from "@/lib/utils";

interface ReplayEvent {
  type: string;
  timestamp: string;
  participantId?: string;
  displayName?: string;
  questionIndex?: number;
  questionText?: string;
  isCorrect?: boolean;
  scoreEarned?: number;
  xpEarned?: number;
  responseTimeMs?: number;
  rankings?: any[];
}

export function LiveSessionReplayPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [currentEventIdx, setCurrentEventIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<1 | 2 | 4>(1);
  const playInterval = useRef<ReturnType<typeof setInterval>>();
  const replayAudioRef = useRef<HTMLAudioElement | null>(null);

  const { data: replay, isLoading } = useQuery({
    queryKey: ["live-replay", sessionId],
    queryFn: async () => {
      const res = await api<{
        success: boolean;
        data: {
          session: {
            id: string;
            title: string;
            createdAt: string;
            roomCode: string;
            questionCount: number;
            questions: any[];
          };
          events: ReplayEvent[];
        };
      }>(`/live-sessions/${sessionId}/replay-data`);
      return res.data;
    },
    enabled: !!sessionId
  });

  const session = (replay as any)?.data?.session || (replay as any)?.session;
  const events = (replay as any)?.data?.events || (replay as any)?.events || [];
  const maxIdx = events.length - 1;

  // Playback timer / Simulation logic
  useEffect(() => {
    if (events.length === 0) return;
    
    // Find the latest music event up to currentEventIdx
    let lastMusicEvent: any = null;
    for (let i = 0; i <= currentEventIdx; i++) {
      const ev = events[i];
      if (ev && ev.type && ev.type.startsWith("music:")) {
        lastMusicEvent = ev;
      }
    }

    if (lastMusicEvent) {
      const payload = lastMusicEvent.payload || {};
      const trackUrl = payload.trackUrl;
      const isMusicPlaying = payload.musicPlaying;
      const volume = payload.musicVolume ?? 50;

      if (trackUrl && isMusicPlaying) {
        if (!replayAudioRef.current) {
          replayAudioRef.current = new Audio();
        }
        
        // Only load a new source if it's different to prevent resetting playback position
        if (replayAudioRef.current.src !== window.location.origin + trackUrl && !replayAudioRef.current.src.endsWith(trackUrl)) {
          replayAudioRef.current.src = trackUrl;
        }

        replayAudioRef.current.volume = volume / 100;
        replayAudioRef.current.loop = payload.musicLoop !== false;
        
        if (isPlaying) {
          replayAudioRef.current.play().catch(() => {});
        } else {
          replayAudioRef.current.pause();
        }
      } else {
        if (replayAudioRef.current) {
          replayAudioRef.current.pause();
        }
      }
    } else {
      if (replayAudioRef.current) {
        replayAudioRef.current.pause();
      }
    }
  }, [currentEventIdx, events, isPlaying]);

  // Handle cleanup and toggle changes
  useEffect(() => {
    if (!isPlaying && replayAudioRef.current) {
      replayAudioRef.current.pause();
    }
    return () => {
      if (replayAudioRef.current) {
        replayAudioRef.current.pause();
      }
    };
  }, [isPlaying]);

  // Playback timer effect
  useEffect(() => {
    if (isPlaying) {
      const ms = 2000 / playSpeed;
      playInterval.current = setInterval(() => {
        setCurrentEventIdx((prev) => {
          if (prev >= maxIdx) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, ms);
    } else {
      if (playInterval.current) {
        clearInterval(playInterval.current);
      }
    }
    return () => {
      if (playInterval.current) {
        clearInterval(playInterval.current);
      }
    };
  }, [isPlaying, maxIdx, playSpeed]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-64 w-full max-w-2xl rounded bg-muted" />
        <p className="text-sm text-muted-foreground">Loading match replay logs...</p>
      </div>
    );
  }

  if (!replay || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground">Replay data not found for this session.</p>
        <Button asChild>
          <Link to="/instructor/quiz-room">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  // Compute current leaderboard state at this event index
  const getCurrentState = () => {
    // Traverse events up to currentEventIdx to accumulate rankings, scores, and active participants
    const activeRankings: any[] = [];
    let activeQuestionIndex = 0;
    let activeQuestionText = "";

    for (let i = 0; i <= currentEventIdx; i++) {
      const ev = events[i];
      if (!ev) continue;

      if ((ev.type === "question_advanced" || ev.type === "next" || ev.type === "start") && ev.questionIndex != null) {
        activeQuestionIndex = ev.questionIndex;
        activeQuestionText = ev.questionText || "";
      }
      if (ev.rankings) {
        // Replace existing rankings with new rankings
        activeRankings.splice(0, activeRankings.length, ...ev.rankings);
      }
    }

    return {
      rankings: activeRankings.map((r, index) => ({
        ...r,
        rank: index + 1
      })),
      questionIndex: activeQuestionIndex,
      questionText: activeQuestionText
    };
  };

  const state = getCurrentState();

  const formatEventDesc = (ev: ReplayEvent) => {
    const payload = (ev as any).payload || {};
    switch (ev.type) {
      case "music:start": {
        const eventKey = payload.eventKey;
        if (eventKey === "lobby") return `🎵 Lobby Music Started: "${payload.trackName || "Theme"}"`;
        if (eventKey === "question" || eventKey === "thinkingTime") return `🎵 Question Music: "${payload.trackName || "Theme"}"`;
        if (eventKey === "leaderboard") return `🎵 Leaderboard Theme: "${payload.trackName || "Theme"}"`;
        if (["podium", "winner", "quizFinished", "finalResults"].includes(eventKey)) return `🏆 Victory Theme: "${payload.trackName || "Theme"}"`;
        return `🎵 Background Music Started: "${payload.trackName || "Theme"}" (Volume: ${payload.musicVolume}%)`;
      }
      case "music:pause":
        return `⏸️ Music Paused: "${payload.trackName || "Theme"}"`;
      case "music:track_change": {
        const eventKey = payload.eventKey;
        if (eventKey === "lobby") return `🎵 Lobby Music Started: "${payload.trackName || "Theme"}"`;
        if (eventKey === "question" || eventKey === "thinkingTime") return `🎵 Question Music: "${payload.trackName || "Theme"}"`;
        if (eventKey === "leaderboard") return `🎵 Leaderboard Theme: "${payload.trackName || "Theme"}"`;
        if (["podium", "winner", "quizFinished", "finalResults"].includes(eventKey)) return `🏆 Victory Theme: "${payload.trackName || "Theme"}"`;
        return `⏭️ Track Changed to: "${payload.trackName || "Theme"}"`;
      }
      case "music:volume_change":
        return `🔊 [MUSIC VOLUME] Room background music master volume adjusted to: ${payload.musicVolume}%`;
      case "music:settings":
        return `⚙️ [MUSIC SETTINGS] Room background music settings changed (Loop: ${payload.musicLoop ? "ON" : "OFF"}, Shuffle: ${payload.musicShuffle ? "ON" : "OFF"})`;

      case "participant_joined":
      case "join":
        return `Competitor "${ev.displayName || "Anonymous"}" joined the lobby.`;
      case "participant_left":
      case "leave":
      case "disconnect":
        return `Competitor "${ev.displayName || "Anonymous"}" disconnected/left.`;
      case "reconnect":
        return `Competitor "${ev.displayName || "Anonymous"}" reconnected.`;
      case "question_advanced":
      case "next":
      case "start":
        return `Advanced to Question ${ev.questionIndex! + 1}: "${ev.questionText || ""}"`;
      case "answer_submitted":
      case "answer":
        return `Competitor "${ev.displayName || "Anonymous"}" answered: ${
          ev.isCorrect ? "Correct! ✓" : "Incorrect ✗"
        } (+${ev.scoreEarned ?? 0} Marks, +${ev.xpEarned ?? 0} XP in ${(ev.responseTimeMs ? ev.responseTimeMs / 1000 : 0).toFixed(1)}s)`;
      case "session_finished":
      case "finish":
        return `Session finished. Showing final competitor standings.`;
      case "violation":
        return `⚠️ [VIOLATION] Competitor "${ev.displayName || "Anonymous"}" flagged: ${payload.details || payload.violationType || "Suspicious behavior"}`;
      case "warning":
        return `⚠️ [WARNING] Host warned "${ev.displayName || "Anonymous"}": "${payload.message || "Please focus"}"`;
      case "chat":
        return `💬 [CHAT] "${ev.displayName || "Anonymous"}": "${payload.text || ""}"`;
      case "announcement":
        return `📢 [ANNOUNCEMENT] Host announced: "${payload.message || ""}"`;
      case "use_powerup":
        return `⚡ [POWERUP] "${ev.displayName || "Anonymous"}" activated powerup: ${payload.powerup || ""}`;
      case "host_action":
        return `🛠️ [HOST CONTROL] Host performed action: ${payload.action || ""}`;
      case "media_state":
        return `📹 [MEDIA STATUS] Competitor "${ev.displayName || "Anonymous"}" updated webcam: ${
          payload.cameraOn ? "Active (Webcam Connected) 🟢" : "Disabled (Webcam Stopped) 🔴"
        }`;
      case "snapshot":
        return `📸 [SNAPSHOT] Captured webcam frame for "${ev.displayName || "Anonymous"}".`;
      default:
        return `${ev.type.replace("_", " ")} occurred.`;
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto bg-gradient-to-b from-muted/20 to-background dark:from-background dark:to-muted/10 min-h-screen">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/instructor/quiz-room">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Dashboard
          </Link>
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-semibold text-muted-foreground">Match Replay Mode</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary animate-pulse" /> Replay: {session.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-semibold">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {new Date(session.createdAt).toLocaleDateString()}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Room Code: {session.roomCode}</span>
          </div>
        </div>
      </div>

      {/* Playback Controls Toolbar */}
      <Card className="border-2 border-primary/20 shadow-md bg-card/75 backdrop-blur-md">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Playback Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant={isPlaying ? "default" : "outline"}
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-28 flex items-center gap-2 font-bold"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? "Pause" : "Play"}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setCurrentEventIdx(0);
                  setIsPlaying(false);
                }}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

              {/* Speed multiplier toggle */}
              <div className="flex border rounded-lg overflow-hidden bg-background">
                {([1, 2, 4] as const).map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaySpeed(spd)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-bold transition-all",
                      playSpeed === spd
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground"
                    )}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Event Timeline slider */}
            <div className="flex-1 min-w-[240px] flex items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground">Timeline</span>
              <input
                type="range"
                min={0}
                max={maxIdx}
                value={currentEventIdx}
                onChange={(e) => {
                  setCurrentEventIdx(parseInt(e.target.value, 10));
                  setIsPlaying(false);
                }}
                className="flex-1 accent-primary h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs font-bold tabular-nums">
                {currentEventIdx + 1} / {events.length}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid: Left Event logs scroll, Right Live state reveal */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left event log list */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="h-[550px] flex flex-col border shadow-inner bg-card/30 backdrop-blur-sm">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" /> Chronological Event Logs
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {events.map((ev: any, index: number) => {
                const isActive = index === currentEventIdx;
                const isPast = index < currentEventIdx;

                return (
                  <div
                    key={index}
                    onClick={() => {
                      setCurrentEventIdx(index);
                      setIsPlaying(false);
                    }}
                    className={cn(
                      "cursor-pointer rounded-lg p-2.5 text-xs transition-all border",
                      isActive
                        ? "bg-primary/10 border-primary font-semibold text-foreground ring-1 ring-primary/30"
                        : isPast
                          ? "bg-background/40 border-transparent text-muted-foreground"
                          : "border-transparent text-muted-foreground/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1 font-bold">
                      <span className="capitalize">{ev.type.replace("_", " ")}</span>
                      <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="line-clamp-2">{formatEventDesc(ev)}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right simulated live screen state */}
        <div className="lg:col-span-2 space-y-4">
          {/* Active Question banner */}
          <Card className="border shadow-sm">
            <CardHeader className="py-3 bg-muted/40 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                <HelpCircle className="h-4.5 w-4.5 text-primary" /> Question Status at index
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                <span>Active Question Index: {state.questionIndex + 1} / {session.questionCount}</span>
              </div>
              <p className="text-sm font-bold text-foreground line-clamp-2">
                {state.questionText || "No active question (Lobby phase)"}
              </p>
            </CardContent>
          </Card>

          {/* Leaderboard state rendering */}
          <Card className="h-[420px] flex flex-col border shadow">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Trophy className="h-4.5 w-4.5 text-primary" /> Live Standings
                </span>
                <span className="text-xs text-muted-foreground font-semibold">Leaderboard reveal state</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4">
              {state.rankings.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground animate-pulse">
                  Waiting for competitors to submit answers...
                </div>
              ) : (
                <LiveLeaderboard entries={state.rankings} compact />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
