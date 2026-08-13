import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { hashSnapshotPayload } from "@/lib/luAuthoring/projectSnapshot";
import type { CompileReport, CompileStatus, EditorSettings, LatexCompileError, LatexCompileResult } from "../types";

interface UseLatexCompileOptions {
  projectId: string;
  settings: EditorSettings;
  onSaveBeforeCompile?: () => Promise<void>;
  getCompileCode?: () => Promise<string | undefined>;
  getCompileFiles?: () => Promise<Array<{ name: string; content: string }> | undefined>;
  getSnapshotHash?: () => Promise<string | undefined>;
  getMainFileName?: () => string | undefined;
  getActiveFilePath?: () => string | undefined;
}

export function useLatexCompile({
  projectId,
  settings,
  onSaveBeforeCompile,
  getCompileCode,
  getCompileFiles,
  getSnapshotHash,
  getMainFileName,
  getActiveFilePath,
}: UseLatexCompileOptions) {
  const buildSnapshotHash = useCallback(
    (code: string | undefined, files: Array<{ name: string; content: string }> | undefined, mainFileName?: string): string => {
      return hashSnapshotPayload({
        projectId,
        mainFileName: mainFileName ?? "main.tex",
        code: code ?? "",
        files: files ?? [],
      });
    },
    [projectId]
  );

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfCacheBust, setPdfCacheBust] = useState(0);
  const [logs, setLogs] = useState<string | null>(null);
  const [errors, setErrors] = useState<LatexCompileError[]>([]);
  const [status, setStatus] = useState<CompileStatus>("idle");
  const [generatedTex, setGeneratedTex] = useState<string | null>(null);
  const [compileCommands, setCompileCommands] = useState<string[]>([]);
  const [outputDirectory, setOutputDirectory] = useState<string | null>(null);
  const [compileReport, setCompileReport] = useState<CompileReport | null>(null);
  const [includeOrder, setIncludeOrder] = useState<string[]>([]);
  const [failedAtFile, setFailedAtFile] = useState<string | null>(null);
  const [compilationTime, setCompilationTime] = useState<number | null>(null);
  const [lastCompiledAt, setLastCompiledAt] = useState<Date | null>(null);
  const [lessonPreview, setLessonPreview] = useState<LatexCompileResult["lessonPreview"] | null>(null);

  const queueRef = useRef(false);
  const compilingRef = useRef(false);
  const autoTimerRef = useRef<number | null>(null);
  const compileSeqRef = useRef(0);

  const applyFailure = useCallback((data: LatexCompileResult | null | undefined, fallback?: string) => {
    setPdfUrl(null);
    const errorList = data?.errors?.length ? data.errors : [];
    setErrors(errorList);
    const validationPrefix = data?.validationFailed
      ? "Pre-compilation validation failed — fix these issues before compiling:\n\n"
      : "";
    setLogs(
      data?.logs ||
        (errorList.length > 0
          ? validationPrefix +
            errorList
              .map((e) => {
                const loc = e.file
                  ? `${e.file}${e.line != null ? `:${e.line}` : ""}: `
                  : e.line != null
                    ? `Line ${e.line}: `
                    : "";
                return `${loc}${e.message}${e.suggestedFix ? `\n  Fix: ${e.suggestedFix}` : ""}`;
              })
              .join("\n\n")
          : null) ||
        fallback ||
        "Compilation failed"
    );
    setGeneratedTex(data?.generatedTex || null);
    setCompileCommands(data?.compileCommands || []);
    setOutputDirectory(data?.outputDirectory || null);
    setCompileReport(data?.compileReport ?? null);
    setIncludeOrder(data?.includeOrder ?? data?.compileReport?.includeOrder ?? []);
    setFailedAtFile(data?.failedAtFile ?? data?.compileReport?.failedAtFile ?? null);
    setCompilationTime(data?.compilationTime ?? data?.compileReport?.compilationTimeMs ?? null);
    setLessonPreview(null);
    setStatus("error");
  }, []);

  const runCompile = useCallback(async () => {
    if (compilingRef.current) {
      queueRef.current = true;
      setStatus("queued");
      return;
    }

    compilingRef.current = true;
    const compileSeq = ++compileSeqRef.current;
    setStatus("compiling");
    setLogs(null);
    setErrors([]);

    try {
      if (onSaveBeforeCompile) {
        await onSaveBeforeCompile();
      }

      const code = getCompileCode ? await getCompileCode() : undefined;
      const files = getCompileFiles ? await getCompileFiles() : undefined;
      const mainFileName = getMainFileName ? getMainFileName() : undefined;
      const activeFilePath = getActiveFilePath ? getActiveFilePath() : undefined;
      const mainInFiles =
        files?.find((f) => f.name === (mainFileName ?? "main.tex")) ??
        files?.find((f) => f.name.endsWith(`/${mainFileName ?? "main.tex"}`));
      const codeForHash = mainInFiles?.content ?? code;
      const serverHash = getSnapshotHash ? await getSnapshotHash() : undefined;
      const snapshotHash =
        serverHash ?? buildSnapshotHash(codeForHash, files, mainFileName);

      const { data, error } = await api<LatexCompileResult>(`/latex/compile`, {
        method: "POST",
        body: {
          projectId,
          ...(code && !serverHash ? { code } : {}),
          ...(files?.length && !serverHash ? { files } : {}),
          ...(mainFileName ? { mainFileName } : {}),
          ...(activeFilePath ? { activeFilePath } : {}),
          snapshotHash,
        },
      });

      // Latest compile wins: ignore stale responses.
      if (compileSeq !== compileSeqRef.current) {
        return { success: false as const, errors: [] };
      }

      if (error || !data?.success) {
        applyFailure(data, error || undefined);
        return { success: false as const, errors: data?.errors || [] };
      }

      if (data.compiledSnapshotHash && data.compiledSnapshotHash !== snapshotHash) {
        console.warn("[Compile] Snapshot hash drift (compile still succeeded)", {
          requested: snapshotHash,
          compiled: data.compiledSnapshotHash,
        });
      }

      const url = data.fileUrl || data.pdfUrl || null;
      setPdfUrl(url);
      setPdfCacheBust(Date.now());
      setLogs(data.logs || null);
      setErrors([]);
      setGeneratedTex(data.generatedTex || null);
      setCompileCommands(data.compileCommands || []);
      setOutputDirectory(data.outputDirectory || null);
      setCompileReport(data.compileReport ?? null);
      setIncludeOrder(data.includeOrder ?? data.compileReport?.includeOrder ?? []);
      setFailedAtFile(data.failedAtFile ?? data.compileReport?.failedAtFile ?? null);
      setCompilationTime(data.compilationTime ?? data.compileReport?.compilationTimeMs ?? null);
      setLessonPreview(data.lessonPreview ?? null);
      setStatus("success");
      setLastCompiledAt(new Date());
      return { success: true as const, data };
    } catch (err: any) {
      applyFailure(null, err.message || "Network error during compilation");
      return { success: false as const, errors: [] };
    } finally {
      compilingRef.current = false;
      if (queueRef.current) {
        queueRef.current = false;
        void runCompile();
      } else if (status !== "error") {
        setStatus((prev) => (prev === "compiling" ? "idle" : prev));
      }
    }
  }, [applyFailure, onSaveBeforeCompile, getCompileCode, getCompileFiles, getSnapshotHash, getMainFileName, getActiveFilePath, projectId, status, buildSnapshotHash]);

  const scheduleAutoCompile = useCallback(() => {
    if (!settings.autoCompile) return;
    if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    autoTimerRef.current = window.setTimeout(() => {
      void runCompile();
    }, settings.autoCompileDelayMs);
  }, [runCompile, settings.autoCompile, settings.autoCompileDelayMs]);

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    };
  }, []);

  const isCompiling = status === "compiling" || status === "queued";

  return {
    pdfUrl,
    pdfCacheBust,
    logs,
    errors,
    status,
    isCompiling,
    generatedTex,
    compileCommands,
    outputDirectory,
    compileReport,
    includeOrder,
    failedAtFile,
    compilationTime,
    lastCompiledAt,
    lessonPreview,
    runCompile,
    scheduleAutoCompile,
    setPdfUrl,
  };
}
