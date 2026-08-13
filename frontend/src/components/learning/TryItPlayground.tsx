import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Lightbulb,
  AlertTriangle,
  Play,
  Send,
  Lock,
  Terminal,
  Variable,
  Layers,
  Sparkles,
  Code2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { repairStarterCode } from "@/lib/labCodeRepair";
import type {
  CodingLabConfig,
  CodingMissionStep,
  CodingLabTestCase,
  CodingLabExecutionResult,
  TestCaseExecutionResult,
  EducationalErrorPayload,
} from "@/types/codingLabTypes";

export interface TryItPlaygroundProps {
  initialCode?: string;
  language?: string;
  title?: string;
  description?: string;
  expectedOutput?: string;
  solution?: string;
  hints?: string[] | string;
  config?: CodingLabConfig;
  showReset?: boolean;
  showSolutionToggle?: boolean;
  showHintsToggle?: boolean;
  className?: string;
  onSuccess?: () => void;
  userId?: string;
  learningUniverseId?: string;
  publishVersionId?: string;
  lessonId?: string;
  stepId?: string;
}

function parseHints(hints?: string[] | string): string[] {
  if (!hints) return [];
  if (Array.isArray(hints)) return hints;
  try {
    const parsed = JSON.parse(hints);
    return Array.isArray(parsed) ? parsed : [String(hints)];
  } catch {
    return [String(hints)];
  }
}

function monacoLanguage(lang: string): string {
  const l = (lang || "javascript").toLowerCase();
  if (l === "python" || l === "py") return "python";
  if (l === "java") return "java";
  if (l === "c") return "c";
  if (l === "cpp" || l === "c++") return "cpp";
  if (l === "typescript" || l === "ts") return "typescript";
  return "javascript";
}

const DEFAULT_BLOCK_PALETTE = [
  "def ",
  "return ",
  "if ",
  "else:",
  "for ",
  "while ",
  "append()",
  "print()",
  "len()",
  "sum()",
  "range()",
];

export function TryItPlayground({
  initialCode = "",
  language = "python",
  title = "Interactive Coding Lab",
  description,
  expectedOutput,
  solution,
  hints,
  config,
  showReset = true,
  showSolutionToggle = true,
  showHintsToggle = true,
  className = "",
  onSuccess,
  userId,
  learningUniverseId,
  publishVersionId,
  lessonId,
  stepId,
}: TryItPlaygroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const previousCodeRef = useRef<string>("");

  const missionSteps: CodingMissionStep[] = config?.missionSteps && config.missionSteps.length > 0
    ? config.missionSteps
    : [];

  const storageKey = `coding_mission_unlock_${stepId || title.replace(/\s+/g, "_")}`;

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [unlockedStepIndex, setUnlockedStepIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const currentMission = missionSteps[activeStepIndex];

  const effectiveLang = currentMission
    ? language
    : config?.language || language;

  const rawInitial = currentMission?.starterCode
    ? currentMission.starterCode
    : config?.starterCode || initialCode || "# Write your solution here\n";

  console.log("[CODING LAB] RAW INITIAL CODE:", rawInitial);
  console.log("[CODING LAB] EFFECTIVE LANGUAGE:", effectiveLang);

  const safeInitial = repairStarterCode(rawInitial, effectiveLang);

  console.log("[CODING LAB] REPAIRED INITIAL CODE:", safeInitial);
  console.log("[CODING LAB] CODE LENGTH:", safeInitial.length);
  console.log("[CODING LAB] CODE LINES:", safeInitial.split("\n").length);

  const [code, setCode] = useState(safeInitial);
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"console" | "testcases" | "inspector">("console");
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [output, setOutput] = useState("");
  const [executionResult, setExecutionResult] = useState<CodingLabExecutionResult | null>(null);
  const [educationalError, setEducationalError] = useState<EducationalErrorPayload | null>(null);

  const [showSolution, setShowSolution] = useState(false);
  const [showHintsPanel, setShowHintsPanel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<"vs-dark" | "light">("vs-dark");

  const [fontSize] = useState(14);
  const [wordWrap] = useState<"on" | "off">("on");

  const hintList = parseHints(config?.hints || hints);
  const blockPalette = config?.blockPalette || DEFAULT_BLOCK_PALETTE;

  const publicCases: CodingLabTestCase[] = currentMission
    ? currentMission.publicTestCases
    : config?.publicTestCases && config.publicTestCases.length > 0
    ? config.publicTestCases
    : [
        {
          id: "pub-1",
          name: "Public Test 1",
          input: config?.sampleInput || "",
          expectedOutput: expectedOutput || config?.sampleOutput || "",
          isHidden: false,
        },
      ];

  const hiddenCases: CodingLabTestCase[] = currentMission
    ? currentMission.hiddenTestCases
    : config?.hiddenTestCases || [];

  const allTestCases = [...publicCases, ...hiddenCases];

  useEffect(() => {
    const nextInitial = repairStarterCode(
      currentMission?.starterCode || config?.starterCode || initialCode || "",
      effectiveLang
    );
    setCode(nextInitial);
    previousCodeRef.current = nextInitial;
    setOutput("");
    setExecutionResult(null);
    setEducationalError(null);
  }, [initialCode, effectiveLang, config?.starterCode, activeStepIndex]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Compute editable line ranges if locked line markers exist
  const getEditableRanges = (text: string): Array<{ start: number; end: number }> | null => {
    const lines = text.split("\n");
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/EDITABLE_START|STUDENT EDIT HERE|TODO/i.test(lines[i])) {
        startIdx = i + 1;
      }
      if (/EDITABLE_END/i.test(lines[i])) {
        endIdx = i + 1;
      }
    }

    if (startIdx !== -1) {
      return [{ start: startIdx, end: endIdx !== -1 ? endIdx : startIdx + 8 }];
    }
    return null;
  };

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    previousCodeRef.current = code;

    editor.onDidChangeModelContent(() => {
      if (showSolution) return;
      const currentVal = editor.getValue();
      const editableRanges = getEditableRanges(safeInitial);

      if (editableRanges && editableRanges.length > 0) {
        const selection = editor.getSelection();
        if (selection) {
          const isOutside = !editableRanges.some(
            (r) => selection.startLineNumber >= r.start && selection.endLineNumber <= r.end
          );

          if (isOutside && currentVal !== previousCodeRef.current) {
            // Revert edit to locked state
            editor.setValue(previousCodeRef.current);
            setLockedNotice("🔒 Edit Prevented: Line is locked by instructor. Type inside designated student sections.");
            setTimeout(() => setLockedNotice(null), 3000);
            return;
          }
        }
      }
      previousCodeRef.current = currentVal;
    });
  };

  const insertBlockText = (text: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const selection = editor.getSelection();
    editor.executeEdits("block-palette", [
      {
        range: selection,
        text,
        forceMoveMarkers: true,
      },
    ]);
    editor.focus();
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const runPublicTests = async () => {
    setIsRunning(true);
    setOutput("Executing public test cases...");
    setEducationalError(null);
    setActiveTab("console");

    console.log("[CODING LAB] EXECUTION START");
    console.log("[CODING LAB] LANGUAGE:", effectiveLang);
    console.log("[CODING LAB] CODE TO EXECUTE:", code);
    console.log("[CODING LAB] CODE LENGTH:", code.length);
    console.log("[CODING LAB] CODE LINES:", code.split("\n").length);
    console.log("[CODING LAB] TEST CASES:", publicCases);

    try {
      const response = await api<CodingLabExecutionResult>("/resources/coding-lab/execute", {
        method: "POST",
        body: {
          language: effectiveLang,
          code,
          testCases: publicCases,
        },
      });

      if (response.error) throw new Error(response.error);

      const res = response.data!;
      setExecutionResult(res);
      setOutput(res.output || "Execution completed.");

      if (res.educationalError) {
        setEducationalError(res.educationalError as EducationalErrorPayload);
      }

      if (res.testResults && res.testResults.length > 0) {
        setActiveTab("testcases");
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Execution failed";
      setOutput(message);
      setEducationalError({
        errorType: "Execution Error",
        rawError: message,
        line: null,
        explanation: "Could not execute code runner. Please check network connection.",
        hints: [],
      });
    } finally {
      setIsRunning(false);
    }
  };

  const submitAllTests = async () => {
    setIsSubmitting(true);
    setOutput("Running full evaluation suite (Public & Hidden test cases)...");
    setEducationalError(null);
    setActiveTab("testcases");

    try {
      const response = await api<CodingLabExecutionResult>("/resources/coding-lab/submit", {
        method: "POST",
        body: {
          language: effectiveLang,
          code,
          testCases: allTestCases.length > 0 ? allTestCases : publicCases,
          userId,
          learningUniverseId,
          publishVersionId,
          lessonId,
          stepId,
        },
      });

      if (response.error) throw new Error(response.error);

      const res = response.data!;
      setExecutionResult(res);
      setOutput(res.output);

      if (res.educationalError) {
        setEducationalError(res.educationalError as EducationalErrorPayload);
      }

      if (res.scorePercent >= 80) {
        onSuccess?.();

        if (missionSteps.length > activeStepIndex + 1) {
          const nextIdx = Math.max(unlockedStepIndex, activeStepIndex + 1);
          setUnlockedStepIndex(nextIdx);
          try {
            localStorage.setItem(storageKey, String(nextIdx));
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Submission failed";
      setOutput(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const applySuggestedFix = () => {
    if (!educationalError) return;
    if (educationalError.correctedCode) {
      setCode(educationalError.correctedCode);
      setEducationalError(null);
    } else if (educationalError.suggestedFix && educationalError.line) {
      const lines = code.split("\n");
      lines[educationalError.line - 1] = educationalError.suggestedFix;
      setCode(lines.join("\n"));
      setEducationalError(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`rounded-xl overflow-hidden border border-slate-700 shadow-2xl bg-slate-950 text-slate-100 flex flex-col ${
        isFullscreen ? "h-screen w-screen fixed inset-0 z-50 rounded-none" : "min-h-[640px]"
      } ${className}`}
    >
      {/* Locked line notice toast */}
      {lockedNotice && (
        <div className="bg-amber-500 text-slate-950 text-xs px-4 py-2 font-bold flex items-center gap-2 animate-bounce shrink-0 z-10">
          <Lock className="w-4 h-4 shrink-0" /> {lockedNotice}
        </div>
      )}

      {/* Coding Missions Stepper Header */}
      {missionSteps.length > 0 && (
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <Sparkles className="w-3.5 h-3.5" /> Mission Steps:
            </span>
            {missionSteps.map((step, idx) => {
              const isUnlocked = idx <= unlockedStepIndex;
              const isActive = idx === activeStepIndex;
              return (
                <button
                  key={step.id || idx}
                  disabled={!isUnlocked}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? "bg-violet-600 text-white shadow-md shadow-violet-500/20"
                      : isUnlocked
                      ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800"
                  }`}
                >
                  {!isUnlocked ? <Lock className="w-3 h-3 text-slate-600" /> : null}
                  <span>Step {step.stepNumber}: {step.title}</span>
                </button>
              );
            })}
          </div>
          <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-300 bg-violet-950/30 shrink-0">
            {unlockedStepIndex + 1} / {missionSteps.length} Unlocked
          </Badge>
        </div>
      )}

      {/* Main Toolbar */}
      <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-rose-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Code2 className="w-4 h-4 text-violet-400 shrink-0" />
            <h3 className="font-bold text-sm text-slate-100 truncate">{title}</h3>
            {config?.challengeMode && (
              <Badge variant="secondary" className="text-[10px] bg-slate-800 text-slate-300 uppercase">
                {config.challengeMode.replace("-", " ")}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400 uppercase">
              {monacoLanguage(effectiveLang)}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCode(safeInitial);
                previousCodeRef.current = safeInitial;
                setOutput("");
                setExecutionResult(null);
                setEducationalError(null);
              }}
              className="h-8 text-xs text-slate-400 hover:text-slate-200"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === "vs-dark" ? "light" : "vs-dark")}
            className="h-8 text-xs text-slate-400 hover:text-slate-200"
          >
            {theme === "vs-dark" ? "☀️ Light" : "🌙 Dark"}
          </Button>

          {showHintsToggle && hintList.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowHintsPanel(!showHintsPanel)}
              className="h-8 text-xs bg-amber-950/40 text-amber-300 border border-amber-800/50 hover:bg-amber-900/50"
            >
              <Lightbulb className="w-3.5 h-3.5 mr-1" /> Hints ({hintList.length})
            </Button>
          )}

          {showSolutionToggle && (solution || config?.hiddenSolution) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSolution(!showSolution)}
              className="h-8 text-xs bg-slate-800 text-slate-300"
            >
              {showSolution ? "Hide Solution" : "Show Solution"}
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={toggleFullscreen} className="h-8 text-xs text-slate-400">
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            onClick={runPublicTests}
            disabled={isRunning || isSubmitting}
          >
            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3.5 h-3.5 mr-1 text-emerald-400 fill-emerald-400" />}
            Run Public Tests
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/30"
            onClick={submitAllTests}
            disabled={isRunning || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Submit Code
          </Button>
        </div>
      </div>

      {/* Hints Banner */}
      {showHintsPanel && hintList.length > 0 && (
        <div className="px-4 py-3 bg-amber-950/30 border-b border-amber-800/40 text-xs flex gap-3 text-amber-200 shrink-0">
          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-300">Progressive Hints:</p>
            <ul className="list-disc pl-4 space-y-1 text-amber-200/90">
              {hintList.map((h, i) => (
                <li key={i}><span className="font-medium text-amber-400">Hint {i + 1}:</span> {h}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Fill Missing Code Blocks Shelf (Beginner Helper) */}
      <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 shrink-0">
          <Layers className="w-3 h-3 text-violet-400" /> Insert Tokens:
        </span>
        <div className="flex items-center gap-1.5">
          {blockPalette.map((token: string, i: number) => (
            <button
              key={i}
              type="button"
              onClick={() => insertBlockText(token)}
              className="px-2 py-0.5 bg-slate-800 hover:bg-violet-950 hover:text-violet-200 border border-slate-700/70 hover:border-violet-700/60 rounded font-mono text-xs text-slate-300 transition"
              title={`Click to insert "${token}" at cursor`}
            >
              + {token}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Body: Left Instructions + Right Editor */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 divide-y md:divide-y-0 md:divide-x divide-slate-800">
        {/* Left Pane: Instructions & Requirements */}
        <div className="w-full md:w-5/12 p-4 bg-slate-950/60 overflow-y-auto space-y-4 text-xs">
          <div>
            <h4 className="font-bold text-sm text-slate-100 mb-1">
              {currentMission ? currentMission.title : "Problem Statement"}
            </h4>
            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
              {currentMission
                ? currentMission.instructions
                : config?.description || description || "Complete the challenge requirements in the code editor."}
            </p>
          </div>

          {config?.learningObjective && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Learning Objective
              </span>
              <p className="text-slate-300">{config.learningObjective}</p>
            </div>
          )}

          {config?.constraints && (
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Constraints
              </span>
              <pre className="font-mono text-[11px] bg-slate-900 p-2.5 rounded border border-slate-800 text-amber-300/90 whitespace-pre-wrap">
                {config.constraints}
              </pre>
            </div>
          )}

          {(config?.sampleInput || config?.sampleOutput) && (
            <div className="grid grid-cols-2 gap-2">
              {config.sampleInput && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Sample Input
                  </span>
                  <pre className="font-mono text-[11px] bg-slate-900 p-2 rounded border border-slate-800 text-slate-300">
                    {config.sampleInput}
                  </pre>
                </div>
              )}
              {config.sampleOutput && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Sample Output
                  </span>
                  <pre className="font-mono text-[11px] bg-slate-900 p-2 rounded border border-slate-800 text-emerald-400">
                    {config.sampleOutput}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Pane: Monaco Code Editor */}
        <div className="w-full md:w-7/12 flex flex-col bg-[#1e1e1e] min-h-[300px]">
          <Editor
            height="100%"
            language={monacoLanguage(effectiveLang)}
            theme={theme}
            value={showSolution ? (config?.hiddenSolution || solution || code) : code}
            onChange={(val) => {
              if (!showSolution) setCode(val || "");
            }}
            onMount={handleEditorMount}
            options={{
              readOnly: showSolution,
              minimap: { enabled: false },
              fontSize,
              lineNumbers: "on",
              wordWrap,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fontFamily: "'Fira Code', 'Consolas', monospace",
              tabSize: 4,
              insertSpaces: true,
              padding: { top: 12, bottom: 12 },
            }}
          />
        </div>
      </div>

      {/* VS Code Style Live Terminal / Console Footer */}
      <div className="border-t border-slate-800 bg-slate-900/90 flex flex-col shrink-0">
        {/* Terminal Header Tabs */}
        <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("console")}
              className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === "console"
                  ? "bg-slate-800 text-violet-400 border border-slate-700"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Terminal className="w-3.5 h-3.5" /> Console Log
            </button>
            <button
              onClick={() => setActiveTab("testcases")}
              className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === "testcases"
                  ? "bg-slate-800 text-emerald-400 border border-slate-700"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Test Results
              {executionResult && (
                <Badge variant="secondary" className="ml-1 text-[10px] bg-slate-700 text-slate-200">
                  {executionResult.passCount}/{executionResult.totalCount}
                </Badge>
              )}
            </button>
            <button
              onClick={() => setActiveTab("inspector")}
              className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === "inspector"
                  ? "bg-slate-800 text-blue-400 border border-slate-700"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Variable className="w-3.5 h-3.5" /> Visual Inspector
            </button>
          </div>

          {executionResult && (
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span>Time: <strong className="text-slate-200">{executionResult.executionTimeMs}ms</strong></span>
              <span>Memory: <strong className="text-slate-200">{executionResult.memoryMb || 14}MB</strong></span>
              <span>Score: <strong className="text-emerald-400">{executionResult.scorePercent}%</strong></span>
            </div>
          )}
        </div>

        {/* Tab Content Display */}
        <div className="p-4 max-h-[220px] overflow-y-auto font-mono text-xs">
          {activeTab === "console" && (
            <div className="space-y-2">
              <pre className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                {output || <span className="text-slate-600 italic">Click "Run Public Tests" or "Submit Code" to execute...</span>}
              </pre>
              {educationalError && (
                <div className="mt-3 p-3 rounded bg-rose-950/40 border border-rose-900/60 text-rose-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-rose-400 text-xs">
                      <AlertTriangle className="w-4 h-4" /> {educationalError.errorType} {educationalError.line ? `(Line ${educationalError.line})` : ""}
                    </div>
                    {educationalError.suggestedFix && (
                      <Button size="sm" onClick={applySuggestedFix} className="h-6 text-[10px] bg-rose-700 hover:bg-rose-600 text-white">
                        <Wrench className="w-3 h-3 mr-1" /> Apply Fix
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-rose-300">{educationalError.explanation}</p>
                  {educationalError.suggestedFix && (
                    <div className="mt-1 p-2 bg-black/40 rounded border border-rose-900/50">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Suggested Fix:</span>
                      <pre className="text-emerald-300 text-xs whitespace-pre-wrap">{educationalError.suggestedFix}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "testcases" && (
            <div>
              {!executionResult ? (
                <p className="text-slate-600 italic">No test results yet. Run or submit your code to view results.</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {executionResult.testResults.map((tr: TestCaseExecutionResult, i: number) => (
                      <div
                        key={tr.id || i}
                        className={`p-3 rounded-lg border text-xs space-y-2 ${
                          tr.passed
                            ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-200"
                            : "bg-rose-950/20 border-rose-800/40 text-rose-200"
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                          <span className="font-bold flex items-center gap-1.5">
                            {tr.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-400" />
                            )}
                            {tr.name} {tr.isHidden ? <Badge className="text-[9px] bg-amber-950 text-amber-300 border-amber-800/50">Hidden Case</Badge> : null}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span>{tr.executionTimeMs}ms</span>
                            <span>{tr.memoryMb || 14}MB</span>
                          </div>
                        </div>

                        {!tr.isHidden ? (
                          <div className="space-y-1 text-[11px] font-mono">
                            {tr.input && <div><span className="text-slate-500">Input:</span> <span className="text-slate-300">{tr.input}</span></div>}
                            <div><span className="text-slate-500">Expected Output:</span> <span className="text-emerald-300">{tr.expectedOutput || "(none)"}</span></div>
                            <div><span className="text-slate-500">Actual Output:</span> <span className={tr.passed ? "text-emerald-300" : "text-rose-300"}>{tr.actualOutput || "(none)"}</span></div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 italic">
                            {tr.passed ? "✓ Hidden test passed evaluation successfully." : "✗ Hidden test assertion failed."}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "inspector" && (
            <div>
              {!executionResult?.variableState || Object.keys(executionResult.variableState).length === 0 ? (
                <p className="text-slate-600 italic">Visual execution state empty. Execute Python code to inspect variable values.</p>
              ) : (
                <div className="border border-slate-800 rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400">
                        <th className="p-2">Variable</th>
                        <th className="p-2">Value</th>
                        <th className="p-2">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(executionResult.variableState).map(([key, val], idx) => (
                        <tr key={key} className={idx % 2 === 0 ? "bg-slate-900/50" : "bg-slate-950/50"}>
                          <td className="p-2 font-bold text-violet-300">{key}</td>
                          <td className="p-2 text-emerald-300">{String(val)}</td>
                          <td className="p-2 text-slate-500">{typeof val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
