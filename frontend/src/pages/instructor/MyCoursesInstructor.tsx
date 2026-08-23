import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PlayCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastStore } from "@/store/toastStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InstructorCourseCard } from "@/components/instructor/InstructorCourseCard";
import type { CourseAcademicStudioEdit } from "@/lib/instructorCourseEdit";

interface Course {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  status: string;
  thumbnail?: string | null;
  bannerUrl?: string | null;
  averageRating?: number;
  reviewCount?: number;
  _count: { enrollments: number; sections: number; reviews?: number };
  academicStudioEdit?: CourseAcademicStudioEdit | null;
}

export function MyCoursesInstructor() {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["courses", "my-instructor"],
    queryFn: async () => {
      const res = await api<{ courses: Course[] }>("/courses/my-instructor");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const handleTogglePublish = async (courseId: string, currentStatus: string) => {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    const res = await api<{ success: boolean }>(`/courses/${courseId}`, {
      method: "PATCH",
      body: { status: newStatus },
    });
    if (res.error) {
      toast({ title: "Error updating course", description: res.error, variant: "destructive" });
    } else {
      toast({ title: `Course ${newStatus} successfully`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["courses", "my-instructor"] });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api<{ success: boolean }>(`/courses/${id}`, { method: "DELETE" });
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: "Course deleted", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["courses", "my-instructor"] });
      setCourseToDelete(null);
      setConfirmName("");
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const courses = data?.courses ?? [];
  const isConfirmNameValid = courseToDelete && confirmName === courseToDelete.title;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title tracking-tight text-foreground">My Courses</h1>
          <p className="mt-2 text-muted-foreground">Manage and grow your curriculum catalog.</p>
        </div>
        <Button asChild size="lg" className="rounded-xl shadow-lg shadow-primary/20">
          <Link to="/instructor/courses/new">Create New Course</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="course-card-skeleton border border-border bg-card/50 animate-pulse">
              <div className="course-card-skeleton__banner" />
            </div>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="p-20 text-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto opacity-40">
              <PlayCircle className="w-8 h-8" />
            </div>
            <p className="text-xl font-bold text-foreground">No courses yet.</p>
            <p className="text-muted-foreground max-w-xs mx-auto">
              Start sharing your knowledge by creating your first course today.
            </p>
            <Button asChild size="lg" className="rounded-xl">
              <Link to="/instructor/courses/new">Create First Course</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-stretch">
          {courses.map((course) => (
            <InstructorCourseCard
              key={course.id}
              course={course}
              variant="catalog"
              onTogglePublish={handleTogglePublish}
              onDelete={(course) => {
                setCourseToDelete(course);
                setConfirmName("");
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={!!courseToDelete} onOpenChange={(open) => {
        if (!open) {
          setCourseToDelete(null);
          setConfirmName("");
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-foreground">Delete Course?</DialogTitle>
            <DialogDescription className="pt-2 text-muted-foreground leading-relaxed">
              This action cannot be undone. All content, enrollments, and associated data for{" "}
              <span className="font-bold text-foreground">&quot;{courseToDelete?.title}&quot;</span> will be
              permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              To confirm, type the name of the course <strong className="text-foreground">{courseToDelete?.title}</strong> below:
            </p>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="Type course name here"
            />
          </div>
          <DialogFooter className="mt-6 flex gap-3">
            <Button variant="outline" className="flex-1 font-semibold rounded-xl" onClick={() => {
              setCourseToDelete(null);
              setConfirmName("");
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 font-bold rounded-xl bg-destructive hover:bg-destructive/90 shadow-lg shadow-destructive/20"
              onClick={() => courseToDelete && deleteMutation.mutate(courseToDelete.id)}
              disabled={deleteMutation.isPending || !isConfirmNameValid}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting...
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
