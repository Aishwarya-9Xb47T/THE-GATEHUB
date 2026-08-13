import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Code2, Sparkles, Layers, ShieldCheck, HelpCircle } from "lucide-react";
import type { CodingLabConfig, CodingLabTestCase, CodingMissionStep } from "@/types/codingLabTypes";

export interface CodingLabAuthoringModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialConfig?: any;
  onSave: (config: CodingLabConfig) => void;
}

export function CodingLabAuthoringModal({
  open,
  onOpenChange,
  initialConfig,
  onSave,
}: CodingLabAuthoringModalProps) {
  const [title, setTitle] = useState<string>(initialConfig?.title || "New Coding Lab");
  const [description, setDescription] = useState<string>(
    initialConfig?.description || initialConfig?.instructions || ""
  );
  const [learningObjective, setLearningObjective] = useState<string>(
    initialConfig?.learningObjective || ""
  );
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">(
    initialConfig?.difficulty || "Medium"
  );
  const [language, setLanguage] = useState<string>(initialConfig?.language || "python");
  const [challengeMode, setChallengeMode] = useState<string>(
    initialConfig?.challengeMode || "complete-code"
  );
  const [starterCode, setStarterCode] = useState<string>(
    initialConfig?.starterCode || initialConfig?.initialCode || "# Write your solution here\n"
  );
  const [hiddenSolution, setHiddenSolution] = useState<string>(
    initialConfig?.hiddenSolution || ""
  );
  const [constraints, setConstraints] = useState<string>(initialConfig?.constraints || "");
  const [sampleInput, setSampleInput] = useState<string>(initialConfig?.sampleInput || "");
  const [sampleOutput, setSampleOutput] = useState<string>(
    initialConfig?.sampleOutput || initialConfig?.expectedOutput || ""
  );

  const [hints, setHints] = useState<string[]>(
    Array.isArray(initialConfig?.hints) ? initialConfig.hints : ["Hint 1: Review function signature"]
  );

  const [publicTestCases, setPublicTestCases] = useState<CodingLabTestCase[]>(
    initialConfig?.publicTestCases || [
      {
        id: "pub-1",
        name: "Sample Test 1",
        input: sampleInput,
        expectedOutput: sampleOutput,
        isHidden: false,
      },
    ]
  );

  const [hiddenTestCases, setHiddenTestCases] = useState<CodingLabTestCase[]>(
    initialConfig?.hiddenTestCases || [
      {
        id: "hid-1",
        name: "Hidden Edge Case 1",
        input: "",
        expectedOutput: "",
        isHidden: true,
      },
    ]
  );

  const [missionSteps, setMissionSteps] = useState<CodingMissionStep[]>(
    initialConfig?.missionSteps || []
  );

  const handleAddHint = () => {
    setHints([...hints, `Hint ${hints.length + 1}`]);
  };

  const handleRemoveHint = (idx: number) => {
    setHints(hints.filter((_, i) => i !== idx));
  };

  const handleAddPublicTest = () => {
    setPublicTestCases([
      ...publicTestCases,
      {
        id: `pub-${Date.now()}`,
        name: `Public Test ${publicTestCases.length + 1}`,
        input: "",
        expectedOutput: "",
        isHidden: false,
      },
    ]);
  };

  const handleAddHiddenTest = () => {
    setHiddenTestCases([
      ...hiddenTestCases,
      {
        id: `hid-${Date.now()}`,
        name: `Hidden Test ${hiddenTestCases.length + 1}`,
        input: "",
        expectedOutput: "",
        isHidden: true,
      },
    ]);
  };

  const handleAddMissionStep = () => {
    setMissionSteps([
      ...missionSteps,
      {
        id: `step-${Date.now()}`,
        stepNumber: missionSteps.length + 1,
        title: `Step ${missionSteps.length + 1}`,
        instructions: "Complete this step to unlock the next challenge.",
        starterCode: "# Step code here\n",
        publicTestCases: [],
        hiddenTestCases: [],
      },
    ]);
  };

  const handleSave = () => {
    const fullConfig: CodingLabConfig = {
      title,
      description,
      learningObjective,
      difficulty,
      language,
      challengeMode: challengeMode as CodingLabConfig["challengeMode"],
      starterCode,
      hiddenSolution,
      constraints,
      sampleInput,
      sampleOutput,
      hints,
      publicTestCases,
      hiddenTestCases,
      missionSteps,
    };
    onSave(fullConfig);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-slate-950 text-slate-100 border-slate-800">
        <DialogHeader className="border-b border-slate-800 pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-violet-300">
            <Code2 className="w-5 h-5 text-violet-400" /> Coding Lab Authoring Suite
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
          <TabsList className="bg-slate-900 border-b border-slate-800 justify-start rounded-none shrink-0 px-2 gap-1">
            <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
            <TabsTrigger value="code" className="text-xs">Code & Solution</TabsTrigger>
            <TabsTrigger value="missions" className="text-xs">Coding Missions</TabsTrigger>
            <TabsTrigger value="tests" className="text-xs">Test Cases ({publicTestCases.length + hiddenTestCases.length})</TabsTrigger>
            <TabsTrigger value="hints" className="text-xs">Hints & Limits</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Problem Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-slate-900 border-slate-800" />
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full h-9 rounded-md bg-slate-900 border border-slate-800 px-3 text-xs text-slate-200"
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="java">Java</option>
                  <option value="c">C</option>
                  <option value="cpp">C++</option>
                  <option value="sql">SQL</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Challenge Style</Label>
                <select
                  value={challengeMode}
                  onChange={(e) => setChallengeMode(e.target.value)}
                  className="w-full h-9 rounded-md bg-slate-900 border border-slate-800 px-3 text-xs text-slate-200"
                >
                  <option value="complete-code">Complete the Code (HackerRank)</option>
                  <option value="debug-code">Fix the Bug</option>
                  <option value="build-from-scratch">Write From Scratch (LeetCode)</option>
                  <option value="predict-output">Predict Output</option>
                  <option value="drag-blocks">Fill Missing Drag Blocks</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Difficulty</Label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as "Easy" | "Medium" | "Hard")}
                  className="w-full h-9 rounded-md bg-slate-900 border border-slate-800 px-3 text-xs text-slate-200"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Problem Description (Markdown)</Label>
              <Textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain problem requirements, algorithms, expected behavior..."
                className="bg-slate-900 border-slate-800 font-sans"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Learning Objective</Label>
              <Input
                value={learningObjective}
                onChange={(e) => setLearningObjective(e.target.value)}
                placeholder="e.g. Master list recursion and boundary handling"
                className="bg-slate-900 border-slate-800"
              />
            </div>
          </TabsContent>

          {/* Code Tab */}
          <TabsContent value="code" className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Starter Code (Student Editor)</Label>
                <span className="text-[10px] text-slate-500">Tip: Use # STUDENT EDIT HERE or # EDITABLE_START to lock non-editable lines</span>
              </div>
              <Textarea
                rows={8}
                value={starterCode}
                onChange={(e) => setStarterCode(e.target.value)}
                className="font-mono bg-slate-900 border-slate-800 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Hidden Reference Solution (Visible only to Instructor)</Label>
              <Textarea
                rows={6}
                value={hiddenSolution}
                onChange={(e) => setHiddenSolution(e.target.value)}
                className="font-mono bg-slate-900 border-slate-800 text-xs text-emerald-300"
              />
            </div>
          </TabsContent>

          {/* Missions Tab */}
          <TabsContent value="missions" className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="font-bold text-slate-200">Coding Missions (Step-by-step Level Progression)</h5>
                <p className="text-[11px] text-slate-400">Students pass Step 1 to unlock Step 2, creating a game-like level progression.</p>
              </div>
              <Button size="sm" onClick={handleAddMissionStep} className="bg-violet-600 hover:bg-violet-500 text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Step
              </Button>
            </div>

            {missionSteps.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-slate-800 rounded text-slate-500">
                No mission steps added yet. Add steps to turn this exercise into a multi-level Coding Mission.
              </div>
            ) : (
              <div className="space-y-3">
                {missionSteps.map((step, idx) => (
                  <div key={step.id} className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-violet-950 text-violet-300">Step {idx + 1}</Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setMissionSteps(missionSteps.filter((_, i) => i !== idx))}
                        className="h-6 w-6 text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={step.title}
                      onChange={(e) => {
                        const updated = [...missionSteps];
                        updated[idx].title = e.target.value;
                        setMissionSteps(updated);
                      }}
                      placeholder="Step Title"
                      className="bg-slate-950 border-slate-800"
                    />
                    <Textarea
                      rows={2}
                      value={step.instructions}
                      onChange={(e) => {
                        const updated = [...missionSteps];
                        updated[idx].instructions = e.target.value;
                        setMissionSteps(updated);
                      }}
                      placeholder="Step instructions..."
                      className="bg-slate-950 border-slate-800"
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Test Cases Tab */}
          <TabsContent value="tests" className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
            {/* Public Tests */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-slate-200">Public Test Cases (Visible to Students)</h5>
                <Button size="sm" variant="outline" onClick={handleAddPublicTest} className="border-slate-700 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Public Test
                </Button>
              </div>
              {publicTestCases.map((tc, idx) => (
                <div key={tc.id} className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <Input
                      value={tc.name}
                      onChange={(e) => {
                        const updated = [...publicTestCases];
                        updated[idx].name = e.target.value;
                        setPublicTestCases(updated);
                      }}
                      className="h-7 w-48 bg-slate-950 border-slate-800 font-bold text-xs"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setPublicTestCases(publicTestCases.filter((_, i) => i !== idx))}
                      className="h-6 w-6 text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={tc.input}
                      onChange={(e) => {
                        const updated = [...publicTestCases];
                        updated[idx].input = e.target.value;
                        setPublicTestCases(updated);
                      }}
                      placeholder="Input"
                      className="bg-slate-950 border-slate-800 font-mono text-xs"
                    />
                    <Input
                      value={tc.expectedOutput}
                      onChange={(e) => {
                        const updated = [...publicTestCases];
                        updated[idx].expectedOutput = e.target.value;
                        setPublicTestCases(updated);
                      }}
                      placeholder="Expected Output"
                      className="bg-slate-950 border-slate-800 font-mono text-xs text-emerald-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Hidden Tests */}
            <div className="space-y-2 border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" /> Hidden Test Cases (Used for Auto-Grading)
                </h5>
                <Button size="sm" variant="outline" onClick={handleAddHiddenTest} className="border-slate-700 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Hidden Test
                </Button>
              </div>
              {hiddenTestCases.map((tc, idx) => (
                <div key={tc.id} className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <Input
                      value={tc.name}
                      onChange={(e) => {
                        const updated = [...hiddenTestCases];
                        updated[idx].name = e.target.value;
                        setHiddenTestCases(updated);
                      }}
                      className="h-7 w-48 bg-slate-950 border-slate-800 font-bold text-xs"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setHiddenTestCases(hiddenTestCases.filter((_, i) => i !== idx))}
                      className="h-6 w-6 text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={tc.input}
                      onChange={(e) => {
                        const updated = [...hiddenTestCases];
                        updated[idx].input = e.target.value;
                        setHiddenTestCases(updated);
                      }}
                      placeholder="Input"
                      className="bg-slate-950 border-slate-800 font-mono text-xs"
                    />
                    <Input
                      value={tc.expectedOutput}
                      onChange={(e) => {
                        const updated = [...hiddenTestCases];
                        updated[idx].expectedOutput = e.target.value;
                        setHiddenTestCases(updated);
                      }}
                      placeholder="Expected Output"
                      className="bg-slate-950 border-slate-800 font-mono text-xs text-emerald-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Hints & Limits Tab */}
          <TabsContent value="hints" className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Progressive Hints (Revealed Step-by-Step)</Label>
                <Button size="sm" variant="ghost" onClick={handleAddHint} className="text-xs text-amber-400">
                  <Plus className="w-3 h-3 mr-1" /> Add Hint
                </Button>
              </div>
              {hints.map((hint, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={hint}
                    onChange={(e) => {
                      const updated = [...hints];
                      updated[idx] = e.target.value;
                      setHints(updated);
                    }}
                    className="bg-slate-900 border-slate-800 text-xs"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleRemoveHint(idx)}
                    className="h-8 w-8 text-rose-400 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4">
              <div className="space-y-1.5">
                <Label>Sample Input</Label>
                <Input value={sampleInput} onChange={(e) => setSampleInput(e.target.value)} className="bg-slate-900 border-slate-800" />
              </div>
              <div className="space-y-1.5">
                <Label>Sample Output</Label>
                <Input value={sampleOutput} onChange={(e) => setSampleOutput(e.target.value)} className="bg-slate-900 border-slate-800" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Constraints</Label>
              <Textarea
                rows={2}
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder="e.g. 1 <= N <= 10^5, Memory < 256MB"
                className="bg-slate-900 border-slate-800 text-xs"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t border-slate-800 pt-3 px-4 flex justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} className="bg-violet-600 hover:bg-violet-500 text-white font-bold">
            Save Coding Lab Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
