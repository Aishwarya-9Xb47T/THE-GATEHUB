import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, BookOpen, CreditCard, Star, GraduationCap, Globe, DollarSign, Activity, FileCheck, Archive, Layers } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/paymentUtils";
import { formatRoleLabel } from "@/lib/roles";

interface DashboardRes {
  stats: {
    userCount: number;
    totalStudents: number;
    totalInstructors: number;
    totalAdmins: number;
    courseCount: number;
    publishedCourses: number;
    draftCourses: number;
    archivedCourses: number;
    totalLearningUniverses: number;
    publishedLearningUniverses: number;
    draftLearningUniverses: number;
    enrollmentCount: number;
    totalPayments: number;
    totalRevenue: number;
    platformRevenue: number;
    instructorRevenue: number;
    monthlyRevenue: number;
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    courseSales: number;
    learningUniverseSales: number;
    projectSubmissions: number;
    projectsReviewed: number;
    certificatesIssued: number;
    reviewCount: number;
  };
  recentUsers: Array<{ email: string; firstName: string; lastName: string; role: string }>;
  recentCourses: Array<{ title: string; status: string }>;
}

export function AdminDashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: async () => {
      const res = await api<DashboardRes>("/admin/dashboard");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    refetchInterval: 60_000,
  });

  if (isError) {
    return (
      <div className="space-y-4 p-8">
        <h1 className="page-title">Admin Dashboard</h1>
        <Card><CardContent className="p-6 text-destructive">
          Failed to load dashboard: {(error as Error).message}
          <button type="button" className="ml-4 text-primary underline" onClick={() => refetch()}>Retry</button>
        </CardContent></Card>
      </div>
    );
  }

  const stats = data?.stats;

  const cards = stats ? [
    { label: "Total Users", value: stats.userCount, icon: Users },
    { label: "Students", value: stats.totalStudents, icon: GraduationCap },
    { label: "Instructors", value: stats.totalInstructors, icon: Users },
    { label: "Admins", value: stats.totalAdmins, icon: Users },
    { label: "Total Courses", value: stats.courseCount, icon: BookOpen },
    { label: "Published Courses", value: stats.publishedCourses, icon: BookOpen },
    { label: "Draft Courses", value: stats.draftCourses, icon: Archive },
    { label: "Total Learning Universes", value: stats.totalLearningUniverses, icon: Globe },
    { label: "Published LUs", value: stats.publishedLearningUniverses, icon: Globe },
    { label: "Draft LUs", value: stats.draftLearningUniverses, icon: Layers },
    { label: "Total Enrollments", value: stats.enrollmentCount, icon: CreditCard },
    { label: "Total Payments", value: stats.totalPayments, icon: CreditCard },
    { label: "Total Revenue", value: formatINR(stats.totalRevenue), icon: DollarSign },
    { label: "Platform Revenue", value: formatINR(stats.platformRevenue), icon: DollarSign },
    { label: "Instructor Revenue", value: formatINR(stats.instructorRevenue), icon: DollarSign },
    { label: "Monthly Revenue", value: formatINR(stats.monthlyRevenue), icon: CreditCard },
    { label: "Certificates Issued", value: stats.certificatesIssued, icon: Star },
    { label: "Projects Submitted", value: stats.projectSubmissions, icon: FileCheck },
    { label: "Projects Reviewed", value: stats.projectsReviewed, icon: FileCheck },
    { label: "Daily Active", value: stats.dailyActiveUsers, icon: Activity },
    { label: "Weekly Active", value: stats.weeklyActiveUsers, icon: Activity },
    { label: "Reviews", value: stats.reviewCount, icon: Star },
  ] : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="mt-1 type-body-muted">Platform overview — live data from PostgreSQL</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}><CardContent className="p-6 animate-pulse h-24" /></Card>
            ))
          : cards.map((c, i) => (
              <motion.div key={c.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                    <c.icon className="h-5 w-5 text-muted-foreground" />
                  </CardHeader>
                  <CardContent><div className="text-2xl type-stat">{c.value}</div></CardContent>
                </Card>
              </motion.div>
            ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent users</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="animate-pulse h-24" /> : (
              <ul className="space-y-2">
                {(data?.recentUsers?.length ?? 0) === 0 ? (
                  <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No recent users yet.
                  </li>
                ) : (
                  data?.recentUsers?.map((u) => (
                  <li key={u.email} className="flex justify-between rounded-lg border p-3 text-sm">
                    <span>{u?.firstName || "Unknown"} {u?.lastName || "User"}</span>
                    <span className="text-muted-foreground">{formatRoleLabel(u.role)}</span>
                  </li>
                ))
                )}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent courses</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="animate-pulse h-24" /> : (
              <ul className="space-y-2">
                {(data?.recentCourses?.length ?? 0) === 0 ? (
                  <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No recent courses yet.
                  </li>
                ) : (
                  data?.recentCourses?.map((c) => (
                  <li key={c.title} className="flex justify-between rounded-lg border p-3 text-sm">
                    <span>{c.title}</span>
                    <span className="text-muted-foreground capitalize">{c.status}</span>
                  </li>
                ))
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
