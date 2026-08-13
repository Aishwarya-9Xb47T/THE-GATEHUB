import {
  FileDown,
  RefreshCw,
  AlertCircle,
  Loader2,
  FileText,
  Terminal,
  Settings,
  Code,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo, useState, useEffect } from "react";
import type { CompileReport, EditorSettings, LatexCompileError } from "./types";
import { CompileErrorPanel } from "./CompileErrorPanel";
import { withUploadAuth } from "@/lib/courseMediaUrls";

type Tab = "student" | "pdf" | "errors" | "logs" | "generated-tex" | "commands" | "output-directory" | "debugger";
type PreviewLoadState = "idle" | "loading" | "loaded" | "error";

interface PdfPreviewProps {
  pdfUrl: string | null;
  pdfCacheBust?: number;
  logs: string | null;
  errors?: LatexCompileError[];
  isCompiling: boolean;
  compileStatus?: string;
  onRefresh: () => void;
  generatedTex?: string | null;
  compileCommands?: string[];
  outputDirectory?: string | null;
  compileReport?: CompileReport | null;
  includeOrder?: string[];
  failedAtFile?: string | null;
  compilationTime?: number;
  settings: EditorSettings;
  onSettingsChange: (patch: Partial<EditorSettings>) => void;
  onGoToError?: (error: LatexCompileError) => void;
  onGoToErrorLine?: (line: number) => void;
  onAutoRepair?: (error: LatexCompileError) => void;
  repairing?: boolean;
  studentPreview?: React.ReactNode;
  defaultTab?: Tab;
}

export function PdfPreview({
  pdfUrl,
  pdfCacheBust = 0,
  logs,
  errors = [],
  isCompiling,
  compileStatus,
  onRefresh,
  generatedTex,
  compileCommands,
  outputDirectory,
  compileReport,
  includeOrder = [],
  failedAtFile,
  compilationTime,
  settings,
  onSettingsChange,
  onGoToError,
  onGoToErrorLine,
  onAutoRepair,
  repairing,
  studentPreview,
  defaultTab = studentPreview ? "student" : "pdf",
}: PdfPreviewProps) {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [page, setPage] = useState(1);
  const [previewState, setPreviewState] = useState<PreviewLoadState>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  const hasErrors = errors.length > 0;
  const failed = hasErrors || (logs && !pdfUrl && !isCompiling);
  const resolvedPdfUrl = useMemo(() => (pdfUrl ? withUploadAuth(pdfUrl) : null), [pdfUrl]);

  useEffect(() => {
    if (!resolvedPdfUrl) {
      setPreviewState("idle");
      setPreviewError(null);
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    setPreviewState("loading");
    setPreviewError(null);
    setPreviewBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    const fetchUrl = `${resolvedPdfUrl}${resolvedPdfUrl.includes("?") ? "&" : "?"}t=${pdfCacheBust}`;

    fetch(fetchUrl, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Preview failed: HTTP ${res.status}`);
        }
        const type = res.headers.get("content-type") || "";
        if (!type.includes("pdf")) {
          throw new Error(`Preview failed: expected application/pdf, got ${type || "unknown"}`);
        }
        const blob = await res.blob();
        if (blob.size < 128) {
          throw new Error(`Preview failed: PDF is empty (${blob.size} bytes)`);
        }
        const header = await blob.slice(0, 5).text();
        if (!header.startsWith("%PDF-")) {
          throw new Error("Preview failed: response is not a valid PDF file");
        }
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewBlobUrl(objectUrl);
        setPreviewState("loaded");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setPreviewState("error");
        setPreviewError(err.message || "Preview failed to load");
        setPreviewBlobUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resolvedPdfUrl, pdfCacheBust]);

  useEffect(() => {
    if (hasErrors && !isCompiling) {
      setActiveTab("errors");
    }
  }, [hasErrors, isCompiling]);

  const zoomScale = useMemo(() => {
    if (settings.pdfFitMode === "width") return 1;
    if (settings.pdfFitMode === "page") return 1;
    return settings.pdfZoom / 100;
  }, [settings.pdfFitMode, settings.pdfZoom]);

  const statusLabel =
    activeTab === "student"
      ? "Student preview"
      : compileStatus === "queued"
      ? "Queued..."
      : isCompiling
        ? "Compiling..."
        : hasErrors
          ? "Compile failed"
          : previewState === "loading"
            ? "Loading preview..."
            : previewState === "error"
              ? "Preview failed"
              : previewState === "loaded" && pdfUrl
                ? "PDF ready"
                : pdfUrl
                  ? "Preview pending"
                  : "No PDF";

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden relative border-l border-slate-800">
      <div className="flex items-center justify-between p-2 pl-4 border-b border-slate-800 bg-[#1e1e1e] shadow-sm z-10 w-full shrink-0 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-xs tracking-wider uppercase text-slate-400 shrink-0">Output</span>
          <span
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${
              hasErrors
                ? "bg-red-900/50 text-red-300"
                : isCompiling
                  ? "bg-amber-900/40 text-amber-200"
                  : previewState === "error"
                    ? "bg-red-900/50 text-red-300"
                    : previewState === "loaded" && pdfUrl
                      ? "bg-emerald-900/40 text-emerald-200"
                      : previewState === "loading"
                        ? "bg-amber-900/40 text-amber-200"
                        : "bg-slate-800 text-slate-400"
            }`}
          >
            {statusLabel}
          </span>

          <div className="flex gap-1 bg-slate-800 rounded-md p-0.5 overflow-x-auto">
            {studentPreview && (
              <TabButton
                active={activeTab === "student"}
                onClick={() => setActiveTab("student")}
                icon={<Eye className="w-3 h-3" />}
                label="Student"
              />
            )}
            <TabButton active={activeTab === "pdf"} onClick={() => setActiveTab("pdf")} icon={<FileText className="w-3 h-3" />} label="PDF" />
            {hasErrors && (
              <TabButton
                active={activeTab === "errors"}
                onClick={() => setActiveTab("errors")}
                icon={<AlertCircle className="w-3 h-3" />}
                label={`Errors (${errors.length})`}
                variant="error"
              />
            )}
            {(logs || hasErrors) && (
              <TabButton active={activeTab === "logs"} onClick={() => setActiveTab("logs")} icon={<Terminal className="w-3 h-3" />} label="Logs" />
            )}
            {generatedTex && (
              <TabButton active={activeTab === "generated-tex"} onClick={() => setActiveTab("generated-tex")} icon={<Code className="w-3 h-3" />} label="TeX" />
            )}
            {compileCommands && compileCommands.length > 0 && (
              <TabButton active={activeTab === "commands"} onClick={() => setActiveTab("commands")} icon={<Terminal className="w-3 h-3" />} label="Cmds" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {pdfUrl && activeTab === "pdf" && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-[10px] font-mono text-slate-500 w-8 text-center">p{page}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400"
                onClick={() => setPage((p) => p + 1)}
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <div className="w-px h-5 bg-slate-700 mx-1" />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400"
                onClick={() => onSettingsChange({ pdfFitMode: "width", pdfZoom: 100 })}
                title="Fit width"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400"
                onClick={() =>
                  onSettingsChange({
                    pdfFitMode: "custom",
                    pdfZoom: Math.max(50, settings.pdfZoom - 10),
                  })
                }
                title="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <span className="text-[10px] font-mono text-slate-500 w-8 text-center">
                {settings.pdfFitMode === "width" ? "Fit" : `${settings.pdfZoom}%`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400"
                onClick={() =>
                  onSettingsChange({
                    pdfFitMode: "custom",
                    pdfZoom: Math.min(200, settings.pdfZoom + 10),
                  })
                }
                title="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          {isCompiling && <Loader2 className="w-4 h-4 animate-spin text-primary mx-1" />}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className="h-8 w-8 text-slate-400 hover:text-slate-100"
            disabled={isCompiling}
            title="Recompile"
          >
            <RefreshCw className={`w-4 h-4 ${isCompiling ? "animate-spin" : ""}`} />
          </Button>
          {resolvedPdfUrl && (
            <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-blue-400">
              <a href={previewBlobUrl || `${resolvedPdfUrl}?t=${pdfCacheBust}`} download="compilation.pdf">
                <FileDown className="w-4 h-4" />
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === "student" && studentPreview && (
          <div className="flex-1 overflow-hidden bg-background text-foreground">{studentPreview}</div>
        )}
        {activeTab === "pdf" && (
          <div className="flex-1 overflow-auto bg-[#525659] relative">
            {failed && !pdfUrl ? (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-red-900/30 bg-[#250d0d] flex items-center gap-3 shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <h2 className="text-sm font-bold text-red-200">Compilation failed</h2>
                    <p className="text-xs text-red-400/70">See errors below for line numbers and suggested fixes</p>
                  </div>
                </div>
                <CompileErrorPanel
                  errors={errors}
                  onGoToError={onGoToError}
                  onGoToLine={onGoToErrorLine}
                  onAutoRepair={onAutoRepair}
                  repairing={repairing}
                />
              </div>
            ) : isCompiling && !pdfUrl ? (
              <div className="absolute inset-0 flex flex-col gap-4 items-center justify-center text-slate-300">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm tracking-widest uppercase font-semibold">Compiling...</p>
              </div>
            ) : previewState === "error" && pdfUrl ? (
              <div className="absolute inset-0 flex flex-col gap-3 items-center justify-center text-red-300 px-6 text-center">
                <AlertCircle className="w-10 h-10" />
                <h3 className="font-bold">Preview failed</h3>
                <p className="text-sm text-red-400/80">{previewError || "Could not load the compiled PDF."}</p>
                <Button variant="outline" size="sm" onClick={onRefresh} className="mt-2 border-red-800 text-red-200">
                  Recompile
                </Button>
              </div>
            ) : previewState === "loading" && pdfUrl ? (
              <div className="absolute inset-0 flex flex-col gap-4 items-center justify-center text-slate-300">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm tracking-widest uppercase font-semibold">Loading preview...</p>
              </div>
            ) : previewBlobUrl && previewState === "loaded" ? (
              <div
                className="min-h-full flex justify-center p-4"
                style={{
                  transform: settings.pdfFitMode === "custom" ? `scale(${zoomScale})` : undefined,
                  transformOrigin: "top center",
                }}
              >
                <iframe
                  key={previewBlobUrl}
                  src={previewBlobUrl}
                  className="bg-white shadow-2xl border-none"
                  style={{
                    width: settings.pdfFitMode === "width" ? "100%" : "816px",
                    height: settings.pdfFitMode === "page" ? "100%" : "1056px",
                    minHeight: "70vh",
                  }}
                  title="PDF output"
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col gap-3 items-center justify-center text-slate-500 select-none">
                <RefreshCw className="w-12 h-12 mb-2 text-slate-600" />
                <h3 className="font-bold tracking-wider">No PDF yet</h3>
                <p className="text-sm text-center max-w-[240px]">Click Compile or enable Auto Compile in settings.</p>
                <Button variant="outline" size="sm" onClick={onRefresh} className="mt-4 border-slate-600 text-slate-300">
                  Compile Now
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === "errors" && (
          <CompileErrorPanel
            errors={errors}
            onGoToError={onGoToError}
            onGoToLine={onGoToErrorLine}
            onAutoRepair={onAutoRepair}
            repairing={repairing}
          />
        )}

        {activeTab === "logs" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <CompileStructuredLog
              compileReport={compileReport}
              errors={errors}
              logs={logs}
              includeOrder={includeOrder}
              failedAtFile={failedAtFile}
              compilationTime={compilationTime}
              compileCommands={compileCommands}
              isCompiling={isCompiling}
              onGoToError={onGoToError}
            />
          </div>
        )}

        {activeTab === "generated-tex" && generatedTex && (
          <div className="flex-1 p-4 overflow-auto">
            <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">{generatedTex}</pre>
          </div>
        )}

        {activeTab === "commands" && compileCommands && (
          <div className="flex-1 p-4 overflow-auto space-y-2">
            {compileCommands.map((cmd, idx) => (
              <pre key={idx} className="bg-slate-800 p-3 rounded text-xs font-mono text-slate-300 border border-slate-700">
                {cmd}
              </pre>
            ))}
          </div>
        )}

        {activeTab === "output-directory" && outputDirectory && (
          <div className="flex-1 p-4 overflow-auto">
            <pre className="bg-slate-800 p-3 rounded text-xs font-mono text-slate-300">{outputDirectory}</pre>
          </div>
        )}

        {activeTab === "pdf" && pdfUrl && hasErrors && (
          <CompileErrorPanel
            errors={errors}
            onGoToError={onGoToError}
            onGoToLine={onGoToErrorLine}
            onAutoRepair={onAutoRepair}
            repairing={repairing}
          />
        )}
      </div>
    </div>
  );
}

function CompileStructuredLog({
  compileReport,
  errors,
  logs,
  includeOrder,
  failedAtFile,
  compilationTime,
  compileCommands,
  isCompiling,
  onGoToError,
}: {
  compileReport?: CompileReport | null;
  errors: LatexCompileError[];
  logs: string | null;
  includeOrder?: string[];
  failedAtFile?: string | null;
  compilationTime?: number;
  compileCommands?: string[];
  isCompiling: boolean;
  onGoToError?: (error: LatexCompileError) => void;
}) {
  const primary = compileReport?.primaryError ?? errors[0];
  const stages = compileReport?.stages ?? [];
  const order = includeOrder?.length ? includeOrder : compileReport?.includeOrder ?? [];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 p-4 border-b border-slate-800 space-y-3">
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Compilation</div>
        <div className="space-y-1 text-xs">
          <div className="text-slate-300">Compilation started</div>
          {stages.map((stage) => (
            <div key={stage.name} className="flex items-center gap-2 text-slate-300">
              <span className={stage.ok ? "text-emerald-400" : "text-red-400"}>{stage.ok ? "✓" : "✗"}</span>
              <span>{stage.name}</span>
            </div>
          ))}
          {isCompiling && <div className="text-amber-300 animate-pulse">Compiling…</div>}
          {!isCompiling && compilationTime != null && (
            <div className="text-slate-500">Finished in {compilationTime}ms</div>
          )}
        </div>

        {primary && (
          <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-red-400">Error</div>
            {primary.file && (
              <div className="text-xs">
                <span className="text-slate-500">File: </span>
                <button
                  type="button"
                  className="font-mono text-red-200 hover:underline"
                  onClick={() =>
                    onGoToError?.({
                      message: primary.message ?? "",
                      line: primary.line ?? null,
                      file: primary.file,
                    })
                  }
                >
                  {primary.file.replace(/^\//, "")}
                </button>
              </div>
            )}
            {primary.line != null && (
              <div className="text-xs">
                <span className="text-slate-500">Line: </span>
                <span className="font-mono text-red-200">{primary.line}</span>
              </div>
            )}
            {primary.category && (
              <div className="text-xs">
                <span className="text-slate-500">Category: </span>
                <span className="text-red-200">{primary.type ?? primary.category}</span>
              </div>
            )}
            {primary.message && (
              <div className="text-xs">
                <span className="text-slate-500">Message: </span>
                <span className="text-red-100">{primary.message}</span>
              </div>
            )}
            {primary.suggestedFix && (
              <div className="text-xs text-amber-200/80">{primary.suggestedFix}</div>
            )}
            {primary.autoRepairAvailable && (
              <div className="text-[10px] font-semibold uppercase text-emerald-400">Auto fix: available</div>
            )}
          </div>
        )}

        {failedAtFile && (
          <div className="text-xs text-slate-500">
            Failed while processing: <span className="font-mono text-slate-400">{failedAtFile.replace(/^\//, "")}</span>
          </div>
        )}

        {compileCommands && compileCommands.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-200">Compiler command</summary>
            <pre className="mt-2 bg-slate-800 p-2 rounded font-mono text-[10px] text-slate-300 overflow-x-auto">
              {compileCommands[0]}
            </pre>
          </details>
        )}

        {order.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
              Include order ({order.length} files)
            </summary>
            <ol className="mt-2 space-y-0.5 font-mono text-[10px] text-slate-400 max-h-32 overflow-auto">
              {order.map((f) => (
                <li key={f}>{f.replace(/^\//, "")}</li>
              ))}
            </ol>
          </details>
        )}
      </div>

      <div className="flex-1 p-4 overflow-auto min-h-0">
        <div className="mb-2 text-xs text-slate-500 font-semibold uppercase">Raw compiler log</div>
        <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed">
          {logs || "No logs available."}
        </pre>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  variant?: "error";
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`text-xs px-2 py-1 h-7 whitespace-nowrap ${
        active
          ? variant === "error"
            ? "bg-red-900/60 text-red-100"
            : "bg-slate-700 text-white"
          : "text-slate-400 hover:text-slate-100"
      }`}
      onClick={onClick}
    >
      <span className="mr-1">{icon}</span>
      {label}
    </Button>
  );
}
