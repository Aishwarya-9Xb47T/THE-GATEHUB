import { create } from "zustand";
import type { AiAssessmentConfig, AiGeneratedQuestion, AiGenerationPreview, AiSourceType, AiStudioStep } from "./types";
import type {
  AiQuestionComparison,
  AiVersionSnapshot,
  CopilotMessage,
  CopilotStreamState,
} from "./copilotTypes";
import { DEFAULT_CONFIG } from "./constants";
import { sanitizeAiQuestions } from "./sanitizeQuestion";

const MAX_UNDO = 40;

function snapshotFromPreview(preview: AiGenerationPreview, label: string, action: string, modifiedIds: string[]): AiVersionSnapshot {
  return {
    id: crypto.randomUUID(),
    label,
    action,
    createdAt: new Date().toISOString(),
    modifiedQuestionIds: modifiedIds,
    questions: structuredClone(preview.questions),
  };
}

function withSummary(preview: AiGenerationPreview): AiGenerationPreview {
  const sanitized = { ...preview, questions: sanitizeAiQuestions(preview.questions) };
  return {
    ...sanitized,
    summary: {
      ...preview.summary,
      totalQuestions: sanitized.questions.length,
    },
  };
}

interface AiAssessmentState {
  step: AiStudioStep;
  source: AiSourceType | null;
  config: AiAssessmentConfig;
  url: string;
  text: string;
  file: File | null;
  jobId: string | null;
  preview: AiGenerationPreview | null;
  progress: { stage: string; percent: number; message: string } | null;
  copilotOpen: boolean;
  copilotMessages: CopilotMessage[];
  copilotStream: CopilotStreamState;
  bulkSelected: Set<string>;
  undoStack: AiVersionSnapshot[];
  redoStack: AiVersionSnapshot[];
  versions: AiVersionSnapshot[];
  pendingComparison: AiQuestionComparison | null;
  aiEditingIds: Set<string>;
  setStep: (s: AiStudioStep) => void;
  setSource: (s: AiSourceType | null) => void;
  patchConfig: (p: Partial<AiAssessmentConfig>) => void;
  setUrl: (u: string) => void;
  setText: (t: string) => void;
  setFile: (f: File | null) => void;
  setJobId: (id: string | null) => void;
  setPreview: (p: AiGenerationPreview | null) => void;
  setProgress: (p: { stage: string; percent: number; message: string } | null) => void;
  updateQuestion: (id: string, patch: Partial<AiGeneratedQuestion>) => void;
  toggleQuestion: (id: string, selected: boolean) => void;
  setCopilotOpen: (o: boolean) => void;
  pushCopilotMessage: (m: Omit<CopilotMessage, "id" | "timestamp">) => void;
  updateLastCopilotMessage: (text: string, streaming?: boolean) => void;
  setCopilotStream: (s: Partial<CopilotStreamState>) => void;
  toggleBulkSelect: (id: string) => void;
  setBulkSelected: (ids: string[]) => void;
  clearBulkSelected: () => void;
  pushUndoSnapshot: (label: string, action: string, modifiedIds: string[]) => void;
  applyQuestions: (questions: AiGeneratedQuestion[], label: string, action: string, modifiedIds: string[]) => void;
  undo: () => void;
  redo: () => void;
  restoreVersion: (versionId: string) => void;
  setPendingComparison: (c: AiQuestionComparison | null) => void;
  acceptComparison: () => void;
  rejectComparison: () => void;
  setAiEditing: (id: string, editing: boolean) => void;
  reset: () => void;
}

const initialCopilotMessage: CopilotMessage = {
  id: "welcome",
  role: "assistant",
  text: "I'm your Assessment Copilot. Ask me to refine difficulty, improve distractors, translate, or transform individual questions — every change is undoable.",
  timestamp: new Date().toISOString(),
};

export const useAiAssessmentStore = create<AiAssessmentState>((set, get) => ({
  step: "sources",
  source: null,
  config: { ...DEFAULT_CONFIG, quizName: "Untitled AI Quiz" },
  url: "",
  text: "",
  file: null,
  jobId: null,
  preview: null,
  progress: null,
  copilotOpen: true,
  copilotMessages: [initialCopilotMessage],
  copilotStream: { active: false, stage: "" },
  bulkSelected: new Set(),
  undoStack: [],
  redoStack: [],
  versions: [],
  pendingComparison: null,
  aiEditingIds: new Set(),
  setStep: (step) => set({ step }),
  setSource: (source) => set({ source }),
  patchConfig: (p) => set((s) => ({ config: { ...s.config, ...p } })),
  setUrl: (url) => set({ url }),
  setText: (text) => set({ text }),
  setFile: (file) => set({ file }),
  setJobId: (jobId) => set({ jobId }),
  setPreview: (preview) => {
    if (preview && get().versions.length === 0) {
      const v = snapshotFromPreview(preview, "Version 1", "Initial generation", preview.questions.map((q) => q.id));
      set({ preview: withSummary(preview), versions: [v] });
      return;
    }
    set({ preview: preview ? withSummary(preview) : null });
  },
  setProgress: (progress) => set({ progress }),
  updateQuestion: (id, patch) =>
    set((s) => ({
      preview: s.preview
        ? withSummary({
            ...s.preview,
            questions: s.preview.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
          })
        : null,
    })),
  toggleQuestion: (id, selected) =>
    set((s) => ({
      preview: s.preview
        ? {
            ...s.preview,
            questions: s.preview.questions.map((q) => (q.id === id ? { ...q, selected } : q)),
          }
        : null,
    })),
  setCopilotOpen: (copilotOpen) => set({ copilotOpen }),
  pushCopilotMessage: (m) =>
    set((s) => ({
      copilotMessages: [
        ...s.copilotMessages,
        { ...m, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
      ],
    })),
  updateLastCopilotMessage: (text, streaming) =>
    set((s) => {
      const msgs = [...s.copilotMessages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, text, streaming };
      }
      return { copilotMessages: msgs };
    }),
  setCopilotStream: (partial) => set((s) => ({ copilotStream: { ...s.copilotStream, ...partial } })),
  toggleBulkSelect: (id) =>
    set((s) => {
      const next = new Set(s.bulkSelected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { bulkSelected: next };
    }),
  setBulkSelected: (ids) => set({ bulkSelected: new Set(ids) }),
  clearBulkSelected: () => set({ bulkSelected: new Set() }),
  pushUndoSnapshot: (label, action, modifiedIds) => {
    const preview = get().preview;
    if (!preview) return;
    const snap = snapshotFromPreview(preview, label, action, modifiedIds);
    set((s) => ({
      undoStack: [...s.undoStack.slice(-MAX_UNDO + 1), snap],
      redoStack: [],
      versions: [...s.versions, snap],
    }));
  },
  applyQuestions: (questions, label, action, modifiedIds) => {
    const preview = get().preview;
    if (!preview) return;
    get().pushUndoSnapshot(label, action, modifiedIds);
    set({
      preview: withSummary({ ...preview, questions }),
      aiEditingIds: new Set(),
    });
  },
  undo: () => {
    const { undoStack, preview, redoStack } = get();
    if (!undoStack.length || !preview) return;
    const current = snapshotFromPreview(preview, "Current", "undo-point", []);
    const prev = undoStack[undoStack.length - 1]!;
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, current],
      preview: withSummary({ ...preview, questions: structuredClone(prev.questions) }),
    });
  },
  redo: () => {
    const { redoStack, preview, undoStack } = get();
    if (!redoStack.length || !preview) return;
    const current = snapshotFromPreview(preview, "Current", "redo-point", []);
    const next = redoStack[redoStack.length - 1]!;
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, current],
      preview: withSummary({ ...preview, questions: structuredClone(next.questions) }),
    });
  },
  restoreVersion: (versionId) => {
    const { versions, preview } = get();
    if (!preview) return;
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;
    get().pushUndoSnapshot(`Before restore`, `restore:${versionId}`, []);
    set({ preview: withSummary({ ...preview, questions: structuredClone(v.questions) }) });
  },
  setPendingComparison: (pendingComparison) => set({ pendingComparison }),
  acceptComparison: () => {
    const { pendingComparison, preview } = get();
    if (!pendingComparison || !preview) return;
    get().applyQuestions(
      preview.questions.map((q) => (q.id === pendingComparison.questionId ? pendingComparison.improved : q)),
      "AI improvement accepted",
      "accept_comparison",
      [pendingComparison.questionId]
    );
    set({ pendingComparison: null });
  },
  rejectComparison: () => set({ pendingComparison: null }),
  setAiEditing: (id, editing) =>
    set((s) => {
      const next = new Set(s.aiEditingIds);
      if (editing) next.add(id);
      else next.delete(id);
      return { aiEditingIds: next };
    }),
  reset: () =>
    set({
      step: "sources",
      source: null,
      config: { ...DEFAULT_CONFIG, quizName: "Untitled AI Quiz" },
      url: "",
      text: "",
      file: null,
      jobId: null,
      preview: null,
      progress: null,
      copilotOpen: true,
      copilotMessages: [initialCopilotMessage],
      copilotStream: { active: false, stage: "" },
      bulkSelected: new Set(),
      undoStack: [],
      redoStack: [],
      versions: [],
      pendingComparison: null,
      aiEditingIds: new Set(),
    }),
}));
