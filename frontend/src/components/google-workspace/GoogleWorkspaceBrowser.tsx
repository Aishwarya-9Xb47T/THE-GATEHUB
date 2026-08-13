/**
 * GoogleWorkspaceBrowser
 *
 * Native GateHub UI for browsing Google Workspace files.
 * This feels like a built-in GateHub feature — NOT an embedded Google page.
 *
 * Design rules:
 * - Never shows raw API errors to educators
 * - Skeleton loaders instead of spinners for file grid
 * - Per-filter empty states with context
 * - Debounced search
 * - File card hover: "Select →" overlay
 * - Clicking a file calls onFileSelect — the parent opens a Preview screen
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  FileText,
  FileQuestion,
  Table,
  Presentation,
  Folder,
  RefreshCw,
  Clock,
  Users,
  Star,
  ArrowLeft,
  FileX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  listFiles,
  searchFiles,
  type GoogleDriveFile,
} from '@/lib/googleWorkspace/api';

// ── MIME / icon maps ──────────────────────────────────────────────────────────

const MIME_KEY: Record<string, string> = {
  'application/vnd.google-apps.document':     'docs',
  'application/vnd.google-apps.form':         'forms',
  'application/vnd.google-apps.presentation': 'slides',
  'application/vnd.google-apps.spreadsheet':  'sheets',
  'application/vnd.google-apps.folder':       'folder',
};

const FILE_ICONS: Record<string, React.ElementType> = {
  docs:    FileText,
  forms:   FileQuestion,
  slides:  Presentation,
  sheets:  Table,
  folder:  Folder,
};

const FILE_STYLES: Record<string, { icon: string; bg: string; border: string }> = {
  docs:    { icon: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/20' },
  forms:   { icon: 'text-purple-400',  bg: 'bg-purple-500/15',  border: 'border-purple-500/20' },
  slides:  { icon: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/20' },
  sheets:  { icon: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/20' },
  folder:  { icon: 'text-sky-400',     bg: 'bg-sky-500/15',     border: 'border-sky-500/20' },
};

// ── Sidebar definition ────────────────────────────────────────────────────────

type SidebarFilter = 'recent' | 'docs' | 'forms' | 'slides' | 'shared' | 'starred' | 'folders';

interface SidebarItem {
  id: SidebarFilter;
  label: string;
  icon: React.ElementType;
  emptyText: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'recent',  label: 'Recent',         icon: Clock,        emptyText: 'No recent files found' },
  { id: 'docs',    label: 'Google Docs',    icon: FileText,     emptyText: 'No Google Docs found' },
  { id: 'forms',   label: 'Google Forms',   icon: FileQuestion, emptyText: 'No Google Forms found' },
  { id: 'slides',  label: 'Google Slides',  icon: Presentation, emptyText: 'No Google Slides found' },
  { id: 'shared',  label: 'Shared with Me', icon: Users,        emptyText: 'Nothing has been shared with you' },
  { id: 'starred', label: 'Starred',        icon: Star,         emptyText: 'No starred files' },
  { id: 'folders', label: 'Folders',        icon: Folder,       emptyText: 'No folders found' },
];

// ── API filter map ────────────────────────────────────────────────────────────

const API_FILTER_MAP: Partial<Record<SidebarFilter, 'recent' | 'shared' | 'starred' | 'folders'>> = {
  recent:  'recent',
  shared:  'shared',
  starred: 'starred',
  folders: 'folders',
};

const MIME_FILTER_MAP: Partial<Record<SidebarFilter, string>> = {
  docs:   'application/vnd.google-apps.document',
  forms:  'application/vnd.google-apps.form',
  slides: 'application/vnd.google-apps.presentation',
};

// ── File Card ─────────────────────────────────────────────────────────────────

function FileCard({ file, onSelect }: { file: GoogleDriveFile; onSelect: () => void }) {
  const key = MIME_KEY[file.mimeType] ?? 'docs';
  const FileIcon = FILE_ICONS[key] ?? FileText;
  const styles = FILE_STYLES[key] ?? FILE_STYLES.docs;

  const modified = new Date(file.modifiedTime).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const owner = file.owners?.[0]?.displayName ?? '';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col gap-3 rounded-xl border p-4 text-left w-full',
        'border-white/8 bg-white/[0.02]',
        'hover:border-white/20 hover:bg-white/[0.05]',
        'hover:shadow-xl hover:shadow-black/20',
        'transition-all duration-200 outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary/60'
      )}
    >
      {/* Icon */}
      <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center border', styles.bg, styles.border)}>
        <FileIcon className={cn('h-5 w-5', styles.icon)} />
      </div>

      {/* Name + owner */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-white/85 line-clamp-2 leading-snug">{file.name}</p>
        {owner && (
          <p className="text-[11px] text-white/30 truncate">{owner}</p>
        )}
      </div>

      {/* Modified date */}
      <p className="text-[10px] text-white/20">{modified}</p>

      {/* Hover overlay */}
      <div
        className={cn(
          'absolute inset-0 rounded-xl flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-all duration-200',
          'bg-primary/8 border border-primary/30'
        )}
      >
        <span className={cn(
          'rounded-full bg-primary px-4 py-1.5 text-xs font-semibold',
          'text-primary-foreground shadow-lg shadow-primary/25',
          'translate-y-1 group-hover:translate-y-0 transition-transform duration-200'
        )}>
          Select →
        </span>
      </div>
    </button>
  );
}

// ── Skeleton Card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/[0.015] p-4 animate-pulse">
      <div className="h-10 w-10 rounded-xl bg-white/8" />
      <div className="space-y-2 flex-1">
        <div className="h-3 bg-white/8 rounded w-4/5" />
        <div className="h-3 bg-white/5 rounded w-2/5" />
      </div>
      <div className="h-2.5 bg-white/5 rounded w-1/3" />
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ text, onRefresh }: { text: string; onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-center">
      <FileX className="h-9 w-9 text-white/15" />
      <p className="text-sm text-white/35">{text}</p>
      <button
        type="button"
        onClick={onRefresh}
        className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors"
      >
        <RefreshCw className="h-3 w-3" />
        Refresh
      </button>
    </div>
  );
}

// ── Error State ───────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-center">
      <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
        <RefreshCw className="h-5 w-5 text-amber-400" />
      </div>
      <div>
        <p className="text-sm text-white/60 font-medium">Couldn't load files</p>
        <p className="text-xs text-white/30 mt-0.5">There was a problem connecting to your Drive</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold',
          'bg-amber-500/15 border border-amber-500/25 text-amber-400',
          'hover:bg-amber-500/25 transition-all'
        )}
      >
        <RefreshCw className="h-3 w-3" />
        Try again
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface GoogleWorkspaceBrowserProps {
  onFileSelect: (file: GoogleDriveFile) => void;
  onBack: () => void;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export function GoogleWorkspaceBrowser({ onFileSelect, onBack }: GoogleWorkspaceBrowserProps) {
  const [activeFilter, setActiveFilter] = useState<SidebarFilter>('recent');
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFiles = useCallback(async (pageToken?: string) => {
    if (!pageToken) {
      setLoadState('loading');
      setFiles([]);
    } else {
      setLoadingMore(true);
    }

    const apiFilter = API_FILTER_MAP[activeFilter];
    const result = await listFiles(apiFilter, pageToken, 24);

    if (!pageToken) {
      setLoadState(result.error ? 'error' : 'loaded');
    } else {
      setLoadingMore(false);
    }

    if (result.data) {
      const newFiles = result.data.files;
      if (pageToken) {
        setFiles((prev) => [...prev, ...newFiles]);
      } else {
        setFiles(newFiles);
      }
      setNextPageToken(result.data.nextPageToken);
    }
  }, [activeFilter]);

  useEffect(() => {
    if (!searchQuery) loadFiles();
  }, [activeFilter, loadFiles, searchQuery]);

  const handleSearch = async (q: string) => {
    if (!q.trim()) {
      setIsSearching(false);
      loadFiles();
      return;
    }
    setIsSearching(true);
    setLoadState('loading');
    const result = await searchFiles(q, undefined, 24);
    setLoadState(result.error ? 'error' : 'loaded');
    if (result.data) {
      setFiles(result.data.files);
      setNextPageToken(undefined);
    }
    setIsSearching(false);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(q), 400);
  };

  const handleFilterChange = (filter: SidebarFilter) => {
    setActiveFilter(filter);
    setSearchQuery('');
    setFiles([]);
  };

  // Apply client-side MIME filter for docs/forms/slides tabs
  const mimeFilter = MIME_FILTER_MAP[activeFilter];
  const displayFiles = mimeFilter ? files.filter((f) => f.mimeType === mimeFilter) : files;

  const currentSidebarItem = SIDEBAR_ITEMS.find((s) => s.id === activeFilter)!;

  return (
    <div className="space-y-4">
      {/* Header row */}
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

        <div className="flex items-center gap-2">
          {/* Google G */}
          <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-white text-sm leading-tight">Google Workspace</h3>
            <p className="text-[10px] text-white/30">Your files, inside GateHub</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25 pointer-events-none" />
        <input
          type="text"
          placeholder="Search Docs, Forms, Slides…"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={cn(
            'w-full rounded-xl border border-white/10 bg-white/[0.04]',
            'pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none',
            'focus:border-primary/50 focus:bg-white/[0.06] transition-all duration-200'
          )}
        />
        {isSearching && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
        )}
      </div>

      {/* Layout */}
      <div className="flex gap-4" style={{ minHeight: 360 }}>
        {/* Sidebar */}
        <nav className="w-36 shrink-0 space-y-0.5 pt-0.5">
          {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleFilterChange(id)}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left',
                'transition-all duration-150',
                activeFilter === id
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'text-white/40 hover:text-white/75 hover:bg-white/5'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight: 400 }}>
          {/* Loading skeletons */}
          {loadState === 'loading' && (
            <div className="grid grid-cols-2 gap-3 pr-0.5">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {/* Error */}
          {loadState === 'error' && (
            <ErrorState onRetry={() => loadFiles()} />
          )}

          {/* Empty */}
          {loadState === 'loaded' && displayFiles.length === 0 && (
            <EmptyState
              text={currentSidebarItem.emptyText}
              onRefresh={() => loadFiles()}
            />
          )}

          {/* File grid */}
          {loadState === 'loaded' && displayFiles.length > 0 && (
            <div className="space-y-3 pr-0.5">
              <div className="grid grid-cols-2 gap-3">
                {displayFiles.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    onSelect={() => onFileSelect(file)}
                  />
                ))}
              </div>

              {/* Load more */}
              {nextPageToken && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => loadFiles(nextPageToken)}
                    disabled={loadingMore}
                    className="flex items-center gap-2 text-xs text-primary/70 hover:text-primary transition-colors px-4 py-2"
                  >
                    {loadingMore ? (
                      <>
                        <span className="h-3 w-3 rounded-full border border-primary/40 border-t-primary animate-spin" />
                        Loading more…
                      </>
                    ) : (
                      'Load more files'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Re-export ─────────────────────────────────────────────────────────────────
export type { GoogleWorkspaceBrowserProps };
