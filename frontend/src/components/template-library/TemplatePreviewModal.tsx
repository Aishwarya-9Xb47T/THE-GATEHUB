import { useQuery } from "@tanstack/react-query";
import {
  Bookmark,
  Clock,
  Copy,
  Play,
  Star,
  X,
} from "lucide-react";
import type { QuizTemplateSummary } from "@/lib/templateLibrary/types";
import { getTemplateLibraryItem } from "@/lib/templateLibrary/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface TemplatePreviewModalProps {
  template: QuizTemplateSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (t: QuizTemplateSummary) => void;
  onDuplicate: (t: QuizTemplateSummary) => void;
  onFavorite: (t: QuizTemplateSummary) => void;
}

export function TemplatePreviewModal({
  template,
  open,
  onOpenChange,
  onUse,
  onDuplicate,
  onFavorite,
}: TemplatePreviewModalProps) {
  const { data: detail } = useQuery({
    queryKey: ["template-library-detail", template?.id],
    enabled: open && Boolean(template?.id),
    queryFn: async () => {
      const res = await getTemplateLibraryItem(template!.id);
      if (res.error) throw new Error(res.error);
      if (!res.data?.data) throw new Error("Template not found");
      return res.data.data;
    },
  });

  if (!template) return null;

  const snap = detail?.quizSnapshot as { questions?: Array<{ text: string; type: string }> } | undefined;
  const questions = snap?.questions ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] max-w-5xl overflow-hidden border-white/10 bg-slate-950 p-0 text-white">
        <div className="grid max-h-[95vh] lg:grid-cols-[1fr_380px]">
          <div className="overflow-y-auto border-r border-white/10">
            <div className="relative aspect-[21/9] min-h-[180px]">
              {template.coverImageUrl ? (
                <img src={template.coverImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full" style={{ background: template.coverGradient || undefined }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 text-white"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="absolute bottom-4 left-6 right-6">
                <h2 className="text-2xl font-bold">{template.title}</h2>
                <p className="mt-1 text-white/60">{template.description}</p>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/50">Overview</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-white/20">{template.category}</Badge>
                  {template.subject && <Badge variant="outline" className="border-white/20">{template.subject}</Badge>}
                  <Badge variant="outline" className="border-white/20 capitalize">{template.difficulty}</Badge>
                  <Badge variant="outline" className="border-white/20">{template.gradeLevel}</Badge>
                </div>
              </section>

              {template.learningObjectives?.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/50">Learning objectives</h3>
                  <ul className="list-inside list-disc space-y-1 text-sm text-white/70">
                    {template.learningObjectives.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/50">Scoring & settings</h3>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                  <p>Shuffle questions and options enabled by default.</p>
                  <p className="mt-1">Timer and scoring copy from template metadata when you use this template.</p>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
                  Sample questions ({questions.length} shown)
                </h3>
                <ol className="space-y-2">
                  {questions.map((q, i) => (
                    <li key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                      <span className="text-white/40">Q{i + 1} · {q.type}</span>
                      <p className="mt-1 text-white/80">{q.text}</p>
                    </li>
                  ))}
                  {questions.length === 0 && (
                    <li className="text-sm text-white/50">Full question set loads when you use this template.</li>
                  )}
                </ol>
              </section>
            </div>
          </div>

          <aside className="flex flex-col gap-4 overflow-y-auto p-5">
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <Row label="Questions" value={String(template.questionCount)} />
              <Row label="Duration" value={`${template.durationMinutes ?? "—"} min`} icon={<Clock className="h-3.5 w-3.5" />} />
              <Row label="Rating" value={`${template.ratingAvg.toFixed(1)} (${template.ratingCount})`} icon={<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />} />
              <Row label="Used" value={template.useCount.toLocaleString()} />
              <Row label="Author" value={template.authorName || "THE GATEHUB"} />
            </div>

            <div className="space-y-2 text-sm">
              <h4 className="font-semibold text-white/70">Compatibility</h4>
              <CompatRow label="Live quiz" ok={template.supportsLive} />
              <CompatRow label="Homework" ok={template.supportsHomework} />
              <CompatRow label="AI features" ok={template.supportsAi} />
              <CompatRow label="Rich media" ok={template.supportsMedia} />
            </div>

            <div className="flex flex-wrap gap-1">
              {template.questionTypes.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  {t.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>

            <div className="mt-auto space-y-2">
              <Button type="button" className="w-full" size="lg" onClick={() => onUse(template)}>
                <Play className="mr-2 h-4 w-4" />
                Start from Template
              </Button>
              <Button type="button" variant="outline" className="w-full border-white/15" onClick={() => onDuplicate(template)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => onFavorite(template)}>
                <Bookmark className={cn("mr-2 h-4 w-4", template.favorited && "fill-primary text-primary")} />
                {template.favorited ? "Bookmarked" : "Bookmark"}
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/50">{label}</span>
      <span className="flex items-center gap-1 font-medium">{icon}{value}</span>
    </div>
  );
}

function CompatRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-white/60">
      <span>{label}</span>
      <span className={ok ? "text-emerald-400" : "text-white/30"}>{ok ? "Yes" : "—"}</span>
    </div>
  );
}
