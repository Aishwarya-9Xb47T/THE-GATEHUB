import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, DollarSign, BookOpen, Star, Plus, Loader2, AlertCircle, FileText, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InstructorCourseCard } from "@/components/instructor/InstructorCourseCard";
import { InstructorLuCard } from "@/components/instructor/InstructorLuCard";
import { instructorPreviewState } from "@/lib/instructorPreview";
import { formatINR } from "@/lib/paymentUtils";
import { useToastStore } from "@/store/toastStore";

interface Course {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  status: string;
  averageRating: number;
  reviewCount: number;
  _count: { enrollments: number; sections: number; reviews: number };
  academicStudioEdit?: import("@/lib/instructorCourseEdit").CourseAcademicStudioEdit | null;
}

interface LearningUniverse {
  id: string;
  title: string;
  status: string;
  thumbnail?: string | null;
  bannerUrl?: string | null;
  _count?: { enrollments: number };
}

export function InstructorDashboard() {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);
  const location = useLocation();
  const previewReturn = instructorPreviewState(location);
  const [universeToDelete, setUniverseToDelete] = useState<LearningUniverse | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const {
    data: coursesData,
    isLoading: coursesLoading,
    isError: coursesError,
    error: coursesErr,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: ["courses", "my-instructor"],
    queryFn: async () => {
      const res = await api<{ courses: Course[] }>("/courses/my-instructor");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const {
    data: luData,
    isLoading: luLoading,
    isError: luError,
    refetch: refetchLu,
  } = useQuery({
    queryKey: ["learning-universes", "mine"],
    queryFn: async () => {
      const res = await api<{ data: LearningUniverse[] }>("/learning-universes/mine");
      if (res.error) throw new Error(res.error);
      return res.data?.data ?? [];
    },
  });

  const { data: earningsData } = useQuery({
    queryKey: ["instructor-earnings-summary"],
    queryFn: async () => {
      const res = await api<any>("/payments/instructor/earnings");
      if (res.error) return null;
      return res.data?.summary;
    },
  });

  const deleteLuMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api<{ success: boolean }>(`/learning-universes/${id}`, { method: "DELETE" });
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: "Learning Universe deleted", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["learning-universes", "mine"] });
      setUniverseToDelete(null);
      setConfirmName("");
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const courses = coursesData?.courses ?? [];
  const learningUniverses = luData ?? [];
  const totalStudents = courses.reduce((acc, c) => acc + (c._count?.enrollments ?? 0), 0);
  const published = courses.filter((c) => c.status === "published").length;
  const drafts = courses.filter((c) => c.status === "draft").length;
  const isConfirmNameValid = universeToDelete && confirmName === universeToDelete.title;

  const rated = courses.filter((c) => (c.reviewCount ?? 0) > 0 && Number.isFinite(c.averageRating));
  const avgRating =
    rated.length > 0
      ? Math.round(
          (rated.reduce((s, c) => s + Number(c.averageRating || 0), 0) / rated.length) * 10
        ) / 10
      : null;

  const isLoading = coursesLoading || luLoading;
  const isError = coursesError || luError;

  const cards = [
    { label: "Total Students", value: isLoading ? "…" : totalStudents, icon: Users, hint: "Across your courses" },
    {
      label: "Net Revenue",
      value: isLoading ? "…" : formatINR(earningsData?.netEarnings ?? 0),
      icon: DollarSign,
      hint: "From completed payments",
    },
    {
      label: "Courses Published",
      value: isLoading ? "…" : published,
      icon: BookOpen,
      hint: drafts > 0 ? `${drafts} draft${drafts === 1 ? "" : "s"}` : "Live for students",
    },
    {
      label: "Avg Rating",
      value: isLoading ? "…" : avgRating != null ? avgRating.toFixed(1) : "No reviews yet",
      icon: Star,
      hint: avgRating != null ? `From ${rated.length} rated course${rated.length === 1 ? "" : "s"}` : "Ratings appear after reviews",
    },
  ];

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Instructor Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Your creator studio</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="font-semibold">Couldn’t load your dashboard</p>
            <p className="text-sm text-muted-foreground">
              {(coursesErr as Error)?.message || "Please try again."}
            </p>
            <Button
              onClick={() => {
                refetchCourses();
                refetchLu();
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Instructor Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Your creator studio</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/instructor/students">
              <Users className="mr-1.5 h-4 w-4" />
              Students
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/instructor/reports">
              <BarChart3 className="mr-1.5 h-4 w-4" />
              Reports
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/instructor/courses/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Course
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="h-full border-border/60 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                <c.icon className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">{c.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-foreground">Your Courses</h2>
          <Link to="/instructor/courses/new">
            <Button variant="secondary" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Course
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="h-48 animate-pulse p-6" />
              </Card>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="flex flex-col items-center gap-4 p-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-bold text-foreground">No courses yet</p>
                <p className="mx-auto max-w-xs text-muted-foreground">
                  Create your first course to start teaching and earning.
                </p>
              </div>
              <Link to="/instructor/courses/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Your First Course
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.map((course, index) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.3) }}
                className="h-full"
              >
                <InstructorCourseCard course={course} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Learning Universes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Full learning paths and free courses. Premium courses appear under Your Courses.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/instructor/certificates">
                <FileText className="mr-1.5 h-4 w-4" />
                Certificates
              </Link>
            </Button>
            <Link to="/instructor/learning-universe/new" data-tour="create-lu">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Create Learning Universe
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="h-40 animate-pulse p-6" />
              </Card>
            ))}
          </div>
        ) : learningUniverses.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="p-12 text-center text-muted-foreground">
              No learning universes yet. Create one to preview the full student experience.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {learningUniverses.map((lu) => (
              <InstructorLuCard
                key={lu.id}
                universe={lu}
                returnState={previewReturn}
                onDelete={(universe) => {
                  setUniverseToDelete(universe);
                  setConfirmName("");
                }}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={!!universeToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setUniverseToDelete(null);
            setConfirmName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-foreground">Delete Learning Universe?</DialogTitle>
            <DialogDescription className="pt-2 text-muted-foreground leading-relaxed">
              This action cannot be undone. All content, enrollments, and associated data for{" "}
              <span className="font-bold text-foreground">&quot;{universeToDelete?.title}&quot;</span> will be
              permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              To confirm, type the name of the learning universe{" "}
              <strong className="text-foreground">{universeToDelete?.title}</strong> below:
            </p>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="Type learning universe name here"
              aria-label="Confirm learning universe title"
            />
          </div>
          <DialogFooter className="mt-6 flex gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl font-semibold"
              onClick={() => {
                setUniverseToDelete(null);
                setConfirmName("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 rounded-xl font-bold"
              onClick={() => universeToDelete && deleteLuMutation.mutate(universeToDelete.id)}
              disabled={deleteLuMutation.isPending || !isConfirmNameValid}
            >
              {deleteLuMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…
                </>
              ) : (
                "Delete Permanently"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
