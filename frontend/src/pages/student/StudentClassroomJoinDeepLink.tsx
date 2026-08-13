/**
 * StudentClassroomJoinDeepLink
 *
 * Handles: /student/classroom/join/:sessionId
 * Param may be a 6-digit roomCode or a session cuid.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, GraduationCap, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { isValidRoomCode, normalizeRoomCode } from '@/lib/classroom/joinUrls';
import {
  ResolveClassroomError,
  fetchClassroomSessionById,
  fetchClassroomSessionByRoomCode,
  studentDestinationForSession,
} from '@/lib/classroom/resolveClassroomSession';

export function StudentClassroomJoinDeepLink() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      navigate('/student/classroom/join', { replace: true });
      return;
    }
    void resolveSession(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const resolveSession = async (id: string) => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const roomCode = normalizeRoomCode(id);
      const session = isValidRoomCode(roomCode)
        ? await fetchClassroomSessionByRoomCode(roomCode)
        : await fetchClassroomSessionById(id);

      const destination = studentDestinationForSession(session);
      navigate(destination, { replace: true });
    } catch (err: any) {
      if (err instanceof ResolveClassroomError) {
        setErrorCode(err.code);
        setError(err.message);
      } else {
        setError(err?.message || 'Could not join this session');
      }
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[120px]" />
        </div>
        <div className="text-center space-y-5 relative">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-violet-500/20 animate-ping" />
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-violet-500/40">
              <GraduationCap className="w-10 h-10 text-white" />
            </div>
          </div>
          <div>
            <h2 className="text-white font-bold text-xl">Joining Classroom</h2>
            <p className="text-slate-400 text-sm mt-1">Verifying session…</p>
          </div>
          <Loader2 className="w-6 h-6 text-violet-400 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  const title =
    errorCode === 'ended'
      ? 'This classroom session has ended.'
      : errorCode === 'not_found'
        ? 'Classroom session not found.'
        : 'Cannot Join Session';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-5 max-w-sm"
      >
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="text-slate-400 text-sm">{error}</p>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => navigate('/student/classroom/join')}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            Try Again
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate('/student/classroom')}
            className="text-slate-400"
          >
            Back to Classroom
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
