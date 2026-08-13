import {
  Copy,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Lock,
  Star,
  AlertCircle,
  CheckCircle2,
  Plus,
} from "lucide-react";
import type { QuizQuestion } from "@/lib/quizBuilder/types";
import { QuestionTypeSelect } from "./QuestionTypeSelect";
import { getQuestionMeta } from "@/lib/quizBuilder/quizStudioMetrics";
import { QuestionTypeEditor } from "@/components/quiz-builder/QuestionTypeEditor";
import { questionContentPreview } from "@/components/media/contentPreview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QuestionWorkspaceCardProps {
  question: QuizQuestion;
  index: number;
  isFocused: boolean;
  isCollapsed: boolean;
  onFocus: () => void;
  onToggleCollapse: () => void;
  onChange: (patch: Partial<QuizQuestion>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddBelow: () => void;
  onOpenAi: () => void;
  dragHandleProps?: Record<string, unknown>;
}

export function QuestionWorkspaceCard({
  question,
  index,
  isFocused,
  isCollapsed,
  onFocus,
  onToggleCollapse,
  onChange,
  onDuplicate,
  onDelete,
  onAddBelow,
  onOpenAi,
  dragHandleProps,
}: QuestionWorkspaceCardProps) {
  const { status, completion, hasErrors, meta } = getQuestionMeta(question);

  return (
    <article
      id={`question-card-${question.id}`}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-card shadow-sm transition-all duration-200",
        isFocused ? "border-primary/50 shadow-lg ring-2 ring-primary/15" : "border-border/60 hover:border-border",
        isCollapsed && "opacity-90"
      )}
      onClick={onFocus}
    >
      {/* Premium header */}
      <header className="flex items-start gap-2 border-b border-border/40 bg-muted/20 px-4 py-3">
        <button
          type="button"
          className="mt-1 cursor-grab text-muted-foreground hover:text-foreground"
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">Q{index + 1}</span>
            <QuestionTypeSelect question={question} onChange={onChange} />
            <Badge variant="outline" className="text-[10px] capitalize">{question.difficulty || "medium"}</Badge>
            <Badge variant="outline" className="text-[10px]">{question.bloomLevel || "L2"}</Badge>
            <Badge variant="outline" className="text-[10px]">{question.estimatedSeconds || 45}s</Badge>
            <Badge className="bg-amber-500/15 text-[10px] font-bold text-amber-800 dark:text-amber-200">
              {question.marks ?? 1} mark{(question.marks ?? 1) === 1 ? "" : "s"}
            </Badge>
            <StatusBadge status={status} hasErrors={hasErrors} />
            {Boolean(meta.aiGenerated) && <Badge className="bg-violet-500/15 text-[10px] text-violet-700">AI</Badge>}
            {Boolean(meta.importSource) && <Badge className="bg-blue-500/15 text-[10px] text-blue-700">Imported</Badge>}
            {Boolean(meta.locked) && <Lock className="h-3 w-3 text-muted-foreground" />}
            {Boolean(meta.favorited) && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
          </div>
          {isCollapsed && (
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
              {questionContentPreview(question.text, 120)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <span className="mr-2 text-[10px] font-medium text-muted-foreground">{completion}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleCollapse}>
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Duplicate">
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {!isCollapsed && (
        <>
          <div className="p-6">
            <QuestionTypeEditor question={question} onChange={onChange} hideAiAssist autoFocusStem={isFocused && !isCollapsed} />
          </div>

          {/* Bottom toolbar */}
          <footer className="flex flex-wrap items-center gap-2 border-t border-border/40 bg-muted/10 px-4 py-3">
            <label className="mr-2 flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold">
              Marks
              <input
                type="number"
                min={0}
                step={1}
                className="h-7 w-16 rounded border bg-background px-2 text-sm font-bold"
                value={question.marks ?? 1}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  const n = Number(e.target.value);
                  onChange({ marks: Number.isFinite(n) && n >= 0 ? n : 0 });
                }}
              />
            </label>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onAddBelow(); }}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Question
            </Button>
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              Duplicate
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpenAi(); }}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              AI Generate
            </Button>
          </footer>
        </>
      )}
    </article>
  );
}

function StatusBadge({ status, hasErrors }: { status: string; hasErrors: boolean }) {
  if (hasErrors) {
    return (
      <Badge variant="destructive" className="gap-0.5 text-[10px]">
        <AlertCircle className="h-3 w-3" />
        Review
      </Badge>
    );
  }
  if (status === "complete") {
    return (
      <Badge className="gap-0.5 bg-emerald-600/90 text-[10px]">
        <CheckCircle2 className="h-3 w-3" />
        Complete
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-[10px] capitalize">{status}</Badge>;
}
