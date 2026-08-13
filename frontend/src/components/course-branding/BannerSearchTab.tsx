import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importBanner, preloadBannerImage, resolveBannerSrc, searchBanners, getBannerConfig } from "@/lib/courseBranding/bannerApi";
import { suggestBannerKeywords } from "@/lib/courseBranding/suggestKeywords";
import { SUGGESTED_SEARCHES } from "@/lib/courseBranding/types";
import { BannerImage, BannerSkeletonGrid } from "./BannerImage";
import { cn } from "@/lib/utils";

interface BannerSearchTabProps {
  defaultQuery?: string;
  categoryName?: string;
  selectedUrl?: string;
  selectedSourceId?: string;
  onSelect: (bannerUrl: string, thumbnailUrl: string, meta?: { bannerId?: string; sourceId?: string }) => void;
}

export function BannerSearchTab({
  defaultQuery = "",
  categoryName,
  selectedUrl,
  selectedSourceId,
  onSelect,
}: BannerSearchTabProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<Array<{ id: string; title: string; url: string; thumbnailUrl: string; source?: string }>>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchReady, setSearchReady] = useState<boolean | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const activeQuery = useRef("");
  const loadingMoreRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const smartSuggestions = useMemo(
    () => suggestBannerKeywords(defaultQuery, categoryName),
    [defaultQuery, categoryName]
  );

  useEffect(() => {
    if (defaultQuery && defaultQuery !== query) setQuery(defaultQuery);
  }, [defaultQuery]);

  useEffect(() => {
    getBannerConfig().then((res) => {
      const cfg = res.data?.data;
      setSearchReady(!!(cfg?.search ?? (cfg?.pexels || cfg?.unsplash || cfg?.google || cfg?.curated)));
    });
  }, []);

  useEffect(() => {
    if (!defaultQuery?.trim()) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => startSearch(defaultQuery), 500);
    return () => clearTimeout(debounceRef.current);
  }, [defaultQuery, categoryName]);

  const runSearch = useCallback(async (q: string, pageNum: number, append: boolean) => {
    if (!q.trim()) return;
    if (append && loadingMoreRef.current) return;
    if (pageNum === 1) setLoading(true);
    else {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    setError(null);

    const res = await searchBanners(q.trim(), pageNum);
    if (pageNum === 1) setLoading(false);
    else {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }

    if (res.error) {
      setError(res.error);
      if (!append) setResults([]);
      return;
    }

    const batch = res.data?.data?.results || [];
    batch.forEach((r) => preloadBannerImage(r.thumbnailUrl));
    setResults((prev) => (append ? [...prev, ...batch] : batch));
    setHasMore(res.data?.data?.hasMore ?? batch.length >= 12);
    setPage(pageNum);
    activeQuery.current = q.trim();
  }, []);

  const startSearch = (q?: string) => {
    const term = q ?? query;
    setResults([]);
    setPage(1);
    runSearch(term, 1, false);
  };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && activeQuery.current) {
          runSearch(activeQuery.current, page + 1, true);
        }
      },
      { rootMargin: "160px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, runSearch]);

  const selectImage = async (imageUrl: string, sourceId: string) => {
    setImporting(sourceId);
    setError(null);
    const res = await importBanner(imageUrl, "search");
    setImporting(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    const data = res.data?.data;
    if (data?.bannerUrl) {
      preloadBannerImage(data.bannerUrl);
      onSelect(data.bannerUrl, data.thumbnailUrl || data.bannerUrl, {
        bannerId: data.bannerId,
        sourceId,
      });
    }
  };

  const isSelected = (itemId: string, itemUrl: string) =>
    selectedSourceId === itemId ||
    (selectedUrl && resolveBannerSrc(selectedUrl) === resolveBannerSrc(itemUrl));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search professional banner images"
          onKeyDown={(e) => e.key === "Enter" && startSearch()}
          className="transition-shadow focus:ring-2 focus:ring-primary/20"
        />
        <Button type="button" onClick={() => startSearch()} disabled={loading} className="shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {smartSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Suggested for your course</p>
          <div className="flex flex-wrap gap-2">
            {smartSuggestions.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuery(ex);
                  startSearch(ex);
                }}
                className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 hover:border-primary/50 transition-all"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {SUGGESTED_SEARCHES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQuery(ex);
              startSearch(ex);
            }}
            className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary/50 hover:bg-muted transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => startSearch()} className="shrink-0 h-7">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
          </Button>
        </div>
      )}

      {loading && <BannerSkeletonGrid count={6} />}

      {results.length > 0 && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1 scroll-smooth">
          {results.map((item) => {
            const selected = isSelected(item.id, item.url);
            return (
              <button
                key={item.id}
                type="button"
                disabled={!!importing}
                onClick={() => selectImage(item.url, item.id)}
                className={cn(
                  "relative rounded-lg overflow-hidden border-2 aspect-video group text-left transition-all duration-200",
                  selected
                    ? "border-primary ring-2 ring-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.25)] scale-[1.02]"
                    : "border-transparent hover:border-primary/50 hover:scale-[1.02]"
                )}
              >
                <BannerImage src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                {importing === item.id && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                  </div>
                )}
                {selected && !importing && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
                    ✓ Selected
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white line-clamp-1 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> {item.source || item.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div ref={sentinelRef} className="h-4 flex items-center justify-center">
        {loadingMore && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
      </div>

      {!loading && results.length === 0 && !error && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {searchReady === false
            ? "Banner search is unavailable. Restart the backend server and try again."
            : "Search professional landscape banners (Pexels, Google, or curated THE GATE HUB library)"}
        </p>
      )}
    </div>
  );
}
