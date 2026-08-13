import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users,
  Sparkles,
  Clock,
} from "lucide-react";
import { useLiveSessionSocket } from "@/hooks/useLiveSessionSocket";
import { LivePodium } from "@/components/live-session/LivePodium";
import { LiveLeaderboard } from "@/components/live-session/LiveLeaderboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPTION_THEMES = [
  { color: "bg-red-500 hover:bg-red-600 border-red-600", text: "text-red-100", icon: "▲", shape: "triangle" },
  { color: "bg-blue-500 hover:bg-blue-600 border-blue-600", text: "text-blue-100", icon: "◆", shape: "diamond" },
  { color: "bg-amber-500 hover:bg-amber-600 border-amber-600", text: "text-amber-100", icon: "●", shape: "circle" },
  { color: "bg-emerald-500 hover:bg-emerald-600 border-emerald-600", text: "text-emerald-100", icon: "■", shape: "square" },
];

export function LiveLeaderboardDisplayPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownQuestionIdx, setCountdownQuestionIdx] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [showLeaderboardTab, setShowLeaderboardTab] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { sessionState, leaderboard } = useLiveSessionSocket({
    sessionId: sessionId!,
    mode: "host",
    onQuestionCountdown: (questionIndex, duration) => {
      setCountdown(duration);
      setCountdownQuestionIdx(questionIndex);
      setShowLeaderboardTab(false);
    },
  });

  // Fetch full quiz details (with correct options/explanations)
  const [quiz, setQuiz] = useState<any>(null);
  useEffect(() => {
    if (!sessionState?.quizId) return;
    const token = localStorage.getItem("lms_token");
    fetch(`/api/quizzes/${sessionState.quizId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(body => {
        if (body.success) setQuiz(body.quiz);
      })
      .catch(console.error);
  }, [sessionState?.quizId]);

  // Fetch real-time analytics
  const { data: analytics } = useQuery({
    queryKey: ["projector-analytics", sessionId],
    enabled: !!sessionId && sessionState?.status === "active",
    queryFn: async () => {
      const token = localStorage.getItem("lms_token");
      const res = await fetch(`/api/live-sessions/${sessionId}/analytics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await res.json();
      return body.data;
    },
    refetchInterval: 1800,
  });

  // Countdown decrementation effect
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      const timer = setTimeout(() => setCountdown(null), 800);
      return () => clearTimeout(timer);
    }
    const interval = setInterval(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  // Elapsed timer effect for active question
  useEffect(() => {
    if (sessionState?.status !== "active" || !sessionState.questionStartedAt) {
      setElapsed(0);
      return;
    }
    const startedTime = new Date(sessionState.questionStartedAt).getTime();
    setElapsed(Math.floor((Date.now() - startedTime) / 1000));

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionState?.status, sessionState?.questionStartedAt, sessionState?.currentQuestionIndex]);

  // Background Audio Music playback sync
  useEffect(() => {
    if (!sessionState) return;
    const settings = (sessionState.settings || {}) as any;
    const enabled = settings.musicEnabled !== false && !settings.musicMuted;

    if (!enabled) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }

    let trackUrl = settings.musicUrl;
    if (!trackUrl) {
      if (sessionState.status === "lobby") {
        trackUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
      } else if (sessionState.status === "active") {
        trackUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3";
      } else {
        trackUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3";
      }
    }

    if (audioRef.current && audioRef.current.src !== trackUrl) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(trackUrl);
      audioRef.current = audio;
    }

    audio.loop = settings.musicLoop !== false;
    audio.volume = (settings.musicVolume ?? 25) / 100;
    audio.play().catch(() => {});

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [
    sessionState?.status,
    sessionState?.settings?.musicEnabled,
    (sessionState?.settings as any)?.musicMuted,
    (sessionState?.settings as any)?.musicUrl,
    (sessionState?.settings as any)?.musicVolume,
    (sessionState?.settings as any)?.musicLoop
  ]);

  if (!sessionState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white animate-pulse">
        <p className="text-lg font-bold">Connecting to GATEHUB live classroom projector...</p>
      </div>
    );
  }

  // 1. Synchronized Fullscreen Countdown Screen
  if (countdown !== null) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-white">
        <p className="text-xl font-bold uppercase tracking-widest text-indigo-400 animate-pulse">
          Question {countdownQuestionIdx + 1} of {sessionState.questionCount}
        </p>
        <motion.div
          key={countdown}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-6 text-[180px] font-black text-amber-400 drop-shadow-[0_10px_20px_rgba(251,191,36,0.3)]"
        >
          {countdown === 0 ? "GO!" : countdown}
        </motion.div>
      </div>
    );
  }

  // 2. Lobby Phase Screen
  if (sessionState.status === "lobby") {
    const joinUrl = `${window.location.origin}/join`;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-8 flex flex-col justify-between">
        <header className="text-center py-4">
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-300">THE GATEHUB LIVE CLASSROOM</p>
          <h1 className="mt-2 text-4xl font-extrabold truncate max-w-4xl mx-auto">{sessionState.title}</h1>
        </header>

        {/* Lobby invitation hero */}
        <div className="max-w-4xl mx-auto w-full grid md:grid-cols-2 gap-8 items-center bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-md shadow-2xl my-6">
          <div className="space-y-6 text-center md:text-left">
            <h2 className="text-3xl font-black">Join the Quiz Lobby!</h2>
            <div className="space-y-2">
              <p className="text-sm text-indigo-200">1. Open on your device:</p>
              <p className="text-2xl font-bold text-indigo-400 font-mono tracking-wide">{joinUrl}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-indigo-200">2. Enter the PIN:</p>
              <p className="text-6xl font-black text-amber-400 font-mono tracking-widest animate-pulse">
                {sessionState.pin || "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center border-l border-white/10 pl-0 md:pl-8">
            <Users className="h-16 w-16 text-indigo-400 mb-2 animate-bounce" />
            <p className="text-3xl font-black text-white">{leaderboard.length}</p>
            <p className="text-sm font-semibold uppercase text-indigo-200 tracking-wider">Competitors Joined</p>
          </div>
        </div>

        {/* Participant list cards */}
        <div className="flex-1 max-w-6xl mx-auto w-full overflow-y-auto px-4 py-2 max-h-[300px]">
          {leaderboard.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm animate-pulse mt-12">Waiting for students to join...</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {leaderboard.map((p, idx) => (
                <motion.div
                  key={p.participantId}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white/5 border rounded-xl p-3 flex items-center gap-3 shadow-sm hover:bg-white/10 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                    {p.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-semibold text-sm truncate">{p.displayName}</span>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <footer className="text-center text-xs text-muted-foreground pt-4">
          Instructors: click Start on your control panel to begin the assessment.
        </footer>
      </div>
    );
  }

  // 3. Finished Podium Screen
  if (sessionState.status === "finished") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-8 flex flex-col justify-between">
        <header className="text-center py-6">
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-300">QUIZ COMPLETE</p>
          <h1 className="mt-2 text-4xl font-black">{sessionState.title} Podium</h1>
        </header>

        <div className="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full">
          <LivePodium entries={leaderboard} />
          
          <div className="mt-8 rounded-2xl bg-white/5 p-5 border border-white/10 max-w-2xl mx-auto w-full backdrop-blur-md">
            <h2 className="text-center text-sm uppercase font-bold text-indigo-300 tracking-widest mb-4">Top Competitor Rankings</h2>
            <LiveLeaderboard entries={leaderboard.slice(0, 10)} compact />
          </div>
        </div>

        <footer className="text-center text-xs text-muted-foreground pt-4">
          GATEHUB Assessment Engine
        </footer>
      </div>
    );
  }

  // 4. Active Question Phase
  const currentQuestion = sessionState.currentQuestion;
  const qTimer = sessionState.settings.questionTimerSeconds || 30;
  const timeLeft = Math.max(0, qTimer - elapsed);

  const totalPlayers = leaderboard.length;
  const answeredCount = analytics?.currentQuestionStats?.answered ?? 0;
  const showReveal = timeLeft <= 0 || answeredCount >= totalPlayers;

  // Options matching shapes/colors
  const questionDetails = quiz?.questions?.find((q: any) => q.id === currentQuestion?.id);
  const options = currentQuestion?.options || [];

  if (showReveal && showLeaderboardTab) {
    // Show rankings page between questions
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-8 flex flex-col justify-between animate-fadeIn">
        <header className="text-center">
          <span className="bg-primary/20 text-primary border border-primary/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
            Leaderboard Standings
          </span>
          <h1 className="mt-4 text-3xl font-black">Question {sessionState.currentQuestionIndex + 1} Standings</h1>
        </header>

        <div className="flex-1 flex flex-col justify-center max-w-3xl mx-auto w-full my-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md shadow-2xl">
            <LiveLeaderboard entries={leaderboard.slice(0, 8)} />
          </div>
        </div>

        <footer className="text-center flex justify-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setShowLeaderboardTab(false)} className="text-xs font-bold">
            Show Answer Chart
          </Button>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-8 flex flex-col justify-between animate-fadeIn">
      {/* Header with timer and counters */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase text-indigo-300 tracking-wider">
            Question {sessionState.currentQuestionIndex + 1} of {sessionState.questionCount}
          </p>
          <p className="text-xs font-semibold text-muted-foreground capitalize">Type: {currentQuestion?.type?.replace("_", " ")}</p>
        </div>

        {/* Sync Ticking Timer */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-white/10 px-3.5 py-1.5 rounded-2xl">
            <Clock className="h-4.5 w-4.5 text-amber-400" />
            <span className="font-mono text-xl font-bold tabular-nums text-amber-400">
              {showReveal ? "Time Up!" : `${timeLeft}s`}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 border border-white/10 px-3.5 py-1.5 rounded-2xl">
            <Users className="h-4.5 w-4.5 text-indigo-400" />
            <span className="font-semibold text-sm">
              Answered: <strong className="text-white text-base">{answeredCount}</strong> / {totalPlayers}
            </span>
          </div>
        </div>
      </header>

      {/* Main Question STEM display */}
      <div className="flex-1 flex flex-col justify-center max-w-5xl mx-auto w-full my-6 space-y-6">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center backdrop-blur-md shadow-lg">
          <h2 className="text-2xl sm:text-3xl font-black leading-snug">
            {currentQuestion?.text}
          </h2>
        </div>

        {/* If question is actively being answered */}
        {!showReveal ? (
          <div className="grid gap-4 md:grid-cols-2">
            {options.map((opt, idx) => {
              const theme = OPTION_THEMES[idx % OPTION_THEMES.length];
              return (
                <div
                  key={opt.id}
                  className={cn("border-2 rounded-2xl p-6 flex items-center gap-4 text-left transition-all shadow-md", theme.color)}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center font-black text-xl select-none">
                    {theme.icon}
                  </div>
                  <span className="font-bold text-lg text-white">{opt.text}</span>
                </div>
              );
            })}
          </div>
        ) : (
          /* Reveal View with Option Select Bar Charts & highlights */
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {options.map((opt, idx) => {
                const theme = OPTION_THEMES[idx % OPTION_THEMES.length];
                const optDetail = questionDetails?.options?.find((o: any) => o.id === opt.id);
                const isCorrect = optDetail?.isCorrect ?? false;
                const count = analytics?.currentQuestionStats?.optionCounts?.[opt.id] ?? 0;
                
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      "border-2 rounded-2xl p-4.5 flex items-center justify-between gap-4 transition-all relative overflow-hidden",
                      isCorrect 
                        ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)]" 
                        : "border-white/5 bg-slate-900/40 opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-3.5 z-10">
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center font-black text-lg text-white", theme.color)}>
                        {theme.icon}
                      </div>
                      <span className="font-bold text-sm sm:text-base text-white">{opt.text}</span>
                    </div>

                    {/* Bar selection stats */}
                    <div className="flex items-center gap-3.5 z-10 shrink-0">
                      {isCorrect && (
                        <span className="bg-emerald-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow animate-pulse">
                          Correct
                        </span>
                      )}
                      <span className="font-mono text-sm font-bold bg-white/10 border px-2.5 py-1 rounded-lg">
                        {count} picks
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Explanation box */}
            {questionDetails?.explanation && (
              <Card className="border border-white/10 bg-slate-900/60 p-4.5 rounded-2xl backdrop-blur">
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 animate-spin" /> Question Explanation
                </p>
                <p className="text-xs text-indigo-100 leading-relaxed font-semibold">{questionDetails.explanation}</p>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Projector actions footer */}
      <footer className="text-center flex justify-center gap-4">
        {showReveal && (
          <Button variant="outline" size="sm" onClick={() => setShowLeaderboardTab(true)} className="text-xs font-bold">
            Show Standings
          </Button>
        )}
      </footer>
    </div>
  );
}
