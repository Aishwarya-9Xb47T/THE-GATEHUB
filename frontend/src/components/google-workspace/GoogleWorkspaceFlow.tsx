/**
 * Production-Grade URL-First Google Workspace Import Component
 * 
 * URL-First Architecture:
 * 1. User pastes a Google Docs or Google Forms URL and clicks Import.
 * 2. System attempts public export / direct extraction first (Zero OAuth for public documents).
 * 3. Only if the document is private (401/AUTH_REQUIRED) does it open the Permission Required Modal.
 * 4. After Google login, the exact same import is automatically retried without losing state.
 */

import { useState } from 'react';
import { 
  FileText, 
  LayoutTemplate, 
  ArrowLeft, 
  Sparkles, 
  Loader2, 
  AlertCircle, 
  Lock,
  X
} from 'lucide-react';
import { analyzeGoogleContent } from '@/lib/contentBuilder/api';
import {
  parseGoogleDocsUrl,
  parseGoogleFormsUrl,
  mapGoogleImportError,
  isGoogleAuthRequiredError,
} from '@/lib/contentBuilder/googleResource';
import { initiateAuth } from '@/lib/googleWorkspace/api';
import { cn } from '@/lib/utils';

interface GoogleWorkspaceFlowProps {
  onImportComplete: (
    jobId: string,
    questions: any[],
    statistics: any,
    diagnostics?: any,
  ) => void;
  onCancel: () => void;
}

type ImportPhase = 'idle' | 'validating' | 'connecting' | 'downloading' | 'processing' | 'extracting' | 'reviewing';

export function GoogleWorkspaceFlow({ onImportComplete, onCancel }: GoogleWorkspaceFlowProps) {
  // Inputs
  const [docsUrl, setDocsUrl] = useState('');
  const [formsUrl, setFormsUrl] = useState('');

  // Inline Validation Errors
  const [docsError, setDocsError] = useState<string | null>(null);
  const [formsError, setFormsError] = useState<string | null>(null);

  // State
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Auth Modal State (Triggered ONLY when 401/AUTH_REQUIRED is returned)
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<{ url: string; type: 'docs' | 'forms' } | null>(null);

  const validateDocsUrl = (url: string) => parseGoogleDocsUrl(url);
  const validateFormsUrl = (url: string) => parseGoogleFormsUrl(url);

  const handleDocsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDocsError(null);
    setGeneralError(null);

    const validation = validateDocsUrl(docsUrl);
    if (!validation.valid) {
      setDocsError(validation.error || 'Invalid URL');
      return;
    }

    executeImport(docsUrl.trim(), 'docs');
  };

  const handleFormsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormsError(null);
    setGeneralError(null);

    const validation = validateFormsUrl(formsUrl);
    if (!validation.valid) {
      setFormsError(validation.error || 'Invalid URL');
      return;
    }

    executeImport(formsUrl.trim(), 'forms');
  };

  const executeImport = async (url: string, type: 'docs' | 'forms') => {
    setGeneralError(null);
    setPendingUrl({ url, type });

    try {
      setImportPhase('validating');
      await new Promise(r => setTimeout(r, 300));

      setImportPhase('connecting');
      await new Promise(r => setTimeout(r, 300));

      setImportPhase('downloading');
      await new Promise(r => setTimeout(r, 300));

      setImportPhase('processing');

      // Call backend API with URL
      const result = await analyzeGoogleContent(url, type === 'docs' ? 'Google Document' : 'Google Form');

      if (result.error) {
        if (isGoogleAuthRequiredError(result.error, result.errorCode)) {
          setImportPhase('idle');
          setAuthModalOpen(true);
          return;
        }

        setGeneralError(mapGoogleImportError(result.error, result.errorCode));
        setImportPhase('idle');
        return;
      }

      if (result.data) {
        console.log('[STEP 8] Frontend received response', { jobId: result.data.jobId, questionsCount: result.data.questions?.length });
        setImportPhase('extracting');
        await new Promise(r => setTimeout(r, 400));

        setImportPhase('reviewing');
        onImportComplete(
          result.data.jobId,
          result.data.questions,
          result.data.statistics,
          result.data.diagnostics,
        );
      }
    } catch (err: any) {
      setGeneralError(err?.message || 'Failed to import Google Workspace content');
      setImportPhase('idle');
    }
  };

  const handleContinueWithGoogle = async () => {
    setAuthenticating(true);
    setGeneralError(null);

    try {
      const result = await initiateAuth();
      if (result.error) {
        setGeneralError(result.error);
        setAuthenticating(false);
        return;
      }

      if (result.authUrl) {
        const popup = window.open(result.authUrl, 'google-oauth', 'width=550,height=650,scrollbars=yes');
        if (!popup) {
          setGeneralError('Popup blocked by browser. Please allow popups for this site.');
          setAuthenticating(false);
          return;
        }

        const checkInterval = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(checkInterval);
            setAuthenticating(false);
            setAuthModalOpen(false);

            // Automatically retry the exact same import without asking the user to paste again!
            if (pendingUrl) {
              console.log('[GoogleWorkspaceFlow] Auto-resuming import after OAuth login:', pendingUrl);
              executeImport(pendingUrl.url, pendingUrl.type);
            }
          }
        }, 600);
      }
    } catch {
      setGeneralError('Failed to initiate Google sign in');
      setAuthenticating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back to Source Selection
        </button>
      </div>

      {/* Hero Title */}
      <div className="text-center space-y-2 py-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold tracking-wide uppercase">
          <Sparkles className="h-3.5 w-3.5" />
          Direct Link Import
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Import from Google Workspace
        </h2>
        <p className="text-sm text-white/45 max-w-lg mx-auto">
          Paste a Google Docs or Google Forms link below to extract questions, equations, images, and tables directly into Quiz Builder.
        </p>
      </div>

      {/* Global Error Banner */}
      {generalError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-sm animate-in fade-in duration-200">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Import Attention Required</p>
            <p className="text-xs text-red-400/80 mt-0.5">{generalError}</p>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {importPhase !== 'idle' && (
        <div className="p-8 rounded-3xl bg-gray-900/90 border border-white/15 backdrop-blur-xl space-y-6 text-center animate-in fade-in duration-200">
          <div className="relative inline-flex items-center justify-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-xl shadow-primary/10">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">
              {importPhase === 'validating' && 'Validating Link...'}
              {importPhase === 'connecting' && 'Connecting to Google Workspace...'}
              {importPhase === 'downloading' && 'Downloading Document Content...'}
              {importPhase === 'processing' && 'Running Universal Document Intelligence...'}
              {importPhase === 'extracting' && 'Extracting Questions & Objects...'}
              {importPhase === 'reviewing' && 'Opening Review Workspace...'}
            </h3>
            <p className="text-xs text-white/45 max-w-sm mx-auto">
              Preserving Bloom taxonomy, math equations, code blocks, tables, and difficulty levels.
            </p>
          </div>

          {/* Progress Indicators */}
          <div className="flex justify-center items-center gap-2 max-w-md mx-auto pt-2">
            {[
              { id: 'validating', label: 'Validate' },
              { id: 'downloading', label: 'Download' },
              { id: 'processing', label: 'Intelligence Engine' },
              { id: 'extracting', label: 'Extract' },
            ].map((p, idx) => {
              const activeIdx = ['validating', 'connecting', 'downloading', 'processing', 'extracting', 'reviewing'].indexOf(importPhase);
              const stepIdx = idx * 1.5;
              const isDone = activeIdx > stepIdx;
              const isCurrent = activeIdx >= stepIdx && activeIdx < stepIdx + 1.5;

              return (
                <div key={p.id} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className={cn(
                    'h-1.5 w-full rounded-full transition-all duration-300',
                    isDone ? 'bg-green-500' : isCurrent ? 'bg-primary animate-pulse' : 'bg-white/10'
                  )} />
                  <span className="text-[10px] text-white/40">{p.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Two Cards Grid */}
      {importPhase === 'idle' && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Card 1: Google Docs */}
          <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 hover:border-blue-500/40 hover:bg-white/[0.05] transition-all flex flex-col justify-between space-y-6 group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                  <FileText className="h-6 w-6" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                  Universal Engine
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white group-hover:text-blue-300 transition-colors">
                  Google Docs
                </h3>
                <p className="text-xs text-white/50 leading-relaxed mt-1">
                  Import directly from a Google Document link. Full formatting, LaTeX equations, code blocks, tables, and images preserved.
                </p>
              </div>
            </div>

            <form onSubmit={handleDocsSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70 block">
                  Google Docs Share Link
                </label>
                <input
                  type="url"
                  value={docsUrl}
                  onChange={(e) => {
                    setDocsUrl(e.target.value);
                    if (docsError) setDocsError(null);
                  }}
                  placeholder="https://docs.google.com/document/d/..."
                  className={cn(
                    'w-full px-4 py-3 rounded-xl bg-black/40 border text-white text-xs placeholder:text-white/25 focus:outline-none transition-all',
                    docsError
                      ? 'border-red-500/60 focus:ring-1 focus:ring-red-500'
                      : 'border-white/10 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/60'
                  )}
                />
                {docsError && (
                  <p className="text-[11px] text-red-400 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {docsError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 group-hover:shadow-blue-500/30"
              >
                <Sparkles className="h-4 w-4" />
                Import Document
              </button>
            </form>
          </div>

          {/* Card 2: Google Forms */}
          <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 hover:border-green-500/40 hover:bg-white/[0.05] transition-all flex flex-col justify-between space-y-6 group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-12 w-12 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400 group-hover:scale-105 transition-transform">
                  <LayoutTemplate className="h-6 w-6" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
                  Forms Converter
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white group-hover:text-green-300 transition-colors">
                  Google Forms
                </h3>
                <p className="text-xs text-white/50 leading-relaxed mt-1">
                  Import directly from a Google Form link. Multiple choice, checkboxes, dropdowns, linear scales, and points converted automatically.
                </p>
              </div>
            </div>

            <form onSubmit={handleFormsSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70 block">
                  Google Forms Share Link
                </label>
                <input
                  type="url"
                  value={formsUrl}
                  onChange={(e) => {
                    setFormsUrl(e.target.value);
                    if (formsError) setFormsError(null);
                  }}
                  placeholder="https://docs.google.com/forms/d/..."
                  className={cn(
                    'w-full px-4 py-3 rounded-xl bg-black/40 border text-white text-xs placeholder:text-white/25 focus:outline-none transition-all',
                    formsError
                      ? 'border-red-500/60 focus:ring-1 focus:ring-red-500'
                      : 'border-white/10 focus:border-green-500/60 focus:ring-1 focus:ring-green-500/60'
                  )}
                />
                {formsError && (
                  <p className="text-[11px] text-red-400 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {formsError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-semibold shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2 group-hover:shadow-green-500/30"
              >
                <Sparkles className="h-4 w-4" />
                Import Form
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Permission Required Modal (Triggered ONLY on private document 401 response) */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md p-6 rounded-3xl bg-gray-900 border border-white/15 shadow-2xl space-y-5 text-center">
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="h-14 w-14 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mx-auto shadow-lg shadow-blue-500/10">
              <Lock className="h-7 w-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">Permission Required</h3>
              <p className="text-xs text-white/50 leading-relaxed max-w-xs mx-auto">
                Google couldn&apos;t provide access with the current connection. Sign in with the Google account that can view this Docs or Forms link, then we&apos;ll retry automatically.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleContinueWithGoogle}
                disabled={authenticating}
                className="w-full py-3 rounded-xl bg-white text-gray-900 font-semibold hover:bg-white/90 transition-all text-xs shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {authenticating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-gray-900" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <span>Continue with Google</span>
                )}
              </button>

              <button
                onClick={() => setAuthModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-all text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
