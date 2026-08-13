import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BookOpen, CheckCircle, Clock, Trophy, GraduationCap, AlertCircle, Compass } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import { CourseBannerThumb } from "@/components/common/CourseCardBanner";

interface LearningItem {
  type: "course" | "learning_universe";
  id: string;
  title: string;
  thumbnail?: string | null;
  progressPercent: number;
  isCompleted: boolean;
  continueUrl: string;
}

interface LearningRes {
  items: LearningItem[];
  continueLearning: LearningItem[];
  stats: { total: number; completed: number; inProgress: number };
}

export function StudentDashboard() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["learning", "my"],
    queryFn: async () => {
      const res = await api<LearningRes>("/learning/my");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["learning", "my"] });
        queryClient.invalidateQueries({ queryKey: ["my-certificates"] });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient]);

  const { data: certificatesData } = useQuery({
    queryKey: ["my-certificates"],
    queryFn: async () => {
      const res = await api<{ certificates: any[] }>("/certificates/my");
      if (res.error) return { certificates: [] };
      return res.data!;
    },
  });

  const items = data?.items ?? [];
  const continueItems = (data?.continueLearning ?? []).filter((i) => !i.isCompleted);
  const primaryContinue = continueItems[0];
  const certificates = certificatesData?.certificates ?? [];
  const enrolled = items.length;
  const completed = data?.stats.completed ?? items.filter((i) => i.isCompleted).length;
  const inProgress =
    data?.stats.inProgress ?? items.filter((i) => i.progressPercent > 0 && i.progressPercent < 100).length;
  const certificatesEarned = certificates.length;

  const avgProgress =
    items.length > 0 ? Math.round(items.reduce((sum, i) => sum + i.progressPercent, 0) / items.length) : 0;

  const cards = [
    { label: "Enrolled", value: enrolled, icon: BookOpen },
    { label: "Completed", value: completed, icon: CheckCircle },
    { label: "In Progress", value: inProgress, icon: Clock },
    { label: "Certificates", value: certificatesEarned, icon: Trophy },
  ];

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="mt-1 text-lg text-muted-foreground">Your learning at a glance</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="font-semibold">Couldn’t load your learning</p>
            <p className="text-sm text-muted-foreground">{(error as Error)?.message || "Please try again."}</p>
            <Button onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="mt-1 text-lg text-muted-foreground">Your learning at a glance</p>
      </div>

      {/* Primary action: Continue Learning */}
      {isLoading ? (
        <Card>
          <CardContent className="h-36 animate-pulse p-6" />
        </Card>
      ) : primaryContinue ? (
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card shadow-md">
          <CardContent className="flex flex-col gap-4 p-0 sm:flex-row sm:items-stretch">
            <CourseBannerThumb
              thumbnailUrl={primaryContinue.thumbnail}
              alt={primaryContinue.title}
              placeholderSeed={primaryContinue.title}
            />
            <div className="flex flex-1 flex-col justify-center gap-3 p-5 sm:p-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Continue learning</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {primaryContinue.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {primaryContinue.type === "learning_universe" ? "Learning Universe" : "Course"} ·{" "}
                  {primaryContinue.progressPercent}% complete
                </p>
              </div>
              <Progress value={primaryContinue.progressPercent} className="h-2.5 max-w-md" />
              <div className="flex flex-wrap gap-2">
                <Button asChild size="lg" className="font-semibold">
                  <Link to={primaryContinue.continueUrl}>Continue Learning</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/student/my-courses">My Courses</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center sm:flex-row sm:text-left">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <Compass className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-lg font-bold text-foreground">Ready to start learning?</p>
              <p className="text-sm text-muted-foreground">
                Browse the catalog and enroll in a course. Your progress will show up here.
              </p>
            </div>
            <Button asChild size="lg">
              <Link to="/student/browse">Browse Courses</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="app-fluid-grid app-fluid-grid--sm grid gap-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Card className="border-border/50 bg-card/50 shadow-sm backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                <div className="rounded-xl border border-border/30 bg-muted/40 p-2">
                  <c.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight text-foreground">
                  {isLoading ? "…" : c.value}
                </div>
                {c.label === "Enrolled" && enrolled > 0 && (
                  <div className="mt-2">
                    <Progress value={avgProgress} className="h-1.5" />
                    <p className="mt-1 text-xs text-muted-foreground">{avgProgress}% avg progress</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-h3 font-display text-foreground">Up next</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/student/my-courses">View all</Link>
            </Button>
          </div>
          {isLoading ? (
            <div className="app-fluid-grid app-fluid-grid--md grid gap-4">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardContent className="h-24 animate-pulse p-6" />
                </Card>
              ))}
            </div>
          ) : continueItems.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Nothing in progress right now.{" "}
                <Link to="/student/browse" className="font-medium text-primary hover:underline">
                  Browse the catalog
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="app-fluid-grid app-fluid-grid--md grid gap-4">
              {continueItems.slice(0, 4).map((item) => (
                <Card
                  key={`${item.type}-${item.id}`}
                  className="group overflow-hidden border-border/50 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <CardContent className="flex h-full p-0">
                    <CourseBannerThumb
                      thumbnailUrl={item.thumbnail}
                      alt={item.title}
                      placeholderSeed={item.title}
                    />
                    <div className="flex flex-1 flex-col justify-center p-5">
                      <div className="mb-1 flex items-center gap-2">
                        {item.type === "learning_universe" ? (
                          <GraduationCap className="h-3 w-3 text-primary" />
                        ) : (
                          <BookOpen className="h-3 w-3 text-primary" />
                        )}
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {item.type === "learning_universe" ? "Learning Universe" : "Course"}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                        {item.title}
                      </p>
                      <Progress value={item.progressPercent} className="mt-3 h-2" />
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">
                          {item.progressPercent}% complete
                        </p>
                        <Link
                          to={item.continueUrl}
                          className="inline-block text-sm font-medium text-primary transition-colors hover:text-primary/80"
                        >
                          Continue →
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <h2 className="text-h3 font-display mb-4 text-foreground">Achievements</h2>
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="space-y-4 p-6">
              {certificatesEarned > 0 ? (
                <>
                  <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <Trophy className="h-6 w-6 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">Certificates earned</p>
                      <p className="text-sm text-muted-foreground">
                        {certificatesEarned} certificate{certificatesEarned !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <Button asChild className="w-full">
                    <Link to="/student/certificates">View certificates</Link>
                  </Button>
                </>
              ) : (
                <div className="py-4 text-center">
                  <Trophy className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Complete courses to earn certificates</p>
                  <Button asChild variant="outline" className="mt-3">
                    <Link to="/student/browse">Browse Courses</Link>
                  </Button>
                </div>
              )}

              {completed > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <CheckCircle className="h-6 w-6 text-muted-foreground" />
                  <div>
                    <p className="font-semibold text-foreground">Courses completed</p>
                    <p className="text-sm text-muted-foreground">
                      {completed} course{completed !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
