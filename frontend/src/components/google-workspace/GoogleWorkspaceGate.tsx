/**
 * GoogleWorkspaceGate
 *
 * Auth state machine for the entire Google Workspace experience.
 * This component OWNS the auth lifecycle — nothing else needs to worry about it.
 *
 * States:
 *   checking        → Silent initial check (small spinner, no text)
 *   not-configured  → OAuth not set up: graceful "not available" message
 *   needs-auth      → Configured but not authenticated: show connect dialog
 *   authenticated   → Ready: show the native Drive browser
 *   error           → Unexpected error: retry option
 *
 * Product rules enforced here:
 * - NEVER expose "Authentication required", "401", or any technical error
 * - NEVER show the browser before auth is confirmed
 * - IF not configured, hide the Google Workspace option gracefully
 * - After successful auth, transition to browser seamlessly
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkAvailability } from '@/lib/googleWorkspace/api';
import type { GoogleDriveFile } from '@/lib/googleWorkspace/api';
import { GoogleAuthDialog } from './GoogleAuthDialog';
import { GoogleWorkspaceBrowser } from './GoogleWorkspaceBrowser';

// ── Types ─────────────────────────────────────────────────────────────────────

type GateState =
  | 'checking'
  | 'not-configured'
  | 'needs-auth'
  | 'authenticated'
  | 'error';

interface GoogleWorkspaceGateProps {
  onFileSelect: (file: GoogleDriveFile) => void;
  onBack: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GoogleWorkspaceGate({ onFileSelect, onBack }: GoogleWorkspaceGateProps) {
  const [gateState, setGateState] = useState<GateState>('checking');

  const runAvailabilityCheck = useCallback(async () => {
    setGateState('checking');

    const status = await checkAvailability();

    if (!status.available) {
      if (status.reason === 'not-configured') {
        setGateState('not-configured');
      } else {
        setGateState('error');
      }
      return;
    }

    if (status.authenticated) {
      setGateState('authenticated');
    } else {
      setGateState('needs-auth');
    }
  }, []);

  useEffect(() => {
    runAvailabilityCheck();
  }, [runAvailabilityCheck]);

  const handleAuthSuccess = () => {
    setGateState('authenticated');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // Checking: silent small spinner — no layout shift
  if (gateState === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-6 w-6 text-primary/50 animate-spin" />
      </div>
    );
  }

  // Not configured: graceful, professional message — not an error
  if (gateState === 'not-configured') {
    return (
      <NotConfiguredScreen onBack={onBack} />
    );
  }

  // Network/unexpected error: retry option
  if (gateState === 'error') {
    return (
      <ErrorScreen onRetry={runAvailabilityCheck} onBack={onBack} />
    );
  }

  // Not authenticated: show connect dialog
  if (gateState === 'needs-auth') {
    return (
      <GoogleAuthDialog
        onSuccess={handleAuthSuccess}
        onBack={onBack}
      />
    );
  }

  // Authenticated: show the native browser
  return (
    <GoogleWorkspaceBrowser
      onFileSelect={onFileSelect}
      onBack={onBack}
    />
  );
}

// ── Sub-screens ───────────────────────────────────────────────────────────────

function NotConfiguredScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 space-y-6">
      {/* Back */}
      <div className="w-full">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          ← Back to sources
        </button>
      </div>

      {/* Illustration area */}
      <div className="flex flex-col items-center gap-5 text-center max-w-xs">
        {/* Google G — desaturated/greyed out intentionally */}
        <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-9 w-9 opacity-30" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        </div>

        <div className="space-y-2">
          <h3 className="font-bold text-white text-base">Google Workspace not available</h3>
          <p className="text-sm text-white/45 leading-relaxed">
            Google Workspace integration is not configured for this account.
            Contact your administrator to enable it.
          </p>
        </div>

        <div className="rounded-xl bg-white/[0.04] border border-white/8 px-5 py-4 text-left space-y-2">
          <p className="text-xs text-white/30 font-semibold uppercase tracking-widest">
            In the meantime
          </p>
          <p className="text-sm text-white/55 leading-relaxed">
            You can still upload PDFs, DOCX, or other files using
            <strong className="text-white/80"> Learning Material</strong>, or paste content directly.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className={cn(
            'px-5 py-2.5 rounded-xl text-sm font-semibold',
            'bg-white/8 border border-white/12 text-white/70',
            'hover:bg-white/12 hover:text-white transition-all'
          )}
        >
          Choose a different source
        </button>
      </div>
    </div>
  );
}

function ErrorScreen({
  onRetry,
  onBack,
}: {
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 space-y-6">
      <div className="w-full">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          ← Back to sources
        </button>
      </div>

      <div className="flex flex-col items-center gap-4 text-center max-w-xs">
        <div className="h-14 w-14 rounded-2xl bg-white/8 flex items-center justify-center">
          <WifiOff className="h-7 w-7 text-white/30" />
        </div>

        <div className="space-y-2">
          <h3 className="font-bold text-white text-base">Couldn't connect to Google</h3>
          <p className="text-sm text-white/45 leading-relaxed">
            There was a problem reaching the Google Workspace service.
            Check your connection and try again.
          </p>
        </div>

        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold',
            'bg-primary/15 border border-primary/25 text-primary',
            'hover:bg-primary/25 transition-all'
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
