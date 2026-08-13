/**
 * useStudentClassroom
 *
 * Central hook for the Student Classroom experience.
 * Manages WebSocket lifecycle, real-time state, and localStorage persistence
 * for notes/bookmarks.  Does NOT touch any instructor code.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useToastStore } from '@/store/toastStore';
import { getUserIdFromToken } from '@/lib/auth';
import { useSessionRecovery } from '@/hooks/useSessionRecovery';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NavigationMode = 'locked' | 'previous' | 'next' | 'free';

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  message: string;
  role: 'student' | 'instructor';
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; avatar?: string };
}

export interface StudentQuestion {
  id: string;
  sessionId: string;
  userId: string;
  text: string;
  isResolved: boolean;
  isPinned: boolean;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; avatar?: string };
}

export interface AnnouncementItem {
  id: string;
  text: string;
  type?: 'info' | 'warning' | 'success';
  receivedAt: string;
}

export interface Slide {
  id: string;
  order: number;
  title: string;
  content?: any;
  interactions: any[];
}

export interface Interaction {
  id: string;
  type: string;
  title: string;
  question: string;
  options?: any[];
  duration?: number;
  points: number;
}

export interface StudentViewData {
  session: {
    id: string;
    title: string;
    roomCode: string;
    currentSlideId: string | null;
    activeInteractionId: string | null;
    settings?: { navigation?: NavigationMode; pointer?: { x: number; y: number } };
  };
  presentation: {
    id: string;
    title: string;
    slides: Slide[];
  };
  instructor: { id: string; firstName: string; lastName: string; avatar?: string };
  isParticipant: boolean;
}

export interface StudentSubmission {
  interactionId: string;
  response: any;
  submittedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOTES_KEY = (sessionId: string, slideId: string) =>
  `sc_notes_${sessionId}_${slideId}`;
const BOOKMARKS_KEY = (sessionId: string) => `sc_bookmarks_${sessionId}`;

function getStoredBookmarks(sessionId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY(sessionId)) || '[]');
  } catch {
    return [];
  }
}

function saveBookmarks(sessionId: string, bookmarks: string[]) {
  localStorage.setItem(BOOKMARKS_KEY(sessionId), JSON.stringify(bookmarks));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseStudentClassroomOptions {
  sessionId: string; // may be room code or UUID — server resolves
}

export function useStudentClassroom({ sessionId }: UseStudentClassroomOptions) {
  const toast = useToastStore((s) => s.add);

  // ── Core state
  const [viewData, setViewData] = useState<StudentViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(null);

  // ── Navigation + UI state
  const [navigation, setNavigation] = useState<NavigationMode>('locked');
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [raisedHand, setRaisedHand] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState<Interaction | null>(null);
  const [submission, setSubmission] = useState<StudentSubmission | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  // ── Questions
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [questionsOpen, setQuestionsOpen] = useState(false);

  // ── Announcements
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);

  // ── Notes (per slide, localStorage)
  const [noteText, setNoteText] = useState('');

  // ── Bookmarks
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  // ── Refs
  const wsRef = useRef<WebSocket | null>(null);
  const isActiveRef = useRef(true);
  const resolvedSessionIdRef = useRef<string | null>(null);
  const connectWebSocketRef = useRef<(sid: string) => void>(() => {});

  const applyClassroomSnapshot = useCallback((snapshot: {
    currentSlideId?: string | null;
    activeInteractionId?: string | null;
    settings?: Record<string, unknown>;
    navigation?: NavigationMode | string;
    submittedInteractions?: Record<string, { response: unknown; submittedAt: string }>;
  }, recoveryApi?: { recordInteractionSubmission: (id: string, response: unknown) => void }) => {
    if (snapshot.navigation) {
      setNavigation(snapshot.navigation as NavigationMode);
    }
    if (snapshot.settings?.navigation) {
      setNavigation(snapshot.settings.navigation as NavigationMode);
    }
    if (snapshot.settings?.pointer) {
      setPointer(snapshot.settings.pointer as { x: number; y: number });
    }

    setViewData((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        session: {
          ...curr.session,
          currentSlideId: snapshot.currentSlideId !== undefined
            ? snapshot.currentSlideId
            : curr.session.currentSlideId,
          activeInteractionId: snapshot.activeInteractionId !== undefined
            ? snapshot.activeInteractionId
            : curr.session.activeInteractionId,
          settings: { ...(curr.session.settings || {}), ...(snapshot.settings || {}) },
        },
      };
    });

    const activeId = snapshot.activeInteractionId;
    if (activeId) {
      setViewData((curr) => {
        if (!curr) return curr;
        const found = curr.presentation.slides
          .flatMap((s) => s.interactions || [])
          .find((i) => i.id === activeId);
        if (found) {
          setActiveInteraction(found);
        } else {
          setActiveInteraction({
            id: activeId,
            type: 'mcq',
            title: 'Live Question',
            question: 'Interactive Question',
            points: 0,
          });
        }
        return curr;
      });
    } else if (snapshot.activeInteractionId === null) {
      setActiveInteraction(null);
      setSubmission(null);
      setRevealed(false);
    }

    if (snapshot.submittedInteractions && recoveryApi) {
      for (const [interactionId, sub] of Object.entries(snapshot.submittedInteractions)) {
        recoveryApi.recordInteractionSubmission(interactionId, sub.response);
        if (snapshot.activeInteractionId === interactionId) {
          setSubmission({
            interactionId,
            response: sub.response,
            submittedAt: sub.submittedAt,
          });
        }
      }
    }
  }, []);

  // ── Session recovery
  const recovery = useSessionRecovery({
    sessionId: resolvedSessionId || sessionId,
    userId: getUserIdFromToken() || 'student',
    onReconnect: (state) => {
      applyClassroomSnapshot(state, recovery);
      toast({ title: 'Reconnected', description: 'Your session has been restored' });
    },
    onDisconnect: () => {
      toast({ title: 'Disconnected', description: 'Attempting to reconnect...', variant: 'destructive' });
    },
    onReconnectWebSocket: () => {
      const sid = resolvedSessionIdRef.current;
      if (sid) connectWebSocketRef.current(sid);
    },
  });

  // ── Fullscreen listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Initial fetch
  useEffect(() => {
    isActiveRef.current = true;
    fetchStudentView();
    return () => {
      isActiveRef.current = false;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Load notes when slide changes
  const currentSlideId = viewData?.session.currentSlideId;
  useEffect(() => {
    if (!resolvedSessionId || !currentSlideId) return;
    const stored = localStorage.getItem(NOTES_KEY(resolvedSessionId, currentSlideId)) || '';
    setNoteText(stored);
  }, [resolvedSessionId, currentSlideId]);

  // ── Load bookmarks when session resolves
  useEffect(() => {
    if (!resolvedSessionId) return;
    setBookmarks(getStoredBookmarks(resolvedSessionId));
  }, [resolvedSessionId]);

  // ── Fetch session data
  const fetchStudentView = useCallback(async () => {
    console.log('[StudentClassroom] Fetching session data', { sessionId });
    try {
      const response = await fetch(`/api/classroom-studio/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('lms_token')}` },
      });
      console.log('[StudentClassroom] Session lookup response', { status: response.status, ok: response.ok });
      if (!response.ok) throw new Error('Session not found');
      const data = await response.json();
      console.log('[StudentClassroom] Session data received', { sessionId: data.id, roomCode: data.roomCode, status: data.status });

      const sid = data.id as string;
      setResolvedSessionId(sid);
      resolvedSessionIdRef.current = sid;
      console.log('[StudentClassroom] Session ID resolved', { originalId: sessionId, resolvedId: sid });

      // Bookmarks
      setBookmarks(getStoredBookmarks(sid));

      setViewData({
        session: data,
        presentation: data.presentation,
        instructor: data.instructor,
        isParticipant: data.participants?.some((p: any) => p.userId === getUserIdFromToken()) ?? false,
      });
      setNavigation(data.settings?.navigation ?? 'locked');
      setPointer(data.settings?.pointer ?? null);

      if (data.activeInteractionId) {
        const activeInt = data.presentation?.slides
          ?.flatMap((s: any) => s.interactions || [])
          ?.find((i: any) => i.id === data.activeInteractionId);
        if (activeInt) {
          setActiveInteraction(activeInt);
        } else {
          setActiveInteraction({
            id: data.activeInteractionId,
            type: 'mcq',
            title: 'Live Question',
            question: 'Interactive Question',
            points: 0,
          });
        }
      }

      console.log('[StudentClassroom] Joining session via HTTP', { sessionId: sid });
      // Join the session
      const joinResponse = await fetch(`/api/classroom-studio/sessions/${sid}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('lms_token')}` },
      });
      console.log('[StudentClassroom] Join response', { status: joinResponse.status, ok: joinResponse.ok });
      if (!joinResponse.ok) {
        const errorData = await joinResponse.json().catch(() => ({}));
        console.error('[StudentClassroom] Join failed', errorData);
      }

      // Load chat history
      fetchChatHistory(sid);

      console.log('[StudentClassroom] Connecting WebSocket', { sessionId: sid });
      connectWebSocketRef.current(sid);
    } catch (error: any) {
      console.error('[StudentClassroom] Failed to fetch session:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const fetchChatHistory = async (sid: string) => {
    try {
      const res = await fetch(`/api/classroom-studio/sessions/${sid}/chat`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('lms_token')}` },
      });
      if (res.ok) {
        const msgs = await res.json();
        setChatMessages(msgs);
      }
    } catch {/* ignore */}
  };

  const handleWebSocketMessageRef = useRef<(message: any, sid: string) => void>(() => {});

  const handleWebSocketMessage = useCallback((message: any, _sid: string) => {
    switch (message.type) {
      case 'connected':
        applyClassroomSnapshot({
          currentSlideId: message.data?.currentSlideId ?? null,
          activeInteractionId: message.data?.activeInteractionId ?? null,
          settings: message.data?.settings,
          navigation: message.data?.settings?.navigation,
        }, recovery);
        break;

      case 'slide:change':
        setViewData((curr) => curr ? {
          ...curr,
          session: { ...curr.session, currentSlideId: message.data.slideId, activeInteractionId: null },
        } : curr);
        setActiveInteraction(null);
        setSubmission(null);
        setRevealed(false);
        break;

      case 'interaction:activate':
      case 'interaction:launch':
      case 'interaction:started': {
        const enrichedInteraction = message.data?.interaction;
        const interactionId = message.data?.interactionId;
        const broadcastSlideId = message.data?.slideId;

        setSubmission(null);
        setRevealed(false);

        if (enrichedInteraction) {
          setActiveInteraction(enrichedInteraction);
        } else {
          setViewData((curr) => {
            const found = curr?.presentation.slides
              .flatMap((slide: any) => slide.interactions || [])
              .find((int: any) => int.id === interactionId);
            if (found) {
              setActiveInteraction(found);
            } else if (interactionId) {
              setActiveInteraction({
                id: interactionId,
                type: 'mcq',
                title: 'Live Question',
                question: 'Interactive Question',
                points: 0,
              });
            }
            return curr;
          });
        }

        setViewData((curr) => curr ? {
          ...curr,
          session: { 
            ...curr.session, 
            activeInteractionId: interactionId,
            currentSlideId: broadcastSlideId || curr.session.currentSlideId 
          },
        } : curr);

        const typeLabel = (enrichedInteraction?.type ?? 'interaction').replace(/_/g, ' ');
        toast({ title: `New ${typeLabel}`, description: 'Your instructor launched a live activity — respond now!' });
        break;
      }

      case 'interaction:deactivate':
      case 'interaction:close':
        setViewData((curr) => curr ? {
          ...curr,
          session: { ...curr.session, activeInteractionId: null },
        } : curr);
        setActiveInteraction(null);
        setRevealed(false);
        break;

      case 'interaction:reveal':
        setRevealed(true);
        break;

      case 'interaction:reopen':
        // BUG FIX: Clear submission so the student can vote again.
        // Previously this only set revealed=false but left the old submission,
        // so the student saw "Response Submitted" and couldn't re-vote.
        setSubmission(null);
        setRevealed(false);
        break;

      case 'slide:update':
        setViewData((curr) => curr ? {
          ...curr,
          presentation: {
            ...curr.presentation,
            slides: curr.presentation.slides.map((s) =>
              s.id === message.data.slide.id ? { ...s, ...message.data.slide } : s
            ),
          },
        } : curr);
        break;

      case 'navigation:change':
        setNavigation(message.data.navigation);
        break;

      case 'pointer:move':
        setPointer(message.data);
        break;

      case 'participant:state':
        if (message.data.userId === getUserIdFromToken() && message.data.raisedHand !== undefined) {
          setRaisedHand(message.data.raisedHand);
        }
        break;

      case 'hands:cleared':
        setRaisedHand(false);
        break;

      case 'session:kicked':
        useToastStore.getState().add({ title: 'Kicked', description: message.data?.message || 'You were removed from the session by the instructor.', variant: 'destructive' });
        window.location.href = '/student/dashboard';
        break;

      case 'announcement:broadcast':
        if (message.data?.message) {
          useToastStore.getState().add({ title: 'Instructor Announcement', description: message.data.message });
        }
        break;

      case 'session:pause':
      case 'session:resume':
        setViewData((curr) => curr ? {
          ...curr,
          session: {
            ...curr.session,
            settings: { ...(curr.session.settings || {}), isPaused: message.type === 'session:pause' }
          }
        } : curr);
        break;

      case 'annotation:add':
      case 'annotation:remove':
      case 'annotation:clear':
        // Annotations are handled by the slide renderer component
        break;

      case 'timer:start':
      case 'timer:stop':
        // Timer state is handled by the slide renderer component
        break;

      case 'chat:message':
        setChatMessages((prev) => [...prev, message.data]);
        if (!chatOpen) setUnreadChat((n) => n + 1);
        break;

      case 'announcement:broadcast':
        const ann: AnnouncementItem = {
          id: Math.random().toString(36).slice(2),
          text: message.data.text || message.data.message || '',
          type: message.data.type ?? 'info',
          receivedAt: new Date().toISOString(),
        };
        setAnnouncements((prev) => [...prev, ann]);
        toast({ title: '📢 Announcement', description: ann.text });
        break;

      case 'question:updated':
        setQuestions((prev) => prev.map((q) => q.id === message.data.id ? message.data : q));
        break;

      case 'emoji:react':
        // Handled by the component directly
        break;

      case 'session:end':
        setSessionEnded(true);
        wsRef.current?.close();
        break;
    }
  }, [chatOpen, toast, applyClassroomSnapshot, recovery]);

  handleWebSocketMessageRef.current = handleWebSocketMessage;

  const connectWebSocket = useCallback((sid: string) => {
    if (!isActiveRef.current) return;

    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const userId = getUserIdFromToken() || 'student';
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const token = localStorage.getItem('lms_token');
    const wsUrl = `${protocol}://${window.location.host}/ws/classroom-studio?sessionId=${sid}&userId=${userId}&role=student&token=${encodeURIComponent(token || '')}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[StudentClassroom] WebSocket connected successfully', { sessionId: sid, userId });
    };

    ws.onerror = (error) => {
      console.error('[StudentClassroom] WebSocket error', { sessionId: sid, error });
    };

    ws.onclose = () => {
      console.log('[StudentClassroom] WebSocket disconnected', { sessionId: sid, userId });
    };

    recovery.registerWebSocket(ws);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessageRef.current(message, sid);
      } catch {/* ignore */ }
    };

    wsRef.current = ws;
  }, [recovery]);

  connectWebSocketRef.current = connectWebSocket;

  // ── Actions ──────────────────────────────────────────────────────────────────

  const raiseHand = useCallback(() => {
    const next = !raisedHand;
    setRaisedHand(next);
    wsRef.current?.send(JSON.stringify({ type: 'participant:state', data: { raisedHand: next } }));
  }, [raisedHand]);

  const sendReaction = useCallback((emoji: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'emoji:react', data: { emoji } }));
  }, []);

  const sendChatMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    wsRef.current?.send(JSON.stringify({ type: 'chat:message', data: { text } }));
  }, []);

  const submitQuestion = useCallback(async (text: string) => {
    if (!resolvedSessionId || !text.trim()) return;
    try {
      const res = await fetch(`/api/classroom-studio/sessions/${resolvedSessionId}/questions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('lms_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const q = await res.json();
        setQuestions((prev) => [...prev, q]);
        toast({ title: 'Question submitted!', description: 'Your instructor will see it.' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to submit question', variant: 'destructive' });
    }
  }, [resolvedSessionId, toast]);

  const submitInteraction = useCallback(async (response: any): Promise<void> => {
    if (!viewData?.session.activeInteractionId || !resolvedSessionId) return;
    const interactionId = viewData.session.activeInteractionId;
    const startedAt = Date.now();

    if (recovery.isInteractionSubmitted(interactionId)) {
      toast({ title: 'Already submitted', description: 'You have already answered this.', variant: 'destructive' });
      return;
    }

    try {
      const res = await fetch(`/api/classroom-studio/sessions/${resolvedSessionId}/interactions/${interactionId}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('lms_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ response, timeSpent: Math.round((Date.now() - startedAt) / 1000) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Submit failed');
      }
      recovery.recordInteractionSubmission(interactionId, response);
      toast({ title: 'Response submitted!', description: 'Your answer was sent to the instructor.' });
      setSubmission({ interactionId, response, submittedAt: new Date().toISOString() });
    } catch (error: any) {
      toast({
        title: 'Could not submit',
        description: error instanceof Error ? error.message : 'Failed to submit response',
        variant: 'destructive',
      });
    }
  }, [viewData, resolvedSessionId, recovery, toast]);

  const selfNavigate = useCallback((direction: 'next' | 'previous') => {
    if (!viewData) return;
    const slides = viewData.presentation.slides;
    const currentIndex = slides.findIndex((s) => s.id === viewData.session.currentSlideId);
    const next = direction === 'next' ? slides[currentIndex + 1] : slides[currentIndex - 1];
    if (next) {
      setViewData((curr) => curr ? { ...curr, session: { ...curr.session, currentSlideId: next.id, activeInteractionId: null } } : curr);
    }
  }, [viewData]);

  const saveNote = useCallback((text: string) => {
    if (!resolvedSessionId || !currentSlideId) return;
    setNoteText(text);
    localStorage.setItem(NOTES_KEY(resolvedSessionId, currentSlideId), text);
  }, [resolvedSessionId, currentSlideId]);

  const toggleBookmark = useCallback((slideId: string) => {
    if (!resolvedSessionId) return;
    setBookmarks((prev) => {
      const next = prev.includes(slideId)
        ? prev.filter((id) => id !== slideId)
        : [...prev, slideId];
      saveBookmarks(resolvedSessionId, next);
      return next;
    });
  }, [resolvedSessionId]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const openChat = useCallback(() => {
    setChatOpen(true);
    setUnreadChat(0);
  }, []);

  const closeChat = useCallback(() => setChatOpen(false), []);

  // ── Derived values
  const currentSlide = viewData?.presentation.slides.find(
    (s) => s.id === viewData.session.currentSlideId
  ) ?? null;
  const currentIndex = viewData?.presentation.slides.findIndex(
    (s) => s.id === viewData?.session.currentSlideId
  ) ?? -1;
  const totalSlides = viewData?.presentation.slides.length ?? 0;
  const canGoPrev = navigation !== 'locked' && currentIndex > 0;
  const canGoNext = navigation !== 'locked' && currentIndex < totalSlides - 1;
  const isCurrentSlideBookmarked = currentSlideId ? bookmarks.includes(currentSlideId) : false;

  return {
    // State
    viewData,
    loading,
    sessionEnded,
    resolvedSessionId,
    navigation,
    pointer,
    raisedHand,
    activeInteraction,
    submission,
    revealed,
    isFullscreen,
    chatMessages,
    chatOpen,
    unreadChat,
    questions,
    questionsOpen,
    announcements,
    noteText,
    bookmarks,
    // Derived
    currentSlide,
    currentIndex,
    totalSlides,
    canGoPrev,
    canGoNext,
    isCurrentSlideBookmarked,
    // Recovery
    connectionStatus: recovery.connectionStatus,
    // Actions
    raiseHand,
    sendReaction,
    sendChatMessage,
    submitQuestion,
    submitInteraction,
    selfNavigate,
    saveNote,
    toggleBookmark,
    toggleFullscreen,
    openChat,
    closeChat,
    setQuestionsOpen,
    dismissAnnouncement: (id: string) =>
      setAnnouncements((prev) => prev.filter((a) => a.id !== id)),
  };
}
