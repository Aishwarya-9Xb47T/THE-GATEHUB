import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Presentation,
  Search,
  Download,
  Eye,
  Calendar,
  Layers,
  FileText,
  Upload,
  ArrowRight,
  Filter,
  X,
  BookOpen,
  Sparkles,
} from "lucide-react";
import {
  fetchLibraryResources,
  fetchLibraryTopics,
  getPptDownloadUrl,
  PPTResource,
  PPTTopic,
} from "@/lib/pptLibrary/api";
import { useUserStore, isAdminRole } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";

export function PptLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUserStore();
  const toast = useToastStore((s) => s.add);

  // Filters from URL search params
  const currentSearch = searchParams.get("search") || "";
  const currentTopicId = searchParams.get("topicId") || "";
  const currentSubtopicId = searchParams.get("subtopicId") || "";
  const currentSort = searchParams.get("sort") || "newest";
  const currentPage = Number(searchParams.get("page")) || 1;

  const [searchInput, setSearchInput] = useState(currentSearch);

  // Can the current user upload?
  const canUpload = useMemo(() => {
    if (!user) return false;
    if (isAdminRole(user.role)) return true;
    if (user.role === "instructor" && (user as any).instructorApprovalStatus === "APPROVED") return true;
    return false;
  }, [user]);

  // TanStack Query for topics — instant cached render across navigation
  const { data: topics = [] } = useQuery({
    queryKey: ["ppt-library", "topics"],
    queryFn: () => fetchLibraryTopics(),
    staleTime: 5 * 60 * 1000,
  });

  // TanStack Query for resources with stale-while-revalidate and placeholder data
  const { data: resourceData, isLoading: isResourcesLoading, isFetching } = useQuery({
    queryKey: [
      "ppt-library",
      "resources",
      currentPage,
      currentSearch,
      currentTopicId,
      currentSubtopicId,
      currentSort,
    ],
    queryFn: () =>
      fetchLibraryResources({
        page: currentPage,
        limit: 12,
        search: currentSearch,
        topicId: currentTopicId,
        subtopicId: currentSubtopicId,
        sort: currentSort,
      }),
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const resources = resourceData?.data ?? [];
  const pagination = resourceData?.pagination ?? { page: 1, limit: 12, total: 0, totalPages: 1 };
  const loading = !resourceData && isResourcesLoading;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (searchInput.trim()) {
      newParams.set("search", searchInput.trim());
    } else {
      newParams.delete("search");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const clearSearch = () => {
    setSearchInput("");
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("search");
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handleTopicClick = (topicId: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (currentTopicId === topicId) {
      newParams.delete("topicId");
      newParams.delete("subtopicId");
    } else {
      newParams.set("topicId", topicId);
      newParams.delete("subtopicId");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handleSubtopicClick = (subtopicId: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (currentSubtopicId === subtopicId) {
      newParams.delete("subtopicId");
    } else {
      newParams.set("subtopicId", subtopicId);
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handleSortChange = (sort: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("sort", sort);
    newParams.set("page", "1");
    setSearchParams(newParams);
  };

  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", String(newPage));
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Find active topic to display its subtopics
  const activeTopic = topics.find((t) => t.id === currentTopicId);

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Hero / Header Section */}
      <section className="relative border-b border-border/50 bg-gradient-to-b from-primary/5 via-transparent to-transparent pt-12 pb-10">
        <div className="app-workspace max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-primary/10 text-primary border border-primary/20 mb-3">
                <Presentation className="w-3.5 h-3.5" />
                ACADEMIC RESOURCE HUB
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight text-foreground">
                PPT Library
              </h1>
              <p className="mt-2 text-base sm:text-lg text-muted-foreground max-w-2xl">
                Browse, view, and download structured presentation decks and learning slides curated by verified
                technology instructors.
              </p>
            </div>

            {canUpload && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => navigate("/ppt-library/upload")}
                  className="gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Upload PPT
                </Button>
                {user?.role === "instructor" && (
                  <Button
                    variant="outline"
                    onClick={() => navigate("/instructor/ppt-library")}
                    className="gap-2"
                  >
                    My PPTs
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="mt-8 relative max-w-3xl">
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search presentations by title, topic, tags, or instructor..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-12 pr-24 h-12 text-base rounded-xl border-border bg-card shadow-sm focus-visible:ring-primary"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-20 text-muted-foreground hover:text-foreground p-1 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <Button type="submit" size="sm" className="absolute right-2 h-8 px-4 rounded-lg">
                Search
              </Button>
            </div>
          </form>

          {/* Topic Pills */}
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <Button
                variant={!currentTopicId ? "default" : "outline"}
                size="sm"
                onClick={() => handleTopicClick("")}
                className="rounded-full text-xs font-medium shrink-0"
              >
                All Topics
              </Button>
              {topics.map((topic) => (
                <Button
                  key={topic.id}
                  variant={currentTopicId === topic.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTopicClick(topic.id)}
                  className="rounded-full text-xs font-medium shrink-0 gap-1.5"
                >
                  {topic.name}
                  {topic.resourceCount !== undefined && topic.resourceCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/30 text-current">
                      {topic.resourceCount}
                    </span>
                  )}
                </Button>
              ))}
            </div>

            {/* Subtopics if topic is selected */}
            {activeTopic && activeTopic.subtopics.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 text-xs scrollbar-none">
                <span className="text-muted-foreground shrink-0 font-medium">Subtopics:</span>
                <Button
                  variant={!currentSubtopicId ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleSubtopicClick("")}
                  className="h-7 px-3 rounded-md text-xs shrink-0"
                >
                  All
                </Button>
                {activeTopic.subtopics.map((sub) => (
                  <Button
                    key={sub.id}
                    variant={currentSubtopicId === sub.id ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => handleSubtopicClick(sub.id)}
                    className="h-7 px-3 rounded-md text-xs shrink-0 gap-1"
                  >
                    {sub.name}
                    {sub.resourceCount !== undefined && sub.resourceCount > 0 && (
                      <span className="text-[10px] opacity-75">({sub.resourceCount})</span>
                    )}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <section className="app-workspace max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Results Header with Sorting */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border/40">
          <div className="text-sm text-muted-foreground">
            {loading ? (
              <span>Loading presentations...</span>
            ) : (
              <span>
                Showing <strong className="text-foreground">{resources.length}</strong> of{" "}
                <strong className="text-foreground">{pagination.total}</strong> presentation
                {pagination.total === 1 ? "" : "s"}
                {currentSearch && (
                  <span>
                    {" "}
                    for &ldquo;<strong className="text-foreground">{currentSearch}</strong>&rdquo;
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground shrink-0 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Sort:
            </span>
            <div className="flex items-center rounded-lg bg-card border border-border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => handleSortChange("newest")}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  currentSort === "newest"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Newest
              </button>
              <button
                type="button"
                onClick={() => handleSortChange("popular")}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  currentSort === "popular"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Most Downloaded
              </button>
              <button
                type="button"
                onClick={() => handleSortChange("views")}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  currentSort === "views"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Most Viewed
              </button>
              <button
                type="button"
                onClick={() => handleSortChange("title")}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  currentSort === "title"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                A-Z
              </button>
            </div>
          </div>
        </div>

        {/* Resources Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse bg-card/60 border-border/40 overflow-hidden">
                <div className="h-44 bg-muted/50 w-full" />
                <CardContent className="p-5 space-y-3">
                  <div className="h-4 bg-muted/70 rounded w-1/3" />
                  <div className="h-5 bg-muted rounded w-4/5" />
                  <div className="h-3 bg-muted/60 rounded w-full" />
                  <div className="h-3 bg-muted/60 rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : resources.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground mb-4">
              <Presentation className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-semibold font-display text-foreground">No presentations found</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              {currentSearch || currentTopicId
                ? "Try adjusting your search terms or selecting a different topic filter."
                : "No presentations have been published yet in this category. Check back soon!"}
            </p>
            {(currentSearch || currentTopicId) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchParams(new URLSearchParams())}
                className="mt-6"
              >
                Reset All Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {resources.map((ppt) => {
              const isPptx = ppt.originalFileName.toLowerCase().endsWith(".pptx");

              return (
                <Card
                  key={ppt.id}
                  className="group flex flex-col justify-between overflow-hidden bg-card border-border hover:border-primary/40 hover:shadow-md transition-all duration-300 rounded-2xl"
                >
                  <div>
                    {/* Presentation Preview Header / Thumbnail */}
                    <div className="relative aspect-video w-full bg-gradient-to-br from-primary/10 via-secondary/30 to-muted/40 overflow-hidden flex items-center justify-center border-b border-border/40">
                      {ppt.thumbnailUrl ? (
                        <img
                          src={ppt.thumbnailUrl}
                          alt={ppt.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-primary/70 group-hover:scale-110 transition-transform duration-300">
                          <Presentation className="w-12 h-12" />
                          <span className="text-xs font-semibold tracking-wider uppercase mt-2 text-muted-foreground">
                            {isPptx ? "PowerPoint Deck" : "Presentation"}
                          </span>
                        </div>
                      )}

                      {/* File format badge */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className="font-mono text-[10px] font-bold uppercase tracking-wider backdrop-blur-md bg-background/80"
                        >
                          {isPptx ? ".PPTX" : ".PPT"}
                        </Badge>
                        {ppt.academicLevel && (
                          <Badge variant="outline" className="text-[10px] backdrop-blur-md bg-background/70">
                            {ppt.academicLevel}
                          </Badge>
                        )}
                      </div>

                      {/* Slide count / size indicator */}
                      <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                        {ppt.slideCount ? (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-background/90 backdrop-blur-md text-foreground shadow-xs flex items-center gap-1">
                            <Layers className="w-3 h-3 text-primary" />
                            {ppt.slideCount} slides
                          </span>
                        ) : null}
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-background/90 backdrop-blur-md text-muted-foreground shadow-xs">
                          {formatFileSize(ppt.fileSize)}
                        </span>
                      </div>
                    </div>

                    {/* Card Content */}
                    <CardContent className="p-5 space-y-3">
                      {/* Topic & Subtopic Badges */}
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="font-semibold text-primary">{ppt.topic.name}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground font-medium">{ppt.subtopic.name}</span>
                      </div>

                      {/* Title */}
                      <h3 className="font-display font-bold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-2">
                        <Link to={`/ppt-library/${ppt.id}/view`} className="focus:outline-hidden">
                          {ppt.title}
                        </Link>
                      </h3>

                      {/* Short Description */}
                      {ppt.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                          {ppt.description}
                        </p>
                      )}

                      {/* Tags */}
                      {ppt.tags && ppt.tags.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {ppt.tags.slice(0, 3).map((tag, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium"
                            >
                              #{tag}
                            </span>
                          ))}
                          {ppt.tags.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{ppt.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </div>

                  {/* Card Footer: Instructor & Actions */}
                  <div className="px-5 pb-5 pt-2 border-t border-border/30 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <UnifiedAvatar user={ppt.instructor as any} size="sm" />
                        <span className="font-medium text-foreground">
                          {ppt.instructor.firstName} {ppt.instructor.lastName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1" title="Downloads">
                          <Download className="w-3.5 h-3.5 text-primary" />
                          {ppt.downloadCount}
                        </span>
                        <span className="flex items-center gap-1" title="Views">
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          {ppt.viewCount}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="default"
                        className="w-full gap-1.5 text-xs h-9"
                        onClick={() => navigate(`/ppt-library/${ppt.id}/view`)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View PPT
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5 text-xs h-9"
                        asChild
                      >
                        <a href={getPptDownloadUrl(ppt.id)} download={ppt.originalFileName}>
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-12">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-3">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

