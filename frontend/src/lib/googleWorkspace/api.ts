/**
 * Google Workspace — Frontend API Layer
 *
 * Design principles:
 * - All functions return { data?, error? } — never throw.
 * - Errors are caught and returned as strings, never bubbled to UI raw.
 * - `checkAvailability()` must be called before any other function.
 *   If it returns { available: false }, hide the Google Workspace option entirely.
 */

import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  thumbnailLink?: string;
  modifiedTime: string;
  owners: Array<{ displayName: string; emailAddress?: string }>;
  size?: string;
  shared?: boolean;
  starred?: boolean;
  parents?: string[];
}

export interface GoogleDriveListResult {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

export interface GoogleFileContent {
  content: string;
  fileType: string;
  metadata: {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
  };
}

export type GoogleAuthStatus =
  | { available: false; reason: 'not-configured' | 'error' }
  | { available: true; authenticated: boolean; email?: string | null };

// ── Availability check ─────────────────────────────────────────────────────────

/**
 * Check if Google Workspace is configured AND whether the user is authenticated.
 *
 * Returns a discriminated union:
 *   { available: false, reason: 'not-configured' }  — OAuth env vars missing
 *   { available: false, reason: 'error' }            — unexpected server error
 *   { available: true, authenticated: false }        — configured, not authed
 *   { available: true, authenticated: true }         — ready to use
 *
 * This function NEVER throws. Use it as the gate before showing any Google UI.
 */
export async function checkAvailability(): Promise<GoogleAuthStatus> {
  try {
    const result = await api<{ authenticated: boolean; configured?: boolean; email?: string | null }>(
      '/google-workspace/auth/status',
      { skipLoginRedirect: true }
    );

    // Network error or 5xx — backend might not have OAuth configured
    if (result.error) {
      // Treat auth/config errors as "not configured" — don't show error to user
      const isConfigError =
        result.error.toLowerCase().includes('client_id') ||
        result.error.toLowerCase().includes('not configured') ||
        result.error.toLowerCase().includes('environment') ||
        result.error.includes('500') ||
        result.error.includes('502') ||
        result.error.includes('503');

      if (isConfigError) {
        return { available: false, reason: 'not-configured' };
      }

      // Other error (network, etc.) — return error state so we can show retry
      return { available: false, reason: 'error' };
    }

    // Backend explicitly says not configured
    if (result.data?.configured === false) {
      return { available: false, reason: 'not-configured' };
    }

    return {
      available: true,
      authenticated: result.data?.authenticated ?? false,
      email: result.data?.email,
    };
  } catch {
    return { available: false, reason: 'error' };
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────────

/**
 * Initiate Google OAuth — returns the auth URL to open in a popup.
 * Returns a friendly error string on failure (never throws).
 */
export async function initiateAuth(
  redirectUrl?: string
): Promise<{ authUrl?: string; error?: string }> {
  try {
    const result = await api<{ authUrl: string }>(
      '/google-workspace/auth',
      { method: 'POST', body: { redirectUrl }, skipLoginRedirect: true }
    );

    if (result.error || !result.data?.authUrl) {
      return { 
        error: 'Google Workspace is not configured. An administrator needs to configure Google API credentials. (Error Code: GW-001)' 
      };
    }

    return { authUrl: result.data.authUrl };
  } catch {
    return { error: 'Network connection issue. Please check your internet connection and try again.' };
  }
}

// ── Drive ──────────────────────────────────────────────────────────────────────

export async function listFiles(
  filter?: 'recent' | 'shared' | 'starred' | 'folders',
  pageToken?: string,
  pageSize?: number
): Promise<{ data?: GoogleDriveListResult; error?: string }> {
  const params = new URLSearchParams();
  if (filter) params.append('filter', filter);
  if (pageToken) params.append('pageToken', pageToken);
  if (pageSize) params.append('pageSize', String(pageSize));
  return api(`/google-workspace/files?${params.toString()}`, { skipLoginRedirect: true });
}

export async function searchFiles(
  query: string,
  pageToken?: string,
  pageSize?: number
): Promise<{ data?: GoogleDriveListResult; error?: string }> {
  const params = new URLSearchParams();
  params.append('query', query);
  if (pageToken) params.append('pageToken', pageToken);
  if (pageSize) params.append('pageSize', String(pageSize));
  return api(`/google-workspace/search?${params.toString()}`, { skipLoginRedirect: true });
}

export async function getFolderFiles(
  folderId: string,
  pageToken?: string,
  pageSize?: number
): Promise<{ data?: GoogleDriveListResult; error?: string }> {
  const params = new URLSearchParams();
  if (pageToken) params.append('pageToken', pageToken);
  if (pageSize) params.append('pageSize', String(pageSize));
  return api(`/google-workspace/folder/${folderId}/files?${params.toString()}`, {
    skipLoginRedirect: true,
  });
}

export async function getFileContent(
  fileId: string
): Promise<{ data?: GoogleFileContent; error?: string }> {
  return api(`/google-workspace/file/${fileId}/content`, { skipLoginRedirect: true });
}

// ── Legacy re-export ──────────────────────────────────────────────────────────

/** @deprecated Use checkAvailability() instead */
export async function checkAuthStatus(): Promise<{ data?: { authenticated: boolean }; error?: string }> {
  const status = await checkAvailability();
  if (!status.available) return { data: { authenticated: false } };
  return { data: { authenticated: status.authenticated } };
}
