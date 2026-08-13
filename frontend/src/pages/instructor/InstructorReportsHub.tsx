import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  Users,
  BookOpen,
  ClipboardList,
  Award,
  FileBarChart,
  Hammer,
  DollarSign,
} from "lucide-react";

/**
 * Instructor Reports hub — only surfaces report capabilities that already exist.
 * Does not invent analytics.
 */
const SECTIONS = [
  {
    id: "overview",
    title: "Overview",
    description: "Enrollment, completion, and revenue overview for your courses.",
    to: "/instructor/analytics",
    icon: BarChart3,
    available: true,
  },
  {
    id: "students",
    title: "Students",
    description: "Per-course student progress, completion, and certificate status.",
    to: "/instructor/students",
    icon: Users,
    available: true,
  },
  {
    id: "courses",
    title: "Courses",
    description: "Manage and review your published and draft courses.",
    to: "/instructor/courses",
    icon: BookOpen,
    available: true,
  },
  {
    id: "assessments",
    title: "Project Reviews",
    description: "Review student project and component submissions.",
    to: "/instructor/project-reviews",
    icon: Hammer,
    available: true,
  },
  {
    id: "quiz-reports",
    title: "Quiz Room Reports",
    description: "Live session results and Quiz Room report history.",
    to: "/instructor/quiz-room?tab=reports",
    icon: FileBarChart,
    available: true,
  },
  {
    id: "certificates",
    title: "Certificates",
    description: "Issued, pending, and revoked certificates for your Learning Universes.",
    to: "/instructor/certificates",
    icon: Award,
    available: true,
  },
  {
    id: "earnings",
    title: "Earnings",
    description: "Payment and payout summary for your catalog.",
    to: "/instructor/earnings",
    icon: DollarSign,
    available: true,
  },
] as const;

export function InstructorReportsHub() {
  const { data: quizReports } = useQuery({
    queryKey: ["instructor", "reports-hub", "quiz-room"],
    queryFn: async () => {
      const res = await api<{ reports?: unknown[]; sessions?: unknown[] }>("/live-sessions/reports");
      if (res.error) return { count: 0 };
      const payload = res.data as { reports?: unknown[]; sessions?: unknown[] } | unknown[];
      if (Array.isArray(payload)) return { count: payload.length };
      return { count: (payload?.reports || payload?.sessions || []).length };
    },
    retry: false,
  });

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="page-title flex items-center gap-3">
          <ClipboardList className="h-9 w-9 text-primary" />
          Reports
        </h1>
        <p className="mt-1 text-muted-foreground">
          Jump to existing instructor reporting tools. Every link below opens a live page.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map(({ id, title, description, to, icon: Icon, available }) => (
          <Card key={id} className={!available ? "opacity-60" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="h-5 w-5 text-primary" />
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{description}</p>
              {id === "quiz-reports" && (
                <p className="text-xs text-muted-foreground">
                  {quizReports?.count != null
                    ? `${quizReports.count} Quiz Room report(s) available`
                    : "Open Quiz Room Reports"}
                </p>
              )}
              {available ? (
                <Link
                  to={to}
                  className="inline-flex text-sm font-medium text-primary hover:underline"
                >
                  Open {title}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">Coming soon</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
