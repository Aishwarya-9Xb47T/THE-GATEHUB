import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export interface InstructorLearningAnalyticsData {
  universeId: string;
  universeTitle: string;
  enrollmentCount: number;
  averageProgress: number;
  distribution: {
    notStarted: number;
    early: number;
    mid: number;
    late: number;
    complete: number;
  };
  learners: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    percentComplete: number;
    lastAccessed: string | null;
    lastLessonId: string | null;
    isCompleted: boolean;
  }>;
}

interface InstructorLearningAnalyticsPanelProps {
  universeId: string;
}

export function InstructorLearningAnalyticsPanel({ universeId }: InstructorLearningAnalyticsPanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lu-analytics-instructor", universeId],
    queryFn: async () => {
      const res = await api<{ success: boolean; data: InstructorLearningAnalyticsData }>(
        `/learning-universes/${universeId}/analytics/instructor`
      );
      if (res.error || !res.data?.data) throw new Error(res.error || "Failed to load analytics");
      return res.data.data;
    },
    enabled: !!universeId,
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground animate-pulse py-4">Loading cohort analytics…</div>;
  }

  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Cohort analytics unavailable for this universe.
      </p>
    );
  }

  const dist = [
    { label: "Not started", value: data.distribution.notStarted },
    { label: "0–39%", value: data.distribution.early },
    { label: "40–69%", value: data.distribution.mid },
    { label: "70–99%", value: data.distribution.late },
    { label: "Complete", value: data.distribution.complete },
  ];

  return (
    <Card data-testid="instructor-learning-analytics">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Cohort progress · {data.universeTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Enrollments</p>
            <p className="text-2xl font-semibold tabular-nums">{data.enrollmentCount}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Average progress</p>
            <p className="text-2xl font-semibold tabular-nums">{data.averageProgress}%</p>
            <Progress value={data.averageProgress} className="h-1.5 mt-2" />
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {dist.map((d) => (
            <div key={d.label} className="rounded-md bg-muted/40 px-2 py-2 text-center">
              <p className="text-lg font-semibold tabular-nums">{d.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{d.label}</p>
            </div>
          ))}
        </div>

        {data.learners.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-2 font-medium">Learner</th>
                  <th className="py-2 pr-2 font-medium">Progress</th>
                  <th className="py-2 font-medium">Last access</th>
                </tr>
              </thead>
              <tbody>
                {data.learners.slice(0, 12).map((l) => (
                  <tr key={l.userId} className="border-b border-border/60">
                    <td className="py-2 pr-2">
                      <p className="font-medium truncate max-w-[180px]">{l.name || "Learner"}</p>
                      <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{l.email}</p>
                    </td>
                    <td className="py-2 pr-2 tabular-nums w-28">
                      <div className="flex items-center gap-2">
                        <Progress value={l.percentComplete} className="h-1.5 flex-1" />
                        <span className="text-xs w-8 text-right">{l.percentComplete}%</span>
                      </div>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {l.lastAccessed ? new Date(l.lastAccessed).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
