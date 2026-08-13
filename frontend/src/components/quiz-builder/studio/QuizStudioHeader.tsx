import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  Upload,
  LayoutTemplate,
  Rocket,
  Settings,
  History,
  Undo2,
  Redo2,
  Sparkles,
  Command,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { QuizEditorData } from "@/lib/quizBuilder/types";
import { computeStudioMetrics } from "@/lib/quizBuilder/quizStudioMetrics";
import { QuizCoverBanner } from "@/components/quiz-branding/QuizCoverBanner";
import { metadataToIdentity } from "@/lib/quizBranding/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QuizStudioHeaderProps {
  quiz: QuizEditorData;
  status: string;
  lastSynced: Date | null;
  validationValid?: boolean;
  validationErrors?: number;
  canUndo: boolean;
  canRedo: boolean;
  aiPanelOpen: boolean;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenPreview: () => void;
  onToggleAi: () => void;
  onBuildFromContent: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onCommand: () => void;
  onSaveTemplate?: () => void;
}

export function QuizStudioHeader({
  quiz,
  status,
  lastSynced,
  validationValid,
  validationErrors = 0,
  canUndo,
  canRedo,
  aiPanelOpen,
  onTitleChange,
  onSave,
  onUndo,
  onRedo,
  onOpenPreview,
  onToggleAi,
  onBuildFromContent,
  onHistory,
  onSettings,
  onCommand,
  onSaveTemplate,
}: QuizStudioHeaderProps) {
  const metrics = computeStudioMetrics(quiz, validationValid);
  const identity = metadataToIdentity(quiz.metadata, quiz);

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-card/95 shadow-sm backdrop-blur-xl">
      <QuizCoverBanner
        id={quiz.id}
        bannerUrl={identity.bannerUrl}
        thumbnailUrl={identity.thumbnailUrl}
        coverGradient={String(quiz.metadata?.coverGradient || "")}
        theme={identity.theme}
        alt={quiz.title}
        icon={identity}
        className="h-14 w-full"
        overlay
        showIconFallback={!identity.bannerUrl}
      >
        <div className="absolute inset-0 flex items-end justify-between gap-3 px-4 pb-2">
          <p className="truncate text-sm font-semibold text-white drop-shadow">{quiz.title}</p>
        </div>
      </QuizCoverBanner>
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/30 px-4 py-2 text-[11px]">
        <Stat label="Questions" value={String(metrics.questionCount)} />
        <Stat label="Est. time" value={`${metrics.estimatedMinutes} min`} />
        <Stat label="Marks" value={String(metrics.totalMarks)} />
        <Stat label="Completion" value={`${metrics.completionPercent}%`} highlight={metrics.completionPercent >= 80} />
        <Stat label="Validation" value={`${metrics.validationScore}%`} highlight={metrics.validationScore >= 90} />
      </div>

      {/* Toolbar row */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link to="/instructor/quiz-room?tab=quizzes"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>

        <Input
          className="h-9 min-w-[140px] max-w-xs flex-1 border-0 bg-transparent px-1 text-base font-semibold shadow-none focus-visible:ring-0"
          value={quiz.title}
          onChange={(e) => onTitleChange(e.target.value)}
        />

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <SavePill status={status} lastSynced={lastSynced} onSave={onSave} />
          {!validationValid && validationErrors > 0 && (
            <Badge variant="destructive" className="gap-1 text-xs"><AlertTriangle className="h-3 w-3" />{validationErrors}</Badge>
          )}
          {validationValid && <Badge className="gap-1 bg-emerald-600 text-xs"><CheckCircle2 className="h-3 w-3" />Valid</Badge>}
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canUndo} onClick={onUndo}><Undo2 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canRedo} onClick={onRedo}><Redo2 className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-8 hidden sm:flex" onClick={onCommand}><Command className="mr-1 h-3.5 w-3.5" />Commands</Button>
          <Button variant="outline" size="sm" className="h-8" onClick={onBuildFromContent}><Upload className="mr-1 h-3.5 w-3.5" /><span className="hidden sm:inline">Content</span></Button>
          <Button variant={aiPanelOpen ? "default" : "outline"} size="sm" className="h-8" onClick={onToggleAi}><Sparkles className="mr-1 h-3.5 w-3.5" /><span className="hidden md:inline">AI</span></Button>
          <Button variant="outline" size="sm" className="h-8" onClick={onHistory}><History className="mr-1 h-3.5 w-3.5" /><span className="hidden md:inline">History</span></Button>
          {onSaveTemplate && (
            <Button variant="outline" size="sm" className="h-8 hidden lg:flex" onClick={onSaveTemplate}>
              <LayoutTemplate className="mr-1 h-3.5 w-3.5" />
              Save template
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8" onClick={onSettings}><Settings className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" className="h-8" onClick={onOpenPreview}>
            <Eye className="mr-1 h-3.5 w-3.5" />
            Preview
          </Button>
          <Button size="sm" className="h-8" asChild>
            <Link to={`/instructor/quiz-room/create?quizId=${quiz.id}`}><Rocket className="mr-1 h-3.5 w-3.5" />Host Live</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", highlight && "text-emerald-600")}>{value}</span>
    </div>
  );
}

function SavePill({ status, lastSynced, onSave }: { status: string; lastSynced: Date | null; onSave: () => void }) {
  return (
    <button type="button" onClick={onSave} className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", status === "saving" && "bg-amber-500/15 text-amber-700", status === "saved" && "bg-emerald-500/15 text-emerald-700", status === "error" && "bg-destructive/15 text-destructive", status === "idle" && "text-muted-foreground")}>
      {status === "saving" && "Saving…"}
      {status === "saved" && lastSynced && `Saved ${lastSynced.toLocaleTimeString()}`}
      {status === "error" && "Retry save"}
      {status === "idle" && "Auto-save"}
    </button>
  );
}
