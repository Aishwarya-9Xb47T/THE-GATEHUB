import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  BookOpen,
  Loader2,
  Columns,
  List,
} from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

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

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export function PptViewerPage() {
  const { pptId } = useParams<{ pptId: string }>();
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);

  const [resource, setResource] = useState<PPTResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deck State for PPT/PPTX
  const [slideCount, setSlideCount] = useState<number>(0);
  const [currentSlide, setCurrentSlide] = useState<number>(0); // 0-indexed
  const [currentSlideSvg, setCurrentSlideSvg] = useState<string | null>(null);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [isLegacyPpt, setIsLegacyPpt] = useState(false);

  // PDF-specific state
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number>(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState<number>(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfViewMode, setPdfViewMode] = useState<"single" | "continuous">("single");

  // Viewer display state
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(900);

  const containerRef = useRef<HTMLDivElement>(null);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);

  const isPdf = useMemo(() => {
    return (
      resource?.fileType === "pdf" ||
      Boolean(resource?.originalFileName?.toLowerCase().endsWith(".pdf"))
    );
  }, [resource]);

  // Synchronize Fullscreen state with browser Fullscreen API
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Track responsive container width for PDF rendering
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (containerRef.current) {
        setViewportWidth(containerRef.current.clientWidth || 900);
      }
    };

    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    window.addEventListener("resize", updateWidth);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [isFullscreen]);

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
        console.error("Failed to load material details:", err);
        setError(err.message || "Material not found or access denied");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [pptId]);

  // 2. Load Presentation into pptx-svg (only for PPT/PPTX)
  useEffect(() => {
    if (!resource || isLegacyPpt || isPdf) return;

    let active = true;
    setDeckLoading(true);
    setDeckError(null);

    async function loadDeck() {
      try {
        const previewUrl = getPptPreviewUrl(resource!.id);
        const token = localStorage.getItem("token") || localStorage.getItem("lms_token");
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
              "Browser slide preview is not available for this presentation. You can download the file below."
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
  }, [resource, isLegacyPpt, isPdf]);

  // 3. Load PDF directly into memory as Uint8Array for native react-pdf rendering
  useEffect(() => {
    if (!resource || !isPdf) return;

    let active = true;
    let createdUrl: string | null = null;
    setPdfLoading(true);
    setPdfError(null);

    async function loadPdf() {
      try {
        const previewUrl = getPptPreviewUrl(resource!.id);
        const token = localStorage.getItem("token") || localStorage.getItem("lms_token");
        const headers: HeadersInit = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(previewUrl, { headers });
        if (!res.ok) throw new Error(`Could not load PDF document (HTTP ${res.status})`);

        const buffer = await res.arrayBuffer();
        if (!active) return;

        if (buffer.byteLength < 64) {
          throw new Error("Received PDF data is empty or incomplete.");
        }

        const data = new Uint8Array(buffer);
        const blob = new Blob([data], { type: "application/pdf" });
        createdUrl = URL.createObjectURL(blob);

        setPdfData(data);
        setPdfBlobUrl(createdUrl);
        setPdfCurrentPage(1);
      } catch (err: any) {
        console.error("[PDF_VIEWER] PDF fetch error:", err);
        if (active) {
          setPdfError(err.message || "Failed to load PDF document.");
        }
      } finally {
        if (active) setPdfLoading(false);
      }
    }

    loadPdf();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [resource, isPdf]);

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

  // PDF Page Navigation
  const goToPdfPage = (page: number) => {
    if (page < 1 || page > pdfNumPages) return;
    setPdfCurrentPage(page);
    if (pdfViewMode === "continuous" && pdfScrollRef.current) {
      const pageEl = pdfScrollRef.current.querySelector(`[data-page-number="${page}"]`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const nextPdfPage = () => {
    if (pdfCurrentPage < pdfNumPages) {
      goToPdfPage(pdfCurrentPage + 1);
    }
  };

  const prevPdfPage = () => {
    if (pdfCurrentPage > 1) {
      goToPdfPage(pdfCurrentPage - 1);
    }
  };

  // Keyboard navigation for presentation slides & PDF
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPdf) {
        if (e.key === "ArrowRight" || e.key === "PageDown") {
          e.preventDefault();
          nextPdfPage();
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          prevPdfPage();
        } else if (e.key === "Escape" && isFullscreen) {
          exitFullscreen();
        }
      } else {
        if (e.key === "ArrowRight" || e.key === "Space") {
          e.preventDefault();
          nextSlide();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          prevSlide();
        } else if (e.key === "Escape" && isFullscreen) {
          exitFullscreen();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide, slideCount, pdfCurrentPage, pdfNumPages, isFullscreen, isPdf]);

  // Fullscreen controls
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {
          setIsFullscreen(true);
        });
      } else {
        setIsFullscreen(true);
      }
    } else {
      exitFullscreen();
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {
        setIsFullscreen(false);
      });
    } else {
      setIsFullscreen(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    toast({ title: "Link Copied!", description: "Shareable link copied to clipboard." });
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <BookOpen className="w-10 h-10 text-primary animate-pulse mb-3" />
        <p className="text-sm text-muted-foreground font-medium">Loading study material…</p>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 text-destructive mb-3" />
        <h2 className="text-xl font-bold font-display text-foreground">Material Unavailable</h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {error || "The requested study material does not exist or has been removed."}
        </p>
        <Button onClick={() => navigate("/ppt-library")} className="mt-6 gap-2" variant="outline">
          <ArrowLeft className="w-4 h-4" />
          Back to Study Materials
        </Button>
      </div>
    );
  }

  // Calculate dynamic PDF page width for single and continuous modes
  const effectivePdfWidth = Math.min(
    Math.max(280, (viewportWidth - (isFullscreen ? 64 : 48)) * (zoomLevel / 100)),
    isFullscreen ? 1600 : 1200
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Header & Breadcrumbs (hidden during Fullscreen) */}
      {!isFullscreen && (
        <header className="border-b border-border/60 bg-card/50 backdrop-blur-md px-4 sm:px-6 py-3 sticky top-0 z-30">
          <div className="app-workspace max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/ppt-library")}
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                title="Back to Study Materials"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Link to="/ppt-library" className="hover:text-foreground">
                    Study Materials
                  </Link>
                  <span>/</span>
                  <span className="truncate">{resource.topic.name}</span>
                  <span>/</span>
                  <span className="truncate font-medium text-foreground">{resource.subtopic.name}</span>
                </div>
                <h1 className="text-sm sm:text-base font-semibold text-foreground truncate mt-0.5">
                  {resource.title}
                </h1>
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
      )}

      {/* Main Presentation / Document Stage */}
      <main
        className={`flex-1 flex flex-col lg:flex-row app-workspace max-w-7xl mx-auto w-full p-4 sm:p-6 gap-6 ${
          isFullscreen ? "!max-w-none !p-0 !m-0 !gap-0 !fixed !inset-0 !z-50 !h-screen !w-screen !bg-slate-950" : ""
        }`}
      >
        {/* Left / Center Stage: Slide Viewer Canvas or Native PDF Viewer */}
        <div className={`flex-1 flex flex-col ${isFullscreen ? "h-full w-full" : ""}`}>
          <div
            ref={containerRef}
            className={`relative flex flex-col justify-between rounded-2xl border border-border bg-slate-950 text-white overflow-hidden shadow-xl transition-all ${
              isFullscreen
                ? "!fixed !inset-0 !z-50 !rounded-none !border-none !h-screen !w-screen !bg-slate-950"
                : "min-h-[500px] md:min-h-[640px]"
            }`}
          >
            {isPdf ? (
              /* ======================================================= */
              /* Dedicated High-Performance PDF Viewer via react-pdf     */
              /* ======================================================= */
              <div className="w-full h-full flex flex-col flex-1">
                {/* PDF Viewer Action Bar */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 backdrop-blur-md border-b border-white/10 z-20 shrink-0">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <Badge className="font-mono text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      PDF DOCUMENT
                    </Badge>
                    {pdfNumPages > 0 && (
                      <span className="font-mono text-xs text-slate-300">
                        Page {pdfCurrentPage} of {pdfNumPages}
                      </span>
                    )}
                  </div>

                  {/* Zoom, Mode & Fullscreen Controls */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {/* View mode toggle (Single Page vs Continuous Scroll) */}
                    <div className="hidden sm:flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-white/10 mr-1">
                      <button
                        type="button"
                        onClick={() => setPdfViewMode("single")}
                        className={`px-2 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1 ${
                          pdfViewMode === "single" ? "bg-primary text-white shadow-xs" : "text-slate-400 hover:text-white"
                        }`}
                        title="Single Page with Arrow Navigation"
                      >
                        <Columns className="w-3 h-3" />
                        Single
                      </button>
                      <button
                        type="button"
                        onClick={() => setPdfViewMode("continuous")}
                        className={`px-2 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1 ${
                          pdfViewMode === "continuous" ? "bg-primary text-white shadow-xs" : "text-slate-400 hover:text-white"
                        }`}
                        title="Continuous Scroll through all pages"
                      >
                        <List className="w-3 h-3" />
                        Scroll
                      </button>
                    </div>

                    {/* Zoom Controls */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-300 hover:text-white hover:bg-white/10"
                      onClick={() => setZoomLevel((z) => Math.max(60, z - 15))}
                      title="Zoom Out"
                      disabled={pdfLoading || Boolean(pdfError)}
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
                      disabled={pdfLoading || Boolean(pdfError)}
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-300 hover:text-white hover:bg-white/10"
                      onClick={() => setZoomLevel(100)}
                      title="Reset Zoom"
                      disabled={pdfLoading || Boolean(pdfError)}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>

                    <div className="h-4 w-px bg-white/20 mx-1 hidden sm:block" />

                    {/* Fullscreen Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-slate-300 hover:text-white hover:bg-white/10 gap-1.5"
                      onClick={toggleFullscreen}
                      title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}
                    >
                      {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{isFullscreen ? "Exit" : "Fullscreen"}</span>
                    </Button>

                    {/* Download Button */}
                    <Button size="sm" asChild className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white gap-1.5">
                      <a href={getPptDownloadUrl(resource.id)} download={resource.originalFileName}>
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Download PDF</span>
                      </a>
                    </Button>
                  </div>
                </div>

                {/* PDF Stage Area */}
                <div
                  ref={pdfScrollRef}
                  className={`relative flex-1 w-full bg-slate-950 flex flex-col items-center overflow-auto select-text scrollbar-thin ${
                    isFullscreen ? "h-[calc(100vh-45px)]" : "h-[580px] md:h-[680px]"
                  }`}
                >
                  {pdfLoading && (
                    <div className="flex flex-col items-center justify-center text-center p-12 my-auto">
                      <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
                      <p className="text-sm text-slate-300 font-medium">Loading and rendering PDF…</p>
                      <span className="text-xs text-slate-500 mt-1">Preserving original layout, images and typography</span>
                    </div>
                  )}

                  {pdfError && !pdfLoading && (
                    <div className="flex flex-col items-center justify-center text-center max-w-md p-8 my-auto bg-slate-900/60 rounded-xl border border-white/10">
                      <AlertCircle className="w-10 h-10 text-destructive mb-3" />
                      <h4 className="text-base font-semibold text-white">PDF Preview Unavailable</h4>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">{pdfError}</p>
                      {pdfBlobUrl && (
                        <Button asChild size="sm" className="mt-4" variant="outline">
                          <a href={pdfBlobUrl} target="_blank" rel="noreferrer">
                            Open in New Tab
                          </a>
                        </Button>
                      )}
                    </div>
                  )}

                  {!pdfLoading && !pdfError && pdfData && (
                    <Document
                      file={{ data: pdfData }}
                      onLoadSuccess={({ numPages }) => {
                        setPdfNumPages(numPages);
                        setPdfCurrentPage(1);
                      }}
                      onLoadError={(err) => {
                        console.error("PDF load error:", err);
                        setPdfError(err.message || "Failed to render PDF pages");
                      }}
                      loading={
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          <p className="text-sm">Rendering PDF pages…</p>
                        </div>
                      }
                      className="w-full flex flex-col items-center"
                    >
                      {pdfViewMode === "single" ? (
                        /* Single Page Mode with proportional scaling and centering */
                        <div className="relative w-full flex-1 flex flex-col items-center justify-center py-6 px-4">
                          <div className="shadow-2xl rounded-xs overflow-hidden bg-white max-w-full">
                            <Page
                              pageNumber={pdfCurrentPage}
                              width={effectivePdfWidth}
                              renderTextLayer
                              renderAnnotationLayer
                              className="max-w-full"
                            />
                          </div>

                          {/* Left / Right Floating Navigation Arrows for Single Mode */}
                          {pdfNumPages > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={prevPdfPage}
                                disabled={pdfCurrentPage === 1}
                                aria-label="Previous Page"
                                className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white disabled:opacity-20 disabled:pointer-events-none transition-all backdrop-blur-xs border border-white/15 shadow-xl hover:scale-105 active:scale-95"
                              >
                                <ChevronLeft className="w-6 h-6" />
                              </button>
                              <button
                                type="button"
                                onClick={nextPdfPage}
                                disabled={pdfCurrentPage === pdfNumPages}
                                aria-label="Next Page"
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white disabled:opacity-20 disabled:pointer-events-none transition-all backdrop-blur-xs border border-white/15 shadow-xl hover:scale-105 active:scale-95"
                              >
                                <ChevronRight className="w-6 h-6" />
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        /* Continuous Scroll Mode with all pages stacked */
                        <div className="flex flex-col items-center gap-6 py-6 px-4 w-full">
                          {Array.from({ length: pdfNumPages }, (_, index) => (
                            <div
                              key={`pdf-page-${index + 1}`}
                              data-page-number={index + 1}
                              className="flex flex-col items-center"
                            >
                              <div className="shadow-2xl rounded-xs overflow-hidden bg-white max-w-full">
                                <Page
                                  pageNumber={index + 1}
                                  width={effectivePdfWidth}
                                  renderTextLayer
                                  renderAnnotationLayer
                                  className="max-w-full"
                                />
                              </div>
                              <span className="text-[11px] font-mono text-slate-400 mt-2">
                                Page {index + 1} of {pdfNumPages}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Document>
                  )}
                </div>
              </div>
            ) : (
              /* ======================================================= */
              /* PPT / PPTX Interactive Slide Viewer                     */
              /* ======================================================= */
              <>
                {/* Viewer Top Action Bar */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 backdrop-blur-md border-b border-white/10 z-20 shrink-0">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 font-mono text-[10px]">
                      {resource.originalFileName.endsWith(".pptx") ? "PPTX" : "PPT"}
                    </Badge>
                    {slideCount > 0 && (
                      <span className="font-mono text-xs text-slate-300">
                        Slide {currentSlide + 1} of {slideCount}
                      </span>
                    )}
                  </div>

                  {/* View Controls */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
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
                      <RotateCcw className="w-3 h-3" />
                    </Button>

                    <div className="h-4 w-px bg-white/20 mx-1 hidden sm:block" />

                    {/* Fullscreen Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-slate-300 hover:text-white hover:bg-white/10 gap-1.5"
                      onClick={toggleFullscreen}
                      title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}
                    >
                      {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{isFullscreen ? "Exit" : "Fullscreen"}</span>
                    </Button>

                    {/* Download Button */}
                    <Button size="sm" asChild className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
                      <a href={getPptDownloadUrl(resource.id)} download={resource.originalFileName}>
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Download</span>
                      </a>
                    </Button>
                  </div>
                </div>

                {/* Slide Stage Area */}
                <div className="relative flex-1 flex items-center justify-center p-4 md:p-8 overflow-auto select-none bg-slate-950">
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
                      <Button asChild size="sm" className="mt-4 gap-2" variant="outline">
                        <a href={getPptDownloadUrl(resource.id)} download={resource.originalFileName}>
                          <Download className="w-4 h-4" />
                          Download Presentation
                        </a>
                      </Button>
                    </div>
                  ) : (
                    /* Active Rendered Slide SVG */
                    <div
                      className="transition-transform duration-200 ease-out origin-center flex items-center justify-center max-w-full max-h-full"
                      style={{ transform: `scale(${zoomLevel / 100})` }}
                    >
                      {currentSlideSvg ? (
                        <div
                          className="bg-white rounded-lg shadow-2xl overflow-hidden max-w-full max-h-full [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:block"
                          dangerouslySetInnerHTML={{ __html: currentSlideSvg }}
                        />
                      ) : (
                        <div className="text-sm text-slate-400">No slide content rendered.</div>
                      )}
                    </div>
                  )}

                  {/* Left / Right Floating Navigation Arrows on Stage */}
                  {slideCount > 1 && !deckLoading && !deckError && !isLegacyPpt && (
                    <>
                      <button
                        type="button"
                        onClick={prevSlide}
                        disabled={currentSlide === 0}
                        aria-label="Previous Slide"
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white disabled:opacity-20 disabled:pointer-events-none transition-all backdrop-blur-xs border border-white/15 shadow-xl hover:scale-105 active:scale-95"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>

                      <button
                        type="button"
                        onClick={nextSlide}
                        disabled={currentSlide === slideCount - 1}
                        aria-label="Next Slide"
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white disabled:opacity-20 disabled:pointer-events-none transition-all backdrop-blur-xs border border-white/15 shadow-xl hover:scale-105 active:scale-95"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                    </>
                  )}
                </div>

                {/* Bottom Controls Bar: Slide progress indicators only — NO duplicate Previous/Next text */}
                {slideCount > 1 && !deckLoading && !deckError && !isLegacyPpt && (
                  <div className="flex items-center justify-center px-4 py-2.5 bg-slate-900/90 border-t border-white/10 z-20 shrink-0">
                    <div className="flex items-center gap-1.5 overflow-x-auto max-w-[80%] px-2 scrollbar-none py-1">
                      {Array.from({ length: Math.min(slideCount, 30) }).map((_, i) => (
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
                      {slideCount > 30 && (
                        <span className="text-[10px] text-slate-500 pl-1 font-mono">
                          +{slideCount - 30} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Side: Document Details & Metadata Panel (hidden during Fullscreen) */}
        {!isFullscreen && (
          <aside className="w-full lg:w-80 shrink-0 space-y-4">
            {/* Quick Metadata Card */}
            <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {resource.topic.name}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {resource.subtopic.name}
                </Badge>
              </div>

              <div>
                <h3 className="text-lg font-bold font-display text-foreground leading-snug">
                  {resource.title}
                </h3>
                {resource.description && (
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    {resource.description}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-border space-y-2.5 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Format
                  </span>
                  <span className="font-semibold text-foreground uppercase">{resource.fileType || "PPTX"}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    {isPdf ? "Pages" : "Slides"}
                  </span>
                  <span className="font-semibold text-foreground">
                    {isPdf ? (resource.pageCount || pdfNumPages || 1) : (resource.slideCount || slideCount || 1)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    Total Downloads
                  </span>
                  <span className="font-semibold text-foreground">{resource.downloadCount}</span>
                </div>

                {resource.academicLevel && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      Academic Level
                    </span>
                    <span className="font-semibold text-foreground">{resource.academicLevel}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Published
                  </span>
                  <span className="font-semibold text-foreground">
                    {new Date(resource.publishedAt || resource.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {resource.tags && resource.tags.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <span className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                    Tags & Keywords
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {resource.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-[10px]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Instructor Card */}
            <div className="p-4 rounded-2xl border border-border bg-card shadow-xs">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase block mb-3">
                Instructor
              </span>
              <div className="flex items-center gap-3">
                <UnifiedAvatar
                  user={resource.instructor as any}
                  size="md"
                  className="w-10 h-10 border border-border"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {resource.instructor.firstName} {resource.instructor.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {resource.instructor.designation || "Instructor at THE GATEHUB"}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
