import { useParams, Link } from "react-router-dom";
import { useState, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ZoomIn, ZoomOut, Download, Printer, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MANUAL_TITLES: Record<string, string> = {
  student: "Student Manual",
  instructor: "Instructor Manual",
  admin: "Admin Manual",
};

export function HelpPdfPage() {
  const { manual = "student" } = useParams();
  const pdfUrl = apiUrl(`/api/docs/pdf/${manual}`);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [search, setSearch] = useState("");
  const [thumbsOpen, setThumbsOpen] = useState(true);

  const title = MANUAL_TITLES[manual] || `${manual} Manual`;

  const onLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setPage(1);
  }, []);

  const pageNumbers = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);

  const goToSearch = () => {
    const q = search.trim();
    if (!q) return;
    window.open(`${pdfUrl}#search=${encodeURIComponent(q)}`, "_blank");
  };

  return (
    <div className="w-full min-w-0 w-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <Link to={`/help/${manual}`} className="text-sm text-primary hover:underline">View online version</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9 w-40"
              placeholder="Search PDF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goToSearch()}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(50, z - 10))}><ZoomOut className="w-4 h-4" /></Button>
          <span className="text-sm self-center w-12 text-center">{zoom}%</span>
          <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(200, z + 10))}><ZoomIn className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" asChild>
            <a href={pdfUrl} download><Download className="w-4 h-4" /></a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" className="hidden sm:inline" onClick={() => setThumbsOpen((v) => !v)}>
            {thumbsOpen ? "Hide" : "Show"} thumbnails
          </Button>
        </div>
      </div>

      <Document
        file={pdfUrl}
        onLoadSuccess={onLoadSuccess}
        loading={<p className="text-sm text-muted-foreground p-8 border border-border rounded-lg">Generating PDF…</p>}
        error={<p className="text-sm text-destructive p-8 border border-border rounded-lg">Failed to load PDF. Ensure the backend is running.</p>}
      >
        <div className="flex gap-4 border border-border rounded-lg overflow-hidden bg-muted/20" style={{ minHeight: "75vh" }}>
          {thumbsOpen && numPages > 0 && (
            <aside className="w-32 shrink-0 border-r border-border bg-background overflow-y-auto p-2 space-y-2 hidden md:block max-h-[75vh]">
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={cn(
                    "w-full rounded border overflow-hidden transition-colors",
                    page === n ? "border-primary ring-2 ring-primary/30" : "border-border hover:bg-muted",
                  )}
                >
                  <Page pageNumber={n} width={100} renderTextLayer={false} renderAnnotationLayer={false} />
                </button>
              ))}
            </aside>
          )}

          <div className="flex-1 overflow-auto p-4 flex justify-center">
            <Page
              pageNumber={page}
              scale={zoom / 100}
              renderTextLayer
              renderAnnotationLayer
              className="shadow-lg"
            />
          </div>
        </div>
      </Document>

      <div className="flex justify-center items-center gap-2 mt-4">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm">Page {page} of {numPages || "—"}</span>
        <Button variant="ghost" size="sm" disabled={page >= numPages} onClick={() => setPage((p) => Math.min(numPages, p + 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
