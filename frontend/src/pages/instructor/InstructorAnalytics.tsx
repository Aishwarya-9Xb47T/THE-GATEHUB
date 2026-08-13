import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/paymentUtils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { InstructorLearningAnalyticsPanel } from "@/components/learning/InstructorLearningAnalyticsPanel";

interface AnalyticsResponse {
  stats: {
    totalCourses: number;
    totalLearningUniverses: number;
    courseEnrollments: number;
    luEnrollments: number;
    luCompletions: number;
    luCertificates: number;
    luRevenue: number;
    pendingSubmissions: number;
    approvedSubmissions: number;
    rejectedSubmissions: number;
    averageProjectGrade: number;
    reviewCompletionRate: number;
    totalEnrollments: number;
    totalRevenue: number;
    averageRating: number | string;
  };
  revenueData: { name: string; revenue: number }[];
  engagementData: { name: string; activeStudents: number }[];
}

export function InstructorAnalytics() {
  const { data, isLoading } = useQuery({
    queryKey: ["instructor", "analytics"],
    queryFn: async () => {
      const res = await api<AnalyticsResponse>("/analytics/instructor");
      if (res.error) throw new Error(res.error);
      return res.data;
    },
  });

  const { data: myUniverses } = useQuery({
    queryKey: ["instructor", "learning-universes", "mine"],
    queryFn: async () => {
      const res = await api<{ success?: boolean; data?: Array<{ id: string; title: string }> } | Array<{ id: string; title: string }>>(
        "/learning-universes/mine"
      );
      if (res.error) return [] as Array<{ id: string; title: string }>;
      const payload = res.data as any;
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.data)) return payload.data;
      return [] as Array<{ id: string; title: string }>;
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading analytics...</div>;
  }

  const chartData = data?.engagementData || [];
  const stats = data?.stats;
  const cohorts = (myUniverses ?? []).slice(0, 3);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Analytics</h1>
        <p className="mt-1 text-muted-foreground">Course and Learning Universe engagement</p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Courses</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.totalCourses || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Learning Universes</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.totalLearningUniverses || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Enrollments</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalEnrollments || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.courseEnrollments ?? 0} courses · {stats?.luEnrollments ?? 0} universes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatINR(stats?.totalRevenue || 0)}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">LU Enrollments</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.luEnrollments || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">LU Completions</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.luCompletions || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">LU Certificates</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.luCertificates || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">LU Revenue</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatINR(stats?.luRevenue || 0)}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending Reviews</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.pendingSubmissions || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Approved Projects</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.approvedSubmissions || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Rejected Projects</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.rejectedSubmissions || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Project Grade</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.averageProjectGrade || 0}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Review Completion Rate</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.reviewCompletionRate || 0}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Average Rating</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.averageRating || "N/A"}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Student engagement (courses + learning universes)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="activeStudents" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {cohorts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Learning Universe cohort detail</h2>
          {cohorts.map((u: { id: string; title: string }) => (
            <InstructorLearningAnalyticsPanel key={u.id} universeId={u.id} />
          ))}
        </div>
      )}
    </div>
  );
}
