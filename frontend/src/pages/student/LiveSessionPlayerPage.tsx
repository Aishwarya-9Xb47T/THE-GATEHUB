import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useLiveSessionSocket } from "@/hooks/useLiveSessionSocket";
import { useLivePlayerFlow } from "@/hooks/useLivePlayerFlow";
import { LiveQuestionDisplay } from "@/components/live-session/LiveQuestionDisplay";
import { LiveAnswerFeedback } from "@/components/live-session/LiveAnswerFeedback";
import { LiveReadyStatusBar } from "@/components/live-session/LiveReadyStatusBar";
import { LiveLeaderboardReveal } from "@/components/live-session/LiveLeaderboardReveal";
import { LivePlayerHeader } from "@/components/live-session/LivePlayerHeader";
import { LiveStudentLobby } from "@/components/live-session/LiveStudentLobby";
import { LiveStudentResults } from "@/components/live-session/LiveStudentResults";
import { LiveConnectionBanner } from "@/components/live-session/LiveConnectionBanner";
import { LiveBackgroundMusic } from "@/components/live-session/LiveBackgroundMusic";
import { useToastStore } from "@/store/toastStore";
import { useLiveStudentProctoring } from "@/hooks/useLiveStudentProctoring";
import {
  isQuestionVisible,
  isPostSubmitPhase,
  isReadyForNext,
  isLeaderboardMoment,
} from "@/lib/liveSession/playerStateMachine";
import type { LeaderboardEntry } from "@/lib/liveSession/types";

export function LiveSessionPlayerPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [finished, setFinished] = useState(false);
  const [fatalToastShown, setFatalToastShown] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownQuestionIdx, setCountdownQuestionIdx] = useState<number>(0);
  const toast = useToastStore((s) => s.add);

  const {
    connected,
    connectionPhase,
    participantId,
    sessionState,
    setSessionState,
    leaderboard,
    wasRestored,
    submitAnswer,
    clearWasRestored,
    send,
  } = useLiveSessionSocket({
    sessionId: sessionId!,
    mode: "play",
    onSessionFinished: () => setFinished(true),
    onQuestionCountdown: (questionIndex, duration) => {
      setCountdown(duration);
      setCountdownQuestionIdx(questionIndex);
    },
  });

  const {
    phase,
    feedback,
    feedbackQuestionId,
    submitError,
    handleSelectionChange,
    handleSubmit,
    isSubmitting,
    canSelectOptions,
    canSubmitNow,
    selfPaced,
    localCurrentQuestion,
    localQuestionIndex,
  } = useLivePlayerFlow({
    sessionId: sessionId!,
    sessionState,
    setSessionState,
    wasRestored,
    onSubmit: submitAnswer,
    clearWasRestored,
  });

  const myEntry = leaderboard.find((e) => e.participantId === participantId);
  const questionCacheRef = useRef(new Map<string, NonNullable<typeof sessionState>["currentQuestion"]>());
  // In self-paced mode, use local question state; in instructor-paced, use session state
  const question = selfPaced ? localCurrentQuestion : sessionState?.currentQuestion ?? null;
  const questionIdx = selfPaced ? localQuestionIndex : sessionState?.currentQuestionIndex ?? 0;

  const proctor = useLiveStudentProctoring({
    sessionId: sessionId!,
    participantId,
    settings: sessionState?.settings,
    enabled: connected && participantId !== null && sessionState?.status !== "finished",
    send,
  });

  useEffect(() => {
    if (connectionPhase === "failed" && !fatalToastShown) {
      setFatalToastShown(true);
      toast({
        title: "Connection lost",
        description: "Could not reconnect to the live session. Refresh the page to try again.",
        variant: "destructive",
      });
    }
  }, [connectionPhase, fatalToastShown, toast]);

  useEffect(() => {
    if (!question) return;
    questionCacheRef.current.set(question.id, question);
  }, [question]);

  // Decrement countdown on student player
  useEffect(() => {
    if (countdown === null) return;
    console.log("[LiveSessionPlayerPage] Countdown overlay rendering. Current value:", countdown);
    if (countdown === 0) {
      const timer = setTimeout(() => {
        setCountdown(null);
      }, 800);
      return () => clearTimeout(timer);
    }
    const interval = setInterval(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(interval);
  }, [countdown]);

  const feedbackQuestion = useMemo(() => {
    if (!feedbackQuestionId) return question;
    return questionCacheRef.current.get(feedbackQuestionId) ?? question;
  }, [feedbackQuestionId, question]);

  if (!sessionState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-48 w-full max-w-md animate-pulse rounded-xl bg-muted" />
        <p className="text-sm text-muted-foreground">
          {connected ? "Loading session…" : "Connecting to session…"}
        </p>
      </div>
    );
  }

  const showBlockingScreen = sessionState.settings.cameraRequired && proctor.hasCameraAccess !== true;
  const showLobby = !showBlockingScreen && (phase === "WAITING_ROOM" || sessionState.status === "lobby");
  const showResults = !showBlockingScreen && !showLobby && (finished || phase === "QUIZ_FINISHED" || sessionState.status === "finished");
  const showQuiz = !showBlockingScreen && !showLobby && !showResults;

  const showFeedback = feedback && question && isPostSubmitPhase(phase, selfPaced ? "self_paced" : "instructor_paced");
  const feedbackVariant = phase === "SHOW_FEEDBACK" || phase === "AUTO_ADVANCE_DELAY" ? "full" : "compact";

  return (
    <div className="min-h-screen bg-background relative">
      {/* Hidden Video and Canvas for Proctoring */}
      <video ref={proctor.videoRef} className="hidden" muted playsInline />
      <canvas ref={proctor.canvasRef} width={160} height={120} className="hidden" />

      {/* Global Background Music Component */}
      <div className="fixed bottom-4 right-4 z-40">
        <LiveBackgroundMusic settings={sessionState.settings} phase={phase} countdown={countdown} sessionType={sessionState.sessionType} />
      </div>

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

      {showBlockingScreen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6 text-center">
          <div className="max-w-md space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 text-red-500 animate-pulse">
              <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black tracking-tight">Camera Required</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This quiz requires camera access.
              <br />
              Please enable your webcam.
            </p>
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs font-semibold text-red-600 dark:text-red-400">
              Please check your browser permissions settings, allow camera access, and retry to continue.
            </div>
            <div className="flex gap-3">
              <button
                className="font-bold flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  window.location.reload();
                }}
              >
                Retry Camera
              </button>
              <button
                className="font-bold flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/90"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Exit Quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {showLobby && (
        <LiveStudentLobby
          sessionState={sessionState}
          myEntry={myEntry}
          sessionId={sessionId!}
          stream={proctor.stream}
          hasCameraAccess={proctor.hasCameraAccess}
        />
      )}

      {showResults && (
        <LiveStudentResults
          myEntry={
            myEntry ?? ({
              participantId: participantId ?? "",
              userId: null,
              displayName: "You",
              avatar: null,
              rank: leaderboard.length + 1,
              score: 0,
              xp: 0,
              streak: 0,
              accuracy: 0,
              correctCount: 0,
              wrongCount: 0,
              fastestAnswerMs: null,
              movement: "same" as const,
              badges: [],
            } satisfies LeaderboardEntry)
          }
          leaderboard={leaderboard}
          title={sessionState.title}
          sessionId={sessionId!}
          questionCount={sessionState.questionCount}
        />
      )}

      {showQuiz && (
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background relative">
          <LivePlayerHeader
            title={sessionState.title}
            questionIndex={questionIdx}
            questionCount={sessionState.questionCount}
            myEntry={myEntry}
            connectionPhase={connectionPhase}
            settings={sessionState.settings}
          />

          <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
            <LiveConnectionBanner phase={connectionPhase} wasRestored={wasRestored} />

            {submitError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <AnimatePresence mode="wait">
              {question && isQuestionVisible(phase) && (
                <LiveQuestionDisplay
                  key={question.id}
                  question={question}
                  questionIndex={questionIdx}
                  questionCount={sessionState.questionCount}
                  timerSeconds={sessionState.settings.questionTimerSeconds}
                  questionStartedAt={sessionState.questionStartedAt}
                  optionsDisabled={!canSelectOptions}
                  submitDisabled={!canSubmitNow}
                  connected={connected}
                  submitting={isSubmitting}
                  onSelectionChange={handleSelectionChange}
                  onSubmit={handleSubmit}
                />
              )}
            </AnimatePresence>

            {showFeedback && (
              <LiveAnswerFeedback
                result={feedback}
                question={feedbackQuestion!}
                showCorrectAnswer={sessionState.settings.showCorrectAnswer}
                variant={feedbackVariant}
                accuracy={myEntry?.accuracy}
                selfPaced={selfPaced}
              />
            )}

            {(() => {
              const shouldShow = isReadyForNext(phase, selfPaced ? "self_paced" : "instructor_paced");
              return shouldShow && <LiveReadyStatusBar />;
            })()}
          </main>

          <AnimatePresence>
            {isLeaderboardMoment(phase) && sessionState.settings.showLeaderboard && (
              <LiveLeaderboardReveal
                entries={leaderboard}
                highlightParticipantId={participantId}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
