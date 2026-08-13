import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LuExplorerNode, StructureAction } from "@/lib/luAuthoring/types";
import { LU_QUESTION_TYPES, QUESTION_TYPE_LABELS, questionTypeLabel } from "@/lib/luAuthoring/quizTypes";
import { buildUpdateConfigAction, dispatchComponentSelected } from "@/lib/luAuthoring/componentSelection";
import { useToastStore } from "@/store/toastStore";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Settings,
  Trash2,
} from "lucide-react";

interface LuQuizEditorProps {
  node: LuExplorerNode;
  config: Record<string, unknown> | null;
  onMutate: (action: StructureAction) => Promise<unknown>;
  onRefresh: () => void;
  variant?: "ide" | "experience";
  selectedQuestionId?: string;
}

type QuestionDraft = Record<string, unknown>;

function resolveQuestionNodeId(questions: LuExplorerNode[], id: string): string | null {
  if (questions.some((q) => q.id === id)) return id;
  const byComponent = questions.find((q) => q.componentId === id);
  return byComponent?.id ?? null;
}

function questionComponentId(q: LuExplorerNode): string {
  return q.componentId ?? q.id;
}

export function LuQuizEditor({
  node,
  config,
  onMutate,
  onRefresh,
  variant = "ide",
  selectedQuestionId,
}: LuQuizEditorProps) {
  const isExperience = variant === "experience";
  const questions = node.children ?? [];
  const listRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef(0);

  const [quizTitle, setQuizTitle] = useState(String(config?.title ?? node.title));
  const [selectedId, setSelectedId] = useState<string | null>(questions[0]?.id ?? null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, QuestionDraft>>({});
  const [quizSettings, setQuizSettings] = useState({
    passingScore: Number((config as { passingScore?: number })?.passingScore ?? 70),
    timeLimitSec: Number((config as { timeLimitSec?: number })?.timeLimitSec ?? 0),
  });
  const toast = useToastStore((s) => s.add);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fieldClass = isExperience ? "" : "bg-[#2d2d2d] border-slate-600";

  useEffect(() => {
    setQuizSettings({
      passingScore: Number((config as { passingScore?: number })?.passingScore ?? 70),
      timeLimitSec: Number((config as { timeLimitSec?: number })?.timeLimitSec ?? 0),
    });
  }, [node.id, config?.passingScore, config?.timeLimitSec]);

  useEffect(() => {
    setQuizTitle(String(config?.title ?? node.title));
  }, [node.id, config?.title, node.title]);

  useEffect(() => {
    if (selectedQuestionId) {
      const resolved = resolveQuestionNodeId(questions, selectedQuestionId);
      if (resolved) setSelectedId(resolved);
    }
  }, [selectedQuestionId, questions]);

  useEffect(() => {
    if (!selectedId) return;
    if (questions.some((q) => q.id === selectedId || q.componentId === selectedId)) return;
    setSelectedId(questions[0]?.id ?? null);
  }, [questions, selectedId]);

  useEffect(() => {
    const onAdd = (e: Event) => {
      const detail = (e as CustomEvent<LuExplorerNode>).detail;
      if (detail?.componentId === node.componentId) setTypePickerOpen(true);
    };
    window.addEventListener("lu-quiz-add-question", onAdd);
    return () => window.removeEventListener("lu-quiz-add-question", onAdd);
  }, [node.componentId]);

  const getDraft = useCallback(
    (q: LuExplorerNode): QuestionDraft => {
      if (questionDrafts[q.id]) return questionDrafts[q.id];
      return (q.config ?? {}) as QuestionDraft;
    },
    [questionDrafts]
  );

  const setDraft = (questionId: string, patch: QuestionDraft) => {
    setQuestionDrafts((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? {}), ...patch },
    }));
  };

  const ctx = useMemo(
    () => ({
      trackId: node.trackId!,
      moduleId: node.moduleId!,
      lessonId: node.lessonId!,
      quizId: node.componentId!,
    }),
    [node]
  );

  const run = async (action: StructureAction) => {
    setBusy(true);
    try {
      if (listRef.current) scrollPos.current = listRef.current.scrollTop;
      const result = (await onMutate(action)) as {
        createdComponentId?: string;
        createdFilePath?: string;
      } | void;
      onRefresh();
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = scrollPos.current;
      });
      return result;
    } catch (err: any) {
      toast({
        title: "Quiz update failed",
        description: err instanceof Error ? err.message : "Could not update quiz",
        variant: "destructive",
      });
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const addQuestion = async (questionType: string) => {
    setTypePickerOpen(false);
    try {
      const result = await run({
        action: "addQuizQuestion",
        ...ctx,
        questionType,
      });
      if (result?.createdComponentId) {
        dispatchComponentSelected(node, config ?? node.config, result.createdComponentId);
        const resolved = resolveQuestionNodeId(questions, result.createdComponentId);
        if (resolved) setSelectedId(resolved);
        else setSelectedId(result.createdComponentId);
      }
    } catch {
      /* toast shown in run */
    }
  };

  const saveQuizMeta = async () => {
    const mergedConfig = {
      ...(config ?? {}),
      title: quizTitle,
      passingScore: quizSettings.passingScore,
      timeLimitSec: quizSettings.timeLimitSec,
      settings: {
        ...((config as { settings?: Record<string, unknown> })?.settings ?? {}),
        passingScore: quizSettings.passingScore,
        timeLimitSec: quizSettings.timeLimitSec,
      },
    };
    const action = buildUpdateConfigAction(node, mergedConfig);
    if (!action) return;
    setBusy(true);
    try {
      await onMutate(action);
      if (quizTitle !== node.title) {
        await onMutate({
          action: "renameComponent",
          trackId: ctx.trackId,
          moduleId: ctx.moduleId,
          lessonId: ctx.lessonId,
          componentId: ctx.quizId,
          title: quizTitle,
        });
      }
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const saveQuestion = async (q: LuExplorerNode) => {
    const draft = getDraft(q);
    const action = buildUpdateConfigAction(q, draft);
    if (!action) return;
    setBusy(true);
    try {
      await onMutate(action);
      setQuestionDrafts((prev) => {
        const next = { ...prev };
        delete next[q.id];
        return next;
      });
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const deleteQuestion = async (q: LuExplorerNode) => {
    if (!confirm("Delete this question?")) return;
    await run({
      action: "removeLessonComponent",
      trackId: ctx.trackId,
      moduleId: ctx.moduleId,
      lessonId: ctx.lessonId,
      componentId: questionComponentId(q),
    });
  };

  const duplicateQuestion = async (q: LuExplorerNode) => {
    await run({
      action: "duplicateQuizQuestion",
      ...ctx,
      questionId: questionComponentId(q),
    });
  };

  const moveQuestion = async (q: LuExplorerNode, direction: "up" | "down") => {
    await run({
      action: "moveQuizQuestion",
      ...ctx,
      questionId: questionComponentId(q),
      direction,
    });
  };

  const reorderQuestions = async (orderedIds: string[]) => {
    await run({
      action: "reorderQuizQuestions",
      ...ctx,
      orderedQuestionIds: orderedIds,
    });
  };

  const handleQuestionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = questions.map((q) => questionComponentId(q));
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...ids];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    void reorderQuestions(next);
  };

  const selected =
    questions.find((q) => q.id === selectedId) ??
    questions.find((q) => q.componentId === selectedId) ??
    null;

  if (!node.trackId || !node.moduleId || !node.lessonId || !node.componentId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Quiz context is incomplete. Re-select the quiz from the explorer.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div
        className={
          isExperience
            ? "flex flex-wrap gap-1 px-3 py-2 border-b shrink-0"
            : "flex flex-wrap gap-1 px-3 py-2 border-b border-slate-700 bg-[#252526] shrink-0"
        }
      >
        <ToolbarBtn icon={<Plus className="w-3.5 h-3.5" />} label="Add Question" onClick={() => setTypePickerOpen(true)} disabled={busy} />
        <ToolbarBtn icon={<Save className="w-3.5 h-3.5" />} label="Save Quiz" onClick={() => void saveQuizMeta()} disabled={busy} />
        <ToolbarBtn
          icon={<Copy className="w-3.5 h-3.5" />}
          label="Duplicate"
          onClick={() =>
            void run({
              action: "duplicateComponent",
              trackId: ctx.trackId,
              moduleId: ctx.moduleId,
              lessonId: ctx.lessonId,
              componentId: ctx.quizId,
            })
          }
          disabled={busy}
        />
        <ToolbarBtn
          icon={<Trash2 className="w-3.5 h-3.5" />}
          label="Delete"
          onClick={() => {
            if (confirm(`Delete quiz "${node.title}"?`)) {
              void run({
                action: "removeLessonComponent",
                trackId: ctx.trackId,
                moduleId: ctx.moduleId,
                lessonId: ctx.lessonId,
                componentId: ctx.quizId,
              });
            }
          }}
          disabled={busy}
          danger
        />
        <ToolbarBtn
          icon={<ChevronUp className="w-3.5 h-3.5" />}
          label="Move Up"
          onClick={() =>
            void run({
              action: "moveComponent",
              trackId: ctx.trackId,
              moduleId: ctx.moduleId,
              lessonId: ctx.lessonId,
              componentId: ctx.quizId,
              direction: "up",
            })
          }
          disabled={busy}
        />
        <ToolbarBtn
          icon={<ChevronDown className="w-3.5 h-3.5" />}
          label="Move Down"
          onClick={() =>
            void run({
              action: "moveComponent",
              trackId: ctx.trackId,
              moduleId: ctx.moduleId,
              lessonId: ctx.lessonId,
              componentId: ctx.quizId,
              direction: "down",
            })
          }
          disabled={busy}
        />
        <ToolbarBtn icon={<Eye className="w-3.5 h-3.5" />} label="Preview" onClick={() => setPreviewOpen(true)} />
        <ToolbarBtn icon={<Settings className="w-3.5 h-3.5" />} label="Settings" onClick={() => setSettingsOpen(true)} />
        {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-1" />}
      </div>

      {/* Quiz title */}
      <div className="px-4 py-3 border-b border-slate-700 shrink-0">
        <Label className="text-xs text-slate-400">Quiz title</Label>
        <Input
          value={quizTitle}
          onChange={(e) => setQuizTitle(e.target.value)}
          className={`mt-1 ${fieldClass}`}
        />
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Question list */}
        <div
          ref={listRef}
          className="w-[42%] border-r border-slate-700 overflow-y-auto shrink-0"
        >
          {questions.length === 0 && (
            <p className="text-xs text-slate-500 p-4">
              No questions yet. Click Add Question to create one.
            </p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleQuestionDragEnd}>
            <SortableContext
              items={questions.map((q) => questionComponentId(q))}
              strategy={verticalListSortingStrategy}
            >
              {questions.map((q, idx) => (
                <SortableQuestionRow
                  key={q.id}
                  question={q}
                  index={idx}
                  isSelected={selectedId === q.id}
                  isCollapsed={collapsed.has(q.id)}
                  qType={String(getDraft(q).questionType ?? "multiple-choice")}
                  preview={String(getDraft(q).question ?? "")}
                  onSelect={() => setSelectedId(q.id)}
                  onDuplicate={() => void duplicateQuestion(q)}
                  onDelete={() => void deleteQuestion(q)}
                  onMoveUp={() => void moveQuestion(q, "up")}
                  onMoveDown={() => void moveQuestion(q, "down")}
                  onToggleCollapse={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(q.id)) next.delete(q.id);
                      else next.add(q.id);
                      return next;
                    })
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Question editor */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selected && (
            <p className="text-sm text-slate-500">Select a question to edit, or add a new one.</p>
          )}
          {selected && (
            <QuestionEditor
              question={selected}
              draft={getDraft(selected)}
              fieldClass={fieldClass}
              onChange={(patch) => setDraft(selected.id, patch)}
              onSave={() => void saveQuestion(selected)}
              saving={busy}
            />
          )}
        </div>
      </div>

      {/* Type picker */}
      <Dialog open={typePickerOpen} onOpenChange={setTypePickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Question Type</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
            {LU_QUESTION_TYPES.map((type) => (
              <Button
                key={type}
                variant="outline"
                className="justify-start h-auto py-2 text-left"
                onClick={() => void addQuestion(type)}
              >
                {QUESTION_TYPE_LABELS[type]}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{quizTitle} — Student Preview</DialogTitle>
          </DialogHeader>
          <QuizStudentPreview title={quizTitle} questions={questions} getDraft={getDraft} />
        </DialogContent>
      </Dialog>

      {/* Settings */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quiz Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Passing score (%)">
              <Input
                type="number"
                value={String(quizSettings.passingScore)}
                className={fieldClass}
                onChange={(e) =>
                  setQuizSettings((s) => ({ ...s, passingScore: Number(e.target.value) }))
                }
              />
            </Field>
            <Field label="Time limit (seconds, 0 = none)">
              <Input
                type="number"
                value={String(quizSettings.timeLimitSec)}
                className={fieldClass}
                onChange={(e) =>
                  setQuizSettings((s) => ({ ...s, timeLimitSec: Number(e.target.value) }))
                }
              />
            </Field>
            <Button onClick={() => void saveQuizMeta()} disabled={busy}>
              Save settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableQuestionRow({
  question,
  index,
  isSelected,
  isCollapsed,
  qType,
  preview,
  onSelect,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleCollapse,
}: {
  question: LuExplorerNode;
  index: number;
  isSelected: boolean;
  isCollapsed: boolean;
  qType: string;
  preview: string;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
}) {
  const id = questionComponentId(question);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border-b border-slate-800 ${isSelected ? "bg-[#2a2d2e]" : "hover:bg-[#252526]"}`}
    >
      <div className="flex items-center gap-1 px-2 py-2 cursor-pointer" onClick={onSelect}>
        <button
          type="button"
          className="p-0.5 text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-slate-500 w-5 shrink-0">{index + 1}</span>
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 shrink-0">
          {questionTypeLabel(qType)}
        </span>
        <span className="text-sm truncate flex-1">{question.title}</span>
        <button type="button" className="p-1 text-slate-500 hover:text-slate-300" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Duplicate">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="p-1 text-slate-500 hover:text-red-400" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="p-1 text-slate-500 hover:text-slate-300" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} title="Move up">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="p-1 text-slate-500 hover:text-slate-300" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} title="Move down">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="p-1 text-slate-500 hover:text-slate-300" onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }} title={isCollapsed ? "Expand" : "Collapse"}>
          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>
      {!isCollapsed && isSelected && preview && (
        <div className="px-3 pb-2 text-xs text-slate-500 truncate">{preview}</div>
      )}
    </div>
  );
}

function ToolbarBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-600 hover:bg-slate-700 disabled:opacity-50 ${
        danger ? "text-red-400 hover:text-red-300" : "text-slate-300"
      }`}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-400">{label}</Label>
      {children}
    </div>
  );
}

function FillBlankFields({
  draft,
  set,
  fieldClass,
}: {
  draft: QuestionDraft;
  set: (key: string, value: unknown) => void;
  fieldClass: string;
}) {
  const blanks = (draft.blanks as Array<{ id?: string; answer?: string; caseSensitive?: boolean }>) ?? [
    { id: "b1", answer: "", caseSensitive: false },
  ];

  const updateBlank = (index: number, patch: Partial<{ answer: string; caseSensitive: boolean }>) => {
    const next = blanks.map((b, i) => (i === index ? { ...b, ...patch } : b));
    set("blanks", next);
  };

  const addBlank = () => {
    const id = `b${blanks.length + 1}`;
    set("blanks", [...blanks, { id, answer: "", caseSensitive: false }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Blanks</Label>
        <Button type="button" size="sm" variant="outline" onClick={addBlank}>
          Add blank
        </Button>
      </div>
      {blanks.map((b, i) => (
        <div key={b.id ?? i} className="rounded border border-slate-700 p-3 space-y-2">
          <Field label={`Blank ${i + 1} — correct answer`}>
            <Input
              value={String(b.answer ?? "")}
              onChange={(e) => updateBlank(i, { answer: e.target.value })}
              className={fieldClass}
              placeholder="Expected answer"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(b.caseSensitive)}
              onChange={(e) => updateBlank(i, { caseSensitive: e.target.checked })}
            />
            Case sensitive
          </label>
        </div>
      ))}
      <p className="text-[11px] text-slate-500">
        Use underscores in your question text for each blank, e.g. &quot;The capital of France is _____.&quot;
      </p>
    </div>
  );
}

function MatchingFields({
  draft,
  set,
  fieldClass,
}: {
  draft: QuestionDraft;
  set: (key: string, value: unknown) => void;
  fieldClass: string;
}) {
  const pairs = (draft.pairs as Array<{ left?: string; right?: string }>) ?? [
    { left: "Term A", right: "Definition A" },
    { left: "Term B", right: "Definition B" },
  ];

  const updatePair = (index: number, side: "left" | "right", value: string) => {
    const next = pairs.map((p, i) => (i === index ? { ...p, [side]: value } : p));
    set("pairs", next);
  };

  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <Input
            value={String(p.left ?? "")}
            onChange={(e) => updatePair(i, "left", e.target.value)}
            placeholder={`Left ${i + 1}`}
            className={fieldClass}
          />
          <Input
            value={String(p.right ?? "")}
            onChange={(e) => updatePair(i, "right", e.target.value)}
            placeholder={`Right ${i + 1}`}
            className={fieldClass}
          />
        </div>
      ))}
    </div>
  );
}

function CodingTestFields({
  draft,
  set,
  fieldClass,
}: {
  draft: QuestionDraft;
  set: (key: string, value: unknown) => void;
  fieldClass: string;
}) {
  const tests = (draft.tests as Array<{ input?: string; expectedOutput?: string }>) ?? [
    { input: "", expectedOutput: "" },
  ];

  const updateTest = (index: number, patch: Partial<{ input: string; expectedOutput: string }>) => {
    const next = tests.map((t, i) => (i === index ? { ...t, ...patch } : t));
    set("tests", next);
  };

  const addTest = () => set("tests", [...tests, { input: "", expectedOutput: "" }]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Test cases</Label>
        <Button type="button" size="sm" variant="outline" onClick={addTest}>
          Add test
        </Button>
      </div>
      {tests.map((t, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <Input
            value={String(t.input ?? "")}
            onChange={(e) => updateTest(i, { input: e.target.value })}
            placeholder="Input"
            className={fieldClass}
          />
          <Input
            value={String(t.expectedOutput ?? "")}
            onChange={(e) => updateTest(i, { expectedOutput: e.target.value })}
            placeholder="Expected output"
            className={fieldClass}
          />
        </div>
      ))}
    </div>
  );
}

function QuestionEditor({
  question: _question,
  draft,
  fieldClass,
  onChange,
  onSave,
  saving,
}: {
  question: LuExplorerNode;
  draft: QuestionDraft;
  fieldClass: string;
  onChange: (patch: QuestionDraft) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const type = String(draft.questionType ?? "multiple-choice");
  const set = (key: string, value: unknown) => onChange({ [key]: value });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{questionTypeLabel(type)}</h3>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save question
        </Button>
      </div>

      <Field label="Question">
        <Textarea
          value={String(draft.question ?? "")}
          onChange={(e) => set("question", e.target.value)}
          rows={3}
          className={fieldClass}
        />
      </Field>

      {(type === "multiple-choice" || type === "multiple-select") && (
        <>
          {(["A", "B", "C", "D"] as const).map((letter) => (
            <Field key={letter} label={`Option ${letter}`}>
              <Input
                value={String(draft[`option${letter}`] ?? "")}
                onChange={(e) => set(`option${letter}`, e.target.value)}
                className={fieldClass}
              />
            </Field>
          ))}
          <Field label="Correct answer">
            <Input
              value={String(draft.correct ?? "B")}
              onChange={(e) => set("correct", e.target.value.toUpperCase())}
              className={fieldClass}
            />
          </Field>
        </>
      )}

      {type === "true-false" && (
        <Field label="Correct answer">
          <select
            value={String(draft.correct ?? "true")}
            onChange={(e) => set("correct", e.target.value)}
            className={`w-full rounded border px-2 py-1.5 text-sm ${fieldClass}`}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </Field>
      )}

      {type === "fill-blank" && (
        <FillBlankFields draft={draft} set={set} fieldClass={fieldClass} />
      )}

      {type === "multiple-select" && (
        <>
          <Field label="Options (one per line)">
            <Textarea
              value={((draft.options as string[]) ?? []).join("\n")}
              onChange={(e) =>
                set(
                  "options",
                  e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                )
              }
              rows={4}
              className={fieldClass}
            />
          </Field>
          <Field label="Correct answers (comma-separated letters)">
            <Input
              value={Array.isArray(draft.correct) ? (draft.correct as string[]).join(", ") : String(draft.correct ?? "")}
              onChange={(e) =>
                set(
                  "correct",
                  e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
                )
              }
              className={fieldClass}
            />
          </Field>
        </>
      )}

      {type === "matching" && (
        <MatchingFields draft={draft} set={set} fieldClass={fieldClass} />
      )}

      {type === "ordering" && (
        <Field label="Items (one per line, in correct order)">
          <Textarea
            value={((draft.items as string[]) ?? []).join("\n")}
            onChange={(e) => {
              const items = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
              set("items", items);
              set("correctOrder", items.map((_, i) => i));
            }}
            rows={4}
            className={fieldClass}
          />
        </Field>
      )}

      {type === "numerical" && (
        <>
          <Field label="Correct answer">
            <Input
              type="number"
              value={String(draft.answer ?? 0)}
              onChange={(e) => set("answer", Number(e.target.value))}
              className={fieldClass}
            />
          </Field>
          <Field label="Tolerance">
            <Input
              type="number"
              value={String(draft.tolerance ?? 0.01)}
              onChange={(e) => set("tolerance", Number(e.target.value))}
              className={fieldClass}
            />
          </Field>
          <Field label="Unit">
            <Input value={String(draft.unit ?? "")} onChange={(e) => set("unit", e.target.value)} className={fieldClass} />
          </Field>
        </>
      )}

      {(type === "short-answer" || type === "long-answer" || type === "essay") && (
        <Field label="Sample / rubric">
          <Textarea
            value={String(draft.sampleAnswer ?? draft.rubric ?? "")}
            onChange={(e) => set(type === "short-answer" ? "sampleAnswer" : "rubric", e.target.value)}
            rows={3}
            className={fieldClass}
          />
        </Field>
      )}

      {type === "coding" && (
        <>
          <Field label="Language">
            <select
              value={String(draft.language ?? "python")}
              onChange={(e) => set("language", e.target.value)}
              className={`w-full rounded border px-2 py-1.5 text-sm ${fieldClass}`}
            >
              {["python", "javascript", "typescript", "java", "c", "cpp", "go", "rust", "sql"].map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Starter code">
            <Textarea
              value={String(draft.starterCode ?? "")}
              onChange={(e) => set("starterCode", e.target.value)}
              rows={6}
              className={`font-mono text-xs ${fieldClass}`}
            />
          </Field>
          <CodingTestFields draft={draft} set={set} fieldClass={fieldClass} />
          <Field label="Time limit (ms)">
            <Input
              type="number"
              value={String(draft.timeLimitMs ?? 5000)}
              onChange={(e) => set("timeLimitMs", Number(e.target.value))}
              className={fieldClass}
            />
          </Field>
        </>
      )}

      {type === "file-upload" && (
        <>
          <Field label="Allowed file types (comma-separated)">
            <Input
              value={
                Array.isArray(draft.allowedTypes)
                  ? (draft.allowedTypes as string[]).join(", ")
                  : String(draft.allowedTypes ?? "pdf, zip")
              }
              onChange={(e) =>
                set(
                  "allowedTypes",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                )
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Max size (MB)">
            <Input
              type="number"
              value={String(draft.maxSizeMb ?? 10)}
              onChange={(e) => set("maxSizeMb", Number(e.target.value))}
              className={fieldClass}
            />
          </Field>
        </>
      )}

      {type === "case-study" && (
        <>
          <Field label="Scenario">
            <Textarea
              value={String(draft.scenario ?? "")}
              onChange={(e) => set("scenario", e.target.value)}
              rows={5}
              className={fieldClass}
            />
          </Field>
          <Field label="Sub-questions (one per line)">
            <Textarea
              value={
                Array.isArray(draft.subQuestions)
                  ? (draft.subQuestions as Array<{ prompt?: string } | string>)
                      .map((sq) => (typeof sq === "string" ? sq : String(sq.prompt ?? "")))
                      .join("\n")
                  : ""
              }
              onChange={(e) =>
                set(
                  "subQuestions",
                  e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((prompt) => ({ prompt, type: "short-answer" }))
                )
              }
              rows={4}
              className={fieldClass}
            />
          </Field>
        </>
      )}

      {type === "image-based" && (
        <>
          <Field label="Image URL">
            <Input
              value={String(draft.imageUrl ?? draft.image ?? "")}
              onChange={(e) => set("imageUrl", e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Hotspot label (optional)">
            <Input
              value={String((draft.hotspot as { label?: string } | null)?.label ?? "")}
              onChange={(e) =>
                set("hotspot", e.target.value ? { label: e.target.value, x: 50, y: 50 } : null)
              }
              className={fieldClass}
              placeholder="Region students must identify"
            />
          </Field>
        </>
      )}

      {type === "audio-based" && (
        <>
          <Field label="Audio URL">
            <Input
              value={String(draft.audioUrl ?? draft.audio ?? "")}
              onChange={(e) => set("audioUrl", e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Transcript">
            <Textarea
              value={String(draft.transcript ?? "")}
              onChange={(e) => set("transcript", e.target.value)}
              rows={4}
              className={fieldClass}
            />
          </Field>
        </>
      )}

      {type === "video-based" && (
        <>
          <Field label="Video URL">
            <Input
              value={String(draft.videoUrl ?? draft.video ?? "")}
              onChange={(e) => set("videoUrl", e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Timestamp (seconds)">
            <Input
              type="number"
              value={String(draft.timestamp ?? 0)}
              onChange={(e) => set("timestamp", Number(e.target.value))}
              className={fieldClass}
            />
          </Field>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Marks">
          <Input
            type="number"
            value={String(draft.marks ?? 1)}
            onChange={(e) => set("marks", Number(e.target.value))}
            className={fieldClass}
          />
        </Field>
        <Field label="Difficulty">
          <select
            value={String(draft.difficulty ?? "medium")}
            onChange={(e) => set("difficulty", e.target.value)}
            className={`w-full rounded border px-2 py-1.5 text-sm ${fieldClass}`}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </Field>
      </div>

      <Field label="Explanation">
        <Textarea
          value={String(draft.explanation ?? "")}
          onChange={(e) => set("explanation", e.target.value)}
          rows={2}
          className={fieldClass}
        />
      </Field>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(draft.shuffle)}
            onChange={(e) => set("shuffle", e.target.checked)}
          />
          Shuffle options
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.required !== false}
            onChange={(e) => set("required", e.target.checked)}
          />
          Required
        </label>
      </div>

      <Field label="Image URL">
        <Input value={String(draft.image ?? "")} onChange={(e) => set("image", e.target.value)} className={fieldClass} />
      </Field>
      <Field label="Video URL">
        <Input value={String(draft.video ?? "")} onChange={(e) => set("video", e.target.value)} className={fieldClass} />
      </Field>
      <Field label="Time limit (seconds)">
        <Input
          type="number"
          value={String(draft.timeLimitSec ?? 0)}
          onChange={(e) => set("timeLimitSec", Number(e.target.value))}
          className={fieldClass}
        />
      </Field>
    </div>
  );
}

function QuizStudentPreview({
  title,
  questions,
  getDraft,
}: {
  title: string;
  questions: LuExplorerNode[];
  getDraft: (q: LuExplorerNode) => QuestionDraft;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {questions.map((q, i) => {
        const d = getDraft(q);
        const type = String(d.questionType ?? "multiple-choice");
        return (
          <div key={q.id} className="rounded-lg border p-4 space-y-3">
            <p className="font-medium">
              {i + 1}. {String(d.question ?? q.title)}
              {Number(d.marks) > 0 && (
                <span className="text-sm text-muted-foreground ml-2">({Number(d.marks)} marks)</span>
              )}
            </p>
            {type === "multiple-choice" && (
              <div className="space-y-2">
                {(["A", "B", "C", "D"] as const).map((letter) => (
                  <label key={letter} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name={q.id} disabled />
                    <span>
                      {letter}. {String(d[`option${letter}`] ?? "")}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {type === "true-false" && (
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name={q.id} disabled /> True
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name={q.id} disabled /> False
                </label>
              </div>
            )}
            {(type === "short-answer" || type === "essay" || type === "long-answer") && (
              <Textarea placeholder="Your answer…" rows={type === "short-answer" ? 2 : 5} disabled={false} />
            )}
            {type === "coding" && (
              <pre className="bg-muted p-3 rounded text-xs font-mono overflow-x-auto">
                {String(d.starterCode ?? "")}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
