import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LeaderboardEntry,
  LiveAnswerResult,
  LiveSessionState,
  LiveWsMessage,
} from "@/lib/liveSession/types";
import { getLiveSessionWsUrl, submitLiveAnswerRest } from "@/lib/liveSession/api";
import type { ConnectionPhase } from "@/lib/liveSession/playerStateMachine";

const MAX_RECONNECT_ATTEMPTS = 8;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const ANSWER_TIMEOUT_MS = 6000;

interface UseLiveSessionSocketOptions {
  sessionId: string;
  enabled?: boolean;
  mode?: "play" | "host";
  onSessionFinished?: (leaderboard: LeaderboardEntry[]) => void;
  onAnswerReceived?: () => void;
  onQuestionAdvanced?: () => void;
  onReconnected?: () => void;
  onQuestionCountdown?: (questionIndex: number, duration: number) => void;
}

interface PendingAnswer {
  questionId: string;
  resolve: (result: LiveAnswerResult) => void;
  reject: (err: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

function parseAnswerResult(msg: Extract<LiveWsMessage, { type: "answer_result" }>): LiveAnswerResult {
  return {
    isCorrect: msg.isCorrect,
    pointsEarned: msg.pointsEarned,
    explanation: msg.explanation,
    correctOptions: msg.correctOptions,
    responseTimeMs: msg.responseTimeMs,
    streak: msg.streak,
    xpEarned: msg.xpEarned,
    totalScore: msg.totalScore,
    totalXp: msg.totalXp,
    rank: msg.rank,
    nextQuestion: msg.nextQuestion,
    participantQuestionIndex: msg.participantQuestionIndex,
    questionStartedAt: msg.questionStartedAt,
    isPersonalComplete: msg.isPersonalComplete,
    ...(msg as any),
  };
}

export function useLiveSessionSocket({
  sessionId,
  enabled = true,
  mode = "host",
  onSessionFinished,
  onAnswerReceived,
  onQuestionAdvanced,
  onReconnected,
  onQuestionCountdown,
}: UseLiveSessionSocketOptions) {
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("connecting");
  const [isHost, setIsHost] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<LiveSessionState | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lastAnswerResult, setLastAnswerResult] = useState<LiveAnswerResult | null>(null);
  /** Server-side action errors only (start/next/submit validation) — not connection blips */
  const [actionError, setActionError] = useState<string | null>(null);
  const [wasRestored, setWasRestored] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const pingTimer = useRef<ReturnType<typeof setInterval>>();
  const shouldReconnect = useRef(true);
  const reconnectAttempts = useRef(0);
  const backoffMs = useRef(INITIAL_BACKOFF_MS);
  const pendingAnswer = useRef<PendingAnswer | null>(null);
  const hadConnectedOnce = useRef(false);

  const onFinishedRef = useRef(onSessionFinished);
  const onAnswerReceivedRef = useRef(onAnswerReceived);
  const onQuestionAdvancedRef = useRef(onQuestionAdvanced);
  const onReconnectedRef = useRef(onReconnected);
  const onQuestionCountdownRef = useRef(onQuestionCountdown);
  onFinishedRef.current = onSessionFinished;
  onAnswerReceivedRef.current = onAnswerReceived;
  onQuestionAdvancedRef.current = onQuestionAdvanced;
  onReconnectedRef.current = onReconnected;
  onQuestionCountdownRef.current = onQuestionCountdown;

  const connected = connectionPhase === "connected";

  const applySessionState = useCallback((state: LiveSessionState) => {
    setSessionState(state);
    setLeaderboard(state.participants);
  }, []);

  const clearPendingAnswer = useCallback(() => {
    if (pendingAnswer.current) {
      clearTimeout(pendingAnswer.current.timeoutId);
      pendingAnswer.current = null;
    }
  }, []);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnect.current || !sessionId || !enabled) return;

    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionPhase("failed");
      return;
    }

    setConnectionPhase("reconnecting");
    clearTimeout(reconnectTimer.current);
    const delay = backoffMs.current;
    reconnectTimer.current = setTimeout(() => {
      reconnectAttempts.current += 1;
      backoffMs.current = Math.min(backoffMs.current * 2, MAX_BACKOFF_MS);
      connectRef.current();
    }, delay);
  }, [sessionId, enabled]);

  const connectRef = useRef<() => void>(() => {});

  const handleMessage = useCallback(
    (originalMsg: LiveWsMessage) => {
      const msg = originalMsg as any;
      switch (msg.type) {
        case "connected":
          setIsHost(msg.isHost);
          if (msg.participantId) setParticipantId(msg.participantId);
          break;
        case "session_state":
          console.log(`[NEXT QUESTION STAGE 7] Student received session_state:`, {
            status: msg.state.status,
            currentQuestionIndex: msg.state.currentQuestionIndex,
            questionCount: msg.state.questionCount,
            hasCurrentQuestion: !!msg.state.currentQuestion,
            currentQuestionId: msg.state.currentQuestion?.id,
            paceMode: msg.state.settings?.paceMode,
            sessionType: msg.state.sessionType
          });
          applySessionState(msg.state);
          break;
        case "participant_state":
          applySessionState(msg.state);
          break;
        case "session_started":
          break;
        case "participant_finished":
          setSessionState((prev) => (prev ? { ...prev, status: "finished" } : prev));
          break;
        case "question_advanced":
          console.log(`[NEXT QUESTION STAGE 7] Student received question_advanced event`);
          onQuestionAdvancedRef.current?.();
          break;
        case "leaderboard":
          setLeaderboard(msg.rankings);
          setSessionState((prev) => (prev ? { ...prev, participants: msg.rankings } : prev));
          break;
        case "answer_result": {
          const result = parseAnswerResult(msg);
          setLastAnswerResult(result);
          if (pendingAnswer.current) {
            clearTimeout(pendingAnswer.current.timeoutId);
            pendingAnswer.current.resolve(result);
            pendingAnswer.current = null;
          }
          break;
        }
        case "answer_received":
          onAnswerReceivedRef.current?.();
          break;
        case "session_finished":
          setLeaderboard(msg.leaderboard);
          setSessionState((prev) =>
            prev ? { ...prev, status: "finished", participants: msg.leaderboard } : prev
          );
          onFinishedRef.current?.(msg.leaderboard);
          break;
        case "error":
          if (pendingAnswer.current) {
            pendingAnswer.current.reject(new Error(msg.message));
            clearPendingAnswer();
          } else {
            setActionError(msg.message);
          }
          break;
        
        // V2 events
        case "question_countdown":
          console.log("[useLiveSessionSocket] Received question_countdown payload:", msg);
          onQuestionCountdownRef.current?.(msg.questionIndex as number, msg.duration as number);
          break;
        case "participant_status_updated":
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.participantId === msg.participantId ? { ...p, status: msg.status as string } : p
              ),
            };
          });
          break;
        case "participant_media_updated":
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.participantId === msg.participantId
                  ? { ...p, cameraOn: msg.cameraOn as boolean, micOn: msg.micOn as boolean }
                  : p
              ),
            };
          });
          break;
        case "participant_hand_updated":
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.participantId === msg.participantId ? { ...p, raisedHand: msg.raisedHand as boolean } : p
              ),
            };
          });
          break;
        case "session_paused_resumed":
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              settings: { ...prev.settings, isPaused: msg.isPaused as boolean } as any,
            };
          });
          break;
        case "music_state_updated":
          console.log("[useLiveSessionSocket] Received music_state_updated payload:", msg);
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              settings: {
                ...prev.settings,
                musicEnabled: msg.musicEnabled as boolean,
                musicPlaying: msg.musicPlaying as boolean,
                musicVolume: msg.musicVolume as number,
                musicLoop: msg.musicLoop as boolean,
                musicShuffle: msg.musicShuffle as boolean,
                currentTrackIndex: msg.currentTrackIndex as number,
                playlist: msg.playlist as any[],
                trackOffsetMs: (msg.trackOffsetMs || 0) as number,
                musicSyncSentAt: (msg.sentAt || Date.now()) as number,
              } as any,
            };
          });
          break;
        case "chat_toggled":
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              settings: { ...prev.settings, chatEnabled: msg.chatEnabled as boolean } as any,
            };
          });
          break;
        case "room_locked_unlocked":
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              settings: { ...prev.settings, isLocked: msg.isLocked as boolean } as any,
            };
          });
          break;
        case "leaderboard_toggled":
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              settings: { ...prev.settings, leaderboardHidden: msg.leaderboardHidden as boolean } as any,
            };
          });
          break;
        case "participant_telemetry_updated":
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.participantId === msg.participantId
                  ? { ...p, ...((msg as any).telemetry) }
                  : p
              ),
            };
          });
          window.dispatchEvent(new CustomEvent("live-session:telemetry", { detail: msg }));
          break;
        case "violation_alert":
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.participantId === msg.participantId
                  ? { ...p, violationCount: ((p as any).violationCount || 0) + 1 }
                  : p
              ),
            };
          });
          window.dispatchEvent(new CustomEvent("live-session:violation", { detail: msg }));
          break;
        case "warning":
          window.dispatchEvent(new CustomEvent("live-session:warning", { detail: msg }));
          break;
        case "announcement":
          window.dispatchEvent(new CustomEvent("live-session:announcement", { detail: msg }));
          break;
        case "private_msg":
          window.dispatchEvent(new CustomEvent("live-session:private-message", { detail: msg }));
          break;
        case "kicked":
          window.dispatchEvent(new CustomEvent("live-session:kicked", { detail: msg }));
          break;
        case "settings_updated":
          setSessionState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              settings: { ...prev.settings, ...((msg as any).settings || {}) } as any,
            };
          });
          window.dispatchEvent(new CustomEvent("live-session:settings-updated", { detail: msg }));
          break;
        case "mute_mic":
          window.dispatchEvent(new CustomEvent("live-session:mute-mic", { detail: msg }));
          break;
        case "disable_camera":
          window.dispatchEvent(new CustomEvent("live-session:disable-camera", { detail: msg }));
          break;
        case "chat_received":
          window.dispatchEvent(new CustomEvent("live-session:chat", { detail: msg }));
          break;
        case "reaction_received":
          window.dispatchEvent(new CustomEvent("live-session:reaction", { detail: msg }));
          break;
        case "participant_snapshot":
          window.dispatchEvent(new CustomEvent("live-session:snapshot", { detail: msg }));
          break;
        case "timer_extended":
        case "timer_reduced":
          window.dispatchEvent(new CustomEvent("live-session:timer-adjust", { detail: msg }));
          break;
        case "powerup_result":
          window.dispatchEvent(new CustomEvent("live-session:powerup-result", { detail: msg }));
          break;
        default:
          break;
      }
    },
    [applySessionState, clearPendingAnswer]
  );

  connectRef.current = () => {
    if (!sessionId || !enabled) return;
    if (
      wsRef.current?.readyState === WebSocket.CONNECTING ||
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      return;
    }

    setConnectionPhase((prev) => (prev === "failed" ? "connecting" : prev === "connected" ? "connected" : "connecting"));

    const ws = new WebSocket(getLiveSessionWsUrl(sessionId, mode));
    wsRef.current = ws;

    ws.onopen = () => {
      const isReconnect = hadConnectedOnce.current;
      hadConnectedOnce.current = true;
      reconnectAttempts.current = 0;
      backoffMs.current = INITIAL_BACKOFF_MS;
      setConnectionPhase("connected");
      if (isReconnect) {
        setWasRestored(true);
        onReconnectedRef.current?.();
      }
      pingTimer.current = setInterval(() => send({ type: "ping" }), 25000);
    };

    ws.onmessage = (event) => {
      try {
        handleMessage(JSON.parse(event.data) as LiveWsMessage);
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      clearInterval(pingTimer.current);
      wsRef.current = null;
      if (!shouldReconnect.current) {
        setConnectionPhase("failed");
        return;
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      /* onclose handles reconnect; avoid surfacing transient errors */
    };
  };

  useEffect(() => {
    shouldReconnect.current = true;
    reconnectAttempts.current = 0;
    backoffMs.current = INITIAL_BACKOFF_MS;
    hadConnectedOnce.current = false;
    setConnectionPhase("connecting");
    connectRef.current();

    return () => {
      shouldReconnect.current = false;
      clearTimeout(reconnectTimer.current);
      clearInterval(pingTimer.current);
      clearPendingAnswer();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sessionId, enabled, mode, clearPendingAnswer]);

  const submitAnswerViaRest = useCallback(
    async (questionId: string, answer: unknown): Promise<LiveAnswerResult> => {
      const res = await submitLiveAnswerRest(sessionId, questionId, answer);
      if (res.error) throw new Error(res.error);
      const result = res.data?.data;
      if (!result) throw new Error("Submit failed");
      setLastAnswerResult(result);
      return result;
    },
    [sessionId]
  );

  const submitAnswer = useCallback(
    async (questionId: string, answer: unknown): Promise<LiveAnswerResult> => {
      setActionError(null);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return new Promise<LiveAnswerResult>((resolve, reject) => {
          if (pendingAnswer.current) {
            reject(new Error("Submit already in progress"));
            return;
          }
          const timeoutId = setTimeout(() => {
            if (pendingAnswer.current?.questionId === questionId) {
              pendingAnswer.current = null;
              submitAnswerViaRest(questionId, answer).then(resolve).catch(reject);
            }
          }, ANSWER_TIMEOUT_MS);

          pendingAnswer.current = { questionId, resolve, reject, timeoutId };
          const sent = send({ type: "answer", questionId, answer });
          if (!sent) {
            clearTimeout(timeoutId);
            pendingAnswer.current = null;
            submitAnswerViaRest(questionId, answer).then(resolve).catch(reject);
          }
        });
      }

      return submitAnswerViaRest(questionId, answer);
    },
    [send, clearPendingAnswer, submitAnswerViaRest]
  );

  const hostStart = useCallback(() => {
    setActionError(null);
    send({ type: "host:start" });
  }, [send]);

  const hostNextQuestion = useCallback(() => {
    setActionError(null);
    console.log(`[NEXT QUESTION STAGE 1] Instructor pressed Next Question. Sending host:next_question`);
    send({ type: "host:next_question" });
  }, [send]);

  const hostFinish = useCallback(() => {
    setActionError(null);
    send({ type: "host:finish" });
  }, [send]);

  return {
    connected,
    connectionPhase,
    isHost,
    participantId,
    sessionState,
    setSessionState,
    leaderboard,
    lastAnswerResult,
    actionError,
    wasRestored,
    submitAnswer,
    hostStart,
    hostNextQuestion,
    hostFinish,
    send,
    clearAnswerResult: () => setLastAnswerResult(null),
    clearActionError: () => setActionError(null),
    clearWasRestored: () => setWasRestored(false),
    /** @deprecated use actionError + connectionPhase */
    error: actionError,
    clearError: () => setActionError(null),
  };
}
