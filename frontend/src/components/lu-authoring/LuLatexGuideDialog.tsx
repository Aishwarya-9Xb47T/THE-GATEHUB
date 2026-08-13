import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  Sparkles,
  Check,
  Loader2,
  FileCode,
  Wand2,
  ChevronRight,
  Filter,
} from "lucide-react";
import {
  CHATGPT_AUTHORING_PROMPT,
  LATEX_QUICK_REFERENCE,
  AI_GUIDE_KIND_FILTERS,
  AI_GUIDE_QUICK_PROMPTS,
  copyAuthoringPromptToClipboard,
  copyTextToClipboard,
  fetchLuAuthoringGuideFiles,
  generateLuAuthoringGuide,
  kindLabel,
  statusColor,
  type LuAuthoringGuideFileResult,
  type LuAuthoringGuideScope,
  type LuAuthoringGuideSelectableFile,
} from "@/lib/luAuthoring/latexAuthoringGuide";
import { cn } from "@/lib/utils";

interface LuLatexGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  activeFilePath?: string;
  onApplyFile: (path: string, content: string) => Promise<void>;
  onOpenFile?: (path: string) => void;
}

type Tab = "generate" | "reference";

const SCOPE_OPTIONS: { value: LuAuthoringGuideScope; label: string; hint: string }[] = [
  { value: "current-file", label: "Current file", hint: "Only the file open in the editor" },
  { value: "current-lesson", label: "Current lesson", hint: "Lesson + all its components (overview, quiz, lab…)" },
  { value: "current-module", label: "Current module", hint: "Module + all lessons and components inside" },
  { value: "current-track", label: "Current track", hint: "Entire track — modules, lessons, all files" },
  { value: "project-incomplete", label: "Needs content", hint: "All empty, draft, or error files" },
  { value: "entire-project", label: "Entire project", hint: "Every track, module, lesson, and component" },
];

export function LuLatexGuideDialog({
  open,
  onOpenChange,
  projectId,
  activeFilePath,
  onApplyFile,
  onOpenFile,
}: LuLatexGuideDialogProps) {
  const [tab, setTab] = useState<Tab>("generate");
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<LuAuthoringGuideScope>("current-lesson");
  const [useManualSelection, setUseManualSelection] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<LuAuthoringGuideSelectableFile[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [kindFilters, setKindFilters] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [results, setResults] = useState<LuAuthoringGuideFileResult[]>([]);
  const [applyingPath, setApplyingPath] = useState<string | null>(null);
  const [appliedPaths, setAppliedPaths] = useState<Set<string>>(new Set());
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const files = await fetchLuAuthoringGuideFiles(projectId);
      setAvailableFiles(files);
    } catch {
      setAvailableFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    void loadFiles();
    if (activeFilePath) {
      setSelectedPaths(new Set([activeFilePath.startsWith("/") ? activeFilePath : `/${activeFilePath}`]));
    }
  }, [open, loadFiles, activeFilePath]);

  const filteredAvailable = useMemo(() => {
    if (!kindFilters.size) return availableFiles;
    return availableFiles.filter((f) => kindFilters.has(f.kind));
  }, [availableFiles, kindFilters]);

  const togglePath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setUseManualSelection(true);
  };

  const selectAllVisible = () => {
    setSelectedPaths(new Set(filteredAvailable.map((f) => f.path)));
    setUseManualSelection(true);
  };

  const clearSelection = () => {
    setSelectedPaths(new Set());
    setUseManualSelection(false);
  };

  const toggleKindFilter = (kind: string) => {
    setKindFilters((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const handleCopyExternal = async () => {
    const ok = await copyAuthoringPromptToClipboard();
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyFile = async (file: LuAuthoringGuideFileResult) => {
    const ok = await copyTextToClipboard(file.content);
    if (ok) {
      setCopiedPath(file.path);
      window.setTimeout(() => setCopiedPath(null), 1500);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Describe your course, lesson, track, quiz, coding lab, or research paper first.");
      return;
    }

    const manualPaths = useManualSelection ? Array.from(selectedPaths) : undefined;
    if (useManualSelection && !manualPaths?.length) {
      setError("Select at least one file from the list, or turn off manual selection to use scope.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResults([]);
    setSummary(null);
    setUsedFallback(false);
    setAppliedPaths(new Set());

    try {
      const data = await generateLuAuthoringGuide(projectId, {
        prompt: prompt.trim(),
        scope: manualPaths?.length ? "selected" : scope,
        activeFilePath,
        targetPaths: manualPaths,
        kinds: kindFilters.size ? Array.from(kindFilters) : undefined,
      });
      setResults(data.files);
      setSummary(data.summary);
      setUsedFallback(data.usedFallback);
      if (data.availableFiles?.length) setAvailableFiles(data.availableFiles);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = async (file: LuAuthoringGuideFileResult) => {
    setApplyingPath(file.path);
    try {
      await onApplyFile(file.path, file.content);
      setAppliedPaths((prev) => new Set(prev).add(file.path));
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Could not apply file");
    } finally {
      setApplyingPath(null);
    }
  };

  const handleApplyAll = async () => {
    for (const file of results) {
      if (appliedPaths.has(file.path)) continue;
      await handleApply(file);
    }
  };

  const groupedResults = useMemo(() => {
    const groups = new Map<string, LuAuthoringGuideFileResult[]>();
    for (const f of results) {
      const parts = f.path.split("/").filter(Boolean);
      const groupKey = parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : f.path;
      const list = groups.get(groupKey) ?? [];
      list.push(f);
      groups.set(groupKey, list);
    }
    return Array.from(groups.entries());
  }, [results]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col bg-[#1e1e1e] text-slate-200 border-slate-700 p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            AI LaTeX Authoring Guide
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Paste your prompt → get LaTeX code for tracks, modules, lessons, quizzes, coding labs,
            research papers, and every component file. Apply directly to your project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 px-6 border-b border-slate-700 pb-2 shrink-0">
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-xs rounded-md transition-colors",
              tab === "generate" ? "bg-amber-500/20 text-amber-200" : "text-slate-400 hover:text-slate-200"
            )}
            onClick={() => setTab("generate")}
          >
            <Wand2 className="w-3.5 h-3.5 inline mr-1.5" />
            Generate
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-xs rounded-md transition-colors",
              tab === "reference" ? "bg-amber-500/20 text-amber-200" : "text-slate-400 hover:text-slate-200"
            )}
            onClick={() => setTab("reference")}
          >
            <Copy className="w-3.5 h-3.5 inline mr-1.5" />
            Reference
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {tab === "generate" ? (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">Your prompt</label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Example: Create a Python for Data Science track. Module 1 covers NumPy and Pandas. Include a coding lab with starter code, a 5-question quiz, and a research paper summary component..."
                  className="min-h-[100px] bg-[#252526] border-slate-600 text-slate-200 placeholder:text-slate-500 text-sm"
                />
                <div className="flex flex-wrap gap-1.5">
                  {AI_GUIDE_QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="text-[10px] px-2 py-1 rounded-full border border-slate-700 text-slate-400 hover:border-amber-600/50 hover:text-amber-200 transition-colors"
                      onClick={() => setPrompt(q)}
                    >
                      {q.slice(0, 48)}…
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Scope (when not picking files manually)</label>
                  <Select
                    value={scope}
                    onValueChange={(v) => {
                      setScope(v as LuAuthoringGuideScope);
                      setUseManualSelection(false);
                    }}
                    disabled={useManualSelection}
                  >
                    <SelectTrigger className="bg-[#252526] border-slate-600 text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-500">
                    {SCOPE_OPTIONS.find((o) => o.value === scope)?.hint}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400 flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    Filter by file type (optional)
                  </label>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {AI_GUIDE_KIND_FILTERS.map((k) => (
                      <button
                        key={k.kind}
                        type="button"
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded border transition-colors",
                          kindFilters.has(k.kind)
                            ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                            : "border-slate-700 text-slate-500 hover:border-slate-500"
                        )}
                        onClick={() => toggleKindFilter(k.kind)}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-[#252526] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-[#2d2d2d]">
                  <span className="text-xs font-medium text-slate-300">
                    Project files
                    {useManualSelection && (
                      <span className="text-amber-400 ml-1">({selectedPaths.size} selected)</span>
                    )}
                  </span>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={selectAllVisible}>
                      All
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={clearSelection}>
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto p-1">
                  {loadingFiles ? (
                    <div className="flex items-center justify-center py-6 text-slate-500 text-xs">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading project structure…
                    </div>
                  ) : filteredAvailable.length === 0 ? (
                    <p className="text-xs text-slate-500 p-3 text-center">
                      No files yet. Add tracks, modules, and lessons in the explorer first.
                    </p>
                  ) : (
                    filteredAvailable.map((file) => (
                      <label
                        key={file.path}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-700/40",
                          selectedPaths.has(file.path) && "bg-amber-500/10"
                        )}
                        style={{ paddingLeft: `${8 + file.depth * 12}px` }}
                      >
                        <Checkbox
                          checked={selectedPaths.has(file.path)}
                          onCheckedChange={() => togglePath(file.path)}
                          className="border-slate-600"
                        />
                        <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                        <span className="text-[10px] font-mono text-amber-200/80 truncate flex-1">
                          {file.path.split("/").pop()}
                        </span>
                        <span className="text-[9px] text-slate-500 shrink-0">{kindLabel(file.kind)}</span>
                        <span className={cn("text-[9px] shrink-0", statusColor(file.status))}>
                          {file.status}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-[10px] text-slate-500 px-3 py-2 border-t border-slate-700">
                  Check specific files to generate only those (track, module, lesson, quiz, coding lab,
                  research paper, etc.). Leave unchecked to use scope above.
                </p>
              </div>

              <Button
                type="button"
                className="w-full gap-2 bg-amber-600 hover:bg-amber-500 text-white"
                onClick={() => void handleGenerate()}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isGenerating ? "Generating LaTeX for your files…" : "Generate LaTeX codes"}
              </Button>

              {error && (
                <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded p-2">{error}</p>
              )}

              {summary && (
                <p
                  className={cn(
                    "text-xs rounded p-2 border",
                    usedFallback
                      ? "text-amber-200 bg-amber-950/20 border-amber-900/40"
                      : "text-emerald-300/90 bg-emerald-950/20 border-emerald-900/40"
                  )}
                >
                  {summary}
                </p>
              )}

              {results.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">
                      {results.length} file(s) — {results.map((r) => kindLabel(r.kind)).join(", ")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-slate-600"
                      onClick={() => void handleApplyAll()}
                      disabled={!!applyingPath || appliedPaths.size === results.length}
                    >
                      Apply all to project
                    </Button>
                  </div>

                  {groupedResults.map(([group, files]) => (
                    <div key={group} className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-mono">{group}</p>
                      {files.map((file) => (
                        <div
                          key={file.path}
                          className="rounded-lg border border-slate-700 bg-[#252526] overflow-hidden"
                        >
                          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-700 bg-[#2d2d2d]">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="text-xs font-mono text-amber-200/90 truncate">{file.path}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                                {kindLabel(file.kind)}
                              </span>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[10px] px-2"
                                onClick={() => void handleCopyFile(file)}
                              >
                                {copiedPath === file.path ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </Button>
                              {onOpenFile && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-[10px] px-2"
                                  onClick={() => onOpenFile(file.path)}
                                >
                                  Open
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] px-2 border-slate-600"
                                onClick={() => void handleApply(file)}
                                disabled={applyingPath === file.path || appliedPaths.has(file.path)}
                              >
                                {appliedPaths.has(file.path) ? (
                                  <>
                                    <Check className="w-3 h-3 mr-1 text-emerald-400" />
                                    Applied
                                  </>
                                ) : applyingPath === file.path ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  "Apply"
                                )}
                              </Button>
                            </div>
                          </div>
                          <pre className="text-[10px] leading-relaxed text-slate-300 p-3 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                            {file.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-slate-600 bg-[#252526] text-slate-200 hover:bg-slate-700"
                onClick={() => void handleCopyExternal()}
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy external ChatGPT prompt"}
              </Button>

              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-[#252526] text-slate-400">
                    <tr>
                      <th className="text-left p-2 font-medium">File type</th>
                      <th className="text-left p-2 font-medium">LaTeX command</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LATEX_QUICK_REFERENCE.map((row) => (
                      <tr key={row.file} className="border-t border-slate-800">
                        <td className="p-2 font-mono text-amber-200/90">{row.file}</td>
                        <td className="p-2 font-mono text-slate-300 text-[10px]">{row.owns}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <pre className="text-[10px] leading-relaxed text-slate-500 whitespace-pre-wrap max-h-48 overflow-y-auto rounded border border-slate-800 p-3">
                {CHATGPT_AUTHORING_PROMPT}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
