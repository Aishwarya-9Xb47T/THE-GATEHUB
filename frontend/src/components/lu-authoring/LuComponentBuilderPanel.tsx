import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LuExplorerNode } from "@/lib/luAuthoring/types";
import type { StructureAction } from "@/lib/luAuthoring/types";
import { buildUpdateConfigAction } from "@/lib/luAuthoring/componentSelection";
import { isLearningModeVisualEditor } from "@/lib/luAuthoring/componentRegistry";
import type { LuLessonComponentKind } from "@/lib/luAuthoring/componentRegistry";
import { parseConfigFromTex, patchTexFromConfig } from "@/lib/luAuthoring/texAst";
import { LuQuizEditor } from "@/components/lu-authoring/LuQuizEditor";
import { CodingLabAuthoringModal } from "@/components/lu-authoring/CodingLabAuthoringModal";
import { VideoAuthoringModal } from "@/components/lu-authoring/VideoAuthoringModal";
import { Loader2, Save } from "lucide-react";


interface LuComponentBuilderPanelProps {
  node: LuExplorerNode | null;
  config?: Record<string, unknown> | null;
  /** Current Monaco buffer — parsed into the visual form when sourceOfTruth is "tex". */
  texContent?: string;
  sourceOfTruth?: "tex" | "json";
  onMutate: (action: StructureAction) => Promise<unknown>;
  onTexSave?: (tex: string) => Promise<void>;
  onRefresh: () => void;
  variant?: "ide" | "experience";
  onDraftChange?: (draft: Record<string, unknown>) => void;
  hideSaveBar?: boolean;
  selectedQuestionId?: string;
}

type FieldProps = {
  draft: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  fieldClass: string;
};

function fc(fieldClass: string) {
  return fieldClass || undefined;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-400">{label}</Label>
      {children}
    </div>
  );
}

export function LuComponentBuilderPanel({
  node,
  config,
  texContent = "",
  sourceOfTruth = "json",
  onMutate,
  onTexSave,
  onRefresh,
  variant = "ide",
  onDraftChange,
  hideSaveBar = false,
  selectedQuestionId,
}: LuComponentBuilderPanelProps) {
  const [internalDraft, setInternalDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [userEdited, setUserEdited] = useState(false);
  const isExperience = variant === "experience";
  const isTexSource = sourceOfTruth === "tex";
  const draft = onDraftChange ? (config ?? {}) : internalDraft;
  const fieldClass = isExperience ? "" : "bg-[#2d2d2d] border-slate-600";

  useEffect(() => {
    if (onDraftChange || userEdited) return;
    if (isTexSource && node?.kind) {
      setInternalDraft(parseConfigFromTex(node.kind as LuLessonComponentKind, texContent));
      return;
    }
    if (!isTexSource) setInternalDraft(config ?? {});
  }, [node?.id, node?.kind, config, texContent, onDraftChange, isTexSource, userEdited]);

  useEffect(() => {
    setUserEdited(false);
  }, [node?.id]);

  const save = useCallback(async () => {
    if (!node) return;
    setSaving(true);
    try {
      if (isTexSource && onTexSave) {
        const patched = patchTexFromConfig(
          node.kind as LuLessonComponentKind,
          texContent,
          draft,
          node.title
        );
        await onTexSave(patched);
        setUserEdited(false);
        return;
      }
      const action = buildUpdateConfigAction(node, draft);
      if (!action) return;
      await onMutate(action);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }, [node, draft, isTexSource, onTexSave, texContent, onMutate, onRefresh]);

  if (!node || !node.componentId || !isLearningModeVisualEditor(node.kind)) {
    return null;
  }

  if (node.kind === "quiz") {
    return (
      <LuQuizEditor
        node={node}
        config={config ?? null}
        onMutate={onMutate}
        onRefresh={onRefresh}
        variant={variant}
        selectedQuestionId={selectedQuestionId}
      />
    );
  }

  const set = (key: string, value: unknown) => {
    const next = { ...draft, [key]: value };
    setUserEdited(true);
    if (onDraftChange) onDraftChange(next);
    else setInternalDraft(next);
  };

  return (
    <div
      className={
        isExperience
          ? "h-full flex flex-col bg-background text-foreground overflow-hidden"
          : "h-full flex flex-col bg-[#1e1e1e] text-slate-200 overflow-hidden"
      }
    >
      {!hideSaveBar && (
        <div
          className={
            isExperience
              ? "flex items-center justify-between px-4 py-2 border-b shrink-0"
              : "flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-[#252526] shrink-0"
          }
        >
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              {node.kind.replace(/-/g, " ")}
            </p>
            <p className="text-sm font-medium truncate">{node.title}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {node.kind === "overview" && <OverviewFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "objectives" && <ObjectivesFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "topics" && <TopicsFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "examples" && <ExamplesFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "practice" && <PracticeFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "coding-lab" && <CodingLabFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "video" && <VideoFields draft={draft} set={set} fieldClass={fieldClass} node={node} />}
        {node.kind === "notebook" && <NotebookFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "project" && <ProjectFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "research-paper" && <ResearchPaperFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "assignment" && <AssignmentFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "discussion" && <DiscussionFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "checkpoint" && <CheckpointFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "reflection" && <ReflectionFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "references" && <ReferencesFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "question" && <QuestionFields draft={draft} set={set} fieldClass={fieldClass} />}
        {node.kind === "resources" && <ResourcesFields draft={draft} set={set} node={node} fieldClass={fieldClass} />}
        {node.kind === "resource-item" && <ResourceItemFields draft={draft} set={set} fieldClass={fieldClass} />}
      </div>
    </div>
  );
}

function OverviewFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <Field label="Overview body">
      <Textarea
        value={String(draft.body ?? "")}
        onChange={(e) => set("body", e.target.value)}
        rows={8}
        className={fc(fieldClass)}
      />
    </Field>
  );
}

function ObjectivesFields({ draft, set, fieldClass }: FieldProps) {
  const items = (draft.items as string[]) ?? [];
  return (
    <Field label="Learning objectives (one per line)">
      <Textarea
        value={items.join("\n")}
        onChange={(e) => set("items", e.target.value.split("\n").filter(Boolean))}
        rows={6}
        className={fc(fieldClass)}
      />
    </Field>
  );
}

function TopicsFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <>
      <Field label="Section title">
        <Input value={String(draft.title ?? "")} onChange={(e) => set("title", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Content">
        <Textarea value={String(draft.body ?? "")} onChange={(e) => set("body", e.target.value)} rows={8} className={fc(fieldClass)} />
      </Field>
    </>
  );
}

function ExamplesFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <Field label="Examples content">
      <Textarea value={String(draft.body ?? "")} onChange={(e) => set("body", e.target.value)} rows={8} className={fc(fieldClass)} />
    </Field>
  );
}

function PracticeFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <>
      <Field label="Language">
        <Input value={String(draft.language ?? "python")} onChange={(e) => set("language", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Starter code">
        <Textarea value={String(draft.starterCode ?? "")} onChange={(e) => set("starterCode", e.target.value)} rows={6} className={`font-mono text-xs ${fc(fieldClass)}`} />
      </Field>
      <Field label="Expected output">
        <Input value={String(draft.expectedOutput ?? "")} onChange={(e) => set("expectedOutput", e.target.value)} className={fc(fieldClass)} />
      </Field>
    </>
  );
}

function CodingLabFields({ draft, set, fieldClass }: FieldProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-violet-300">Coding Lab Authoring Suite</span>
          <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded uppercase font-mono">
            {String(draft.language ?? "python")}
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          Configure Coding Missions, starter code, hidden solutions, public & hidden test cases.
        </p>
        <Button
          type="button"
          size="sm"
          className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs"
          onClick={() => setModalOpen(true)}
        >
          Open Coding Lab Studio
        </Button>
      </div>

      <Field label="Language">
        <Input value={String(draft.language ?? "python")} onChange={(e) => set("language", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Starter code">
        <Textarea value={String(draft.starterCode ?? "")} onChange={(e) => set("starterCode", e.target.value)} rows={6} className={`font-mono text-xs ${fc(fieldClass)}`} />
      </Field>

      {modalOpen && (
        <CodingLabAuthoringModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          initialConfig={draft}
          onSave={(updatedConfig) => {
            Object.entries(updatedConfig).forEach(([k, v]) => {
              set(k, v);
            });
          }}
        />
      )}
    </>
  );
}


function NotebookFields({ draft, set, fieldClass }: FieldProps) {
  const cells = (draft.cells as { type: string; source: string }[]) ?? [];
  return (
    <>
      <Field label="Kernel">
        <Input value={String(draft.kernel ?? "python")} onChange={(e) => set("kernel", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="First cell (markdown)">
        <Textarea
          value={cells[0]?.source ?? ""}
          onChange={(e) =>
            set("cells", [{ type: "markdown", source: e.target.value, id: "cell-1" }, ...cells.slice(1)])
          }
          rows={6}
          className={fc(fieldClass)}
        />
      </Field>
    </>
  );
}

function ProjectFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <>
      <Field label="Introduction">
        <Textarea value={String(draft.introduction ?? "")} onChange={(e) => set("introduction", e.target.value)} rows={3} className={fc(fieldClass)} />
      </Field>
      <Field label="Instructions">
        <Textarea value={String(draft.instructions ?? "")} onChange={(e) => set("instructions", e.target.value)} rows={4} className={fc(fieldClass)} />
      </Field>
      <Field label="Difficulty">
        <Input value={String(draft.difficulty ?? "intermediate")} onChange={(e) => set("difficulty", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Estimated hours">
        <Input type="number" value={String(draft.estimatedHours ?? 4)} onChange={(e) => set("estimatedHours", Number(e.target.value))} className={fc(fieldClass)} />
      </Field>
    </>
  );
}

function ResearchPaperFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <>
      <Field label="Paper title">
        <Input value={String(draft.title ?? "")} onChange={(e) => set("title", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Abstract">
        <Textarea value={String(draft.abstract ?? "")} onChange={(e) => set("abstract", e.target.value)} rows={4} className={fc(fieldClass)} />
      </Field>
    </>
  );
}

function AssignmentFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <>
      <Field label="Due date">
        <Input value={String(draft.dueDate ?? "")} onChange={(e) => set("dueDate", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Points">
        <Input type="number" value={String(draft.points ?? 100)} onChange={(e) => set("points", Number(e.target.value))} className={fc(fieldClass)} />
      </Field>
      <Field label="Instructions">
        <Textarea value={String(draft.instructions ?? "")} onChange={(e) => set("instructions", e.target.value)} rows={4} className={fc(fieldClass)} />
      </Field>
    </>
  );
}

function DiscussionFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <Field label="Discussion prompt">
      <Textarea value={String(draft.prompt ?? "")} onChange={(e) => set("prompt", e.target.value)} rows={4} className={fc(fieldClass)} />
    </Field>
  );
}

function CheckpointFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <>
      <Field label="Title">
        <Input value={String(draft.title ?? "")} onChange={(e) => set("title", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Message">
        <Textarea value={String(draft.message ?? "")} onChange={(e) => set("message", e.target.value)} rows={3} className={fc(fieldClass)} />
      </Field>
    </>
  );
}

function ReflectionFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <Field label="Reflection prompt">
      <Textarea value={String(draft.prompt ?? "")} onChange={(e) => set("prompt", e.target.value)} rows={4} className={fc(fieldClass)} />
    </Field>
  );
}

function ReferencesFields({ draft, set, fieldClass }: FieldProps) {
  const items = (draft.items as { citation: string; url?: string }[]) ?? [];
  return (
    <Field label="References (one per line)">
      <Textarea
        value={items.map((i) => i.citation).join("\n")}
        onChange={(e) =>
          set(
            "items",
            e.target.value.split("\n").filter(Boolean).map((citation) => ({ citation, url: "" }))
          )
        }
        rows={6}
        className={fc(fieldClass)}
      />
    </Field>
  );
}

function QuestionFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <>
      <Field label="Question">
        <Textarea value={String(draft.question ?? "")} onChange={(e) => set("question", e.target.value)} rows={3} className={fc(fieldClass)} />
      </Field>
      <Field label="Option A">
        <Input value={String(draft.optionA ?? "")} onChange={(e) => set("optionA", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Option B">
        <Input value={String(draft.optionB ?? "")} onChange={(e) => set("optionB", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Option C">
        <Input value={String(draft.optionC ?? "")} onChange={(e) => set("optionC", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Option D">
        <Input value={String(draft.optionD ?? "")} onChange={(e) => set("optionD", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Correct answer (A, B, C, or D)">
        <Input value={String(draft.correct ?? "B")} onChange={(e) => set("correct", e.target.value.toUpperCase())} className={fc(fieldClass)} />
      </Field>
      <Field label="Explanation">
        <Textarea value={String(draft.explanation ?? "")} onChange={(e) => set("explanation", e.target.value)} rows={3} className={fc(fieldClass)} />
      </Field>
    </>
  );
}

function ResourcesFields({ draft, set, node, fieldClass }: FieldProps & { node: LuExplorerNode }) {
  const items = node.children ?? [];
  return (
    <>
      <Field label="Resource collection">
        <div className="rounded border border-slate-600 bg-[#2d2d2d] p-3 space-y-2">
          {items.length === 0 && (
            <p className="text-xs text-slate-500">No resources yet. Use + Add on the Resources node.</p>
          )}
          {items.map((r) => (
            <div key={r.id} className="text-sm text-slate-300">
              {r.title}
            </div>
          ))}
        </div>
      </Field>
      <Field label="Collection notes">
        <Textarea value={String(draft.notes ?? "")} onChange={(e) => set("notes", e.target.value)} rows={2} className={fc(fieldClass)} />
      </Field>
    </>
  );
}

function ResourceItemFields({ draft, set, fieldClass }: FieldProps) {
  return (
    <>
      <Field label="Title">
        <Input value={String(draft.title ?? "")} onChange={(e) => set("title", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="Type">
        <Input value={String(draft.type ?? "link")} onChange={(e) => set("type", e.target.value)} className={fc(fieldClass)} />
      </Field>
      <Field label="URL">
        <Input value={String(draft.url ?? "")} onChange={(e) => set("url", e.target.value)} className={fc(fieldClass)} />
      </Field>
    </>
  );
}

function VideoFields({ draft, set, fieldClass, node }: FieldProps & { node: LuExplorerNode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const type = String(draft.type ?? draft.sourceType ?? "upload");
  const videoTitle = String(draft.title ?? node.title ?? "Video Lesson");
  const isUpload = type === "upload";

  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-300">Video Lesson Component</span>
          <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded uppercase font-mono">
            {isUpload ? "Local MP4" : "YouTube"}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 truncate">
          {isUpload
            ? `File: ${String(draft.file || draft.url || "Local File")}`
            : `URL: ${String(draft.url || "YouTube URL")}`}
        </p>
        <Button
          type="button"
          size="sm"
          className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs"
          onClick={() => setModalOpen(true)}
        >
          Reconfigure Video / Replace Source
        </Button>
      </div>

      <Field label="Video Title">
        <Input
          value={videoTitle}
          onChange={(e) => set("title", e.target.value)}
          className={fc(fieldClass)}
        />
      </Field>

      {isUpload ? (
        <Field label="Local File Path / Asset Reference">
          <Input
            value={String(draft.file ?? draft.url ?? "")}
            onChange={(e) => set("file", e.target.value)}
            className={fc(fieldClass)}
          />
        </Field>
      ) : (
        <Field label="YouTube Video URL">
          <Input
            value={String(draft.url ?? "")}
            onChange={(e) => set("url", e.target.value)}
            className={fc(fieldClass)}
          />
        </Field>
      )}

      {modalOpen && (
        <VideoAuthoringModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initialData={{
            type: isUpload ? "upload" : "youtube",
            title: videoTitle,
            url: String(draft.url ?? ""),
            file: String(draft.file ?? ""),
          }}
          onSave={(data) => {
            set("type", data.type);
            set("sourceType", data.type);
            set("title", data.title);
            if (data.type === "youtube") {
              set("url", data.url ?? "");
            } else {
              set("file", data.file ?? "");
            }
          }}
        />
      )}
    </>
  );
}
