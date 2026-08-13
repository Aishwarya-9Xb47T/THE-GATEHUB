/**
 * GoogleAuthPopup
 *
 * Premium dark-mode OAuth connection dialog.
 * Google is used ONLY for authentication — not for redirecting users.
 * After auth the popup closes automatically and GateHub shows its own Drive browser.
 */

import { useState, useEffect } from 'react';
import { X, Loader2, ShieldCheck, FileText, Files, Presentation } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface GoogleAuthPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  redirectUrl?: string;
}

const PERMISSIONS = [
  { icon: FileText, text: 'Read Google Docs & Forms' },
  { icon: Presentation, text: 'Read Google Slides' },
  { icon: Files, text: 'Browse your Drive folders' },
  { icon: ShieldCheck, text: 'No write access — read only' },
];

export function GoogleAuthPopup({ isOpen, onClose, onSuccess, redirectUrl }: GoogleAuthPopupProps) {
  const [authUrl, setAuthUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      initiateAuth();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'google_oauth_success') {
        onSuccess();
        onClose();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess, onClose]);

  const initiateAuth = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<{ authUrl: string }>(
        '/google-workspace/auth',
        { method: 'POST', body: { redirectUrl } }
      );
      if (result.error || !result.data?.authUrl) {
        setError(result.error || 'Failed to initiate authentication');
        return;
      }
      setAuthUrl(result.data.authUrl);
    } catch {
      setError('Failed to initiate authentication');
    } finally {
      setLoading(false);
    }
  };

  const openPopup = () => {
    if (!authUrl) return;
    const width = 500;
    const height = 620;
    const left = Math.round(window.innerWidth / 2 - width / 2 + window.screenLeft);
    const top = Math.round(window.innerHeight / 2 - height / 2 + window.screenTop);
    const popup = window.open(
      authUrl,
      'google-oauth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    const check = setInterval(() => {
      if (popup?.closed) clearInterval(check);
    }, 800);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          'sm:max-w-[400px] p-0 overflow-hidden border-white/10',
          'bg-[#111318]'
        )}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-white/30 hover:text-white/70 transition-colors"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        {/* Top gradient band */}
        <div className="h-1 bg-gradient-to-r from-sky-500 via-blue-500 to-violet-500" />

        <div className="p-7 space-y-6">
          {/* Google G + heading */}
          <div className="text-center space-y-3">
            {/* Google "G" logo as SVG */}
            <div className="flex justify-center">
              <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center shadow-lg">
                <svg viewBox="0 0 24 24" className="h-8 w-8">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold text-white">Connect Google Workspace</h2>
              <p className="text-sm text-white/45 mt-1">
                GateHub uses a secure popup — you never leave the app.
              </p>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
              <p className="text-sm text-white/40">Preparing secure connection…</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
              {error}
              <button
                onClick={initiateAuth}
                className="block mt-2 text-xs text-red-400/70 hover:text-red-400 underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Ready state */}
          {!loading && !error && authUrl && (
            <div className="space-y-5">
              {/* Permissions list */}
              <div className="rounded-xl bg-white/[0.03] border border-white/8 p-4 space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
                  Access requested
                </p>
                {PERMISSIONS.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5">
                    <Icon className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                    <span className="text-sm text-white/60">{text}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <Button
                onClick={openPopup}
                className={cn(
                  'w-full h-11 gap-3 font-semibold text-sm',
                  'bg-white text-[#1a1a2e] hover:bg-white/90',
                  'shadow-lg shadow-black/30 transition-all'
                )}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </Button>

              <p className="text-center text-[11px] text-white/25 leading-relaxed">
                A popup window will open. After sign-in, it closes automatically
                and your files appear inside GateHub.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
