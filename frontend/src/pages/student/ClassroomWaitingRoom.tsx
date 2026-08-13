/**
 * Student Classroom Waiting Room
 *
 * Premium waiting experience while instructor hasn't started the session.
 * Connects to WS and listens for session:start to redirect automatically.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Clock,
  Users,
  Loader2,
  LogOut,
  CheckCircle,
  GraduationCap,
  Wifi,
  WifiOff,
  BookOpen,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToastStore } from '@/store/toastStore';
import { getUserIdFromToken } from '@/lib/auth';
import { apiUrl, getWsConnectTarget } from "@/lib/api";

const WS_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

interface Participant {
  userId: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  joinedAt: string;
}

interface WaitingRoomData {
  session: {
    id: string;
    title: string;
    roomCode: string;
    status: 'waiting' | 'active' | 'ended';
    instructorStarted: boolean;
  };
  presentation: { id: string; title: string };
  instructor: { id: string; firstName: string; lastName: string; avatar?: string };
  participants: Participant[];
  isParticipant: boolean;
}

export function ClassroomWaitingRoom() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const [data, setData] = useState<WaitingRoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const isActiveRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(`/api/classroom-studio/sessions/${sessionId}`), {
        headers: { Authorization: `Bearer ${localStorage.getItem('lms_token')}` },
      });
      if (!response.ok) throw new Error('Session not found');
      const sessionData = await response.json();

      if (sessionData.status === 'active' || sessionData.instructorStarted) {
        navigate(`/student/classroom/session/${sessionData.id || sessionId}`, { replace: true });
        return;
      }

      if (sessionData.status === 'ended' || sessionData.status === 'cancelled') {
        setError('This classroom session has ended.');
        setLoading(false);
        return;
      }

      setData({
        session: {
          id: sessionData.id,
          title: sessionData.title || sessionData.presentation?.title || 'Classroom',
          roomCode: sessionData.roomCode,
          status: sessionData.status,
          instructorStarted: Boolean(sessionData.instructorStarted),
        },
        presentation: sessionData.presentation || { id: '', title: sessionData.title || 'Classroom' },
        instructor: sessionData.instructor || { id: '', firstName: 'Instructor', lastName: '' },
        participants: (sessionData.participants || []).map((p: any) => ({
          userId: p.userId || p.user?.id,
          firstName: p.user?.firstName || p.firstName || 'Student',
          lastName: p.user?.lastName || p.lastName || '',
          avatar: p.user?.avatar || p.avatar,
          joinedAt: p.joinedAt || new Date().toISOString(),
        })),
        isParticipant: (sessionData.participants || []).some(
          (p: any) => (p.userId || p.user?.id) === getUserIdFromToken(),
        ),
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId, navigate]);

  const connectWebSocket = useCallback(() => {
    if (!isActiveRef.current || !sessionId) return;
    const userId = getUserIdFromToken() || 'student';
    const { protocol, host } = getWsConnectTarget();
    const token = localStorage.getItem('lms_token');

    const ws = new WebSocket(
      `${protocol}://${host}/ws/classroom-studio?sessionId=${sessionId}&userId=${userId}&role=student&token=${encodeURIComponent(token || '')}`
    );

    ws.onopen = () => { reconnectAttempt.current = 0; setWsStatus('connected'); };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'session:start':
            navigate(`/student/classroom/session/${sessionId}`, { replace: true });
            break;
          case 'participant:joined':
          case 'participant:left':
            fetchData();
            break;
          case 'session:end':
            toast({ title: 'Session Ended', description: 'The instructor cancelled this session', variant: 'destructive' });
            navigate('/student/classroom');
            break;
          // slide:change on active session = redirect
          case 'slide:change':
            navigate(`/student/classroom/session/${sessionId}`, { replace: true });
            break;
        }
      } catch {/* ignore */ }
    };

    ws.onerror = () => { setWsStatus('disconnected'); };

    ws.onclose = () => {
      setWsStatus('disconnected');
      if (!isActiveRef.current) return;
      const delay = WS_RECONNECT_DELAYS[Math.min(reconnectAttempt.current, WS_RECONNECT_DELAYS.length - 1)] ?? 16000;
      reconnectAttempt.current += 1;
      reconnectTimer.current = window.setTimeout(() => connectWebSocket(), delay);
    };

    wsRef.current = ws;
  }, [sessionId, navigate, fetchData, toast]);

  useEffect(() => {
    isActiveRef.current = true;
    fetchData();
    connectWebSocket();
    return () => {
      isActiveRef.current = false;
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [fetchData, connectWebSocket]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-violet-400 mx-auto" />
          <p className="text-slate-400">Loading session…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-6xl">❌</div>
          <h2 className="text-xl font-semibold text-white">Session Not Found</h2>
          <p className="text-slate-400 text-sm">{error || 'Unable to load session'}</p>
          <Button onClick={() => navigate('/student/classroom')} variant="outline" className="border-white/20 text-white">
            Return to Classroom
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-indigo-600/10 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="border-b border-white/10 bg-slate-950/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white truncate max-w-[200px] md:max-w-xs">
                {data.session.title || data.presentation.title}
              </h1>
              <p className="text-xs text-slate-400">
                <BookOpen className="inline w-3 h-3 mr-1" />
                {data.instructor.firstName} {data.instructor.lastName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${wsStatus === 'connected' ? 'border-emerald-400/30 text-emerald-400' : 'border-red-400/30 text-red-400'}`}>
              {wsStatus === 'connected' ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
              {wsStatus === 'connected' ? 'Connected' : 'Reconnecting'}
            </Badge>
            <Badge variant="outline" className="border-white/20 text-slate-300 font-mono text-xs">
              {data.session.roomCode}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => navigate('/student/classroom')}
              className="text-slate-400 hover:text-red-400 hover:bg-red-400/10">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Waiting card */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="bg-slate-900/60 border-white/10 backdrop-blur">
                <CardContent className="p-10 md:p-14 text-center space-y-6">
                  {/* Animated waiting icon */}
                  <div className="relative w-24 h-24 mx-auto">
                    <div className="absolute inset-0 rounded-full bg-violet-600/20 animate-ping" />
                    <div className="absolute inset-2 rounded-full bg-violet-600/30 animate-pulse" />
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-violet-600/40 to-indigo-600/40 flex items-center justify-center border border-violet-500/30">
                      <Clock className="w-10 h-10 text-violet-300" />
                    </div>
                  </div>

                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-white">Waiting for Instructor</h2>
                    <p className="text-slate-400 mt-2 text-sm md:text-base">
                      The session will begin when your instructor starts the presentation.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-sm text-violet-300">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connected and ready…
                  </div>

                  {data.isParticipant && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-emerald-300 font-medium">You're in the queue</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Participants sidebar */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="bg-slate-900/60 border-white/10 backdrop-blur">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-4 h-4 text-violet-400" />
                    <span className="font-semibold text-white text-sm">Participants</span>
                    <Badge variant="secondary" className="ml-auto bg-violet-500/20 text-violet-300 border-violet-500/30">
                      {data.participants.length}
                    </Badge>
                  </div>

                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {data.participants.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">Waiting for others to join…</p>
                    ) : (
                      data.participants.map((p) => (
                        <motion.div
                          key={p.userId}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-2.5"
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={p.avatar} />
                            <AvatarFallback className="text-[11px] bg-slate-700">
                              {p.firstName[0]}{p.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {p.firstName} {p.lastName}
                              {p.userId === getUserIdFromToken() && (
                                <span className="text-violet-400 text-xs ml-1">(you)</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
