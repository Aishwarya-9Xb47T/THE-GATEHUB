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
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Terminal,
  Cpu,
  Layers,
  ShieldCheck,
  FilePlus2,
  FileEdit,
  Play,
} from "lucide-react";
import {
  CHATGPT_AUTHORING_PROMPT,
  LATEX_QUICK_REFERENCE,
  AI_GUIDE_KIND_FILTERS,
  AI_GUIDE_QUICK_PROMPTS,
  copyAuthoringPromptToClipboard,
  copyTextToClipboard,
  fetchLuAuthoringGuideFiles,
  kindLabel,
  statusColor,
  planLuAgent,
  executeLuAgentPlan,
  compileAndRepairLuAgent,
  rollbackLuAgent,
  type LuAuthoringGuideScope,
  type LuAuthoringGuideSelectableFile,
  type LuAgentPlan,
  type LuAgentFileOperation,
  type LuAgentExecutionResult,
  type LuAgentCompileRepairResult,
} from "@/lib/luAuthoring/latexAuthoringGuide";
import { cn } from "@/lib/utils";

interface LuLatexGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  activeFilePath?: string;
  onApplyFile: (path: string, content: string) => Promise<void>;
  onApplyPlan?: (plan: LuAgentPlan) => Promise<LuAgentExecutionResult>;
  onOpenFile?: (path: string) => void;
  onTriggerCompile?: () => Promise<void> | void;
}

type Tab = "generate" | "reference";
type ExecutionStage =
  | "idle"
  | "planning"
  | "planned"
  | "applying"
  | "compiling"
  | "repairing"
  | "verified"
  | "failed";

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
  onApplyPlan,
  onOpenFile,
  onTriggerCompile,
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

  // Agent State Machine
  const [agentStage, setAgentStage] = useState<ExecutionStage>("idle");
  const [currentPlan, setCurrentPlan] = useState<LuAgentPlan | null>(null);
  const [compileReport, setCompileReport] = useState<LuAgentCompileRepairResult | null>(null);
  const [lastSnapshotId, setLastSnapshotId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per-file action tracking
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

  const handleCopyFile = async (file: LuAgentFileOperation) => {
    const ok = await copyTextToClipboard(file.content);
    if (ok) {
      setCopiedPath(file.path);
      window.setTimeout(() => setCopiedPath(null), 1500);
    }
  };

  /** Step 1: Request change plan from AI Planner */
  const handlePlan = async () => {
    if (!prompt.trim()) {
      setError("Describe what you want to teach or create first.");
      return;
    }

    const manualPaths = useManualSelection ? Array.from(selectedPaths) : undefined;
    if (useManualSelection && !manualPaths?.length) {
      setError("Select at least one file from the list, or turn off manual selection to use scope.");
      return;
    }

    setAgentStage("planning");
    setError(null);
    setCurrentPlan(null);
    setCompileReport(null);
    setAppliedPaths(new Set());
    setStatusMessage("Analyzing course syllabus & planning file operations...");

    try {
      const plan = await planLuAgent(projectId, {
        prompt: prompt.trim(),
        scope: manualPaths?.length ? "selected" : scope,
        activeFilePath,
        targetPaths: manualPaths,
        kinds: kindFilters.size ? Array.from(kindFilters) : undefined,
      });

      setCurrentPlan(plan);
      setAgentStage("planned");
      setStatusMessage(plan.summary);
    } catch (err: any) {
      setAgentStage("idle");
      setError(err instanceof Error ? err.message : "Planning failed");
    }
  };

  /** Step 2: Apply plan and run autonomous compilation + repair loop */
  const handleApplyAndAutonomousCompile = async () => {
    if (!currentPlan) return;

    setError(null);
    setAgentStage("applying");
    setStatusMessage("Safely creating project structure & applying files...");

    try {
      // 1. Transactional apply
      let execResult: LuAgentExecutionResult;
      if (onApplyPlan) {
        execResult = await onApplyPlan(currentPlan);
      } else {
        execResult = await executeLuAgentPlan(projectId, currentPlan, { rollbackOnFailure: true });
      }

      setLastSnapshotId(execResult.snapshotId);
      setAppliedPaths(new Set(currentPlan.fileOperations.map((f) => f.path)));

      // 2. Compilation and repair loop
      setAgentStage("compiling");
      setStatusMessage("Running real pdflatex compiler on merged project...");

      const report = await compileAndRepairLuAgent(projectId, {
        maxRetries: 3,
        snapshotId: execResult.snapshotId,
      });

      setCompileReport(report);

      if (report.success && report.verified) {
        setAgentStage("verified");
        setStatusMessage("Compilation passed and verified. PDF generated successfully.");
        if (onTriggerCompile) {
          void onTriggerCompile();
        }
      } else {
        setAgentStage("failed");
        setStatusMessage(
          report.stalled
            ? "Repair loop stalled on compiler diagnostics. Manual inspection recommended."
            : "Compilation could not be repaired automatically after maximum attempts."
        );
      }
    } catch (err: any) {
      setAgentStage("failed");
      setError(err instanceof Error ? err.message : "Execution failed");
    }
  };

  /** Apply single file */
  const handleApplySingle = async (file: LuAgentFileOperation) => {
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

  /** Rollback to pre-agent snapshot */
  const handleRollback = async () => {
    setIsRollingBack(true);
    setError(null);
    try {
      await rollbackLuAgent(projectId, lastSnapshotId ?? undefined);
      setAgentStage("idle");
      setCurrentPlan(null);
      setCompileReport(null);
      setAppliedPaths(new Set());
      setStatusMessage("Successfully rolled back to pre-agent snapshot.");
      await loadFiles();
      if (onTriggerCompile) {
        void onTriggerCompile();
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setIsRollingBack(false);
    }
  };

  const groupedOperations = useMemo(() => {
    if (!currentPlan?.fileOperations?.length) return [];
    const groups = new Map<string, LuAgentFileOperation[]>();
    for (const f of currentPlan.fileOperations) {
      const parts = f.path.split("/").filter(Boolean);
      const groupKey = parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : f.path;
      const list = groups.get(groupKey) ?? [];
      list.push(f);
      groups.set(groupKey, list);
    }
    return Array.from(groups.entries());
  }, [currentPlan]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col bg-[#1e1e1e] text-slate-200 border-slate-700 p-0 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Cpu className="w-5 h-5 text-amber-400" />
              <span>AI LaTeX Engineering Agent</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Autonomous v2.1
              </span>
            </DialogTitle>

            {agentStage === "verified" && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2.5 py-1 rounded-md">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verified by pdflatex
              </span>
            )}

            {agentStage === "failed" && (
              <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 px-2.5 py-1 rounded-md">
                <AlertTriangle className="w-3.5 h-3.5" />
                Diagnostics Available
              </span>
            )}
          </div>
          <DialogDescription className="text-slate-400 text-xs mt-1">
            Context-aware autonomous agent: plans curriculum structure, generates valid LaTeX, executes transactional mutations, and self-repairs compiler diagnostics with local pdflatex.
          </DialogDescription>
        </DialogHeader>

        {/* Navigation Tabs */}
        <div className="flex gap-2 px-6 border-b border-slate-800 py-2 shrink-0 bg-[#18181b]">
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-xs rounded-md transition-colors font-medium flex items-center gap-1.5",
              tab === "generate" ? "bg-amber-500/20 text-amber-200 border border-amber-500/30" : "text-slate-400 hover:text-slate-200"
            )}
            onClick={() => setTab("generate")}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Autonomous Agent
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-xs rounded-md transition-colors font-medium flex items-center gap-1.5",
              tab === "reference" ? "bg-amber-500/20 text-amber-200 border border-amber-500/30" : "text-slate-400 hover:text-slate-200"
            )}
            onClick={() => setTab("reference")}
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            LaTeX Reference
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {tab === "generate" ? (
            <>
              {/* Prompt Input Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">Course / Lesson Engineering Prompt</label>
                  <span className="text-[10px] text-slate-500">Autonomous multi-file generation & repair</span>
                </div>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Example: Create a full Distributed Systems course. Track 1 covers Core Foundations. Module 1 covers Consensus and Replication with an overview, theory on Paxos vs Raft, a Python coding lab, a 3-question quiz, and a milestone checkpoint..."
                  className="min-h-[90px] bg-[#252526] border-slate-700 text-slate-200 placeholder:text-slate-500 text-xs leading-relaxed"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {AI_GUIDE_QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="text-[10px] px-2 py-0.5 rounded-full border border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-amber-200 transition-colors"
                      onClick={() => setPrompt(q)}
                    >
                      {q.slice(0, 45)}…
                    </button>
                  ))}
                </div>
              </div>

              {/* Scope & Kind Filter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">Target Scope</label>
                  <Select
                    value={scope}
                    onValueChange={(v) => {
                      setScope(v as LuAuthoringGuideScope);
                      setUseManualSelection(false);
                    }}
                    disabled={useManualSelection || agentStage === "planning" || agentStage === "applying" || agentStage === "compiling"}
                  >
                    <SelectTrigger className="bg-[#252526] border-slate-700 text-xs h-8">
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

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    Component Kind Filter
                  </label>
                  <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-1">
                    {AI_GUIDE_KIND_FILTERS.slice(0, 10).map((k) => (
                      <button
                        key={k.kind}
                        type="button"
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded border transition-colors",
                          kindFilters.has(k.kind)
                            ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                            : "border-slate-800 text-slate-500 hover:border-slate-600"
                        )}
                        onClick={() => toggleKindFilter(k.kind)}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Available Files Explorer Preview */}
              <div className="rounded-lg border border-slate-700 bg-[#252526] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700 bg-[#2d2d2d]">
                  <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    Target Project Files
                    {useManualSelection && (
                      <span className="text-amber-400 ml-1">({selectedPaths.size} selected)</span>
                    )}
                  </span>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={selectAllVisible}>
                      All
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={clearSelection}>
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="max-h-36 overflow-y-auto p-1 text-xs">
                  {loadingFiles ? (
                    <div className="flex items-center justify-center py-4 text-slate-500 text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                      Inspecting project tree…
                    </div>
                  ) : filteredAvailable.length === 0 ? (
                    <p className="text-xs text-amber-300/80 p-3 text-center bg-amber-950/20 border border-amber-900/30 rounded m-1">
                      No files yet. The agent will autonomously create the complete syllabus structure (track, module, lesson, and components) from your prompt!
                    </p>
                  ) : (
                    filteredAvailable.map((file) => (
                      <label
                        key={file.path}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-slate-700/40 text-xs",
                          selectedPaths.has(file.path) && "bg-amber-500/10"
                        )}
                        style={{ paddingLeft: `${8 + file.depth * 10}px` }}
                      >
                        <Checkbox
                          checked={selectedPaths.has(file.path)}
                          onCheckedChange={() => togglePath(file.path)}
                          className="border-slate-600 w-3.5 h-3.5"
                        />
                        <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                        <span className="text-[10px] font-mono text-amber-200/90 truncate flex-1">
                          {file.path.split("/").pop()}
                        </span>
                        <span className="text-[9px] text-slate-400 shrink-0">{kindLabel(file.kind)}</span>
                        <span className={cn("text-[9px] shrink-0 font-medium", statusColor(file.status))}>
                          {file.status}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Primary Agent Action Button */}
              {agentStage === "idle" || agentStage === "planning" ? (
                <Button
                  type="button"
                  className="w-full gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-medium h-9 shadow-lg"
                  onClick={() => void handlePlan()}
                  disabled={agentStage === "planning"}
                >
                  {agentStage === "planning" ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Wand2 className="w-4 h-4 text-white" />
                  )}
                  {agentStage === "planning" ? "Planning Course Changes..." : "Plan with AI LaTeX Agent"}
                </Button>
              ) : null}

              {/* Status & Error Alerts */}
              {error && (
                <div className="flex items-start gap-2 text-xs text-red-300 bg-red-950/40 border border-red-800/60 rounded-md p-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold text-red-200">Error</p>
                    <p className="text-red-300/90 text-xs">{error}</p>
                  </div>
                </div>
              )}

              {statusMessage && (
                <div className="text-xs rounded-md p-2.5 border bg-[#222225] border-amber-500/30 text-amber-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    {statusMessage}
                  </span>
                  {currentPlan?.isScaffoldedCourse && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Autonomous Syllabus Scaffold
                    </span>
                  )}
                </div>
              )}

              {/* Progress Stage Tracker */}
              {(agentStage === "applying" || agentStage === "compiling" || agentStage === "repairing") && (
                <div className="rounded-lg border border-amber-500/30 bg-[#252526] p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-300 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    Autonomous Execution in Progress
                  </p>
                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>1. Transactional pre-change snapshot captured</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {agentStage === "applying" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span>2. Applying structural mutations and file operations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {agentStage === "compiling" || agentStage === "repairing" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
                      )}
                      <span>3. Real pdflatex compilation & source diagnostic mapping</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-700" />
                      <span>4. Self-repair loop (targeted source fixes without rewriting working code)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Stage: Planned Plan Actions */}
              {currentPlan && (agentStage === "planned" || agentStage === "verified" || agentStage === "failed") && (
                <div className="space-y-4">
                  {/* Action Bar */}
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-700 bg-[#242427]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">
                        {currentPlan.fileOperations.length} Proposed File Change(s)
                      </span>
                      {currentPlan.structuralActions.length > 0 && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                          +{currentPlan.structuralActions.length} Structural Action(s)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {lastSnapshotId && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-slate-600 text-slate-300 hover:text-amber-200"
                          onClick={() => void handleRollback()}
                          disabled={isRollingBack}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          {isRollingBack ? "Rolling back..." : "Rollback"}
                        </Button>
                      )}
                      {agentStage === "planned" && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 text-xs font-semibold bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-md gap-1.5"
                          onClick={() => void handleApplyAndAutonomousCompile()}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Apply & Autonomous Compile
                        </Button>
                      )}
                      {compileReport?.logs && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-slate-400 hover:text-slate-200"
                          onClick={() => setShowLogs(!showLogs)}
                        >
                          <Terminal className="w-3 h-3 mr-1" />
                          {showLogs ? "Hide Logs" : "Compiler Logs"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Compiler Diagnostics / Repair History Card */}
                  {compileReport && (
                    <div className={cn(
                      "rounded-lg border p-3 space-y-2 text-xs",
                      compileReport.verified
                        ? "border-emerald-800/70 bg-emerald-950/20"
                        : "border-amber-800/70 bg-amber-950/20"
                    )}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1.5">
                          {compileReport.verified ? (
                            <>
                              <ShieldCheck className="w-4 h-4 text-emerald-400" />
                              <span className="text-emerald-300">Artifact Verified (pdflatex exit 0)</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-4 h-4 text-amber-400" />
                              <span className="text-amber-300">Compiler Diagnostic Report</span>
                            </>
                          )}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {compileReport.attempts} repair pass(es) • {compileReport.repairedFiles.length} file(s) repaired
                        </span>
                      </div>

                      {/* Mapped Error List */}
                      {compileReport.errors.length > 0 && (
                        <div className="space-y-1 pt-1 max-h-36 overflow-y-auto">
                          {compileReport.errors.map((err, idx) => (
                            <div
                              key={idx}
                              className="p-1.5 rounded bg-black/40 border border-slate-800 font-mono text-[10px] text-red-300 flex items-start gap-2"
                            >
                              <span className="text-amber-400 font-bold shrink-0">
                                {err.sourceFile || err.file || "main.tex"}:{err.sourceLine || err.line || 1}
                              </span>
                              <span className="text-slate-300 truncate flex-1">{err.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Raw Compiler Log Viewer */}
                  {showLogs && compileReport?.logs && (
                    <div className="rounded-lg border border-slate-700 bg-black/70 p-3 space-y-1">
                      <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                        <span className="text-[10px] font-mono text-slate-400">Raw Compiler Output (pdflatex)</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-5 text-[9px] px-1 text-slate-400"
                          onClick={() => void copyTextToClipboard(compileReport.logs)}
                        >
                          Copy Log
                        </Button>
                      </div>
                      <pre className="text-[10px] leading-relaxed text-slate-300 font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {compileReport.logs}
                      </pre>
                    </div>
                  )}

                  {/* Grouped Proposed File Operations */}
                  {groupedOperations.map(([group, ops]) => (
                    <div key={group} className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-mono font-semibold">
                        {group}
                      </p>
                      {ops.map((file) => (
                        <div
                          key={file.path}
                          className="rounded-lg border border-slate-700 bg-[#252526] overflow-hidden"
                        >
                          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-700 bg-[#2d2d2d]">
                            <div className="flex items-center gap-2 min-w-0">
                              {file.operation === "create" ? (
                                <FilePlus2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              ) : (
                                <FileEdit className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              )}
                              <span className="text-xs font-mono text-amber-200/90 truncate">
                                {file.path}
                              </span>
                              <span className={cn(
                                "text-[9px] px-1.5 py-0.2 rounded font-medium shrink-0",
                                file.operation === "create"
                                  ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/50"
                                  : "bg-amber-950/60 text-amber-300 border border-amber-800/50"
                              )}>
                                {file.operation === "create" ? "CREATE" : "UPDATE"}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 shrink-0">
                                {kindLabel(file.kind)}
                              </span>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] px-2"
                                onClick={() => void handleCopyFile(file)}
                              >
                                {copiedPath === file.path ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                              </Button>
                              {onOpenFile && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] px-2 text-slate-300 hover:text-white"
                                  onClick={() => onOpenFile(file.path)}
                                >
                                  Open
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2 border-slate-600 text-slate-200"
                                onClick={() => void handleApplySingle(file)}
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
                          <pre className="text-[10px] leading-relaxed text-slate-300 p-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono bg-[#1e1e1e]">
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
            /* Reference Tab */
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

              <pre className="text-[10px] leading-relaxed text-slate-500 whitespace-pre-wrap max-h-48 overflow-y-auto rounded border border-slate-800 p-3 font-mono">
                {CHATGPT_AUTHORING_PROMPT}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
