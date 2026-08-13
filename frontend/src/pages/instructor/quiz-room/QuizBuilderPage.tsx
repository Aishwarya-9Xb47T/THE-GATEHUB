import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { arrayMove } from "@dnd-kit/sortable";
import {
  getQuizEditor,
  validateQuiz,
  listQuizVersions,
  restoreQuizVersion,
} from "@/lib/quizBuilder/api";
import type { QuizEditorData, QuizQuestion } from "@/lib/quizBuilder/types";
import { newQuestion } from "@/lib/quizBuilder/questionTypeUtils";
import { validateQuestionLive } from "@/lib/quizBuilder/questionLiveValidation";
import { pushRecentType } from "@/lib/quizBuilder/questionTypeCatalog";
import { QuestionNavigator } from "@/components/quiz-builder/studio/QuestionNavigator";
import { PropertiesPanelTabs } from "@/components/quiz-builder/studio/PropertiesPanelTabs";
import { QuizQuestionsCanvas, scrollToQuestionCard } from "@/components/quiz-builder/studio/QuizQuestionsCanvas";
import { AddQuestionTypeModal } from "@/components/quiz-builder/studio/AddQuestionTypeModal";
import { BulkActionsBar } from "@/components/quiz-builder/studio/BulkActionsBar";
import { QuizStudioHeader } from "@/components/quiz-builder/studio/QuizStudioHeader";
import { StudentPreviewStudio } from "@/components/quiz-builder/studio/StudentPreviewStudio";
import { QuizAuthoringStudioShell } from "@/components/quiz-builder/studio/QuizAuthoringStudioShell";
import { AiStudioPanel } from "@/components/quiz-builder/studio/AiStudioPanel";
import { stripMockArtifacts } from "@/lib/aiAssessmentStudio/sanitizeQuestion";
import { useQuizAutoSave } from "@/hooks/useQuizAutoSave";
import { useQuizStudioHistory } from "@/hooks/useQuizStudioHistory";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RichContentEditor } from "@/components/media";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToastStore } from "@/store/toastStore";
import { SaveTemplateDialog } from "@/components/template-library/SaveTemplateDialog";

export function QuizBuilderPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();

  const [quiz, setQuiz] = useState<QuizEditorData | null>(() =>
    quizId ? queryClient.getQueryData<QuizEditorData>(["quiz-editor", quizId]) ?? null : null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);
  const [initialFocusDone, setInitialFocusDone] = useState(false);
  const fromContentBuilder = Boolean((location.state as { fromContentBuilder?: boolean } | null)?.fromContentBuilder);
  const previewInitialIndex = useMemo(() => {
    if (!selectedId || !quiz?.questions.length) return 0;
    const idx = quiz.questions.findIndex((q) => q.id === selectedId);
    return idx >= 0 ? idx : 0;
  }, [selectedId, quiz?.questions]);
  const pendingContentBuilderFocus = useRef(false);
  const deferValidation = useRef(fromContentBuilder);

  useEffect(() => {
    if (!deferValidation.current) return;
    const t = window.setTimeout(() => {
      deferValidation.current = false;
      if (quizId && quiz) {
        void queryClient.invalidateQueries({ queryKey: ["quiz-validate", quizId] });
      }
    }, 2500);
    return () => window.clearTimeout(t);
  }, [quizId, quiz, queryClient]);

  const { pushSnapshot, undo, redo, canUndo, canRedo, reset: resetHistory } = useQuizStudioHistory(quiz);

  const { data, isLoading, error: quizLoadError } = useQuery({
    queryKey: ["quiz-editor", quizId],
    enabled: !!quizId,
    initialData: () => queryClient.getQueryData<QuizEditorData>(["quiz-editor", quizId!]),
    queryFn: async () => {
      const res = await getQuizEditor(quizId!);
      if (res.error) {
        console.error("[QuizBuilderPage] Failed to load quiz", { error: res.error, quizId });
        throw new Error(res.error || "Failed to load quiz data");
      }
      const quizData = res.data?.data;
      if (!quizData) {
        console.error("[QuizBuilderPage] Quiz data is empty", { quizId, response: res.data });
        throw new Error("Quiz data not found in response");
      }
      return quizData;
    },
    staleTime: fromContentBuilder ? 30_000 : 0,
  });

  // Handle quiz load errors
  useEffect(() => {
    if (quizLoadError) {
      console.error("[QuizBuilderPage] Quiz load error", quizLoadError);
      toast({
        title: "Failed to load quiz",
        description: quizLoadError.message || "Could not load quiz data. Please try again.",
        variant: "destructive",
      });
    }
  }, [quizLoadError, toast]);

  const { data: validation } = useQuery({
    queryKey: ["quiz-validate", quizId, quiz?.version],
    enabled: !!quizId && !!quiz && !deferValidation.current,
    queryFn: async () => {
      const res = await validateQuiz(quizId!);
      return res.data?.data;
    },
  });

  const { data: versions } = useQuery({
    queryKey: ["quiz-versions", quizId],
    enabled: versionsOpen && !!quizId,
    queryFn: async () => {
      const res = await listQuizVersions(quizId!);
      return res.data?.data || [];
    },
  });

  useEffect(() => {
    if (!data) return;
    if (!data.questions || !Array.isArray(data.questions)) {
      console.error("[QuizBuilderPage] Invalid quiz data - questions missing or not an array", data);
      toast({
        title: "Invalid quiz data",
        description: "Quiz questions are missing or invalid. Please try reloading.",
        variant: "destructive",
      });
      return;
    }
    setQuiz({
      ...data,
      questions: data.questions.map((q) => ({
        ...q,
        text: stripMockArtifacts(q.text),
        options: (q.options || []).map((o) => ({ ...o, text: stripMockArtifacts(o.text) })),
      })),
    });
    resetHistory();
    setInitialFocusDone(false);
    if (!selectedId && data.questions[0]) setSelectedId(data.questions[0].id);
  }, [data, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fromCB = (location.state as { fromContentBuilder?: boolean } | null)?.fromContentBuilder;
    if (!fromCB || !quizId) return;
    pendingContentBuilderFocus.current = true;
    queryClient.invalidateQueries({ queryKey: ["quiz-editor", quizId] });
    toast({
      title: "Questions ready",
      description: "Review and edit any question below, then use Host Live when you're ready.",
      variant: "success",
    });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, quizId, queryClient, toast, navigate]);

  useEffect(() => {
    if (!pendingContentBuilderFocus.current || !quiz?.questions.length) return;
    pendingContentBuilderFocus.current = false;
    setInitialFocusDone(false);
    const first = quiz.questions[0]!;
    setSelectedId(first.id);
    requestAnimationFrame(() => scrollToQuestionCard(first.id));
  }, [quiz]);

  // Focus Question 1 stem on first load — user already chose "Create Manually" in wizard
  useEffect(() => {
    if (!quiz || initialFocusDone || !selectedId) return;
    const el = document.getElementById(`question-stem-${selectedId}`) as HTMLTextAreaElement | null;
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        setInitialFocusDone(true);
      });
    }
  }, [quiz, selectedId, initialFocusDone]);

  const { status, lastSynced, saveNow } = useQuizAutoSave(quizId!, quiz);

  useEffect(() => {
    const prev = document.title;
    const label = quiz?.title?.trim() || "Quiz Builder";
    document.title = `${label} — Quiz Room — THE GATEHUB`;
    return () => {
      document.title = prev;
    };
  }, [quiz?.title]);

  const selected = useMemo(
    () => quiz?.questions.find((q) => q.id === selectedId) || null,
    [quiz, selectedId]
  );

  const liveIssues = useMemo(
    () => (selected ? validateQuestionLive(selected) : []),
    [selected]
  );

  const updateQuizWithHistory = useCallback(
    (patch: Partial<QuizEditorData>) => {
      setQuiz((prev) => {
        if (!prev) return prev;
        pushSnapshot(prev);
        return { ...prev, ...patch };
      });
    },
    [pushSnapshot]
  );

  const updateQuestion = useCallback(
    (id: string, patch: Partial<QuizQuestion>) => {
      setQuiz((prev) => {
        if (!prev) return prev;
        pushSnapshot(prev);
        return {
          ...prev,
          questions: prev.questions.map((q) =>
            q.id === id ? ({ ...q, ...patch, options: patch.options ?? q.options } as QuizQuestion) : q
          ),
        };
      });
    },
    [pushSnapshot]
  );

  const handleUndo = () => {
    if (!quiz) return;
    const prev = undo(quiz);
    if (prev) setQuiz(prev);
  };

  const handleRedo = () => {
    if (!quiz) return;
    const next = redo(quiz);
    if (next) setQuiz(next);
  };

  const handleReorder = (activeId: string, overId: string) => {
    if (!quiz) return;
    const oldIndex = quiz.questions.findIndex((q) => q.id === activeId);
    const newIndex = quiz.questions.findIndex((q) => q.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;
    updateQuizWithHistory({ questions: arrayMove(quiz.questions, oldIndex, newIndex) });
  };

  const openAddModal = (afterIndex: number | null = null) => {
    setInsertAfterIndex(afterIndex);
    setAddModalOpen(true);
  };

  const addQuestionOfType = (type: string) => {
    if (!quiz) return;
    pushRecentType(type);
    const q = newQuestion(quiz.questions.length, type);
    const insertPos = insertAfterIndex === null ? quiz.questions.length : insertAfterIndex + 1;
    const questions = [...quiz.questions.slice(0, insertPos), q, ...quiz.questions.slice(insertPos)];
    updateQuizWithHistory({ questions });
    setSelectedId(q.id);
    setInsertAfterIndex(null);
    setAddModalOpen(false);
    requestAnimationFrame(() => {
      scrollToQuestionCard(q.id);
      const el = document.getElementById(`question-stem-${q.id}`) as HTMLTextAreaElement | null;
      el?.focus();
    });
  };

  const duplicateQuestion = (id: string) => {
    if (!quiz) return;
    const src = quiz.questions.find((q) => q.id === id);
    if (!src) return;
    const copy = {
      ...src,
      id: `new-${Date.now()}`,
      options: src.options.map((o) => ({ ...o, id: `o-${Math.random()}` })),
    };
    updateQuizWithHistory({ questions: [...quiz.questions, copy] });
    setSelectedId(copy.id);
  };

  const deleteQuestion = (id: string) => {
    if (!quiz) return;
    if (quiz.questions.length <= 1) {
      toast({ title: "Cannot delete the last question", variant: "destructive" });
      return;
    }
    const next = quiz.questions.filter((q) => q.id !== id);
    updateQuizWithHistory({ questions: next });
    if (selectedId === id) setSelectedId(next[0]?.id || null);
    setSelectedIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = () => {
    if (!quiz || selectedIds.size === 0) return;
    const remaining = quiz.questions.filter((q) => !selectedIds.has(q.id));
    if (remaining.length === 0) {
      toast({ title: "Keep at least one question", variant: "destructive" });
      return;
    }
    updateQuizWithHistory({ questions: remaining });
    setSelectedIds(new Set());
    if (selectedId && selectedIds.has(selectedId)) setSelectedId(remaining[0]?.id || null);
  };

  const bulkDuplicate = () => {
    if (!quiz || selectedIds.size === 0) return;
    const copies = quiz.questions
      .filter((q) => selectedIds.has(q.id))
      .map((src) => ({
        ...src,
        id: `new-${Date.now()}-${Math.random()}`,
        options: src.options.map((o) => ({ ...o, id: `o-${Math.random()}` })),
      }));
    updateQuizWithHistory({ questions: [...quiz.questions, ...copies] });
    toast({ title: `Duplicated ${copies.length} question(s)`, variant: "success" });
  };

  const bulkExport = () => {
    if (!quiz) return;
    const exported = quiz.questions.filter((q) => selectedIds.has(q.id));
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${quiz.title || "quiz"}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const bulkChangeDifficulty = (d: string) => {
    if (!quiz) return;
    updateQuizWithHistory({
      questions: quiz.questions.map((q) => (selectedIds.has(q.id) ? { ...q, difficulty: d } : q)),
    });
  };

  const bulkChangeBloom = (b: string) => {
    if (!quiz) return;
    updateQuizWithHistory({
      questions: quiz.questions.map((q) => (selectedIds.has(q.id) ? { ...q, bloomLevel: b } : q)),
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if ((isLoading && !data && !quiz) || !quiz) {
    return (
      <QuizAuthoringStudioShell>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading authoring studio…</p>
        </div>
      </QuizAuthoringStudioShell>
    );
  }

  const renderCanvas = () => (
    <>
      {quiz.questions.length === 0 ? (
        <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-muted-foreground">No questions yet. Add your first question to begin.</p>
          <Button size="lg" onClick={() => openAddModal(null)}>Add Question</Button>
        </div>
      ) : (
        <main className="h-full overflow-y-auto">
          <QuizQuestionsCanvas
            questions={quiz.questions}
            focusedId={selectedId}
            collapsedIds={collapsedIds}
            onFocus={setSelectedId}
            onToggleCollapse={toggleCollapse}
            onChange={updateQuestion}
            onDuplicate={duplicateQuestion}
            onDelete={deleteQuestion}
            onInsertAt={(idx) => openAddModal(idx)}
            onOpenAi={() => setAiDrawerOpen(true)}
            onReorder={handleReorder}
          />
          <BulkActionsBar
            count={selectedIds.size}
            onDelete={bulkDelete}
            onDuplicate={bulkDuplicate}
            onExport={bulkExport}
            onAiImprove={() => setAiDrawerOpen(true)}
            onChangeDifficulty={bulkChangeDifficulty}
            onChangeBloom={bulkChangeBloom}
            onClear={() => setSelectedIds(new Set())}
          />
        </main>
      )}
    </>
  );

  return (
    <QuizAuthoringStudioShell>
    <div className="studio-shell flex h-full min-h-0 flex-col bg-background">
      <QuizStudioHeader
        quiz={quiz}
        status={status}
        lastSynced={lastSynced}
        validationValid={validation?.valid}
        validationErrors={validation?.errors?.length}
        canUndo={canUndo}
        canRedo={canRedo}
        aiPanelOpen={aiDrawerOpen}
        onTitleChange={(title) => updateQuizWithHistory({ title })}
        onSave={saveNow}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenPreview={() => setPreviewOpen(true)}
        onToggleAi={() => setAiDrawerOpen((v) => !v)}
        onBuildFromContent={() =>
          navigate(`/instructor/quiz-room/create?method=build_from_content&returnQuizId=${quizId}`)
        }
        onHistory={() => setVersionsOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onCommand={() => setCommandOpen(true)}
        onSaveTemplate={() => setSaveTemplateOpen(true)}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <PanelGroup {...({ orientation: "horizontal", className: "h-full w-full min-w-0", autoSaveId: "quiz-studio-panels" } as any)}>
          <Panel
            id="navigator"
            defaultSize="24%"
            minSize="18%"
            maxSize="36%"
            className="min-w-0 !overflow-hidden"
          >
            <div className="flex h-full w-full min-h-0 flex-col overflow-hidden border-r border-border/40 bg-card/50">
              <QuestionNavigator
              questions={quiz.questions}
              sections={quiz.sections}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelect={setSelectedId}
              onToggleSelect={toggleSelect}
              onDuplicate={duplicateQuestion}
              onDelete={deleteQuestion}
              onReorder={handleReorder}
              onOpenAddModal={() => openAddModal(null)}
              onScrollToQuestion={scrollToQuestionCard}
            />
            </div>
          </Panel>

          <PanelResizeHandle className="w-1.5 shrink-0 bg-border/50 transition-colors hover:bg-primary/50" />

          <Panel id="canvas" defaultSize="46%" minSize="28%" className="min-w-0 !overflow-hidden">
            <div className="h-full w-full min-h-0 overflow-hidden bg-background">
              {renderCanvas()}
            </div>
          </Panel>

          <PanelResizeHandle className="w-1.5 shrink-0 bg-border/50 transition-colors hover:bg-primary/50" />

          <Panel
            id="properties"
            defaultSize="30%"
            minSize="20%"
            maxSize="42%"
            className="min-w-0 !overflow-hidden"
          >
            <div className="flex h-full w-full min-h-0 flex-col overflow-hidden border-l border-border/40 bg-card/50">
            {aiDrawerOpen ? (
              <AiStudioPanel
                question={selected}
                onApply={(patch) => selected && updateQuestion(selected.id, patch)}
                onClose={() => setAiDrawerOpen(false)}
                className="h-full border-l-0"
              />
            ) : selected ? (
              <PropertiesPanelTabs
                quiz={quiz}
                question={selected}
                liveIssues={liveIssues}
                validation={validation}
                onUpdateQuestion={(patch) => updateQuestion(selected.id, patch)}
                onUpdateQuiz={updateQuizWithHistory}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                Select a question for properties
              </div>
            )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <AddQuestionTypeModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onSelect={addQuestionOfType}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quiz settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <RichContentEditor
                compact
                value={quiz.description || ""}
                onChange={(text) => updateQuizWithHistory({ description: text })}
                inputId="quiz-description"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={quiz.settings.shuffleQuestions}
                onChange={(e) => updateQuizWithHistory({ settings: { ...quiz.settings, shuffleQuestions: e.target.checked } })}
              />
              Shuffle questions
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={quiz.settings.shuffleOptions}
                onChange={(e) => updateQuizWithHistory({ settings: { ...quiz.settings, shuffleOptions: e.target.checked } })}
              />
              Shuffle options
            </label>
            <div className="space-y-2">
              <Label>Time per question (sec)</Label>
              <Input
                type="number"
                value={quiz.settings.timePerQuestion}
                onChange={(e) =>
                  updateQuizWithHistory({ settings: { ...quiz.settings, timePerQuestion: Number(e.target.value) } })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Passing score %</Label>
              <Input
                type="number"
                value={quiz.settings.passingScore}
                onChange={(e) =>
                  updateQuizWithHistory({ settings: { ...quiz.settings, passingScore: Number(e.target.value) } })
                }
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
          </DialogHeader>
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {(versions || []).map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Version {v.version}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const res = await restoreQuizVersion(quizId!, v.version);
                    if (res.data?.data) {
                      setQuiz(res.data.data);
                      toast({ title: `Restored v${v.version}`, variant: "success" });
                      queryClient.invalidateQueries({ queryKey: ["quiz-editor", quizId] });
                    }
                  }}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Command palette</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {[
              { label: "Save now", action: () => { saveNow(); setCommandOpen(false); } },
              { label: "Student preview", action: () => { setPreviewOpen(true); setCommandOpen(false); } },
              { label: "Add question", action: () => { openAddModal(null); setCommandOpen(false); } },
              { label: "Build from Content", action: () => navigate(`/instructor/quiz-room/create?method=build_from_content&returnQuizId=${quizId}`) },
              { label: "Open AI Studio", action: () => { setAiDrawerOpen(true); setCommandOpen(false); } },
              { label: "Quiz settings", action: () => { setSettingsOpen(true); setCommandOpen(false); } },
              { label: "Save as template", action: () => { setSaveTemplateOpen(true); setCommandOpen(false); } },
            ].map((cmd) => (
              <button
                key={cmd.label}
                type="button"
                className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={cmd.action}
              >
                {cmd.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {quizId && quiz && (
        <SaveTemplateDialog
          open={saveTemplateOpen}
          onOpenChange={setSaveTemplateOpen}
          quizId={quizId}
          defaultTitle={quiz.title}
          defaultDescription={quiz.description || undefined}
          defaultSubject={quiz.subject || undefined}
          onSaved={() => saveNow()}
        />
      )}

      <StudentPreviewStudio
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        quiz={quiz}
        initialIndex={previewInitialIndex}
      />
    </div>
    </QuizAuthoringStudioShell>
  );
}
