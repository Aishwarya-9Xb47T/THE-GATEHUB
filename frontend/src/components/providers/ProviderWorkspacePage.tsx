/**
 * ProviderWorkspacePage
 * 
 * Generic full-screen workspace for cloud providers.
 * This component handles provider selection, authentication, and file browsing.
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, ShieldCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { providerRegistry } from '@/lib/providers';
import type { ProviderPlugin, ProviderFile } from '@/lib/providers/types';
import { ProviderBrowser } from './ProviderBrowser';

type WorkspaceState =
  | 'selecting-provider'
  | 'checking-provider'
  | 'provider-not-available'
  | 'authenticating'
  | 'loading-files'
  | 'browsing-files'
  | 'error-temporary'
  | 'error-file-read';

interface ProviderWorkspacePageProps {
  onFileSelect: (file: ProviderFile, providerId: string) => void;
  onBack: () => void;
}

export function ProviderWorkspacePage({ onFileSelect, onBack }: ProviderWorkspacePageProps) {
  const [state, setState] = useState<WorkspaceState>('selecting-provider');
  const [selectedProvider, setSelectedProvider] = useState<ProviderPlugin | null>(null);
  const [availableProviders, setAvailableProviders] = useState<ProviderPlugin[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    loadAvailableProviders();
  }, []);

  const loadAvailableProviders = async () => {
    const all = providerRegistry.getAll();
    const configured = await providerRegistry.getConfigured();
    setAvailableProviders(configured.length > 0 ? configured : all);
  };

  const handleProviderSelect = async (provider: ProviderPlugin) => {
    setSelectedProvider(provider);
    setState('checking-provider');

    try {
      const status = await provider.checkAuthStatus();

      if (!status.configured) {
        setState('provider-not-available');
        return;
      }

      if (status.authenticated) {
        setState('loading-files');
        // ProviderBrowser will handle loading files
        setState('browsing-files');
      } else {
        // Need to authenticate
        await initiateAuthentication(provider);
      }
    } catch (error: any) {
      setState('error-temporary');
    }
  };

  const initiateAuthentication = async (provider: ProviderPlugin) => {
    setState('authenticating');
    setAuthError(null);

    try {
      const result = await provider.initiateAuth();

      if ('error' in result) {
        setAuthError(result.error);
        setState('error-temporary');
        return;
      }

      // Open OAuth popup
      const width = 500;
      const height = 640;
      const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
      const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

      const popup = window.open(
        result.authUrl,
        'gatehub-provider-oauth',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
      );

      if (!popup) {
        setAuthError('Please allow popups for this site');
        setState('error-temporary');
        return;
      }

      // Listen for success message
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'provider_oauth_success') {
          popup?.close();
          window.removeEventListener('message', handleMessage);
          // Re-check provider status instead of reloading the page
          loadAvailableProviders();
          setState('checking-provider');
        }
      };

      window.addEventListener('message', handleMessage);

      // Poll for popup close
      const check = setInterval(() => {
        if (popup.closed) {
          clearInterval(check);
          window.removeEventListener('message', handleMessage);
          setState('selecting-provider');
        }
      }, 500);
    } catch (error: any) {
      setAuthError('Failed to initiate authentication');
      setState('error-temporary');
    }
  };

  const handleFileSelect = (file: ProviderFile) => {
    if (selectedProvider) {
      onFileSelect(file, selectedProvider.id);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      {state === 'selecting-provider' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl',
                'border border-white/10 text-white/50',
                'hover:text-white hover:border-white/30 hover:bg-white/5',
                'transition-all duration-150'
              )}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h3 className="font-bold text-white text-lg">Cloud Providers</h3>
              <p className="text-xs text-white/30">Select a provider to browse your files</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {availableProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleProviderSelect(provider)}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border',
                  'border-white/10 bg-white/[0.02]',
                  'hover:border-white/20 hover:bg-white/[0.05]',
                  'transition-all duration-200'
                )}
              >
                <provider.icon className="h-8 w-8" />
                <div className="text-left">
                  <p className="font-semibold text-white text-sm">{provider.name}</p>
                  <p className="text-xs text-white/40">Connect to browse your files</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Provider Browser */}
      {state === 'browsing-files' && selectedProvider && (
        <ProviderBrowser
          provider={selectedProvider}
          onFileSelect={handleFileSelect}
          onBack={() => setState('selecting-provider')}
        />
      )}

      {/* Provider Not Available */}
      {state === 'provider-not-available' && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-amber-400" />
          </div>
          <div className="text-center space-y-2">
            <p className="font-semibold text-white">Provider Not Available</p>
            <p className="text-sm text-white/40">This provider is not configured. Please contact your administrator.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setState('selecting-provider')}
            className="border-white/15 text-white/70 hover:bg-white/8"
          >
            Go back
          </Button>
        </div>
      )}

      {/* Authenticating */}
      {state === 'authenticating' && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping" />
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          </div>
          <p className="text-white font-semibold">Connecting to {selectedProvider?.name}…</p>
          <p className="text-sm text-white/40">Complete sign-in in the popup window</p>
        </div>
      )}

      {/* Temporary Error */}
      {state === 'error-temporary' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-6 space-y-3">
            <div className="flex items-start gap-3">
              <RefreshCw className="h-5 w-5 text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold text-white text-sm">Provider Temporarily Unavailable</p>
                <p className="text-sm text-white/50 mt-1">{authError || 'There was a problem connecting to the provider. Please try again.'}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={onBack}
              className="text-white/40 hover:text-white hover:bg-white/8"
            >
              Go back
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-500 text-white"
              onClick={() => setState('selecting-provider')}
            >
              Try again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
