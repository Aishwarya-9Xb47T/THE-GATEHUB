import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clock, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export interface StudentLearningAnalyticsData {
  universeId: string;
  universeTitle: string;
  publishVersionId: string;
  percentComplete: number;
  totalTimeSpentSeconds: number;
  lessonCount: number;
  lessonsCompleted: number;
  lessons: Array<{
    lessonId: string;
    title: string;
    moduleTitle: string;
    stepCount: number;
    visitedSteps: number;
    completedSteps: number;
    timeSpentSeconds: number;
    percent: number;
  }>;
  weakLessons: Array<{
    lessonId: string;
    title: string;
    moduleTitle: string;
    percent: number;
  }>;
}

function formatMinutes(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

interface StudentLearningAnalyticsPanelProps {
  universeId: string;
  compact?: boolean;
}

export function StudentLearningAnalyticsPanel({ universeId, compact }: StudentLearningAnalyticsPanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lu-analytics-student", universeId],
    queryFn: async () => {
      const res = await api<{ success: boolean; data: StudentLearningAnalyticsData }>(
        `/learning-universes/${universeId}/analytics/student`
      );
      if (res.error || !res.data?.data) throw new Error(res.error || "Failed to load analytics");
      return res.data.data;
    },
    enabled: !!universeId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground animate-pulse">Loading learning analytics…</CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  return (
    <Card data-testid="student-learning-analytics">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Your learning analytics
        </CardTitle>
        {!compact && <p className="text-xs text-muted-foreground truncate">{data.universeTitle}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Progress</p>
            <p className="text-xl font-semibold tabular-nums">{data.percentComplete}%</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Time
            </p>
            <p className="text-xl font-semibold tabular-nums">{formatMinutes(data.totalTimeSpentSeconds)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Lessons</p>
            <p className="text-xl font-semibold tabular-nums">
              {data.lessonsCompleted}/{data.lessonCount}
            </p>
          </div>
        </div>

        <div>
          <Progress value={data.percentComplete} className="h-2" />
        </div>

        {data.weakLessons.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Focus next
            </p>
            <ul className="space-y-1.5">
              {data.weakLessons.slice(0, compact ? 3 : 5).map((l) => (
                <li key={l.lessonId} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{l.moduleTitle}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs tabular-nums text-muted-foreground">{l.percent}%</span>
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <Link to={`/learning-universe/${universeId}/learn/${l.lessonId}`}>Resume</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
