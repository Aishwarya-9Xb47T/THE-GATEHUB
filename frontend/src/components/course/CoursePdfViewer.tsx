import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  Download,
  Printer,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface CoursePdfViewerProps {
  url: string;
  title?: string;
  className?: string;
}

function getAuthToken(): string | null {
  return (
    localStorage.getItem("lms_token") ||
    (() => {
      try {
        const raw = localStorage.getItem("lms-auth");
        if (raw) return JSON.parse(raw)?.state?.token || null;
      } catch {
        /* ignore */
      }
      return null;
    })()
  );
}

export function CoursePdfViewer({ url, title = "Course notes", className }: CoursePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [useIframeFallback, setUseIframeFallback] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    async function loadPdf() {
      setIsLoading(true);
      setLoadError(null);
      setRenderError(null);
      setPdfData(null);
      setBlobUrl(null);
      setNumPages(0);
      setUseIframeFallback(false);

      try {
        const token = getAuthToken();
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) {
          const msg =
            res.status === 404
              ? "PDF not found — compile notes in the lecture editor first."
              : res.status === 403
                ? "You do not have access to this PDF."
                : `Failed to load PDF (${res.status})`;
          throw new Error(msg);
        }

        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        if (buffer.byteLength < 128) {
          throw new Error("PDF file is empty or invalid.");
        }

        const header = new TextDecoder().decode(new Uint8Array(buffer).slice(0, 8));
        if (!header.startsWith("%PDF")) {
          throw new Error("Invalid PDF file received from server.");
        }

        const data = new Uint8Array(buffer);
        const blob = new Blob([data], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        revoked = objectUrl;
        setPdfData(data);
        setBlobUrl(objectUrl);
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load PDF");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateWidth = () => {
      const w = el.clientWidth || window.innerWidth;
      setPageWidth(Math.max(w - 16, 280));
    };

    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    window.addEventListener("resize", updateWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [pdfData, useIframeFallback]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const onDocumentLoad = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setRenderError(null);
  }, []);

  const onDocumentError = useCallback((error: Error) => {
    console.error("PDF render error:", error);
    setRenderError(error.message);
    setUseIframeFallback(true);
  }, []);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${title.replace(/[^a-zA-Z0-9-_]+/g, "_") || "notes"}.pdf`;
    a.click();
  };

  const effectiveWidth = pageWidth || Math.max(window.innerWidth - 16, 280);

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col h-full min-h-0 w-full bg-slate-950",
        isFullscreen && "fixed inset-0 z-[200]",
        className
      )}
    >
      <div className="shrink-0 flex items-center gap-1.5 border-b border-white/10 bg-black/80 backdrop-blur px-2 py-1.5 sm:px-3 sm:py-2 z-10">
        <p className="text-[11px] sm:text-xs font-medium text-white/70 truncate flex-1 min-w-0">
          {title}
        </p>
        {numPages > 0 && !useIframeFallback && (
          <span className="text-[10px] sm:text-xs text-white/70 tabular-nums shrink-0">
            {numPages} {numPages === 1 ? "page" : "pages"}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-white/80 hover:text-white hover:bg-white/10"
          onClick={handleDownload}
          disabled={!blobUrl}
        >
          <Download className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-white/80 hover:text-white hover:bg-white/10 hidden sm:flex"
          onClick={() => window.print()}
          disabled={!blobUrl}
        >
          <Printer className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-white/80 hover:text-white hover:bg-white/10"
          onClick={() => void toggleFullscreen()}
          disabled={!blobUrl}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 relative overflow-auto bg-slate-950">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground z-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Loading {title}…</p>
          </div>
        )}

        {loadError && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-destructive px-6 text-center">
            <AlertCircle className="w-10 h-10" />
            <p className="text-sm font-medium">{loadError}</p>
          </div>
        )}

        {!isLoading && !loadError && blobUrl && useIframeFallback && (
          <iframe
            src={`${blobUrl}#view=FitH`}
            title={title}
            className="absolute inset-0 w-full h-full border-0 bg-white"
          />
        )}

        {!isLoading && !loadError && pdfData && !useIframeFallback && (
          <Document
            file={{ data: pdfData }}
            onLoadSuccess={onDocumentLoad}
            onLoadError={onDocumentError}
            loading={
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Rendering PDF…</p>
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
                <AlertCircle className="w-10 h-10 text-destructive" />
                <p className="text-sm text-destructive">Failed to render PDF.</p>
                {renderError && <p className="text-xs text-muted-foreground">{renderError}</p>}
              </div>
            }
            className="w-full"
          >
            {numPages > 0 && (
              <div className="flex flex-col items-center gap-2 py-1 px-1 sm:py-2 sm:px-2 min-h-full">
                {Array.from({ length: numPages }, (_, index) => (
                  <Page
                    key={`page-${index + 1}`}
                    pageNumber={index + 1}
                    width={effectiveWidth}
                    renderTextLayer
                    renderAnnotationLayer
                    className="shadow-2xl bg-white max-w-full"
                  />
                ))}
              </div>
            )}
          </Document>
        )}
      </div>
    </div>
  );
}
