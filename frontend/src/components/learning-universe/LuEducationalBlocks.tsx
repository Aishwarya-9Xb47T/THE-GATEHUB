import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Code2, BookOpen, FileText, MessageSquare, Library } from "lucide-react";
import { TryItPlayground } from "@/components/learning/TryItPlayground";
import { api } from "@/lib/api";

interface BlockContext {
  universeId: string;
  lessonId: string;
  blockIndex: number;
}

function componentKey(blockIndex: number) {
  return `block-${blockIndex}`;
}

export function CodingLabBlock({
  content,
  blockIndex,
  onSuccess,
}: {
  content: Record<string, unknown>;
  blockIndex: number;
  onSuccess?: () => void;
}) {
  return (
    <Card className="p-6 border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 mb-4">
        <Code2 className="w-5 h-5 text-emerald-600" />
        <h3 className="font-semibold text-lg">{String(content.title || "Coding Lab")}</h3>
      </div>
      <TryItPlayground
        title={String(content.title || "Coding Lab")}
        initialCode={String(content.starterCode || "")}
        language={String(content.language || "python")}
        expectedOutput={content.expectedOutput ? String(content.expectedOutput) : undefined}
        solution={content.solution ? String(content.solution) : undefined}
        hints={content.hints as string[] | string | undefined}
        onSuccess={onSuccess}
      />
    </Card>
  );
}

export function NotebookBlock({
  content,
  blockIndex,
  ctx,
  onCellRun,
}: {
  content: { title?: string; kernel?: string; cells?: { type: string; source: string }[] };
  blockIndex: number;
  ctx?: BlockContext;
  onCellRun?: () => void;
}) {
  const cells = content.cells ?? [];
  return (
    <Card className="p-6 border-violet-200 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/20">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5 text-violet-600" />
        <h3 className="font-semibold text-lg">{content.title || "Notebook"}</h3>
        {content.kernel && <span className="text-xs text-muted-foreground">({content.kernel})</span>}
      </div>
      <div className="space-y-4">
        {cells.length === 0 && <p className="text-sm text-muted-foreground">No cells in this notebook yet.</p>}
        {cells.map((cell, i) =>
          cell.type === "code" ? (
            <TryItPlayground
              key={`nb-${blockIndex}-${i}`}
              title={`Cell ${i + 1}`}
              initialCode={cell.source}
              language={content.kernel || "python"}
              onSuccess={onCellRun}
            />
          ) : (
            <div key={`nb-${blockIndex}-${i}`} className="prose dark:prose-invert max-w-none rounded-lg border p-4 bg-background">
              <p className="whitespace-pre-wrap m-0">{cell.source}</p>
            </div>
          )
        )}
      </div>
    </Card>
  );
}

export function ResearchPaperBlock({ content }: { content: Record<string, unknown> }) {
  const sections = (content.sections as { title: string; body: string }[]) ?? [];
  return (
    <Card className="p-6 border-slate-300 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-slate-600" />
        <h3 className="font-semibold text-lg">{String(content.title || "Research Paper")}</h3>
      </div>
      {content.abstract != null && (
        <div className="mb-4 p-4 rounded-lg bg-muted/50">
          <h4 className="text-sm font-medium mb-1">Abstract</h4>
          <p className="text-sm whitespace-pre-wrap">{String(content.abstract)}</p>
        </div>
      )}
      <div className="space-y-4">
        {sections.map((s, i) => (
          <div key={i}>
            <h4 className="font-medium">{s.title}</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{s.body}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ReflectionBlock({
  content,
  blockIndex,
  ctx,
}: {
  content: { prompt?: string };
  blockIndex: number;
  ctx: BlockContext;
}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<{ success: boolean; submission: { payload?: { text?: string }; status?: string } | null }>(
      `/learning-universes/${ctx.universeId}/lessons/${ctx.lessonId}/components/${componentKey(blockIndex)}/submission`
    ).then((res) => {
      const sub = res.data?.submission;
      if (sub?.payload && typeof sub.payload === "object" && "text" in sub.payload) {
        setText(String((sub.payload as { text?: string }).text ?? ""));
      }
      if (sub?.status) setStatus(sub.status);
    });
  }, [ctx.universeId, ctx.lessonId, blockIndex]);

  const save = async (submit: boolean) => {
    setSaving(true);
    try {
      const res = await api<{ success: boolean; submission: { status: string } }>(
        `/learning-universes/${ctx.universeId}/lessons/${ctx.lessonId}/components/${componentKey(blockIndex)}/submission`,
        {
          method: "POST",
          body: {
            kind: "reflection",
            payload: { text },
            status: submit ? "submitted" : "draft",
          },
        }
      );
      if (res.data?.submission?.status) setStatus(res.data.submission.status);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/20">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-teal-600" />
        <h3 className="font-semibold text-lg">Reflection</h3>
      </div>
      <p className="text-sm mb-3">{content.prompt || "What did you learn from this lesson?"}</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mb-3" />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void save(false)}>
          Save draft
        </Button>
        <Button type="button" size="sm" disabled={saving || !text.trim()} onClick={() => void save(true)}>
          Submit reflection
        </Button>
        {status && <span className="text-xs text-muted-foreground self-center capitalize">{status.replace(/_/g, " ")}</span>}
      </div>
    </Card>
  );
}

export function ReferencesBlock({ content }: { content: { items?: { citation: string }[] } }) {
  const items = content.items ?? [];
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Library className="w-5 h-5" />
        <h3 className="font-semibold text-lg">References</h3>
      </div>
      <ol className="list-decimal list-inside space-y-2 text-sm">
        {items.map((item, i) => (
          <li key={i} className="whitespace-pre-wrap">{item.citation}</li>
        ))}
      </ol>
    </Card>
  );
}
