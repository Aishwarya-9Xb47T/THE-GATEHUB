/**
 * Google Workspace Dashboard
 * 
 * Professional SaaS dashboard showing connected account, recent files, and import actions
 */

import { useState, useEffect } from 'react';
import { 
  FileText, LayoutTemplate, Search, RefreshCw, ExternalLink, 
  Clock, Users, Star, Folder, CheckCircle2, Loader2, AlertCircle 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  listFiles, searchFiles, checkAvailability, initiateAuth, type GoogleDriveFile 
} from '@/lib/googleWorkspace/api';

type FilterType = 'recent' | 'shared' | 'starred' | 'folders';
export type GoogleWorkspaceSource = 'google_docs' | 'google_forms';

interface GoogleWorkspaceDashboardProps {
  initialSource?: GoogleWorkspaceSource;
  onFileSelected: (file: GoogleDriveFile) => void;
  onOpenGoogleDocs: () => void;
  onOpenGoogleForms: () => void;
  onBack: () => void;
}

export function GoogleWorkspaceDashboard({ 
  initialSource,
  onFileSelected, 
  onOpenGoogleDocs, 
  onOpenGoogleForms,
  onBack 
}: GoogleWorkspaceDashboardProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'google_docs' | 'google_forms'>(
    initialSource || 'all'
  );
  const [filter, setFilter] = useState<FilterType>('recent');
  const [sortBy, setSortBy] = useState<'modified' | 'title'>('modified');
  const [searchQuery, setSearchQuery] = useState('');
  const [docs, setDocs] = useState<GoogleDriveFile[]>([]);
  const [forms, setForms] = useState<GoogleDriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<GoogleDriveFile | null>(null);
  const [authStatus, setAuthStatus] = useState<{ available: boolean; authenticated: boolean; email?: string | null } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  // Sync initialSource if prop changes
  useEffect(() => {
    if (initialSource) {
      setActiveTab(initialSource);
    }
  }, [initialSource]);

  // Check authentication status on mount and after OAuth callback
  useEffect(() => {
    const checkAuthAndLoad = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const googleAuthSuccess = urlParams.get('googleAuth') === 'success';
      
      if (googleAuthSuccess) {
        window.history.replaceState({}, document.title, window.location.pathname);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      await checkAuth();
    };
    
    checkAuthAndLoad();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'google-auth-success') {
        console.log('[GoogleWorkspaceDashboard] Received auth success message from popup');
        setTimeout(() => checkAuth(), 500);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Load files when authenticated
  useEffect(() => {
    if (authStatus?.authenticated) {
      console.log('[GoogleWorkspaceDashboard] User authenticated, loading files');
      loadFiles();
    }
  }, [authStatus, filter, searchQuery, sortBy]);

  const checkAuth = async () => {
    const status = await checkAvailability();
    if (status.available) {
      setAuthStatus({ available: true, authenticated: status.authenticated, email: status.email });
    } else {
      setAuthStatus({ available: false, authenticated: false });
    }
  };

  const handleAuth = async () => {
    setAuthenticating(true);
    setError(null);
    
    try {
      const result = await initiateAuth();
      
      if (result.error) {
        setError(result.error);
        setAuthenticating(false);
        return;
      }
      
      if (result.authUrl) {
        console.log('[STAGE 1] OAuth URL received:', result.authUrl);
        
        const popup = window.open(
          result.authUrl,
          'google-oauth',
          'width=550,height=650,scrollbars=yes'
        );
        
        if (!popup) {
          setError('Popup blocked by browser. Please allow popups for this site.');
          setAuthenticating(false);
          return;
        }
        
        const checkInterval = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(checkInterval);
            await new Promise(resolve => setTimeout(resolve, 800));
            await checkAuth();
            setAuthenticating(false);
          }
        }, 500);
        
        const authCheckInterval = setInterval(async () => {
          const status = await checkAvailability();
          if (status.available && status.authenticated) {
            clearInterval(authCheckInterval);
            if (popup && !popup.closed) {
              popup.close();
            }
            setAuthStatus({ available: true, authenticated: true, email: status.email });
            setAuthenticating(false);
          }
        }, 2000);
        
        setTimeout(() => {
          clearInterval(checkInterval);
          clearInterval(authCheckInterval);
          setAuthenticating(false);
        }, 120000);
      } else {
        setError('Failed to get OAuth URL from server');
        setAuthenticating(false);
      }
    } catch (err: any) {
      setError('Failed to initiate authentication');
      setAuthenticating(false);
    }
  };

  const loadFiles = async () => {
    console.log('[GoogleWorkspaceDashboard] loadFiles called');
    setLoading(true);
    setError(null);

    try {
      let result;
      if (searchQuery.trim()) {
        result = await searchFiles(searchQuery.trim());
      } else {
        result = await listFiles(filter, undefined, 50);
      }

      console.log('[GoogleWorkspaceDashboard] Drive API result:', result);

      if (result.error) {
        console.log('[GoogleWorkspaceDashboard] Drive error:', result.error);
        if (result.error.includes('401') || result.error.includes('unauthorized') || result.error.includes('authenticated')) {
          setError('Google connection expired. Please sign in again.');
          setAuthStatus({ available: true, authenticated: false });
        } else if (result.error.includes('429') || result.error.includes('quota')) {
          setError('Google API quota exceeded. Please try again later.');
        } else {
          setError(result.error);
        }
      } else if (result.data) {
        const allFiles = result.data.files || [];
        
        let docsFiles = allFiles.filter(
          file => file.mimeType === 'application/vnd.google-apps.document'
        );
        let formsFiles = allFiles.filter(
          file => file.mimeType === 'application/vnd.google-apps.form'
        );

        if (sortBy === 'title') {
          docsFiles.sort((a, b) => a.name.localeCompare(b.name));
          formsFiles.sort((a, b) => a.name.localeCompare(b.name));
        } else {
          docsFiles.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
          formsFiles.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
        }

        setDocs(docsFiles);
        setForms(formsFiles);
      }
    } catch (err: any) {
      console.error('[GoogleWorkspaceDashboard] Load files error:', err);
      setError('Failed to load files. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadFiles();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFiles();
    setRefreshing(false);
  };

  const handleFileSelect = (file: GoogleDriveFile) => {
    setSelectedFile(file);
  };

  const formatModifiedTime = (modifiedTime?: string) => {
    if (!modifiedTime) return '';
    
    const now = new Date();
    const modified = new Date(modifiedTime);
    const diffMs = now.getTime() - modified.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return modified.toLocaleDateString();
  };

  const handleOpenInQuizBuilder = () => {
    console.log('[GoogleWorkspaceDashboard] Open in Quiz Builder clicked, selectedFile:', selectedFile);
    if (selectedFile) {
      onFileSelected(selectedFile);
    } else {
      console.error('[GoogleWorkspaceDashboard] No file selected');
    }
  };

  const handleOpenExternal = (file: GoogleDriveFile) => {
    if (file.webViewLink) {
      window.open(file.webViewLink, '_blank', 'noopener,noreferrer');
    } else if (file.mimeType === 'application/vnd.google-apps.document') {
      window.open(`https://docs.google.com/document/d/${file.id}/edit`, '_blank', 'noopener,noreferrer');
    } else {
      window.open(`https://docs.google.com/forms/d/${file.id}/edit`, '_blank', 'noopener,noreferrer');
    }
  };

  if (!authStatus?.available) {
    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 14 14" fill="none">
            <path
              d="M11 7H3M6 4l-3 3 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Source Selection
        </button>

        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <AlertCircle className="h-12 w-12 text-yellow-400" />
          <h3 className="text-xl font-bold text-white">Google Workspace Not Configured</h3>
          <p className="text-sm text-white/40 max-w-md text-center">
            Google Workspace integration requires OAuth credentials. Please contact your administrator to set up Google OAuth.
          </p>
        </div>
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 14 14" fill="none">
            <path
              d="M11 7H3M6 4l-3 3 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Source Selection
        </button>

        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-lg shadow-primary/10">
            <svg className="h-7 w-7 text-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white">Connect Google Workspace</h3>
          <p className="text-sm text-white/45 max-w-md text-center leading-relaxed">
            Sign in with your Google account to import documents and forms directly from Google Drive into GateHub. Permission requested only once.
          </p>
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}
          <button
            onClick={handleAuth}
            disabled={authenticating}
            className="px-6 py-3 rounded-xl bg-white text-gray-900 font-semibold hover:bg-white/90 transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
          >
            {authenticating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Sign in with Google'
            )}
          </button>
        </div>
      </div>
    );
  }

  const showDocs = activeTab === 'all' || activeTab === 'google_docs';
  const showForms = activeTab === 'all' || activeTab === 'google_forms';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-white/40 hover:text-white/60 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 14 14" fill="none">
              <path
                d="M11 7H3M6 4l-3 3 3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to Source Selection
          </button>
          <div className="flex items-center gap-3 pt-2">
            <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {authStatus.email ? `Connected as ${authStatus.email}` : 'Google Workspace Connected'}
              </p>
              <p className="text-xs text-white/45">Select a document or form to import directly</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={onOpenGoogleDocs}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition-all text-xs font-medium"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Google Docs
          </button>
          <button
            onClick={onOpenGoogleForms}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition-all text-xs font-medium"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Google Forms
          </button>
        </div>
      </div>

      {/* Workspace Type Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white/[0.02] p-3 rounded-2xl border border-white/10">
        {/* Workspace selector: All / Google Docs / Google Forms */}
        <div className="flex gap-1.5 p-1 bg-white/5 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all',
              activeTab === 'all'
                ? 'bg-primary text-white shadow-md'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            )}
          >
            All Workspace
          </button>
          <button
            onClick={() => setActiveTab('google_docs')}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all',
              activeTab === 'google_docs'
                ? 'bg-blue-500 text-white shadow-md'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Google Docs ({docs.length})
          </button>
          <button
            onClick={() => setActiveTab('google_forms')}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all',
              activeTab === 'google_forms'
                ? 'bg-green-600 text-white shadow-md'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            )}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            Google Forms ({forms.length})
          </button>
        </div>

        {/* Sort & Filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'modified' | 'title')}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="modified" className="bg-gray-900 text-white">Sort by Last Modified</option>
            <option value="title" className="bg-gray-900 text-white">Sort by Title</option>
          </select>
        </div>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documents and forms by title..."
          className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent transition-all"
        />
      </form>

      {/* Category Tabs: Recent, Shared, Starred */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'recent' as FilterType, label: 'Recent Files', icon: Clock },
          { id: 'shared' as FilterType, label: 'Shared with me', icon: Users },
          { id: 'starred' as FilterType, label: 'Starred', icon: Star },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setFilter(tab.id);
              }}
              className={cn(
                'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                filter === tab.id
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-white/[0.02] text-white/40 hover:bg-white/5 hover:text-white/60 border border-transparent'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content grid */}
      <div className={cn(
        'grid gap-6',
        showDocs && showForms ? 'lg:grid-cols-2' : 'grid-cols-1'
      )}>
        {/* Google Docs Column */}
        {showDocs && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider text-white/70">
                <FileText className="h-4 w-4 text-blue-400" />
                Google Documents
              </h3>
              <span className="text-xs text-white/40">{docs.length} found</span>
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-12 gap-3 text-white/40">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                  <span className="text-sm">Fetching Google Docs...</span>
                </div>
              ) : docs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-white/30 border border-dashed border-white/10 rounded-2xl">
                  <FileText className="h-10 w-10 mb-2 text-blue-400/40" />
                  <p className="text-sm font-medium">No Google Docs found</p>
                  <p className="text-xs text-white/30 mt-1">Create a new document in Google Docs to get started</p>
                </div>
              ) : (
                docs.map((doc) => {
                  const ownerName = doc.owners?.[0]?.displayName || doc.owners?.[0]?.emailAddress || 'Me';
                  return (
                    <button
                      key={doc.id}
                      onClick={() => handleFileSelect(doc)}
                      className={cn(
                        'w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left group',
                        selectedFile?.id === doc.id
                          ? 'bg-blue-500/15 border-blue-500/50 shadow-lg shadow-blue-500/5'
                          : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] hover:border-white/20'
                      )}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        <FileText className="h-5 w-5" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm truncate group-hover:text-blue-300 transition-colors">
                          {doc.name}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-white/40 mt-1">
                          <span>Owner: {ownerName}</span>
                          <span>•</span>
                          <span>{formatModifiedTime(doc.modifiedTime)}</span>
                        </div>
                      </div>

                      {doc.shared && (
                        <div title="Shared file" className="flex items-center gap-1 text-xs text-white/40 bg-white/5 px-2 py-1 rounded-md">
                          <Users className="h-3 w-3" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Google Forms Column */}
        {showForms && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider text-white/70">
                <LayoutTemplate className="h-4 w-4 text-green-400" />
                Google Forms
              </h3>
              <span className="text-xs text-white/40">{forms.length} found</span>
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-12 gap-3 text-white/40">
                  <Loader2 className="h-5 w-5 animate-spin text-green-400" />
                  <span className="text-sm">Fetching Google Forms...</span>
                </div>
              ) : forms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-white/30 border border-dashed border-white/10 rounded-2xl">
                  <LayoutTemplate className="h-10 w-10 mb-2 text-green-400/40" />
                  <p className="text-sm font-medium">No Google Forms found</p>
                  <p className="text-xs text-white/30 mt-1">Create a form in Google Forms to get started</p>
                </div>
              ) : (
                forms.map((form) => {
                  const ownerName = form.owners?.[0]?.displayName || form.owners?.[0]?.emailAddress || 'Me';
                  return (
                    <button
                      key={form.id}
                      onClick={() => handleFileSelect(form)}
                      className={cn(
                        'w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left group',
                        selectedFile?.id === form.id
                          ? 'bg-green-500/15 border-green-500/50 shadow-lg shadow-green-500/5'
                          : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] hover:border-white/20'
                      )}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-500/15 text-green-400 border border-green-500/20">
                        <LayoutTemplate className="h-5 w-5" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm truncate group-hover:text-green-300 transition-colors">
                          {form.name}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-white/40 mt-1">
                          <span>Owner: {ownerName}</span>
                          <span>•</span>
                          <span>{formatModifiedTime(form.modifiedTime)}</span>
                        </div>
                      </div>

                      {form.shared && (
                        <div title="Shared file" className="flex items-center gap-1 text-xs text-white/40 bg-white/5 px-2 py-1 rounded-md">
                          <Users className="h-3 w-3" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Bar when a document is selected */}
      {selectedFile && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-5 px-6 py-4 rounded-2xl bg-gray-900/95 border border-white/15 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3 min-w-[200px] max-w-[320px]">
              <div className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border',
                selectedFile.mimeType === 'application/vnd.google-apps.document'
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : 'bg-green-500/15 text-green-400 border-green-500/30'
              )}>
                {selectedFile.mimeType === 'application/vnd.google-apps.document' ? (
                  <FileText className="h-6 w-6" />
                ) : (
                  <LayoutTemplate className="h-6 w-6" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{selectedFile.name}</p>
                <p className="text-xs text-white/45 truncate mt-0.5">
                  {selectedFile.mimeType === 'application/vnd.google-apps.document' ? 'Google Doc' : 'Google Form'} • Modified {formatModifiedTime(selectedFile.modifiedTime)}
                </p>
              </div>
            </div>

            <div className="h-8 w-px bg-white/10" />

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenExternal(selectedFile)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all text-xs font-medium"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in {selectedFile.mimeType === 'application/vnd.google-apps.document' ? 'Google Docs' : 'Google Forms'}
              </button>

              <button
                onClick={() => setSelectedFile(null)}
                className="px-3.5 py-2 rounded-xl bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all text-xs font-medium"
              >
                Cancel
              </button>

              <button
                onClick={handleOpenInQuizBuilder}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-all text-xs shadow-lg shadow-primary/25"
              >
                Open in Quiz Builder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
