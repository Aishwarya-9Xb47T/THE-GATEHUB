/**
 * GoogleAuthDialog
 *
 * In-page dialog for connecting Google Workspace.
 * Shown by GoogleWorkspaceGate when the user is not yet authenticated.
 *
 * Design rules:
 * - NEVER shows "Failed to initiate authentication" or any raw error
 * - If OAuth is not configured: shows "not available" (not an error)
 * - Opens a small popup window for the actual Google sign-in
 * - The popup closes automatically after successful auth
 * - After auth: calls onSuccess() and this component disappears
 * - The user NEVER leaves GateHub
 */

import { useState, useEffect } from 'react';
import { ShieldCheck, FileText, Files, Presentation, ArrowLeft, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initiateAuth } from '@/lib/googleWorkspace/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type DialogState = 'ready' | 'opening-popup' | 'waiting' | 'error-network';

interface GoogleAuthDialogProps {
  onSuccess: () => void;
  onBack: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PERMISSIONS = [
  { icon: FileText, label: 'Read your Google Docs' },
  { icon: Files, label: 'Read your Google Forms' },
  { icon: Presentation, label: 'Read your Google Slides' },
  { icon: ShieldCheck, label: 'Read-only access — no editing' },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function GoogleAuthDialog({ onSuccess, onBack }: GoogleAuthDialogProps) {
  const [state, setState] = useState<DialogState>('ready');
  const popupRef = useState<Window | null>(null);

  // Listen for the success message from the OAuth popup window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'google_oauth_success') {
        onSuccess();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess]);

  // Also watch for the OAuth success query param (for redirect-based flows)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('googleAuth') === 'success') {
      // Clean URL and call success
      const url = new URL(window.location.href);
      url.searchParams.delete('googleAuth');
      window.history.replaceState({}, '', url.toString());
      onSuccess();
    }
  }, [onSuccess]);

  const handleConnect = async () => {
    setState('opening-popup');

    const result = await initiateAuth();

    if (result.error || !result.authUrl) {
      // If OAuth is not configured, this should have been caught by the Gate.
      // If we still get here, it's a network error.
      setState('error-network');
      return;
    }

    setState('waiting');

    // Open the OAuth popup
    const width = 500;
    const height = 640;
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

    const popup = window.open(
      result.authUrl,
      'gatehub-google-oauth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
    );

    if (!popup) {
      // Popup was blocked — fall back to a visible message
      setState('error-network');
      return;
    }

    // Poll for popup close (user dismissed without completing auth)
    const check = setInterval(() => {
      if (popup.closed) {
        clearInterval(check);
        // If still in 'waiting' state, the user closed without completing auth
        setState((prev) => (prev === 'waiting' ? 'ready' : prev));
      }
    }, 500);
  };

  const handleRetry = () => {
    setState('ready');
  };

  return (
    <div className="flex flex-col items-center justify-center py-4 space-y-6">
      {/* Back */}
      <div className="w-full">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sources
        </button>
      </div>

      {/* Card */}
      <div
        className={cn(
          'w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden',
          'transition-all duration-300'
        )}
      >
        {/* Top colour band */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-sky-400 to-emerald-400" />

        <div className="p-7 space-y-6">
          {/* Google G logo */}
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-black/30">
              <GoogleGLogo className="h-8 w-8" />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center space-y-2">
            <h3 className="text-lg font-bold text-white">Connect Google Workspace</h3>
            <p className="text-sm text-white/45 leading-relaxed">
              A small popup will open. After you sign in, it closes automatically.
              You never leave GateHub.
            </p>
          </div>

          {/* Permissions */}
          <div className="rounded-xl bg-white/[0.04] border border-white/8 p-4 space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">
              Access requested
            </p>
            {PERMISSIONS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                <span className="text-sm text-white/60">{label}</span>
              </div>
            ))}
          </div>

          {/* Error: network/popup blocked */}
          {state === 'error-network' && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 space-y-2">
              <p className="text-sm text-amber-300 font-medium">
                Couldn't open the sign-in window
              </p>
              <p className="text-xs text-amber-400/70 leading-relaxed">
                Your browser may have blocked the popup. Allow popups for this site and try again.
              </p>
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors mt-1"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </button>
            </div>
          )}

          {/* Waiting indicator */}
          {state === 'waiting' && (
            <div className="rounded-xl bg-sky-500/8 border border-sky-500/20 p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="h-4 w-4 rounded-full border-2 border-sky-400/40 border-t-sky-400 animate-spin shrink-0" />
                <p className="text-sm text-sky-300">
                  Waiting for Google sign-in…
                </p>
              </div>
              <p className="text-xs text-sky-400/50 mt-1.5 ml-6">
                Complete sign-in in the popup window
              </p>
            </div>
          )}

          {/* CTA */}
          {(state === 'ready' || state === 'opening-popup') && (
            <button
              type="button"
              onClick={handleConnect}
              disabled={state === 'opening-popup'}
              className={cn(
                'w-full h-11 flex items-center justify-center gap-3 rounded-xl font-semibold text-sm',
                'bg-white text-[#1f1f1f]',
                'hover:bg-white/90 active:scale-[0.98]',
                'shadow-lg shadow-black/30 transition-all duration-200',
                'disabled:opacity-60 disabled:cursor-not-allowed'
              )}
            >
              {state === 'opening-popup' ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-gray-400 border-t-gray-700 animate-spin" />
                  Opening…
                </>
              ) : (
                <>
                  <GoogleGLogo className="h-4 w-4" />
                  Continue with Google
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-white/20 max-w-xs leading-relaxed">
        GateHub only reads your documents. We never modify or delete anything in your Drive.
      </p>
    </div>
  );
}

// ── Google G Logo SVG ─────────────────────────────────────────────────────────

function GoogleGLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
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
  );
}
