import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatINR } from "@/lib/paymentUtils";

export function AdminAnalytics() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: async () => {
      const res = await api<any>("/admin/analytics");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="p-8 animate-pulse text-muted-foreground">Loading analytics...</div>;
  if (isError) return <div className="p-8 text-destructive">Failed to load analytics: {(error as Error).message}</div>;

  const kpiCards = [
    { label: "Monthly Revenue", value: formatINR(data?.monthlyRevenue ?? 0) },
    { label: "Course Sales (month)", value: data?.courseSales ?? 0 },
    { label: "LU Sales (month)", value: data?.learningUniverseSales ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Analytics</h1>
        <p className="mt-1 text-muted-foreground">Platform-wide metrics from live database</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {kpiCards.map((k) => (
          <Card key={k.label}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{k.label}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{k.value}</CardContent></Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Daily Users (7 days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data?.dailyUsers ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Line type="monotone" dataKey="users" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Weekly Users (4 weeks)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.weeklyUsers ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Bar dataKey="users" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Monthly Users (6 months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data?.monthlyUsers ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Line type="monotone" dataKey="users" stroke="#8b5cf6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Revenue Growth (₹)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data?.revenueGrowth ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: number) => formatINR(v)} />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Course Growth</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.courseGrowth ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Learning Universe Growth</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.learningUniverseGrowth ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Enrollment Trend (7 days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data?.enrollmentTrend ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Line type="monotone" dataKey="enrollments" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Courses</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.topCourses ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Bar dataKey="enrollments" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Learning Universes</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.topLearningUniverses ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Bar dataKey="enrollments" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Instructors (Revenue)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.topInstructors ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: number) => formatINR(v)} />
                <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Highest Revenue Products</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.highestRevenueProducts ?? []}>
                <XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: number) => formatINR(v)} />
                <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Most Active Students</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left p-2">Name</th><th className="text-left p-2">Email</th><th className="text-right p-2">Activity Score</th></tr></thead>
              <tbody>
                {(data?.mostActiveStudents ?? []).map((s: any) => (
                  <tr key={s.email} className="border-b last:border-0">
                    <td className="p-2">{s.name}</td>
                    <td className="p-2 text-muted-foreground">{s.email}</td>
                    <td className="p-2 text-right font-medium">{s.activity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
