import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";
import { formatINR } from "@/lib/paymentUtils";

interface Course {
  id: string;
  title: string;
  status: string;
  price: number;
  instructor?: { firstName: string; lastName: string };
  product?: { id: string; published: boolean; visible: boolean; learningUniverseId?: string | null } | null;
  learningUniverse?: { id: string; title: string; status: string; enrollments: number } | null;
  learningUniverseId?: string | null;
  moduleCount?: number;
  lessonCount?: number;
  _count?: { enrollments: number };
  revenue?: number;
  platformFee?: number;
  instructorEarning?: number;
  paymentCount?: number;
  completedEnrollments?: number;
  completionRate?: number;
  createdAt?: string;
  updatedAt?: string;
  certificateAvailability?: boolean;
}

interface DeletionImpact {
  canHardDelete: boolean;
  recommendedAction: string;
  warning: string;
  course: { title: string; enrollments: number; certificates: number; reviews: number };
  product?: { id: string; displayName: string } | null;
  learningUniverse?: { id: string; title: string; enrollments: number; certificates: number } | null;
}

export function AdminCourses() {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);
  const [statusFilter, setStatusFilter] = useState("");
  const [impactFor, setImpactFor] = useState<{ id: string; impact: DeletionImpact } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "courses", statusFilter],
    queryFn: async () => {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const res = await api<{ courses: Course[] }>(`/admin/courses${params}`);
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    refetchInterval: 60_000,
  });

  const updateCourseStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api(`/admin/courses/${id}/status`, { method: "PATCH", body: { status } });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast({ title: "Course status updated", variant: "success" });
    },
    onError: (err: Error) => toast({ title: "Failed to update course", description: err.message, variant: "destructive" }),
  });

  const archiveCourse = useMutation({
    mutationFn: async (id: string) => {
      const res = await api<{ action?: string; message?: string }>(`/admin/courses/${id}`, { method: "DELETE" });
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      setImpactFor(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      toast({
        title: data?.action === "archived" ? "Course archived" : "Course removed",
        description: data?.message,
        variant: "success",
      });
    },
    onError: (err: Error) => toast({ title: "Archive failed", description: err.message, variant: "destructive" }),
  });

  const openImpact = async (id: string) => {
    const res = await api<{ impact: DeletionImpact }>(`/admin/courses/${id}/deletion-impact`);
    if (res.error) {
      toast({ title: "Could not load impact", description: res.error, variant: "destructive" });
      return;
    }
    setImpactFor({ id, impact: res.data!.impact });
  };

  const courses = data?.courses ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Courses</h1>
        <p className="mt-1 text-muted-foreground">
          Manage Course catalog records, linked Products, and Learning Universes
        </p>
      </div>

      <select className="h-10 rounded-lg border px-3 text-sm bg-background" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>

      {isError && <Card><CardContent className="p-4 text-destructive">{(error as Error).message}</CardContent></Card>}

      {impactFor && (
        <Card className="border-amber-500/40">
          <CardContent className="p-4 space-y-3 text-sm">
            <p className="font-medium">Archive confirmation — {impactFor.impact.course.title}</p>
            <p className="text-muted-foreground">{impactFor.impact.warning}</p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Course enrollments: {impactFor.impact.course.enrollments}</li>
              <li>Course certificates: {impactFor.impact.course.certificates}</li>
              <li>Reviews: {impactFor.impact.course.reviews}</li>
              <li>Product: {impactFor.impact.product?.displayName || "—"}</li>
              <li>
                Learning Universe:{" "}
                {impactFor.impact.learningUniverse
                  ? `${impactFor.impact.learningUniverse.title} (${impactFor.impact.learningUniverse.enrollments} enrollments, ${impactFor.impact.learningUniverse.certificates} certificates)`
                  : "—"}
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Recommended: {impactFor.impact.recommendedAction}. Issued certificates and historical results are never deleted.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={archiveCourse.isPending}
                onClick={() => archiveCourse.mutate(impactFor.id)}
              >
                Archive course
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImpactFor(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6 animate-pulse h-48" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-4 font-medium">Title</th>
                    <th className="text-left p-4 font-medium">Instructor</th>
                    <th className="text-left p-4 font-medium">Product / LU</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-right p-4 font-medium">Modules</th>
                    <th className="text-right p-4 font-medium">Lessons</th>
                    <th className="text-right p-4 font-medium">Students</th>
                    <th className="text-right p-4 font-medium">Progress</th>
                    <th className="text-right p-4 font-medium">Price</th>
                    <th className="text-right p-4 font-medium">Cert</th>
                    <th className="text-right p-4 font-medium">Updated</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-4 font-medium">{c.title}</td>
                      <td className="p-4">{c.instructor ? `${c.instructor.firstName} ${c.instructor.lastName}` : "—"}</td>
                      <td className="p-4 text-xs text-muted-foreground">
                        <div>Product: {c.product ? (c.product.published && c.product.visible ? "Visible" : "Hidden") : "—"}</div>
                        <div>LU: {c.learningUniverse?.status || "—"}</div>
                      </td>
                      <td className="p-4">
                        <select
                          className="rounded border px-2 py-1 text-sm bg-background"
                          value={c.status}
                          onChange={(e) => updateCourseStatus.mutate({ id: c.id, status: e.target.value })}
                        >
                          <option value="draft">Draft</option>
                          <option value="published">Published</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>
                      <td className="p-4 text-right">{c.moduleCount ?? "—"}</td>
                      <td className="p-4 text-right">{c.lessonCount ?? "—"}</td>
                      <td className="p-4 text-right">{c._count?.enrollments ?? 0}</td>
                      <td className="p-4 text-right">{c.completionRate ?? 0}%</td>
                      <td className="p-4 text-right">{formatINR(c.price ?? 0)}</td>
                      <td className="p-4 text-right">{c.certificateAvailability ? "LU" : "—"}</td>
                      <td className="p-4 text-right text-xs text-muted-foreground">
                        {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-4 text-right">
                        <Button variant="outline" size="sm" onClick={() => openImpact(c.id)}>
                          Archive…
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {courses.length === 0 && <p className="p-12 text-center text-muted-foreground">No courses found.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
