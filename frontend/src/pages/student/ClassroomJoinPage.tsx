/**
 * Student Classroom Join Page
 *
 * Premium entry screen for the Student Classroom module.
 * Students join via session code, QR scan, or deep link.
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  QrCode,
  Keyboard,
  ArrowRight,
  Loader2,
  AlertCircle,
  Camera,
  GraduationCap,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToastStore } from '@/store/toastStore';
import { ClassroomQrScannerDialog } from '@/components/classroom/ClassroomQrScannerDialog';
import { ClassroomPasteLinkDialog } from '@/components/classroom/ClassroomPasteLinkDialog';
import {
  buildClassroomJoinPath,
  isValidRoomCode,
  normalizeRoomCode,
} from '@/lib/classroom/joinUrls';
import {
  ResolveClassroomError,
  resolveClassroomJoinTarget,
} from '@/lib/classroom/resolveClassroomSession';

type JoinMethod = 'code' | 'qr';

export function ClassroomJoinPage() {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const [method, setMethod] = useState<JoinMethod>('code');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const resolveAndNavigate = async (sessionCode: string) => {
    const normalized = normalizeRoomCode(sessionCode);
    if (!isValidRoomCode(normalized)) {
      setError('Please enter a valid session code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { destination } = await resolveClassroomJoinTarget({ roomCode: normalized });
      toast({ title: 'Session found', description: 'Joining classroom…' });
      navigate(destination, { replace: true });
    } catch (err: any) {
      if (err instanceof ResolveClassroomError) {
        setError(err.message);
      } else {
        setError('Unable to join classroom. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = () => {
    if (code.length < 4) {
      setError('Please enter the complete session code');
      return;
    }
    void resolveAndNavigate(code);
  };

  const goJoinPath = (path: string) => {
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-600/20 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 mb-4 shadow-2xl shadow-violet-500/30">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Join Classroom</h1>
          <p className="text-slate-400 mt-2 text-sm">Enter your session code, scan a QR, or paste a link</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
          <div className="flex gap-2 mb-6 p-1 bg-slate-800/50 rounded-xl">
            {[
              { key: 'code' as JoinMethod, icon: Keyboard, label: 'Session Code' },
              { key: 'qr' as JoinMethod, icon: QrCode, label: 'Scan QR' },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => {
                  setMethod(key);
                  setError(null);
                  if (key === 'qr') setScanOpen(true);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  method === key
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {method === 'code' && (
              <motion.div
                key="code"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    Session Code
                  </label>
                  <Input
                    ref={codeInputRef}
                    id="sc-code-input"
                    placeholder="e.g. 123456"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8));
                      setError(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                    maxLength={8}
                    inputMode="numeric"
                    className="text-center text-3xl tracking-[0.3em] uppercase bg-slate-800 border-white/10 text-white placeholder:text-slate-600 h-16 font-mono focus:border-violet-500 focus:ring-violet-500/20"
                    disabled={loading}
                    autoFocus
                  />
                </div>

                <Button
                  id="sc-join-btn"
                  onClick={handleJoinByCode}
                  disabled={loading || code.length < 4}
                  className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/30 transition-all"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Joining…
                    </>
                  ) : (
                    <>
                      Join Classroom <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 border-white/10 text-slate-200"
                  onClick={() => setPasteOpen(true)}
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Paste Link
                </Button>
              </motion.div>
            )}

            {method === 'qr' && (
              <motion.div
                key="qr"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                className="space-y-4 text-center py-4"
              >
                <div className="w-28 h-28 mx-auto bg-slate-800 rounded-2xl flex items-center justify-center border-2 border-dashed border-white/20">
                  <QrCode className="w-14 h-14 text-slate-500" />
                </div>
                <p className="text-sm text-slate-400">
                  Point your camera at the QR code shown by your instructor
                </p>
                <Button
                  onClick={() => setScanOpen(true)}
                  className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Open Scanner
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="text-sm">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-center text-xs text-slate-600 mt-5">
            Ask your instructor for the session code or QR code
          </p>
        </div>
      </motion.div>

      <ClassroomQrScannerDialog
        open={scanOpen}
        onOpenChange={(open) => {
          setScanOpen(open);
          if (!open) setMethod('code');
        }}
        onJoinPath={goJoinPath}
        onRequestPasteLink={() => setPasteOpen(true)}
        onRequestEnterCode={() => {
          setMethod('code');
          codeInputRef.current?.focus();
        }}
      />
      <ClassroomPasteLinkDialog open={pasteOpen} onOpenChange={setPasteOpen} onJoinPath={goJoinPath} />
    </div>
  );
}

/** Path helper for callers */
export function classroomJoinHref(roomCode: string) {
  return buildClassroomJoinPath(roomCode);
}
