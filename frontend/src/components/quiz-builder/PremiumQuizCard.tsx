import { Link } from "react-router-dom";
import { useState } from "react";
import {
  Clock,
  Copy,
  Edit,
  Play,
  Star,
  Pin,
  Trash2,
  BookOpen,
  Users,
  BarChart3,
  Calendar,
  FileSpreadsheet
} from "lucide-react";
import type { QuizListItem } from "@/lib/quizBuilder/types";
import { TYPE_LABELS } from "@/lib/quizBuilder/types";
import { QuizCoverBanner } from "@/components/quiz-branding/QuizCoverBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDashboardSidebarContext } from "@/contexts/DashboardSidebarContext";
import { apiUrl } from "@/lib/api";

interface PremiumQuizCardProps {
  quiz: QuizListItem;
  view?: "grid" | "list";
  onDuplicate?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onToggleFavorite?: () => void;
  onTogglePin?: () => void;
}

export function PremiumQuizCard({
  quiz,
  view = "grid",
  onDuplicate,
  onArchive,
  onDelete,
  onToggleFavorite,
  onTogglePin,
}: PremiumQuizCardProps) {
  const isList = view === "list";
  const sidebar = useDashboardSidebarContext();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"reports" | "replay">("reports");
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const handleOpenSessions = async (action: "reports" | "replay") => {
    setDialogAction(action);
    setDialogOpen(true);
    setLoadingSessions(true);
    try {
      const token = localStorage.getItem("lms_token");
      const res = await fetch(apiUrl(`/api/quizzes/${quiz.id}/sessions`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await res.json();
      if (body.success && body.sessions) {
        setSessions(body.sessions);
      }
    } catch (err: any) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5",
        isList && "flex"
      )}
    >
      <QuizCoverBanner
        id={quiz.id}
        bannerUrl={quiz.bannerUrl}
        coverImageUrl={quiz.coverImageUrl}
        thumbnailUrl={quiz.thumbnailUrl}
        coverGradient={quiz.coverGradient}
        theme={quiz.theme}
        alt={quiz.title}
        zoomOnHover
        className={cn(isList ? "w-48 shrink-0" : "h-32 w-full")}
      >
        <div className="absolute left-3 top-3 flex gap-1">
          {quiz.pinned && <Pin className="h-4 w-4 text-white drop-shadow" />}
          {quiz.favorited && <Star className="h-4 w-4 fill-amber-300 text-amber-300 drop-shadow" />}
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <Badge className="bg-black/40 text-white backdrop-blur-sm">{quiz.visibility}</Badge>
        </div>
      </QuizCoverBanner>

      <div className={cn("flex flex-1 flex-col p-5", isList && "min-w-0")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold">{quiz.title}</h3>
            {quiz.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{quiz.description}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Pin" onClick={onTogglePin}>
              <Pin className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Favorite" onClick={onToggleFavorite}>
              <Star className={cn("h-4 w-4", quiz.favorited && "fill-amber-400 text-amber-400")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Duplicate" onClick={onDuplicate}>
              <Copy className="h-4 w-4" />
            </Button>
            {onArchive && (
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Archive" onClick={onArchive}>
                <BookOpen className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {quiz.subject && <span>{quiz.subject}</span>}
          {quiz.course && (
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              {quiz.course.title}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Stat icon={BarChart3} label="Questions" value={String(quiz.questionCount)} />
          <Stat icon={Clock} label="Duration" value={`${quiz.estimatedMinutes}m`} />
          <Stat icon={Users} label="Attempts" value={String(quiz.studentAttempts)} />
          <Stat icon={Play} label="Live uses" value={String(quiz.timesUsed)} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px] capitalize">
            {quiz.difficulty}
          </Badge>
          {quiz.bloomSummary && (
            <Badge variant="outline" className="text-[10px]">
              Bloom: {quiz.bloomSummary}
            </Badge>
          )}
          {quiz.questionTypes.slice(0, 3).map((t) => (
            <Badge key={t} variant="outline" className="text-[10px]">
              {TYPE_LABELS[t] || t}
            </Badge>
          ))}
          {quiz.averageScore > 0 && (
            <Badge variant="outline" className="text-[10px]">
              Avg {quiz.averageScore}%
            </Badge>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <Button size="sm" asChild className="h-9">
            <Link to={`/instructor/quiz-room/create?quizId=${quiz.id}`}>
              <Play className="mr-2 h-4 w-4" />
              Host Live
            </Link>
          </Button>
          <Button size="sm" variant="secondary" asChild className="h-9">
            <Link
              to={`/instructor/quiz-room/quizzes/${quiz.id}/edit`}
              onClick={() => sidebar?.closeSidebar()}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleOpenSessions("reports")} className="h-9 font-semibold flex items-center gap-1">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            Reports
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleOpenSessions("replay")} className="h-9 font-semibold flex items-center gap-1">
            <Clock className="h-4 w-4 text-indigo-500" />
            Replays
          </Button>
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground">
          Updated {new Date(quiz.updatedAt).toLocaleDateString()}
        </p>
      </div>

      {/* Sessions list dialog selector */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="text-base font-bold capitalize flex items-center gap-2">
              <Calendar className="h-4.5 w-4.5 text-primary" /> Select Quiz Session to View {dialogAction}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {loadingSessions ? (
              <p className="text-xs text-muted-foreground text-center py-6 animate-pulse">Loading hosted sessions history...</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No live sessions hosted for this quiz yet.</p>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between border rounded-lg p-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                    <div>
                      <p className="text-xs font-bold">{new Date(s.createdAt).toLocaleDateString()} at {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      <span className="text-[10px] text-muted-foreground font-semibold">PIN: {s.pin || "—"} · {s._count?.participants ?? 0} participants</span>
                    </div>
                    
                    <Button size="sm" variant="outline" asChild className="text-[10px] font-bold">
                      {dialogAction === "reports" ? (
                        <Link to={`/instructor/quiz-room/${s.id}/report`}>Report</Link>
                      ) : (
                        <Link to={`/instructor/quiz-room/${s.id}/replay`}>Replay</Link>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
