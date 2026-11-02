import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Share2,
  Layers,
  Calendar,
  User,
  ArrowLeft,
  FileText,
  AlertCircle,
  Presentation,
  Check,
} from "lucide-react";
import {
  fetchResourceDetail,
  getPptDownloadUrl,
  getPptPreviewUrl,
  PPTResource,
} from "@/lib/pptLibrary/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToastStore } from "@/store/toastStore";
import { UnifiedAvatar } from "@/components/common/UnifiedAvatar";

export function PptViewerPage() {
  const { pptId } = useParams<{ pptId: string }>();
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);

  const [resource, setResource] = useState<PPTResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deck State
  const [slideCount, setSlideCount] = useState<number>(0);
  const [currentSlide, setCurrentSlide] = useState<number>(0); // 0-indexed
  const [currentSlideSvg, setCurrentSlideSvg] = useState<string | null>(null);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [isLegacyPpt, setIsLegacyPpt] = useState(false);

  // Viewer display state
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);

  // 1. Fetch metadata
  useEffect(() => {
    if (!pptId) return;
    setLoading(true);
    fetchResourceDetail(pptId)
      .then((data) => {
        setResource(data);
        const ext = data.originalFileName.toLowerCase();
        if (ext.endsWith(".ppt") && !ext.endsWith(".pptx")) {
          setIsLegacyPpt(true);
        }
      })
      .catch((err) => {
        console.error("Failed to load presentation details:", err);
        setError(err.message || "Presentation not found or access denied");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [pptId]);

  // 2. Load Presentation into pptx-svg
  useEffect(() => {
    if (!resource || isLegacyPpt) return;

    let active = true;
    setDeckLoading(true);
    setDeckError(null);

    async function loadDeck() {
      try {
        const previewUrl = getPptPreviewUrl(resource!.id);
        const token = localStorage.getItem("token");
        const headers: HeadersInit = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(previewUrl, { headers });
        if (!res.ok) throw new Error(`Could not fetch presentation file (HTTP ${res.status})`);
        const buffer = await res.arrayBuffer();

        // Initialize pptx-svg
        const { PptxRenderer } = await import("pptx-svg");
        const renderer = new PptxRenderer({ logLevel: "warn" });

        // Initialize WASM
        const wasmMod = await import("pptx-svg/wasm?url");
        const wasmUrl = (wasmMod as { default: string }).default;
        try {
          const wasmRes = await fetch(wasmUrl);
          if (wasmRes.ok) {
            await renderer.init(await wasmRes.arrayBuffer());
          } else {
            await renderer.init(wasmUrl);
          }
        } catch {
          await renderer.init(wasmUrl);
        }

        const loaded = await renderer.loadPptx(buffer);
        if (!active) return;

        rendererRef.current = renderer;
        setSlideCount(loaded.slideCount);
        setCurrentSlide(0);

        // Render first slide
        if (loaded.slideCount > 0) {
          const svg = renderer.renderSlideSvg(0);
          setCurrentSlideSvg(svg);
        }
      } catch (err: any) {
        console.warn("[PPT_VIEWER] pptx-svg rendering warning:", err);
        if (active) {
          setDeckError(
            err.message ||
              "Browser preview is not available for this file. You can download the original presentation."
          );
        }
      } finally {
        if (active) setDeckLoading(false);
      }
    }

    loadDeck();

    return () => {
      active = false;
    };
  }, [resource, isLegacyPpt]);

  // Render current slide when slide index changes
  const renderSlide = useCallback((index: number) => {
    if (!rendererRef.current) return;
    try {
      const svg = rendererRef.current.renderSlideSvg(index);
      setCurrentSlideSvg(svg);
    } catch (err) {
      console.error("Failed to render slide:", err);
    }
  }, []);

  const goToSlide = (index: number) => {
    if (index < 0 || index >= slideCount) return;
    setCurrentSlide(index);
    renderSlide(index);
  };

  const nextSlide = () => {
    if (currentSlide < slideCount - 1) {
      goToSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      goToSlide(currentSlide - 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Space") {
        e.preventDefault();
        nextSlide();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevSlide();
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide, slideCount, isFullscreen]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    toast({ title: "Link copied to clipboard", variant: "success" });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Presentation className="w-12 h-12 text-primary animate-pulse mb-4" />
        <p className="text-muted-foreground font-medium">Loading presentation details...</p>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold font-display text-foreground">Unable to Load Presentation</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">{error || "Presentation could not be found."}</p>
        <Button variant="outline" onClick={() => navigate("/ppt-library")} className="mt-6 gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to PPT Library
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Header & Breadcrumbs */}
      <header className="border-b border-border/40 bg-card/60 backdrop-blur-md sticky top-0 z-40 px-4 py-3">
        <div className="app-workspace max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/ppt-library")}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              PPT Library
            </Button>
            <span className="text-border shrink-0">/</span>
            <div className="min-w-0">
              <span className="text-xs text-primary font-medium">{resource.topic.name}</span>
              <h1 className="text-sm font-semibold truncate text-foreground">{resource.title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-1.5 text-xs">
              {copiedLink ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Share2 className="w-3.5 h-3.5" />}
              Share
            </Button>
            <Button size="sm" asChild className="gap-1.5 text-xs">
              <a href={getPptDownloadUrl(resource.id)} download={resource.originalFileName}>
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Presentation Stage */}
      <main className="flex-1 flex flex-col lg:flex-row app-workspace max-w-7xl mx-auto w-full p-4 sm:p-6 gap-6">
        {/* Left / Center Stage: Slide Viewer Canvas */}
        <div className="flex-1 flex flex-col">
          <div
            ref={containerRef}
            className={`relative flex flex-col justify-between rounded-2xl border border-border bg-slate-950 text-white overflow-hidden shadow-xl transition-all ${
              isFullscreen ? "fixed inset-0 z-50 rounded-none border-none" : "min-h-[460px] md:min-h-[580px]"
            }`}
          >
            {/* Viewer Top Action Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 backdrop-blur-md border-b border-white/10 z-20">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Badge variant="outline" className="border-white/20 text-white font-mono text-[10px]">
                  {resource.originalFileName.endsWith(".pptx") ? "PPTX" : "PPT"}
                </Badge>
                {slideCount > 0 && (
                  <span>
                    Slide {currentSlide + 1} of {slideCount}
                  </span>
                )}
              </div>

              {/* View Controls */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-300 hover:text-white hover:bg-white/10"
                  onClick={() => setZoomLevel((z) => Math.max(60, z - 15))}
                  title="Zoom Out"
                  disabled={deckLoading || Boolean(deckError) || isLegacyPpt}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <span className="text-[11px] font-mono text-slate-400 w-10 text-center select-none">
                  {zoomLevel}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-300 hover:text-white hover:bg-white/10"
                  onClick={() => setZoomLevel((z) => Math.min(180, z + 15))}
                  title="Zoom In"
                  disabled={deckLoading || Boolean(deckError) || isLegacyPpt}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-300 hover:text-white hover:bg-white/10"
                  onClick={() => setZoomLevel(100)}
                  title="Reset Zoom"
                  disabled={deckLoading || Boolean(deckError) || isLegacyPpt}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
                <div className="w-px h-4 bg-white/15 mx-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-300 hover:text-white hover:bg-white/10"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            {/* Slide Stage Area */}
            <div className="relative flex-1 flex items-center justify-center p-4 md:p-8 overflow-auto select-none">
              {deckLoading ? (
                <div className="flex flex-col items-center justify-center text-center p-8">
                  <Presentation className="w-10 h-10 text-primary animate-pulse mb-3" />
                  <p className="text-sm text-slate-300 font-medium">Parsing and rendering presentation slides…</p>
                  <span className="text-xs text-slate-500 mt-1">This runs securely inside your browser</span>
                </div>
              ) : isLegacyPpt || deckError ? (
                <div className="flex flex-col items-center justify-center text-center max-w-md p-8 bg-slate-900/60 rounded-xl border border-white/10">
                  <Presentation className="w-12 h-12 text-primary/80 mb-3" />
                  <h4 className="text-base font-semibold text-white">
                    {isLegacyPpt ? "Legacy PowerPoint Presentation (.ppt)" : "Browser Preview Notice"}
                  </h4>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    {isLegacyPpt
                      ? "Legacy binary (.ppt) files require Microsoft PowerPoint or LibreOffice. For the best interactive viewing experience, download the file below or upload modern (.pptx) decks."
                      : deckError}
                  </p>
                  <Button asChild className="mt-5 gap-2" size="sm">
                    <a href={getPptDownloadUrl(resource.id)} download={resource.originalFileName}>
                      <Download className="w-4 h-4" />
                      Download Presentation File
                    </a>
                  </Button>
                </div>
              ) : currentSlideSvg ? (
                <div
                  className="transition-transform duration-150 origin-center flex items-center justify-center shadow-2xl rounded-lg overflow-hidden bg-white"
                  style={{
                    transform: `scale(${zoomLevel / 100})`,
                    maxWidth: "100%",
                    maxHeight: "100%",
                  }}
                  dangerouslySetInnerHTML={{ __html: currentSlideSvg }}
                />
              ) : (
                <div className="text-center text-slate-400 text-sm">No slide visual available</div>
              )}

              {/* Navigation overlay arrows on canvas */}
              {slideCount > 1 && !deckLoading && !deckError && !isLegacyPpt && (
                <>
                  <button
                    type="button"
                    onClick={prevSlide}
                    disabled={currentSlide === 0}
                    aria-label="Previous Slide"
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/60 hover:bg-slate-900 text-white disabled:opacity-20 disabled:pointer-events-none transition-all backdrop-blur-xs border border-white/10 shadow-lg"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={nextSlide}
                    disabled={currentSlide === slideCount - 1}
                    aria-label="Next Slide"
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/60 hover:bg-slate-900 text-white disabled:opacity-20 disabled:pointer-events-none transition-all backdrop-blur-xs border border-white/10 shadow-lg"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Bottom Controls Bar */}
            {slideCount > 1 && !deckLoading && !deckError && !isLegacyPpt && (
              <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-t border-white/10 z-20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={prevSlide}
                  disabled={currentSlide === 0}
                  className="gap-1.5 text-xs text-slate-300 hover:text-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>

                {/* Slide indicator dots / quick jumper */}
                <div className="flex items-center gap-1.5 overflow-x-auto max-w-[50%] px-2 scrollbar-none">
                  {Array.from({ length: Math.min(slideCount, 25) }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => goToSlide(i)}
                      className={`h-2 rounded-full transition-all ${
                        currentSlide === i ? "w-6 bg-primary" : "w-2 bg-slate-600 hover:bg-slate-400"
                      }`}
                      title={`Go to slide ${i + 1}`}
                    />
                  ))}
                  {slideCount > 25 && (
                    <span className="text-[10px] text-slate-500 font-mono">+{slideCount - 25}</span>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={nextSlide}
                  disabled={currentSlide === slideCount - 1}
                  className="gap-1.5 text-xs text-slate-300 hover:text-white"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right Stage: Presentation Metadata & Instructor Card */}
        <aside className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
          {/* Metadata Card */}
          <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs font-semibold">
                  {resource.topic.name}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {resource.subtopic.name}
                </Badge>
              </div>
              <h2 className="text-xl font-bold font-display text-foreground leading-snug">{resource.title}</h2>
            </div>

            {resource.description && (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {resource.description}
              </p>
            )}

            {/* Quick Specs */}
            <div className="pt-3 border-t border-border/50 space-y-2 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-primary" /> Format
                </span>
                <span className="font-medium text-foreground uppercase">
                  {resource.originalFileName.split(".").pop()}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" /> Slides
                </span>
                <span className="font-medium text-foreground">{slideCount || resource.slideCount || "—"}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-primary" /> Total Downloads
                </span>
                <span className="font-medium text-foreground">{resource.downloadCount}</span>
              </div>
              {resource.academicLevel && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-primary" /> Academic Level
                  </span>
                  <span className="font-medium text-foreground">{resource.academicLevel}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" /> Published
                </span>
                <span className="font-medium text-foreground">
                  {new Date(resource.publishedAt || resource.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Tags */}
            {resource.tags && resource.tags.length > 0 && (
              <div className="pt-3 border-t border-border/50">
                <span className="text-xs font-semibold text-muted-foreground mb-2 block">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {resource.tags.map((tag, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-md bg-muted text-muted-foreground">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Instructor Profile Card */}
          <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3">
            <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">
              Instructor
            </span>
            <div className="flex items-center gap-3">
              <UnifiedAvatar user={resource.instructor as any} size="md" />
              <div>
                <h4 className="font-semibold text-sm text-foreground">
                  {resource.instructor.firstName} {resource.instructor.lastName}
                </h4>
                {resource.instructor.designation && (
                  <p className="text-xs text-muted-foreground">{resource.instructor.designation}</p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

