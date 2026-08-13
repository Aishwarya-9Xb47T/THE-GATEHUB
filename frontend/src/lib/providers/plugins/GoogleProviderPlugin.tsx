/**
 * GoogleProviderPlugin (Frontend)
 * 
 * Implements the ProviderPlugin interface for Google Workspace.
 */

import { Search, Clock, Users, Star, Folder, FileText, FileQuestion, Presentation, Table } from 'lucide-react';
import type { ProviderPlugin, ProviderFile, ListFilesResult, SidebarItem, ProviderStatus } from '../types.js';
import { checkProviderStatus as checkStatus, initiateAuth as initAuth, listFiles as listProviderFiles, searchFiles as searchProviderFiles } from '../api.js';

// Google MIME types
const GOOGLE_MIME_TYPES = {
  DOCS: 'application/vnd.google-apps.document',
  FORMS: 'application/vnd.google-apps.form',
  SHEETS: 'application/vnd.google-apps.spreadsheet',
  SLIDES: 'application/vnd.google-apps.presentation',
  FOLDER: 'application/vnd.google-apps.folder',
} as const;

// MIME to icon mapping
const MIME_ICONS: Record<string, React.ElementType> = {
  [GOOGLE_MIME_TYPES.DOCS]: FileText,
  [GOOGLE_MIME_TYPES.FORMS]: FileQuestion,
  [GOOGLE_MIME_TYPES.SLIDES]: Presentation,
  [GOOGLE_MIME_TYPES.SHEETS]: Table,
  [GOOGLE_MIME_TYPES.FOLDER]: Folder,
};

// MIME to style mapping
const MIME_STYLES: Record<string, { icon: string; bg: string; border: string }> = {
  [GOOGLE_MIME_TYPES.DOCS]: { icon: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/20' },
  [GOOGLE_MIME_TYPES.FORMS]: { icon: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/20' },
  [GOOGLE_MIME_TYPES.SLIDES]: { icon: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/20' },
  [GOOGLE_MIME_TYPES.SHEETS]: { icon: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/20' },
  [GOOGLE_MIME_TYPES.FOLDER]: { icon: 'text-sky-400', bg: 'bg-sky-500/15', border: 'border-sky-500/20' },
};

// Google G Logo SVG
function GoogleGLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export class GoogleProviderPlugin implements ProviderPlugin {
  readonly id = 'google';
  readonly name = 'Google Workspace';
  readonly icon = GoogleGLogo;
  readonly color = 'text-white';
  
  readonly sidebarItems: SidebarItem[] = [
    { id: 'recent', label: 'Recent', icon: Clock, emptyText: 'No recent files found', filter: 'recent' },
    { id: 'docs', label: 'Google Docs', icon: FileText, emptyText: 'No Google Docs found', filter: 'docs' },
    { id: 'forms', label: 'Google Forms', icon: FileQuestion, emptyText: 'No Google Forms found', filter: 'forms' },
    { id: 'slides', label: 'Google Slides', icon: Presentation, emptyText: 'No Google Slides found', filter: 'slides' },
    { id: 'shared', label: 'Shared with Me', icon: Users, emptyText: 'Nothing has been shared with you', filter: 'shared' },
    { id: 'starred', label: 'Starred', icon: Star, emptyText: 'No starred files', filter: 'starred' },
    { id: 'folders', label: 'Folders', icon: Folder, emptyText: 'No folders found', filter: 'folders' },
  ];
  
  /**
   * Check authentication status
   */
  async checkAuthStatus(): Promise<ProviderStatus> {
    return await checkStatus(this.id);
  }
  
  /**
   * Initiate authentication
   */
  async initiateAuth(redirectUrl?: string): Promise<{ authUrl: string } | { error: string }> {
    const result = await initAuth(this.id, redirectUrl);
    
    if (result.error) {
      return { error: result.error };
    }
    
    if (result.authUrl) {
      return { authUrl: result.authUrl };
    }
    
    return { error: 'Failed to initiate authentication' };
  }
  
  /**
   * List files from Google Drive
   */
  async listFiles(filter: string = 'recent', pageToken?: string, pageSize: number = 24): Promise<ListFilesResult> {
    return await listProviderFiles(this.id, filter, pageToken, pageSize);
  }
  
  /**
   * Search files in Google Drive
   */
  async searchFiles(query: string, pageToken?: string, pageSize: number = 24): Promise<ListFilesResult> {
    return await searchProviderFiles(this.id, query, pageToken, pageSize);
  }
  
  /**
   * Get icon for a file based on MIME type
   */
  getFileIcon(mimeType: string): React.ElementType {
    return MIME_ICONS[mimeType] || FileText;
  }
  
  /**
   * Get style for a file based on MIME type
   */
  getFileStyle(mimeType: string) {
    return MIME_STYLES[mimeType] || MIME_STYLES[GOOGLE_MIME_TYPES.DOCS];
  }
}

// Export singleton instance
export const googleProviderPlugin = new GoogleProviderPlugin();
