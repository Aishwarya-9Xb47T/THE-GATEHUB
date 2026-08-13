/**
 * ProviderBrowser
 * 
 * Generic browser component for cloud providers.
 * This component works with any provider that implements the ProviderPlugin interface.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  ArrowLeft,
  RefreshCw,
  FileX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProviderPlugin, ProviderFile, SidebarItem } from '@/lib/providers/types.js';

// ── File Card ─────────────────────────────────────────────────────────────────

function FileCard({ 
  file, 
  onSelect, 
  icon: FileIcon, 
  styles 
}: { 
  file: ProviderFile; 
  onSelect: () => void; 
  icon: React.ElementType;
  styles: { icon: string; bg: string; border: string };
}) {
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
        <p className="text-xs text-white/30 mt-0.5">There was a problem connecting to the provider</p>
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

interface ProviderBrowserProps {
  provider: ProviderPlugin;
  onFileSelect: (file: ProviderFile) => void;
  onBack: () => void;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

export function ProviderBrowser({ provider, onFileSelect, onBack }: ProviderBrowserProps) {
  const [activeFilter, setActiveFilter] = useState(provider.sidebarItems[0].id);
  const [files, setFiles] = useState<ProviderFile[]>([]);
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

    try {
      const result = await provider.listFiles(activeFilter, pageToken, 24);

      if (!pageToken) {
        setLoadState(result.files.length > 0 ? 'loaded' : 'loaded');
      } else {
        setLoadingMore(false);
      }

      if (result.files) {
        const newFiles = result.files;
        if (pageToken) {
          setFiles((prev) => [...prev, ...newFiles]);
        } else {
          setFiles(newFiles);
        }
        setNextPageToken(result.nextPageToken);
      }
    } catch (error: any) {
      if (!pageToken) {
        setLoadState('error');
      } else {
        setLoadingMore(false);
      }
    }
  }, [activeFilter, provider]);

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
    try {
      const result = await provider.searchFiles(q, undefined, 24);
      setLoadState(result.files.length > 0 ? 'loaded' : 'loaded');
      if (result.files) {
        setFiles(result.files);
        setNextPageToken(undefined);
      }
    } catch (error: any) {
      setLoadState('error');
    }
    setIsSearching(false);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(q), 400);
  };

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    setSearchQuery('');
    setFiles([]);
  };

  const currentSidebarItem = provider.sidebarItems.find((s) => s.id === activeFilter)!;

  // Get file icon and style helpers (for Google, can be extended for other providers)
  const getFileIcon = (mimeType: string) => {
    if ((provider as any).getFileIcon) {
      return (provider as any).getFileIcon(mimeType);
    }
    return FileX; // Default icon
  };

  const getFileStyle = (mimeType: string) => {
    if ((provider as any).getFileStyle) {
      return (provider as any).getFileStyle(mimeType);
    }
    return { icon: 'text-white/40', bg: 'bg-white/5', border: 'border-white/10' }; // Default style
  };

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
          <provider.icon className="h-7 w-7" />
          <div>
            <h3 className="font-bold text-white text-sm leading-tight">{provider.name}</h3>
            <p className="text-[10px] text-white/30">Your files, inside GateHub</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25 pointer-events-none" />
        <input
          type="text"
          placeholder={`Search ${provider.name}…`}
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
          {provider.sidebarItems.map(({ id, label, icon: Icon }) => (
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
          {loadState === 'loaded' && files.length === 0 && (
            <EmptyState
              text={currentSidebarItem.emptyText}
              onRefresh={() => loadFiles()}
            />
          )}

          {/* File grid */}
          {loadState === 'loaded' && files.length > 0 && (
            <div className="space-y-3 pr-0.5">
              <div className="grid grid-cols-2 gap-3">
                {files.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    icon={getFileIcon(file.mimeType)}
                    styles={getFileStyle(file.mimeType)}
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
