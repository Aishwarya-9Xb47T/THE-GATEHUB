import { useEffect } from "react";
import { Users, CheckCircle, Clock, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveLeaderboard } from "./LiveLeaderboard";
import type { LeaderboardEntry } from "@/lib/liveSession/types";
import { cn } from "@/lib/utils";

interface ParticipantRow {
  id: string;
  displayName: string;
  status: string;
  score: number;
}

interface QuestionStats {
  questionIndex: number;
  text: string;
  totalParticipants: number;
  answered: number;
  pending: number;
  correctPercent: number;
  wrongPercent: number;
  avgTimeMs: number;
}

interface LiveSessionAnalyticsPanelProps {
  participants: ParticipantRow[];
  leaderboard: LeaderboardEntry[];
  currentQuestionStats: QuestionStats | null;
  questionIndex: number;
  questionCount: number;
  answerPulse?: number;
}

const STATUS_COLORS: Record<string, string> = {
  online: "bg-emerald-500",
  thinking: "bg-amber-500",
  answered: "bg-blue-500",
  submitted: "bg-purple-500",
  disconnected: "bg-red-500",
  idle: "bg-muted-foreground",
};

export function LiveSessionAnalyticsPanel({
  participants,
  leaderboard,
  currentQuestionStats,
  questionIndex,
  questionCount,
  answerPulse = 0,
}: LiveSessionAnalyticsPanelProps) {
  useEffect(() => {
    /* answerPulse triggers re-render for incoming answer animations */
  }, [answerPulse]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {currentQuestionStats && (
        <Card className={cn(answerPulse > 0 && "animate-in fade-in duration-300")}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Live Question Analytics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground line-clamp-2">{currentQuestionStats.text}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBox icon={Users} label="Answered" value={`${currentQuestionStats.answered}/${currentQuestionStats.totalParticipants}`} />
              <StatBox icon={CheckCircle} label="Correct" value={`${currentQuestionStats.correctPercent}%`} />
              <StatBox icon={Clock} label="Avg Time" value={`${(currentQuestionStats.avgTimeMs / 1000).toFixed(1)}s`} />
              <StatBox icon={Users} label="Pending" value={String(currentQuestionStats.pending)} />
            </div>
            <div className="flex h-3 overflow-hidden rounded-full">
              <div className="bg-emerald-500" style={{ width: `${currentQuestionStats.correctPercent}%` }} />
              <div className="bg-red-400" style={{ width: `${currentQuestionStats.wrongPercent}%` }} />
              <div className="flex-1 bg-muted" />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Participants ({participants.length})
            </span>
            <Badge variant="outline">
              Q{questionIndex + 1}/{questionCount}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 max-h-40 space-y-1 overflow-y-auto">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[p.status] || STATUS_COLORS.idle}`} />
                <span className="flex-1 truncate">{p.displayName}</span>
                <Badge variant="secondary" className="text-xs capitalize">
                  {p.status}
                </Badge>
              </div>
            ))}
          </div>
          <LiveLeaderboard entries={leaderboard.slice(0, 10)} compact />
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
