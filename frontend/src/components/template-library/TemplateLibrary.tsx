import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertCircle, RefreshCw, Search, Sparkles, SlidersHorizontal } from "lucide-react";
import {
  deleteTemplateLibraryItem,
  duplicateTemplateLibraryItem,
  favoriteTemplateLibraryItem,
  listTemplateLibrary,
  useTemplateLibraryItem,
} from "@/lib/templateLibrary/api";
import type { QuizTemplateSummary, TemplateFilters, TemplateSection } from "@/lib/templateLibrary/types";
import { TEMPLATE_CATEGORY_CHIPS, TEMPLATE_SECTIONS } from "@/lib/templateLibrary/types";
import { TemplateCard } from "./TemplateCard";
import { TemplateCarousel } from "./TemplateCarousel";
import { TemplatePreviewModal } from "./TemplatePreviewModal";
import { TemplateEmptyState } from "./TemplateEmptyState";
import { TemplateLibrarySkeleton } from "./TemplateCardSkeleton";
import { TemplateFiltersPanel } from "./TemplateFiltersPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/toastStore";

interface TemplateLibraryProps {
  embedded?: boolean;
  onUseTemplate?: (quizId: string) => void;
  onUseTemplateRequest?: (template: QuizTemplateSummary) => void;
  applying?: boolean;
}

function logAudit(label: string, payload: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.info(`[TemplateLibrary] ${label}`, payload);
  }
}

export function TemplateLibrary({ embedded, onUseTemplate, onUseTemplateRequest, applying }: TemplateLibraryProps) {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [section, setSection] = useState<TemplateSection>("all");
  const [preview, setPreview] = useState<QuizTemplateSummary | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<TemplateFilters>({ sort: "popular" });
  const [appliedFilters, setAppliedFilters] = useState<TemplateFilters>({ sort: "popular" });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const queryKey = ["template-library", debouncedSearch, category, section, appliedFilters];

  const sortForSection =
    section === "popular"
      ? "popular"
      : section === "new"
        ? "newest"
        : section === "trending"
          ? "trending"
          : appliedFilters.sort || "popular";

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await listTemplateLibrary({
        q: debouncedSearch || undefined,
        category: category || undefined,
        section: section === "all" || section === "recent" ? undefined : section,
        page: pageParam,
        pageSize: 24,
        sort: sortForSection,
        difficulty: appliedFilters.difficulty,
        language: appliedFilters.language,
        supportsHomework: appliedFilters.supportsHomework,
        supportsLive: appliedFilters.supportsLive,
        supportsAi: appliedFilters.supportsAi,
        supportsMedia: appliedFilters.supportsMedia,
      });

      if (res.error) throw new Error(res.error);
      if (!res.data?.data) throw new Error("Template library returned no data");

      const page = res.data.data;
      logAudit("API response", {
        apiTotal: page.total,
        apiItems: page.items.length,
        featured: page.featured.length,
        page: page.page,
      });
      return page;
    },
    getNextPageParam: (last) => (last?.hasMore ? (last.page ?? 1) + 1 : undefined),
    retry: 2,
  });

  const firstPage = data?.pages[0];
  const items = useMemo(() => data?.pages.flatMap((p) => p?.items ?? []) ?? [], [data]);
  const featured = firstPage?.featured ?? [];
  const recentlyUsed = firstPage?.recentlyUsed ?? [];
  const apiTotal = firstPage?.total ?? 0;

  const displayItems = section === "recent" ? recentlyUsed : items;

  const hasActiveFilters = Boolean(
    debouncedSearch || category || section !== "all" || appliedFilters.difficulty || appliedFilters.language ||
    appliedFilters.supportsHomework || appliedFilters.supportsLive || appliedFilters.supportsAi || appliedFilters.supportsMedia
  );

  const showEmptyState = !isLoading && !isError && displayItems.length === 0 && (apiTotal === 0 || hasActiveFilters);

  useEffect(() => {
    if (!isLoading && !isError) {
      logAudit("render audit", {
        apiTotal,
        filteredCount: displayItems.length,
        renderedCount: displayItems.length,
        section,
        category,
        hasActiveFilters,
      });
      if (apiTotal > 0 && displayItems.length === 0 && !hasActiveFilters) {
        console.warn("[TemplateLibrary] Rendering bug: API has templates but grid is empty", { apiTotal, section });
      }
    }
  }, [isLoading, isError, apiTotal, displayItems.length, section, category, hasActiveFilters]);

  const favoriteMutation = useMutation({
    mutationFn: (id: string) => favoriteTemplateLibraryItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["template-library"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTemplateLibraryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-library"] });
      toast({ title: "Template deleted", variant: "success" });
    },
    onError: () => toast({ title: "Could not delete template", variant: "destructive" }),
  });

  const handleUse = useCallback(
    async (t: QuizTemplateSummary) => {
      if (onUseTemplateRequest) {
        onUseTemplateRequest(t);
        return;
      }
      try {
        const res = await useTemplateLibraryItem(t.id);
        if (res.error) throw new Error(res.error);
        const quizId = res.data?.data?.quizId;
        if (!quizId) throw new Error("No quiz returned");
        toast({ title: "Template applied", description: `"${t.title}" is ready in the builder.`, variant: "success" });
        if (onUseTemplate) onUseTemplate(quizId);
        else navigate(`/instructor/quiz-room/quizzes/${quizId}/edit`);
      } catch (e: any) {
        toast({
          title: "Could not use template",
          description: e instanceof Error ? e.message : "Try again.",
          variant: "destructive",
        });
      }
    },
    [navigate, onUseTemplate, onUseTemplateRequest, toast]
  );

  const handleDuplicate = useCallback(
    async (t: QuizTemplateSummary) => {
      try {
        const res = await duplicateTemplateLibraryItem(t.id);
        if (res.error) throw new Error(res.error);
        toast({ title: "Saved to My Templates", description: `"${t.title}" was duplicated.`, variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["template-library"] });
        setSection("my");
      } catch (e: any) {
        toast({
          title: "Could not duplicate",
          description: e instanceof Error ? e.message : "Try again.",
          variant: "destructive",
        });
      }
    },
    [queryClient, toast]
  );

  const handleFavorite = (t: QuizTemplateSummary) => favoriteMutation.mutate(t.id);

  return (
    <div className={cn("space-y-8", embedded ? "px-0" : "px-4 py-6 sm:px-8")}>
      <header className="space-y-4">
        {!embedded && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Template Library</h1>
          <p className="mt-2 max-w-2xl text-white/55">
            Official templates, your saved layouts, and community picks — start faster with professional quizzes.
          </p>
        </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates, subjects, tags…"
              className="h-11 border-white/10 bg-white/5 pl-10 text-white placeholder:text-white/40"
            />
          </div>
          <Button type="button" variant="outline" className="border-white/15 bg-white/5 text-white" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-white/15 bg-white/5 text-white"
            onClick={() => navigate("/instructor/quiz-room/create?method=ai")}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate with AI
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {TEMPLATE_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                section === s.id ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70 hover:bg-white/15"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs",
              !category ? "bg-white text-slate-900" : "bg-white/10 text-white/70"
            )}
          >
            All categories
          </button>
          {TEMPLATE_CATEGORY_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c === category ? null : c)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs transition-colors",
                category === c ? "bg-white text-slate-900" : "bg-white/10 text-white/70 hover:bg-white/15"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <TemplateLibrarySkeleton />
      ) : isError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-12 text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
          <h3 className="text-lg font-semibold text-white">Could not load templates</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
            {(error as Error)?.message || "The template library API is unavailable."}
          </p>
          <Button type="button" className="mt-6" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      ) : (
        <>
          {section === "all" && featured.length > 0 && (
            <TemplateCarousel
              title="Featured templates"
              subtitle="Hand-picked by THE GATEHUB — ready to customize"
              templates={featured}
              onPreview={setPreview}
              onUse={handleUse}
              onFavorite={handleFavorite}
              onDuplicate={handleDuplicate}
            />
          )}

          {section === "all" && recentlyUsed.length > 0 && (
            <TemplateCarousel
              title="Recently used"
              templates={recentlyUsed}
              onPreview={setPreview}
              onUse={handleUse}
              onFavorite={handleFavorite}
              onDuplicate={handleDuplicate}
            />
          )}

          {showEmptyState ? (
            <TemplateEmptyState
              filtered={hasActiveFilters}
              onCreate={() => navigate("/instructor/quiz-room/create?method=manual")}
              onImport={() => navigate("/instructor/quiz-room/create?method=import")}
              onExploreOfficial={() => { setSection("official"); setCategory(null); setSearch(""); }}
              onGenerateAi={() => navigate("/instructor/quiz-room/create?method=ai")}
            />
          ) : displayItems.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-white/50">
                  {apiTotal} templates
                  {category && (
                    <Badge variant="secondary" className="ml-2">
                      {category}
                    </Badge>
                  )}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {displayItems.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onPreview={() => setPreview(t)}
                    onUse={() => handleUse(t)}
                    onFavorite={() => handleFavorite(t)}
                    onDuplicate={() => handleDuplicate(t)}
                    onDelete={section === "my" && t.source === "user" ? () => deleteMutation.mutate(t.id) : undefined}
                  />
                ))}
              </div>
              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <Button type="button" variant="outline" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
                    {isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </>
      )}

      <TemplatePreviewModal
        template={preview}
        open={Boolean(preview)}
        onOpenChange={(o) => !o && setPreview(null)}
        onUse={handleUse}
        onDuplicate={handleDuplicate}
        onFavorite={handleFavorite}
      />

      <TemplateFiltersPanel
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onChange={setFilters}
        onApply={() => setAppliedFilters(filters)}
        onClear={() => {
          const cleared = { sort: "popular" as const };
          setFilters(cleared);
          setAppliedFilters(cleared);
        }}
      />
    </div>
  );
}
