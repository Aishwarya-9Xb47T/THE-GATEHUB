import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Users, Clock, QrCode, Play, Pause, Square, ChevronLeft, ChevronRight, Maximize2, Minimize2, Lock, BarChart3, Radio, ChevronDown, ChevronUp, Eye, EyeOff, RotateCcw, Pen, Eraser, Trash2, Plus, Zap, BarChart2, MessageSquare, Star, Hash, Smile, PenLine, UserCheck, LogOut, BrainCircuit, Image, ToggleLeft, AlignLeft, X, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Check, Copy, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildClassroomJoinUrl, isCrossDeviceShareUnsafe } from "@/lib/classroom/joinUrls";
import { SessionQrPanel } from "@/components/classroom/SessionQrPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToastStore } from "@/store/toastStore";
import { apiUrl, getToken, getWsConnectTarget } from "@/lib/api";
import { getUserIdFromToken } from "@/lib/auth";
import { SlideRenderer } from "@/components/classroom/SlideRenderer";
import { ClassroomLiveShell } from "@/components/classroom/ClassroomLiveShell";
import { parseSlide } from "@/lib/slideParser/index";
import { CreatePollDialog, type CreatePollPayload } from "@/components/classroom/CreatePollDialog";
import { formatPollTimer, parsePollOptions, remainingSeconds, resolvePollContent } from "@/lib/classroom/pollOptions";

interface Slide {
  id: string;
  order: number;
  title: string;
  content?: any;
  thumbnail?: string;
  isHidden?: boolean;
  interactions: Interaction[];
}

function getVisibleSlides(slides: Slide[]): Slide[] {
  return slides.filter((slide) => !slide.isHidden);
}

interface Interaction {
  id: string;
  type: string;
  title?: string;
  question?: string;
  options?: any;
  settings?: any;
  duration?: number;
  points: number;
}

interface Participant {
  id: string;
  user: { id: string; firstName: string; lastName: string; avatar?: string };
  status: string;
  joinedAt: string;
  raisedHand?: boolean;
  hasResponded?: boolean;
  responseTime?: number;
}

interface SessionData {
  id: string;
  title: string;
  roomCode: string;
  status: string;
  currentSlideId: string | null;
  activeInteractionId: string | null;
  presentation: {
    id: string;
    title: string;
    slides: Slide[];
  };
  participants: Participant[];
  settings?: { navigation?: "locked" | "previous" | "next" | "free"; pointer?: { x: number; y: number } };
}

interface ResponseSummary {
  totalResponses: number;
  correctResponses: number;
  incorrectResponses: number;
  averageDuration: number;
  responseRate: number;
  optionCounts: Record<string, number>;
  respondents?: Record<string, Array<{ userId: string; firstName: string; lastName: string; avatar?: string }>>;
  pending?: number;
  participationPercent?: number;
  accuracyPercent?: number | null;
  optionStats?: Array<{ id: string; label: string; text: string; count: number; percent: number; isCorrect?: boolean }>;
  anonymous?: boolean;
  remainingSeconds?: number | null;
  status?: string;
  question?: string | null;
}

interface LiveResponseEntry {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  response: string;
  submittedAt: string;
}

const WS_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function InteractiveClassroomSession() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const toast = useToastStore((s) => s.add);
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [summary, setSummary] = useState<ResponseSummary | null>(null);
  const [liveResponses, setLiveResponses] = useState<LiveResponseEntry[]>([]);
  const [navigation, setNavigation] = useState<"locked" | "previous" | "next" | "free">("locked");
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [expandedOptions, setExpandedOptions] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [showTimer, setShowTimer] = useState(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [addingInteraction, setAddingInteraction] = useState(false);
  const [interactionModeDialog, setInteractionModeDialog] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [repairingVisuals, setRepairingVisuals] = useState(false);
  const panelSnapshotRef = useRef({ left: true, right: true });
  const [showAnnouncementDialog, setShowAnnouncementDialog] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [createPollOpen, setCreatePollOpen] = useState(false);
  const [pollSaving, setPollSaving] = useState(false);
  const [editingPoll, setEditingPoll] = useState<CreatePollPayload | null>(null);
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [pollHistory, setPollHistory] = useState<Array<any>>([]);
  const [closedPollId, setClosedPollId] = useState<string | null>(null);
  const [pollRemaining, setPollRemaining] = useState<number | null>(null);
  const [viewingHistoryPollId, setViewingHistoryPollId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const sessionRef = useRef<SessionData | null>(null);

  // Keep sessionRef current for use in WS callbacks without stale closure
  useEffect(() => { sessionRef.current = session; }, [session]);

  useLayoutEffect(() => {
    document.documentElement.dataset.classroomFocus = focusMode ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.classroomFocus;
    };
  }, [focusMode]);

  useEffect(() => {
    if (!session?.activeInteractionId || pollRemaining == null) return;
    const id = window.setInterval(() => {
      setPollRemaining((current) => (current == null || current <= 0 ? current : current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [session?.activeInteractionId]);

  const fetchResponseSummary = useCallback(async (interactionId: string) => {
    if (!sessionId) return;
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/interactions/${interactionId}/summary`),
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (response.ok) {
        const data = (await response.json()) as ResponseSummary;
        setSummary(data);
      }
    } catch {
      /* ignore — WS will catch up */
    }
  }, [sessionId]);

  const fetchPollHistory = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/polls`), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (response.ok) {
        setPollHistory(await response.json());
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const fetchParticipants = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/participants`), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) return;
      const participants = await response.json() as Participant[];
      setSession((current) => current ? { ...current, participants } : current);
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const mapApiParticipant = (p: any): Participant => ({
    id: p.id,
    user: p.user ?? { id: p.userId, firstName: 'Student', lastName: '' },
    status: p.status ?? 'online',
    joinedAt: p.joinedAt ?? new Date().toISOString(),
    raisedHand: p.raisedHand ?? false,
    hasResponded: p.hasResponded ?? false,
  });

  useEffect(() => {
    void fetchSession();
    connectWebSocket();

    return () => {
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}`), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error("Failed to load session");
      const data = await response.json() as SessionData;
      // Backward-compatible repair for sessions created before server-side
      // initialization existed. New sessions are initialized in the service.
      if (!data.currentSlideId) {
        const firstSlide = getVisibleSlides(data.presentation.slides)[0];
        if (firstSlide) {
          await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/current-slide`), { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ slideId: firstSlide.id }) });
          data.currentSlideId = firstSlide.id;
        }
      }
      setNavigation(data.settings?.navigation ?? 'locked');
      setPointer(data.settings?.pointer ?? null);
      setSession(data);
      if (data.activeInteractionId) {
        void fetchResponseSummary(data.activeInteractionId);
      }
      void fetchPollHistory();
    } catch (error: any) {
      console.error("Failed to fetch session:", error);
    } finally {
      setLoading(false);
    }
  };

  const repairVisuals = async () => {
    if (!session?.presentation.id) return;
    setRepairingVisuals(true);
    try {
      const response = await fetch(
        apiUrl(`/api/classroom-studio/presentations/${session.presentation.id}/regenerate-visuals`),
        { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error?.message || body?.error || "Could not regenerate slide visuals";
        toast({ title: "Regenerate failed", description: String(message), variant: "destructive" });
        return;
      }
      toast({ title: "Slide visuals regenerated", description: "Reloading the presentation." });
      await fetchSession();
    } catch {
      toast({ title: "Regenerate failed", description: "Could not reach the presentation repair service.", variant: "destructive" });
    } finally {
      setRepairingVisuals(false);
    }
  };

  const connectWebSocket = useCallback(() => {
    const userId = getUserIdFromToken() || "instructor";
    const { protocol, host } = getWsConnectTarget();
    const wsUrl = `${protocol}://${host}/ws/classroom-studio?sessionId=${sessionId}&userId=${userId}&role=instructor&token=${encodeURIComponent(getToken() || "")}`;
    console.log("[WS] Instructor connecting", { sessionId, userId, wsUrl });
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WS] Instructor connected successfully", { sessionId, userId });
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("[WS] Instructor received message", { type: message.type, sessionId });
        handleWebSocketMessage(message);
      } catch { /* ignore malformed frames */ }
    };

    ws.onerror = (error) => {
      console.error("[WS] Instructor WebSocket error", { sessionId, error });
    };

    ws.onclose = () => {
      console.log("[WS] Instructor disconnected — scheduling reconnect", { sessionId, attempt: reconnectAttempt.current });
      const delay = WS_RECONNECT_DELAYS[Math.min(reconnectAttempt.current, WS_RECONNECT_DELAYS.length - 1)] ?? 16000;
      reconnectAttempt.current += 1;
      reconnectTimer.current = window.setTimeout(() => {
        if (sessionRef.current?.status === "active") connectWebSocket();
      }, delay);
    };

    wsRef.current = ws;
  }, [sessionId]);

  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case "participant:joined": {
        const enriched = message.data.participant;
        if (enriched) {
          const mapped = mapApiParticipant(enriched);
          setSession((current) => {
            if (!current) return current;
            if (current.participants.some((p) => p.user.id === mapped.user.id)) return current;
            return { ...current, participants: [...current.participants, mapped] };
          });
        } else {
          void fetchParticipants();
        }
        toast({ title: "Participant Joined", description: "A new student has joined the session" });
        break;
      }
      case "participant:left":
        setSession((current) => current ? { ...current, participants: current.participants.filter(p => p.user.id !== message.data.userId) } : current);
        break;
      case "slide:change":
        setSession((current) => current ? { ...current, currentSlideId: message.data.slideId, activeInteractionId: null } : current);
        break;
      case 'interaction:activate':
      case 'interaction:launch':
      case 'poll:launch':
        setClosedPollId(null);
        setViewingHistoryPollId(null);
        setPollRemaining(message.data?.remainingSeconds ?? remainingSeconds(message.data?.interaction?.timerEndsAt || message.data?.interaction?.settings?.timerEndsAt));
        setSession((current) => {
          if (!current) return current;
          const newInteraction = message.data.interaction;
          if (newInteraction && current.currentSlideId) {
            const updatedSlides = current.presentation.slides.map((slide) => {
              if (slide.id === current.currentSlideId) {
                const alreadyExists = slide.interactions.some((i) => i.id === newInteraction.id);
                if (!alreadyExists) {
                  return { ...slide, interactions: [...slide.interactions, newInteraction] };
                }
              }
              return slide;
            });
            return { ...current, activeInteractionId: message.data.interactionId, presentation: { ...current.presentation, slides: updatedSlides } };
          }
          return { ...current, activeInteractionId: message.data.interactionId };
        });
        setRevealed(false);
        setExpandedOptions({});
        setLiveResponses([]);
        if (message.data.interactionId) void fetchResponseSummary(message.data.interactionId);
        void fetchPollHistory();
        break;
      case "interaction:deactivate":
      case "interaction:close":
      case "poll:close":
        setClosedPollId(message.data?.interactionId ?? sessionRef.current?.activeInteractionId ?? null);
        setPollRemaining(0);
        if (message.data?.summary) setSummary(message.data.summary);
        setSession((current) => current ? { ...current, activeInteractionId: null } : current);
        setRevealed(false);
        setExpandedOptions({});
        break;
      case "interaction:reveal":
        setRevealed(true);
        break;
      case "interaction:reopen":
        setSession((current) => current ? { ...current, activeInteractionId: message.data.interactionId } : current);
        setRevealed(false);
        break;
      case "slide:update":
        setSession((current) => current ? { ...current, presentation: { ...current.presentation, slides: current.presentation.slides.map((slide) => slide.id === message.data.slide.id ? { ...slide, ...message.data.slide } : slide) } } : current);
        break;
      case 'analytics:update':
      case 'poll:results':
        if (message.data.summary) setSummary(message.data.summary);
        if (typeof message.data?.remainingSeconds === 'number') setPollRemaining(message.data.remainingSeconds);
        break;
      case 'poll:timer':
        if (typeof message.data?.remainingSeconds === 'number') setPollRemaining(message.data.remainingSeconds);
        break;
      case 'poll:sync':
        if (message.data?.activePoll) {
          setPollRemaining(message.data.remainingSeconds ?? remainingSeconds(message.data.activePoll.timerEndsAt || message.data.activePoll.settings?.timerEndsAt));
        }
        break;
      case 'participant:response': {
        const d = message.data;
        if (d?.userId && d?.response != null) {
          const responseText = Array.isArray(d.response) ? d.response.join(', ') : String(d.response);
          setLiveResponses((prev) => [
            {
              id: `${d.userId}-${Date.now()}`,
              userId: d.userId,
              firstName: d.firstName ?? 'Student',
              lastName: d.lastName ?? '',
              response: responseText,
              submittedAt: d.submittedAt ?? new Date().toISOString(),
            },
            ...prev,
          ].slice(0, 30));
        }
        setSession((current) => current ? { ...current, participants: current.participants.map((participant) => participant.user.id === message.data.userId ? { ...participant, hasResponded: true } as Participant : participant) } : current);
        break;
      }
      case "participant:state":
        setSession((current) => current ? { ...current, participants: current.participants.map((participant) => (participant.user.id === message.data.userId || participant.user.id === message.data.participantId) ? { ...participant, raisedHand: message.data.raisedHand } as Participant : participant) } : current);
        break;
      case "hands:cleared":
        setSession((current) => current ? { ...current, participants: current.participants.map((p) => ({ ...p, raisedHand: false })) } : current);
        break;
      case "pointer:move":
        setPointer(message.data);
        break;
      case "navigation:change":
        setNavigation(message.data.navigation);
        break;
      case "connected":
        setNavigation(message.data.settings?.navigation ?? "locked");
        setPointer(message.data.settings?.pointer ?? null);
        if (message.data.currentSlideId) {
          setSession((current) => current ? {
            ...current,
            currentSlideId: message.data.currentSlideId,
            activeInteractionId: message.data.activeInteractionId ?? current.activeInteractionId,
          } : current);
        }
        break;
      default:
        console.log("[WS] Unknown message type:", message.type);
    }
  };

  // NO POLLING: Analytics update via WebSocket only
  // This useEffect is now empty - all analytics come through analytics:update events

  /** Navigate to a slide: update DB via HTTP, then broadcast via WS so students follow immediately. */
  const goToSlide = async (slide: Slide) => {
    if (!session || slide.id === session.currentSlideId) return;
    const previousSlideId = session.currentSlideId;
    // Optimistic local update
    setSession((current) => current ? { ...current, currentSlideId: slide.id, activeInteractionId: null } : current);
    try {
      await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/current-slide`), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ slideId: slide.id, previousSlideId }),
      });
      // HTTP controller broadcasts slide:change to all clients
    } catch (error: any) {
      console.error("Failed to advance slide:", error);
      // Rollback optimistic update
      setSession((current) => current ? { ...current, currentSlideId: previousSlideId, activeInteractionId: null } : current);
    }
  };

  const advanceSlide = async (direction: "next" | "previous") => {
    if (!session) return;
    const visible = getVisibleSlides(session.presentation.slides);
    const currentIdx = visible.findIndex((s) => s.id === session.currentSlideId);
    if (currentIdx < 0) return;
    const nextIdx = direction === "next" ? currentIdx + 1 : currentIdx - 1;
    if (nextIdx >= 0 && nextIdx < visible.length) {
      await goToSlide(visible[nextIdx]!);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || ["INPUT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); void advanceSlide("next"); }
      if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); void advanceSlide("previous"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session?.currentSlideId]);

  const triggerInteraction = async (interactionId: string) => {
    try {
      await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/activate-interaction`), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ interactionId }),
      });
      setSession((current) => current ? { ...current, activeInteractionId: interactionId } : current);
      setLiveResponses([]);
      void fetchResponseSummary(interactionId);
    } catch (error: any) {
      console.error("Failed to trigger interaction:", error);
    }
  };

  const endInteraction = async () => {
    try {
      await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/deactivate-interaction`), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      // Backend handles broadcast via WebSocket
      setSession((current) => current ? { ...current, activeInteractionId: null } : current);
      setRevealed(false);
      setExpandedOptions({});
    } catch (error: any) {
      console.error("Failed to end interaction:", error);
    }
  };

  const revealAnswers = async () => {
    if (!session?.activeInteractionId) return;
    try {
      await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/reveal-answer`), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ interactionId: session.activeInteractionId }),
      });
      setRevealed(true);
    } catch {
      wsRef.current?.send(JSON.stringify({ type: "interaction:reveal", data: { interactionId: session.activeInteractionId } }));
      setRevealed(true);
    }
  };

  const reopenInteraction = async () => {
    if (!session?.activeInteractionId) return;
    const interactionId = session.activeInteractionId;
    try {
      setRevealed(false);
      setExpandedOptions({});
      // Call the real reopen API: clears DB responses + re-activates + broadcasts
      await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/interactions/${interactionId}/reopen`), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      // Also reset local summary so UI instantly shows 0 votes
      setSummary(null);
    } catch (error: any) {
      console.error("Failed to reopen interaction:", error);
    }
  };

  const toggleOptionExpansion = (optionText: string) => {
    setExpandedOptions((prev) => ({
      ...prev,
      [optionText]: !prev[optionText],
    }));
  };

  const endSession = async () => {
    try {
      await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/end`), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      // Broadcast session end to students so they can show a "Session ended" screen
      wsRef.current?.send(JSON.stringify({ type: "session:end", data: {} }));
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
      navigate("/instructor/interactive-classroom");
    } catch (error: any) {
      console.error("Failed to end session:", error);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => undefined);
      setIsFullscreen(false);
    }
  };

  const enterFocusMode = useCallback(() => {
    setLeftPanelOpen((left) => {
      panelSnapshotRef.current.left = left;
      return left;
    });
    setRightPanelOpen((right) => {
      panelSnapshotRef.current.right = right;
      return right;
    });
    setFocusMode(true);
  }, []);

  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    setLeftPanelOpen(panelSnapshotRef.current.left);
    setRightPanelOpen(panelSnapshotRef.current.right);
  }, []);

  useEffect(() => {
    if (!focusMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        exitFocusMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, exitFocusMode]);

  const updateNavigation = async (next: typeof navigation) => {
    setNavigation(next);
    await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}`), { method: "PUT", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ settings: { ...(session?.settings ?? {}), navigation: next } }) });
    wsRef.current?.send(JSON.stringify({ type: "navigation:change", data: { navigation: next } }));
  };

  // Timer functions
  const startTimer = (seconds: number) => {
    setTimerSeconds(seconds);
    setTimerRunning(true);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = window.setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          toast({ title: "Timer Finished", description: "Time is up!" });
          wsRef.current?.send(JSON.stringify({ type: "timer:stop", data: {} }));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    wsRef.current?.send(JSON.stringify({ type: "timer:start", data: { duration: seconds } }));
  };

  const stopTimer = () => {
    setTimerRunning(false);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    wsRef.current?.send(JSON.stringify({ type: "timer:stop", data: {} }));
  };

  const resetTimer = () => {
    stopTimer();
    setTimerSeconds(0);
  };

  // Annotation functions
  const addAnnotation = (annotation: any) => {
    const newAnnotation = { ...annotation, id: Date.now().toString(), slideId: session?.currentSlideId };
    setAnnotations((prev) => [...prev, newAnnotation]);
    wsRef.current?.send(JSON.stringify({ type: "annotation:add", data: newAnnotation }));
  };

  const clearAnnotations = () => {
    setAnnotations([]);
    wsRef.current?.send(JSON.stringify({ type: "annotation:clear", data: { slideId: session?.currentSlideId } }));
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    wsRef.current?.send(JSON.stringify({ type: "annotation:remove", data: { id } }));
  };

  const kickParticipant = (userId: string, name: string) => {
    wsRef.current?.send(JSON.stringify({ type: "participant:kick", data: { userId } }));
    setSession((prev) => prev ? { ...prev, participants: prev.participants.filter(p => p.user.id !== userId) } : prev);
    toast({ title: "Student Removed", description: `${name} has been removed from the session` });
  };

  const muteParticipant = (userId: string, name: string) => {
    wsRef.current?.send(JSON.stringify({ type: "participant:mute", data: { userId } }));
    toast({ title: "Student Muted", description: `Chat muted for ${name}` });
  };

  const broadcastAnnouncement = () => {
    if (!announcementText.trim()) return;
    wsRef.current?.send(JSON.stringify({ type: "announcement:broadcast", data: { message: announcementText.trim() } }));
    toast({ title: "Announcement Broadcast", description: "Sent to all connected students" });
    setAnnouncementText("");
    setShowAnnouncementDialog(false);
  };

  const togglePauseSession = () => {
    const nextState = !isPaused;
    setIsPaused(nextState);
    wsRef.current?.send(JSON.stringify({ type: nextState ? "session:pause" : "session:resume", data: {} }));
    toast({ title: nextState ? "Session Paused" : "Session Resumed", description: nextState ? "Student inputs are locked" : "Session active" });
  };

  const clearRaisedHands = async () => {
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/clear-hands`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (response.ok) {
        toast({ title: "Hands cleared", description: "All raised hands have been cleared" });
        fetchSession();
      }
    } catch (error: any) {
      console.error("Failed to clear raised hands:", error);
    }
  };

  /**
   * Quick-launch an interaction: creates it on the current slide + activates it atomically.
   * The backend broadcasts interaction:activate with the full interaction object, so students
   * receive the overlay without any additional round trips.
   */
  const quickLaunchInteraction = async (type: string, settings?: Record<string, any>) => {
    if (!session?.currentSlideId || addingInteraction) return;
    setAddingInteraction(true);
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/quick-interaction`), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type, settings: settings ?? {} }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast({ title: "Error", description: err.error || "Failed to launch interaction", variant: "destructive" });
        return;
      }
      const result = await response.json();
      setSummary(null);
      setRevealed(false);
      setLiveResponses([]);
      if (result.interaction?.id) void fetchResponseSummary(result.interaction.id);
      toast({ title: `${type.replace(/_/g, ' ')} launched!`, description: "Students can now respond" });
    } catch (error: any) {
      console.error("Failed to quick-launch interaction:", error);
      toast({ title: "Error", description: "Failed to launch interaction", variant: "destructive" });
    } finally {
      setAddingInteraction(false);
    }
  };

  const openInteractionModeDialog = () => {
    if (!session?.currentSlideId) {
      toast({ title: "No active slide", description: "Navigate to a slide first", variant: "destructive" });
      return;
    }
    setInteractionModeDialog(true);
  };

  const launchInteractionMode = async (type: string) => {
    setInteractionModeDialog(false);
    await quickLaunchInteraction(type);
  };

  const saveOrLaunchPoll = async (payload: CreatePollPayload) => {
    if (!sessionId) return;
    setPollSaving(true);
    try {
      const endpoint = editingPollId
        ? `/api/classroom-studio/sessions/${sessionId}/polls/${editingPollId}`
        : `/api/classroom-studio/sessions/${sessionId}/polls`;
      const response = await fetch(apiUrl(endpoint), {
        method: editingPollId ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, launch: payload.launch && !editingPollId }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save poll");
      }
      const result = await response.json();
      const pollId = result.interaction?.id || editingPollId;
      if (payload.launch && pollId && editingPollId) {
        const launchRes = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/polls/${pollId}/launch`), {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!launchRes.ok) {
          const err = await launchRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to launch poll");
        }
      }
      setCreatePollOpen(false);
      setEditingPoll(null);
      setEditingPollId(null);
      setClosedPollId(null);
      void fetchPollHistory();
      toast({
        title: payload.launch ? "Poll launched" : "Draft saved",
        description: payload.launch ? "Students can answer now" : "Poll saved without launching",
      });
    } catch (error: any) {
      toast({ title: "Poll error", description: error.message || "Could not save poll", variant: "destructive" });
    } finally {
      setPollSaving(false);
    }
  };

  const closeActivePoll = async () => {
    const pollId = session?.activeInteractionId;
    if (!sessionId || !pollId) {
      await endInteraction();
      return;
    }
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/polls/${pollId}/close`), {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) {
        await endInteraction();
        return;
      }
      const result = await response.json();
      setClosedPollId(pollId);
      if (result.summary) setSummary(result.summary);
      setPollRemaining(0);
      void fetchPollHistory();
    } catch {
      await endInteraction();
    }
  };

  const duplicateHistoryPoll = async (pollId: string) => {
    const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/polls/${pollId}/duplicate`), {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!response.ok) {
      toast({ title: "Could not duplicate poll", variant: "destructive" });
      return;
    }
    const poll = await response.json();
    setEditingPollId(poll.id);
    setEditingPoll({
      question: poll.question || "",
      pollKind: poll.settings?.pollKind || "single_choice",
      type: poll.settings?.pollKind || "single_choice",
      options: parsePollOptions(poll.options),
      anonymous: Boolean(poll.settings?.anonymous),
      showResults: poll.settings?.showResults !== false,
      allowChangeAnswer: Boolean(poll.settings?.allowChangeAnswer),
      required: Boolean(poll.settings?.required),
      shuffleOptions: Boolean(poll.settings?.shuffleOptions),
      timerEnabled: Boolean(poll.settings?.timerEnabled),
      durationSeconds: poll.settings?.durationSeconds ?? poll.duration,
      launch: false,
    });
    setCreatePollOpen(true);
    void fetchPollHistory();
  };

  const relaunchHistoryPoll = async (pollId: string) => {
    const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/polls/${pollId}/launch`), {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      toast({ title: "Could not re-launch", description: err.error || "Duplicate the poll first if it already closed.", variant: "destructive" });
      return;
    }
    void fetchPollHistory();
  };

  const deleteHistoryPoll = async (pollId: string) => {
    const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/polls/${pollId}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      toast({ title: "Could not delete poll", description: err.error, variant: "destructive" });
      return;
    }
    void fetchPollHistory();
  };

  const exportCsv = async () => {
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/export/csv`), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error("CSV export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session_${sessionId}_report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast({ title: "Export complete", description: "CSV report downloaded" });
    } catch (error: any) {
      console.error("Export CSV error:", error);
      toast({ title: "Export Error", description: "Failed to export CSV", variant: "destructive" });
    }
  };

  const exportPdf = async () => {
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}/export/pdf`), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error("PDF export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session_${sessionId}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast({ title: "Export complete", description: "PDF report downloaded" });
    } catch (error: any) {
      console.error("Export PDF error:", error);
      toast({ title: "Export Error", description: "Failed to export PDF", variant: "destructive" });
    }
  };

  const joinLink = session?.roomCode
    ? buildClassroomJoinUrl(session.roomCode)
    : `${window.location.origin}/student/classroom/join/`;
  const broadcastPointer = (point: { x: number; y: number }) => {
    setPointer(point); wsRef.current?.send(JSON.stringify({ type: "pointer:move", data: point }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Session not found</p>
      </div>
    );
  }

  const currentSlide = session.presentation.slides.find(s => s.id === session.currentSlideId);
  const visibleSlides = getVisibleSlides(session.presentation.slides);
  const visibleSlideIndex = currentSlide ? visibleSlides.findIndex((s) => s.id === currentSlide.id) : -1;
  const displayedInteractionId = session.activeInteractionId || closedPollId || viewingHistoryPollId;
  const displayedInteraction =
    currentSlide?.interactions.find((i) => i.id === displayedInteractionId) ||
    session.presentation.slides.flatMap((slide) => slide.interactions).find((i) => i.id === displayedInteractionId);
  const activeInteraction = currentSlide?.interactions.find(i => i.id === session.activeInteractionId) || displayedInteraction;
  const pollClosed = Boolean(closedPollId && !session.activeInteractionId);
  
  // Parse slide content for interaction display
  const parsedSlide = currentSlide ? parseSlide(currentSlide) : null;
  const pollContent = activeInteraction
    ? resolvePollContent(activeInteraction, { title: parsedSlide?.question || currentSlide?.title, parsedOptions: parsedSlide?.options })
    : null;
  const interactionContent = pollContent
    ? { question: pollContent.question, options: pollContent.options }
    : null;

  return (
    <ClassroomLiveShell
      focusMode={focusMode}
      leftOpen={leftPanelOpen}
      rightOpen={rightPanelOpen}
      header={
      <div className={focusMode ? "px-4 py-2" : "mx-auto max-w-[1800px] px-5 py-3"}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/instructor/interactive-classroom")}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-[11px] font-bold tracking-[.18em] text-emerald-300">LIVE CLASSROOM</span></div>
                <h1 className="text-xl font-bold">{session.title || session.presentation.title}</h1>
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {session.participants.length} participants
                  </span>
                  <span className="flex items-center gap-1">
                    <QrCode className="w-4 h-4" />
                    {session.roomCode}
                  </span>
                  <Badge variant={session.status === "active" ? "default" : "secondary"}>
                    {session.status}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {focusMode ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={exitFocusMode}
                  className="bg-violet-600 text-white hover:bg-violet-500"
                  title="Exit focus mode (Esc)"
                  data-testid="classroom-focus-toggle"
                >
                  <Minimize2 className="w-4 h-4 mr-1.5" />
                  <span>Exit Focus</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={enterFocusMode}
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  title="Focus on the presentation"
                  data-testid="classroom-focus-toggle"
                >
                  <Maximize2 className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">Focus</span>
                </Button>
              )}
              {!focusMode && (
              <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setLeftPanelOpen((v) => !v)}
                className="inline-flex border-white/15 bg-white/5 text-white hover:bg-white/10"
                title={leftPanelOpen ? 'Hide class flow' : 'Show class flow'}
              >
                {leftPanelOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setRightPanelOpen((v) => !v)}
                className="inline-flex border-white/15 bg-white/5 text-white hover:bg-white/10"
                title={rightPanelOpen ? 'Hide live pulse' : 'Show live pulse'}
              >
                {rightPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv} className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                <BarChart2 className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
              <Button variant="outline" size="sm" onClick={exportPdf} className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                <Image className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowQR(true)} className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                <QrCode className="w-4 h-4" />
                <span className="ml-2 hidden sm:inline">Join</span>
              </Button>
              <Button variant="outline" size="icon" onClick={toggleFullscreen} className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
              </>
              )}
              <Button type="button" variant="destructive" onClick={endSession}>
                <Square className="w-4 h-4 mr-2" />
                End Session
              </Button>
            </div>
          </div>
        </div>
      }
      left={
        <>
          <div className="p-4 border-b border-white/10">
            <h3 className="font-semibold text-white">Class flow</h3>
            <p className="mt-1 text-xs text-slate-400">Instructor controls navigation</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {session.presentation.slides.map((slide, index) => {
                const isCurrentSlide = currentSlide?.id === slide.id;
                const hasInteractions = slide.interactions.length > 0;
                
                return (
                  <div key={slide.id}>
                    <Card
                      className={`cursor-pointer border-white/10 bg-white/[.03] transition-all ${
                        isCurrentSlide ? "ring-2 ring-violet-400 bg-violet-500/10" : ""
                      } ${slide.isHidden ? "opacity-50" : ""}`}
                      onClick={() => goToSlide(slide)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {index + 1}
                          </Badge>
                          <p className="text-sm font-medium truncate flex-1 text-white">{slide.title}</p>
                          {hasInteractions && (
                            <Badge variant="secondary" className="text-xs">
                              {slide.interactions.length}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    
                    {/* Show interactions for this slide */}
                    {hasInteractions && (
                      <div className="ml-4 mt-1 space-y-1">
                        {slide.interactions.map((interaction: any) => {
                          const isActive = session.activeInteractionId === interaction.id;
                          return (
                            <div
                              key={interaction.id}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${
                                isActive
                                  ? 'bg-violet-500/20 text-violet-300'
                                  : 'bg-white/5 text-slate-400'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                              <span className="truncate flex-1">{interaction.title}</span>
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                {interaction.type}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </>
      }
      stage={
            currentSlide ? (
                <SlideRenderer
                  content={currentSlide.content}
                  title={currentSlide.title}
                  slideNumber={currentSlide.order}
                  presentationId={session.presentation.id}
                  slideId={currentSlide.id}
                  onPointerMove={broadcastPointer}
                  pointer={pointer}
                  className="w-full h-full max-h-full rounded-lg"
                  canRepair
                  repairing={repairingVisuals}
                  onRepair={() => void repairVisuals()}
                />
            ) : (
              <div className="text-center">
                <p className="text-muted-foreground">This presentation has no visible slides.</p>
              </div>
            )
      }
      compactBar={
          (focusMode || !rightPanelOpen) ? (
            <div className="shrink-0 border-t border-violet-500/30 bg-violet-950/40 px-3 py-2 flex items-center justify-between gap-2 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
                {activeInteraction ? (
                  <>
                    <Badge variant="secondary" className="text-[10px] uppercase shrink-0">
                      Poll active
                    </Badge>
                    <span className="text-xs sm:text-sm text-violet-100 truncate">
                      {interactionContent?.question || currentSlide?.title || "Live poll"}
                    </span>
                  </>
                ) : (
                  <span className="text-xs sm:text-sm text-violet-100 truncate">Polls remain available while Live Pulse is hidden</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {activeInteraction && (
                  <span className="text-xs text-violet-200 shrink-0 tabular-nums whitespace-nowrap">
                    {summary?.totalResponses ?? 0}/{session.participants.length}
                  </span>
                )}
                {activeInteraction && !revealed && (
                  <Button size="sm" variant="outline" onClick={revealAnswers} className="h-7 text-xs border-white/20 bg-white/5 text-white">
                    <Eye className="w-3 h-3 mr-1" />
                    Reveal
                  </Button>
                )}
                {session.activeInteractionId ? (
                  <Button variant="destructive" size="sm" onClick={closeActivePoll} className="h-7 text-xs">
                    Close Poll
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingPoll(null);
                      setEditingPollId(null);
                      setCreatePollOpen(true);
                    }}
                    disabled={!session.currentSlideId}
                    className="h-7 text-xs bg-violet-600 hover:bg-violet-500 text-white"
                  >
                    Create Poll
                  </Button>
                )}
                {(!rightPanelOpen || focusMode) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (focusMode) exitFocusMode();
                      setRightPanelOpen(true);
                    }}
                    className="h-7 text-xs border-white/20 bg-white/5 text-white"
                  >
                    Live Pulse
                  </Button>
                )}
              </div>
            </div>
          ) : null
      }
      bottomNav={
          <div className="border-t border-white/10 bg-slate-900/90 p-3">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <Button
                variant="outline"
                size="icon"
                onClick={() => advanceSlide("previous")}
                disabled={!currentSlide || visibleSlideIndex <= 0}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>

              <div className="flex items-center gap-3 text-sm text-slate-300 tabular-nums">
                <span>
                  {currentSlide ? visibleSlideIndex + 1 : 0}/{visibleSlides.length}
                </span>
                {currentSlide?.interactions.map((interaction) => (
                  <Button
                    key={interaction.id}
                    variant={session.activeInteractionId === interaction.id ? "default" : "outline"}
                    onClick={() => session.activeInteractionId === interaction.id ? endInteraction() : triggerInteraction(interaction.id)}
                  >
                    {session.activeInteractionId === interaction.id ? (
                      <>
                        <Pause className="w-4 h-4 mr-2" />
                        End
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        {interaction.type}
                      </>
                    )}
                  </Button>
                ))}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={() => advanceSlide("next")}
                disabled={!currentSlide || visibleSlideIndex >= visibleSlides.length - 1}
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
      }
      right={
        <>
          <div className="shrink-0 p-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Live pulse</h3>
              <Radio className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Joined", session.participants.length],
                ["Active", session.participants.filter((p) => p.status === "online").length],
                ["Pending", Math.max(0, session.participants.length - (summary?.totalResponses ?? 0))],
                ["Hands", session.participants.filter((p) => p.raisedHand).length],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="text-lg font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable controls */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="divide-y divide-white/10">
              {activeInteraction && (
                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <BarChart3 className="h-4 w-4 text-violet-300 shrink-0" />
                      <span className="text-sm font-semibold text-white truncate">{pollClosed ? 'Poll closed' : 'Active poll'}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {pollRemaining != null && session.activeInteractionId && (
                        <Badge className="bg-amber-500/20 text-amber-200 border-0">{formatPollTimer(pollRemaining)}</Badge>
                      )}
                      {!revealed ? (
                        <Button size="sm" variant="outline" onClick={revealAnswers} className="h-7 text-xs border-white/20 bg-white/5 text-white hover:bg-white/10">
                          <Eye className="w-3 h-3 mr-1" />
                          Reveal
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={reopenInteraction} className="h-7 text-xs border-white/20 bg-white/5 text-white hover:bg-white/10">
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>
                  {interactionContent?.question && (
                    <p className="text-sm font-medium text-white mb-3 leading-snug">{interactionContent.question}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                    <div><b className="block text-lg text-white">{summary?.totalResponses ?? 0}</b><span className="text-slate-400">answered</span></div>
                    <div><b className="block text-lg text-white">{Math.round(summary?.participationPercent ?? summary?.responseRate ?? 0)}%</b><span className="text-slate-400">participation</span></div>
                    <div><b className="block text-lg text-white">{Math.round(summary?.averageDuration ?? 0)}s</b><span className="text-slate-400">average</span></div>
                  </div>
                  {typeof summary?.accuracyPercent === 'number' && (
                    <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-emerald-200">Correct {Math.round(summary.accuracyPercent)}%</div>
                      <div className="rounded-md bg-rose-500/10 px-2 py-1.5 text-rose-200">Incorrect {Math.round(100 - summary.accuracyPercent)}%</div>
                    </div>
                  )}

                  {liveResponses.length > 0 && !summary?.anonymous && (
                    <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300 mb-2">Live responses</p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {liveResponses.slice(0, 8).map((entry) => (
                          <div key={entry.id} className="flex items-center gap-2 text-xs">
                            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300 font-semibold shrink-0">
                              {entry.firstName?.[0] ?? '?'}
                            </div>
                            <span className="text-white font-medium truncate">{entry.firstName} {entry.lastName}</span>
                            <span className="text-slate-400 truncate ml-auto max-w-[38%]">{entry.response}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(interactionContent?.options && interactionContent.options.length > 0
                    ? interactionContent.options
                    : []
                  ).map((option: any, index: number) => {
                    const optionKey = option.label || option.text || String.fromCharCode(65 + index);
                    const count = (summary?.optionCounts?.[option.label] || summary?.optionCounts?.[optionKey] || summary?.optionCounts?.[option.text] || summary?.optionCounts?.[option.id] || 0);
                    const percent = summary?.totalResponses ? Math.round((count / summary.totalResponses) * 100) : 0;
                    const isExpanded = expandedOptions[optionKey] || expandedOptions[option.text];
                    const respondents = (summary?.respondents?.[option.label] || summary?.respondents?.[optionKey] || summary?.respondents?.[option.text] || []) ;

                    return (
                      <div key={option.id || index} className="mt-3">
                        <div className="mb-1 flex justify-between items-center text-xs gap-2">
                          <span className="font-medium text-white truncate">{option.label || String.fromCharCode(65 + index)} · {option.text}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-slate-400">{count}{summary?.totalResponses ? ` (${percent}%)` : ''}</span>
                            {count > 0 && !summary?.anonymous && (
                              <Button size="sm" variant="ghost" onClick={() => toggleOptionExpansion(optionKey)} className="h-5 w-5 p-0 text-slate-400 hover:text-white">
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="h-2 overflow-hidden rounded bg-white/10 mb-1">
                          <div className="h-full bg-violet-500 transition-all duration-500" style={{ width: `${percent}%` }} />
                        </div>
                        {isExpanded && respondents.length > 0 && (
                          <div className="mt-1 space-y-1 pl-2 border-l-2 border-violet-500/30">
                            {respondents.map((respondent: any) => (
                              <div key={respondent.userId} className="flex items-center gap-2 text-xs text-slate-300">
                                <div className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-300 text-[10px] font-medium">
                                  {respondent.firstName?.[0] || '?'}
                                </div>
                                <span className="text-white truncate">{respondent.firstName} {respondent.lastName}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Launch Interaction</p>
                  {addingInteraction && <span className="text-xs text-violet-400 animate-pulse">Launching…</span>}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingPoll(null);
                    setEditingPollId(null);
                    setCreatePollOpen(true);
                  }}
                  disabled={!session.currentSlideId || addingInteraction}
                  className="w-full mb-2 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white"
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Create Poll
                </Button>
                {!session.currentSlideId ? (
                  <p className="text-xs text-slate-500">Select a slide first</p>
                ) : session.activeInteractionId ? (
                  <Button variant="destructive" size="sm" onClick={closeActivePoll} className="w-full text-xs font-medium">
                    <Pause className="mr-2 h-3.5 w-3.5" />
                    Close Poll
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        ['poll', 'Poll'],
                        ['mcq', 'MCQ'],
                        ['true_false', 'True/False'],
                        ['rating', 'Rating'],
                        ['word_cloud', 'Word Cloud'],
                        ['discussion', 'Discussion'],
                      ].map(([type, label]) => (
                        <Button
                          key={type}
                          size="sm"
                          variant="outline"
                          onClick={() => quickLaunchInteraction(type)}
                          disabled={addingInteraction}
                          className="text-xs text-white border-white/15 bg-white/5 hover:bg-white/10 justify-start"
                        >
                          <Zap className="mr-1.5 h-3 w-3 text-violet-400 shrink-0" />
                          {label}
                        </Button>
                      ))}
                    </div>
                    <Button
                      onClick={openInteractionModeDialog}
                      disabled={addingInteraction}
                      variant="ghost"
                      className="w-full justify-center text-xs text-violet-300 hover:text-white hover:bg-violet-500/20"
                    >
                      More Modes…
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <History className="h-3 w-3" /> Poll history
                </p>
                {pollHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">No polls yet this session.</p>
                ) : (
                  <div className="space-y-2">
                    {pollHistory.slice(0, 8).map((poll) => (
                      <div key={poll.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
                        <p className="text-xs text-white font-medium truncate">{poll.question}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{poll.responseCount} responses · {poll.status}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-slate-200" onClick={() => { setViewingHistoryPollId(poll.id); setClosedPollId(poll.id); void fetchResponseSummary(poll.id); }}>View</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-slate-200" onClick={() => void relaunchHistoryPoll(poll.id)}>Re-launch</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-slate-200" onClick={() => void duplicateHistoryPoll(poll.id)}><Copy className="h-3 w-3 mr-1" />Duplicate</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-slate-200" onClick={() => { setEditingPollId(poll.id); setEditingPoll({ question: poll.question, pollKind: poll.pollKind, type: poll.pollKind, options: poll.options, anonymous: poll.settings?.anonymous, showResults: poll.settings?.showResults, allowChangeAnswer: poll.settings?.allowChangeAnswer, required: poll.settings?.required, shuffleOptions: poll.settings?.shuffleOptions, timerEnabled: poll.settings?.timerEnabled, durationSeconds: poll.settings?.durationSeconds, launch: false }); setCreatePollOpen(true); }}>Edit</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-rose-300" onClick={() => void deleteHistoryPoll(poll.id)}>Delete</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Student navigation</p>
                <div className="grid grid-cols-2 gap-2">
                  {[["locked", "Lock"], ["previous", "Previous"], ["next", "Next"], ["free", "Explore"]].map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={navigation === value ? "default" : "outline"}
                      className={
                        navigation === value
                          ? "text-xs font-medium"
                          : "text-xs font-medium text-slate-100 border-white/25 bg-slate-800/60 hover:bg-white/10 hover:text-white"
                      }
                      onClick={() => updateNavigation(value as typeof navigation)}
                    >
                      {value === "locked" && <Lock className="mr-1 h-3 w-3" />}
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Participant Actions</p>
                <div className="space-y-2">
                  <Button size="sm" variant="outline" onClick={clearRaisedHands} disabled={session.participants.filter((p) => p.raisedHand).length === 0} className="w-full text-xs text-white border-white/20 bg-white/5 hover:bg-white/10">
                    Clear All Raised Hands ({session.participants.filter((p) => p.raisedHand).length})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAnnouncementDialog(true)} className="w-full text-xs text-white border-white/20 bg-white/5 hover:bg-white/10">
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-violet-400" />
                    Broadcast Announcement
                  </Button>
                  <Button size="sm" variant={isPaused ? "default" : "outline"} onClick={togglePauseSession} className="w-full text-xs text-white border-white/20 bg-white/5 hover:bg-white/10">
                    {isPaused ? <Play className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 mr-1.5 text-amber-400" />}
                    {isPaused ? "Resume Session" : "Pause Session"}
                  </Button>
                </div>
              </div>

              <div className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Tools</p>
                <div className="space-y-2">
                  <Button size="sm" variant="outline" onClick={() => setShowTimer(true)} className="w-full justify-start text-xs text-white border-white/20 bg-white/5 hover:bg-white/10">
                    <Clock className="mr-2 h-3 w-3" />Timer
                  </Button>
                  <Button size="sm" variant={annotationMode ? "default" : "outline"} onClick={() => setAnnotationMode(!annotationMode)} className="w-full justify-start text-xs text-white border-white/20 bg-white/5 hover:bg-white/10">
                    <Pen className="mr-2 h-3 w-3" />Annotations
                  </Button>
                  {annotationMode && (
                    <Button size="sm" variant="outline" onClick={clearAnnotations} className="w-full text-xs text-white border-white/20 bg-white/5 hover:bg-white/10">
                      <Trash2 className="h-3 w-3 mr-1.5" />Clear annotations
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Participants panel — fixed footer */}
          <div className="shrink-0 border-t border-white/10 bg-slate-950 flex flex-col min-h-[200px] max-h-[38vh]">
            <div className="p-3 border-b border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Participants</p>
              <input
                type="text"
                placeholder="Search participants…"
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-2 space-y-1.5">
                {session.participants
                  .filter((p) => {
                    if (!participantSearch.trim()) return true;
                    const q = participantSearch.toLowerCase();
                    return p.user.firstName?.toLowerCase().includes(q) || p.user.lastName?.toLowerCase().includes(q);
                  })
                  .map((participant) => {
                    const isOnline = participant.status === 'online';
                    const hasResponded = participant.hasResponded || false;
                    const fullName = `${participant.user.firstName} ${participant.user.lastName}`;

                    return (
                      <div
                        key={participant.id}
                        className={`rounded-lg border border-white/10 bg-white/[.03] p-2.5 ${participant.raisedHand ? 'ring-1 ring-amber-400/50' : ''}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="relative shrink-0">
                            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-sm font-medium text-violet-200">
                              {participant.user.firstName[0]}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-white">{fullName}</p>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <span className={`text-[10px] ${isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {isOnline ? 'Online' : 'Offline'}
                              </span>
                              {activeInteraction && (
                                <span className={`text-[10px] ${hasResponded ? 'text-violet-300' : 'text-slate-500'}`}>
                                  · {hasResponded ? 'Answered' : 'Pending'}
                                </span>
                              )}
                              {participant.raisedHand && (
                                <span className="text-[10px] text-amber-400">· Hand raised</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button size="sm" variant="ghost" onClick={() => muteParticipant(participant.user.id, fullName)} className="h-7 w-7 p-0 text-slate-500 hover:text-amber-400" title="Mute chat">
                              <Lock className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => kickParticipant(participant.user.id, fullName)} className="h-7 w-7 p-0 text-slate-500 hover:text-rose-400" title="Remove student">
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {session.participants.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-4">No participants yet</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </>
      }
      extras={
        <>
      {/* QR Code Dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite Students</DialogTitle>
          </DialogHeader>
          <SessionQrPanel roomCode={session.roomCode} joinUrl={joinLink} />
          {isCrossDeviceShareUnsafe() ? null : (
            <p className="text-xs text-muted-foreground text-center">
              Students can scan QR, open the link, or enter code {session.roomCode}.
            </p>
          )}
        </DialogContent>
      </Dialog>
      {/* Announcement Dialog */}
      <Dialog open={showAnnouncementDialog} onOpenChange={setShowAnnouncementDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Broadcast Announcement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea
              placeholder="Type announcement message for all students..."
              value={announcementText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAnnouncementText(e.target.value)}
              className="min-h-[100px]"
            />
            <Button className="w-full" onClick={broadcastAnnouncement} disabled={!announcementText.trim()}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Broadcast Message
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Timer Dialog */}
      <Dialog open={showTimer} onOpenChange={setShowTimer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Session Timer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center">
              <div className="text-4xl font-mono font-bold">
                {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[30, 60, 120].map((seconds) => (
                <Button
                  key={seconds}
                  variant="outline"
                  onClick={() => startTimer(seconds)}
                  disabled={timerRunning}
                  className="text-sm"
                >
                  {seconds}s
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[300, 600, 900].map((seconds) => (
                <Button
                  key={seconds}
                  variant="outline"
                  onClick={() => startTimer(seconds)}
                  disabled={timerRunning}
                  className="text-sm"
                >
                  {Math.floor(seconds / 60)}m
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={stopTimer}
                disabled={!timerRunning}
                className="flex-1"
              >
                <Pause className="w-4 h-4 mr-2" />
                Stop
              </Button>
              <Button
                variant="outline"
                onClick={resetTimer}
                className="flex-1"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Interaction Mode Dialog */}
      <Dialog open={interactionModeDialog} onOpenChange={setInteractionModeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose Interaction Mode</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <p className="text-sm text-slate-600 mb-4">
              Select an interaction mode for the current slide. The slide content will be used as the question.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { type: 'poll',            icon: BarChart2,    label: 'Poll',        color: 'from-blue-500 to-blue-700' },
                { type: 'mcq',             icon: Check,        label: 'MCQ',         color: 'from-violet-500 to-violet-700' },
                { type: 'true_false',      icon: ToggleLeft,   label: 'True/False',  color: 'from-emerald-500 to-emerald-700' },
                { type: 'multiple_select', icon: AlignLeft,    label: 'Multi Select',color: 'from-indigo-500 to-indigo-700' },
                { type: 'word_cloud',      icon: Hash,         label: 'Word Cloud',  color: 'from-pink-500 to-pink-700' },
                { type: 'rating',          icon: Star,         label: 'Rating',      color: 'from-amber-500 to-amber-700' },
                { type: 'discussion',      icon: MessageSquare,label: 'Discussion',  color: 'from-teal-500 to-teal-700' },
                { type: 'reflection',      icon: AlignLeft,    label: 'Reflection',  color: 'from-cyan-500 to-cyan-700' },
                { type: 'attendance_check',icon: UserCheck,    label: 'Attendance',  color: 'from-green-500 to-green-700' },
                { type: 'emoji_voting',    icon: Smile,        label: 'Reaction',    color: 'from-rose-500 to-rose-700' },
                { type: 'drawing',         icon: PenLine,      label: 'Drawing',     color: 'from-orange-500 to-orange-700' },
                { type: 'exit_ticket',     icon: LogOut,       label: 'Exit Ticket', color: 'from-red-500 to-red-700' },
              ].map(({ type, icon: Icon, label, color }) => (
                <button
                  key={type}
                  onClick={() => launchInteractionMode(type)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all"
                >
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-sm font-medium text-white">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CreatePollDialog
        open={createPollOpen}
        onOpenChange={(open) => {
          setCreatePollOpen(open);
          if (!open) {
            setEditingPoll(null);
            setEditingPollId(null);
          }
        }}
        initial={editingPoll ?? undefined}
        saving={pollSaving}
        onSubmit={saveOrLaunchPoll}
      />
        </>
      }
    />
  );
}
