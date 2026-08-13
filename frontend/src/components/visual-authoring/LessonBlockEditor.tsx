import Editor from "@monaco-editor/react";
import { Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { VisualLesson } from "@/lib/visualBuilder/converters";
import {
  BLOCK_LABELS,
  type ContentBlockType,
  type LuContentBlock,
} from "@/lib/learningUniverseSchema";
import { CODE_LANGUAGES, PRACTICE_LANGUAGES } from "@/lib/visualBuilder/blockToolbar";
import { BlockTypeToolbar } from "./BlockTypeToolbar";
import { AssetUploadField } from "./AssetUploadField";
import { QuizBlockEditor } from "./QuizBlockEditor";
import { ProjectBlockEditor } from "./ProjectBlockEditor";
import { CanonicalContentPreview } from "./CanonicalContentPreview";
import { LessonMetadataPanel } from "./LessonMetadataPanel";

interface LessonBlockEditorProps {
  lesson: VisualLesson;
  onChange: (lesson: VisualLesson) => void;
}

function blockContent(block: LuContentBlock): Record<string, unknown> {
  return typeof block.content === "object" && block.content !== null
    ? (block.content as Record<string, unknown>)
    : {};
}

function updateBlock(lesson: VisualLesson, index: number, patch: Partial<LuContentBlock> | LuContentBlock): VisualLesson {
  const blocks = [...lesson.contentBlocks];
  blocks[index] = { ...blocks[index], ...patch } as LuContentBlock;
  return { ...lesson, contentBlocks: blocks };
}

function updateBlockContent(lesson: VisualLesson, index: number, key: string, value: unknown): VisualLesson {
  const blocks = [...lesson.contentBlocks];
  const c = blockContent(blocks[index]);
  blocks[index] = { ...blocks[index], content: { ...c, [key]: value } };
  return { ...lesson, contentBlocks: blocks };
}

function SortableBlockCard({
  id,
  block,
  index,
  lesson,
  onChange,
  onRemove,
}: {
  id: string;
  block: LuContentBlock;
  index: number;
  lesson: VisualLesson;
  onChange: (lesson: VisualLesson) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const onPatch = (key: string, val: unknown) => onChange(updateBlockContent(lesson, index, key, val));
  const onContent = (val: LuContentBlock["content"]) => onChange(updateBlock(lesson, index, { content: val }));

  return (
    <Card ref={setNodeRef} style={style} className="border-l-4 border-l-primary/40">
      <CardHeader className="py-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <button type="button" className="cursor-grab active:cursor-grabbing touch-none" {...attributes} {...listeners}>
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
          {BLOCK_LABELS[block.type as ContentBlockType] || block.type}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onRemove}><Trash2 className="w-4 h-4 text-destructive" /></Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <BlockFields block={block} onPatch={onPatch} onContent={onContent} />
        <div className="pt-3 border-t">
          <p className="text-xs text-muted-foreground mb-2">Canonical preview</p>
          <CanonicalContentPreview block={block} index={index} previewMode />
        </div>
      </CardContent>
    </Card>
  );
}

export function LessonBlockEditor({ lesson, onChange }: LessonBlockEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const blockIds = lesson.contentBlocks.map((_, i) => `block-${i}`);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blockIds.indexOf(String(active.id));
    const newIndex = blockIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange({ ...lesson, contentBlocks: arrayMove(lesson.contentBlocks, oldIndex, newIndex) });
  };

  const addBlock = (block: LuContentBlock) => {
    onChange({ ...lesson, contentBlocks: [...lesson.contentBlocks, block] });
  };

  return (
    <div className="space-y-6 w-full min-w-0">
      <LessonMetadataPanel lesson={lesson} onChange={onChange} />

      <Card>
        <CardHeader><CardTitle className="text-base">Lesson Overview (Markdown)</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={lesson.overviewMarkdown || ""}
            onChange={(e) => onChange({ ...lesson, overviewMarkdown: e.target.value })}
            placeholder="Markdown overview for this lesson..."
            className="min-h-28 font-mono text-sm"
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        <BlockTypeToolbar onAdd={addBlock} />
        <span className="text-xs text-muted-foreground">{lesson.contentBlocks.length} blocks</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {lesson.contentBlocks.map((block, i) => (
              <SortableBlockCard
                key={blockIds[i]}
                id={blockIds[i]}
                block={block}
                index={i}
                lesson={lesson}
                onChange={onChange}
                onRemove={() => onChange({ ...lesson, contentBlocks: lesson.contentBlocks.filter((_, idx) => idx !== i) })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {lesson.contentBlocks.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No content blocks yet. Click Add Block to build this lesson.</p>
      )}
    </div>
  );
}

function BlockFields({
  block,
  onPatch,
  onContent,
}: {
  block: LuContentBlock;
  onPatch: (key: string, value: unknown) => void;
  onContent: (value: LuContentBlock["content"]) => void;
}) {
  const c = blockContent(block);

  switch (block.type) {
    case "overview":
      return (
        <Textarea
          value={typeof block.content === "string" ? block.content : String(c.text || "")}
          onChange={(e) => onContent(e.target.value)}
          placeholder="Paragraph or markdown content..."
          className="min-h-20"
        />
      );

    case "theory":
      return (
        <>
          <Field label="Title"><Input value={String(c.title || "")} onChange={(e) => onPatch("title", e.target.value)} /></Field>
          <Field label="Body"><Textarea value={String(c.body || "")} onChange={(e) => onPatch("body", e.target.value)} className="min-h-32" /></Field>
        </>
      );

    case "note":
    case "tip":
    case "warning":
    case "summary":
    case "keypoints":
      return <Textarea value={String(c.text || "")} onChange={(e) => onPatch("text", e.target.value)} className="min-h-24" />;

    case "image":
      return (
        <>
          <AssetUploadField
            kind="image"
            filename={String(c.file || "")}
            onFilenameChange={(name) => { onPatch("file", name); onPatch("path", name); }}
            label="Upload image"
          />
          <Field label="Or remote URL"><Input value={String(c.path || c.url || "")} onChange={(e) => onPatch("path", e.target.value)} placeholder="https://..." /></Field>
          <Field label="Caption"><Input value={String(c.caption || "")} onChange={(e) => onPatch("caption", e.target.value)} /></Field>
          <Field label="Alt text"><Input value={String(c.alt || "")} onChange={(e) => onPatch("alt", e.target.value)} /></Field>
        </>
      );

    case "video":
      return (
        <>
          <Field label="Type">
            <Select value={String(c.type || "youtube")} onValueChange={(v) => onPatch("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="vimeo">Vimeo</SelectItem>
                <SelectItem value="upload">Uploaded file</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {c.type === "upload" ? (
            <AssetUploadField
              kind="video"
              filename={String(c.file || c.url || "")}
              onFilenameChange={(name) => { onPatch("file", name); onPatch("url", name); }}
              label="Upload video (MP4, WEBM, MOV)"
            />
          ) : (
            <Field label="URL"><Input value={String(c.url || "")} onChange={(e) => onPatch("url", e.target.value)} placeholder="https://youtu.be/..." /></Field>
          )}
          <Field label="Title"><Input value={String(c.title || "")} onChange={(e) => onPatch("title", e.target.value)} /></Field>
        </>
      );

    case "codeexample":
      return (
        <>
          <Field label="Language">
            <Select value={String(c.language || "python")} onValueChange={(v) => onPatch("language", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CODE_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Code">
            <div className="h-40 border rounded overflow-hidden">
              <Editor height="100%" language={String(c.language || "python")} value={String(c.code || "")} onChange={(v) => onPatch("code", v || "")} options={{ minimap: { enabled: false }, fontSize: 13 }} />
            </div>
          </Field>
          <Field label="Output"><Textarea value={String(c.output || "")} onChange={(e) => onPatch("output", e.target.value)} className="font-mono text-sm" /></Field>
        </>
      );

    case "practice":
      return (
        <>
          <Field label="Title"><Input value={String(c.title || "")} onChange={(e) => onPatch("title", e.target.value)} /></Field>
          <Field label="Language">
            <Select value={String(c.language || "python")} onValueChange={(v) => onPatch("language", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRACTICE_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Starter code">
            <div className="h-40 border rounded overflow-hidden">
              <Editor height="100%" language={String(c.language || "python")} value={String(c.initialCode || c.startercode || "")} onChange={(v) => onPatch("initialCode", v || "")} options={{ minimap: { enabled: false }, fontSize: 13 }} />
            </div>
          </Field>
          <Field label="Expected output"><Textarea value={String(c.expectedOutput || c.expectedoutput || "")} onChange={(e) => onPatch("expectedOutput", e.target.value)} className="font-mono text-sm" /></Field>
          <Field label="Solution (hidden from students)">
            <div className="h-32 border rounded overflow-hidden">
              <Editor height="100%" language={String(c.language || "python")} value={String(c.solution || "")} onChange={(v) => onPatch("solution", v || "")} options={{ minimap: { enabled: false }, fontSize: 13 }} />
            </div>
          </Field>
          <Field label="Hints (one per line)">
            <Textarea
              value={Array.isArray(c.hints) ? (c.hints as string[]).join("\n") : String(c.hints || "")}
              onChange={(e) => onPatch("hints", e.target.value.split("\n").filter(Boolean))}
              className="min-h-16"
            />
          </Field>
        </>
      );

    case "quiz":
      return (
        <QuizBlockEditor
          content={c as { title?: string; questions?: import("@/lib/learningUniverseSchema").LuQuizQuestion[] }}
          onChange={(next) => onContent(next as LuContentBlock["content"])}
        />
      );

    case "project": {
      const variant = c.colabUrl && !c.githubUrl ? "colab" : c.githubUrl && !c.colabUrl ? "github" : "project";
      return (
        <ProjectBlockEditor
          content={c as Parameters<typeof ProjectBlockEditor>[0]["content"]}
          variant={variant}
          onChange={(patch) => Object.entries(patch).forEach(([k, v]) => onPatch(k, v))}
        />
      );
    }

    case "assignment":
      return (
        <>
          <Field label="Title"><Input value={String(c.title || "")} onChange={(e) => onPatch("title", e.target.value)} /></Field>
          <Field label="Instructions"><Textarea value={String(c.instructions || "")} onChange={(e) => onPatch("instructions", e.target.value)} /></Field>
          <Field label="Points"><Input value={String(c.points || "")} onChange={(e) => onPatch("points", e.target.value)} /></Field>
          <Field label="Due date"><Input value={String(c.duedate || "")} onChange={(e) => onPatch("duedate", e.target.value)} placeholder="YYYY-MM-DD" /></Field>
        </>
      );

    case "resource":
      return (
        <>
          <Field label="Type">
            <Select value={String(c.type || "website")} onValueChange={(v) => onPatch("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="video">Video</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title"><Input value={String(c.title || "")} onChange={(e) => onPatch("title", e.target.value)} /></Field>
          <Field label="URL"><Input value={String(c.url || "")} onChange={(e) => onPatch("url", e.target.value)} /></Field>
        </>
      );

    case "download":
      return (
        <>
          <Field label="Title"><Input value={String(c.title || "")} onChange={(e) => onPatch("title", e.target.value)} /></Field>
          <AssetUploadField
            kind={String(c.file || "").toLowerCase().endsWith(".pdf") ? "pdf" : "any"}
            filename={String(c.file || c.fileUrl || "")}
            onFilenameChange={(name) => { onPatch("file", name); onPatch("fileUrl", name); }}
            label="Upload file"
          />
          <Field label="Or URL"><Input value={String(c.url || "")} onChange={(e) => onPatch("url", e.target.value)} /></Field>
        </>
      );

    case "checkpoint":
      return <Field label="Checkpoint label"><Input value={String(c.title || "")} onChange={(e) => onPatch("title", e.target.value)} /></Field>;

    case "discussion":
      return <Field label="Discussion prompt"><Textarea value={String(c.prompt || c.text || "")} onChange={(e) => onPatch("prompt", e.target.value)} className="min-h-24" /></Field>;

    case "certificatecriteria":
      return <Textarea value={typeof block.content === "string" ? block.content : String(c.text || "")} onChange={(e) => onContent(e.target.value)} className="min-h-20" />;

    case "finalexam":
      return (
        <>
          <Field label="Title"><Input value={String(c.title || "")} onChange={(e) => onPatch("title", e.target.value)} /></Field>
          <Field label="Duration"><Input value={String(c.duration || "")} onChange={(e) => onPatch("duration", e.target.value)} /></Field>
          <Field label="Description"><Textarea value={String(c.description || "")} onChange={(e) => onPatch("description", e.target.value)} /></Field>
        </>
      );

    default:
      return <p className="text-sm text-muted-foreground">Editor for {block.type}</p>;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
