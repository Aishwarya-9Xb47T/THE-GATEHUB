import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type LiveSessionStatus } from "@/lib/liveSession/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<LiveSessionStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  scheduled: "bg-sky-100 text-sky-800 border-sky-200",
  lobby: "bg-amber-100 text-amber-800 border-amber-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200 animate-pulse",
  paused: "bg-orange-100 text-orange-800 border-orange-200",
  finished: "bg-muted text-muted-foreground border-border",
};

export function QuizRoomStatusBadge({ status, className }: { status: LiveSessionStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
