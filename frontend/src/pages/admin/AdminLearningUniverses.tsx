import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";
import { formatINR } from "@/lib/paymentUtils";

interface LearningUniverse {
  id: string;
  title: string;
  status: string;
  price: number;
  instructor?: { firstName: string; lastName: string; email: string };
  _count?: { enrollments: number; certificates: number };
  revenue?: number;
  paymentCount?: number;
  avgProgress?: number;
}

export function AdminLearningUniverses() {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [impactText, setImpactText] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "learning-universes", statusFilter],
    queryFn: async () => {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const res = await api<{ learningUniverses: LearningUniverse[] }>(`/admin/learning-universes${params}`);
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    refetchInterval: 60_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api(`/admin/learning-universes/${id}/status`, { method: "PATCH", body: { status } });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "learning-universes"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast({ title: "Learning Universe updated", variant: "success" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const archiveLu = useMutation({
    mutationFn: async (id: string) => {
      const res = await api<{ action?: string; message?: string }>(`/admin/learning-universes/${id}`, {
        method: "DELETE",
      });
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      setConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "learning-universes"] });
      toast({
        title: data?.action === "archived" ? "Learning Universe archived" : "Learning Universe removed",
        description: data?.message,
        variant: "success",
      });
    },
    onError: (err: Error) => toast({ title: "Archive failed", description: err.message, variant: "destructive" }),
  });

  const openArchive = async (id: string) => {
    const res = await api<{ impact: { warning: string; recommendedAction: string } }>(
      `/admin/learning-universes/${id}/deletion-impact`
    );
    if (res.error) {
      toast({ title: "Could not load impact", description: res.error, variant: "destructive" });
      return;
    }
    setImpactText(res.data!.impact.warning);
    setConfirmId(id);
  };

  const universes = data?.learningUniverses ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Learning Universes</h1>
        <p className="mt-1 text-muted-foreground">Manage Learning Universes, revenue, and progress</p>
      </div>

      <select className="h-10 rounded-lg border px-3 text-sm bg-background" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>

      {isError && <Card><CardContent className="p-4 text-destructive">{(error as Error).message}</CardContent></Card>}

      {confirmId && (
        <Card className="border-amber-500/40">
          <CardContent className="p-4 space-y-3 text-sm">
            <p className="font-medium">Archive Learning Universe?</p>
            <p className="text-muted-foreground">{impactText}</p>
            <p className="text-xs text-muted-foreground">
              Issued certificates and historical student results are never deleted.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={archiveLu.isPending}
                onClick={() => archiveLu.mutate(confirmId)}
              >
                Archive
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmId(null)}>
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
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-right p-4 font-medium">Enrollments</th>
                    <th className="text-right p-4 font-medium">Avg Progress</th>
                    <th className="text-right p-4 font-medium">Certificates</th>
                    <th className="text-right p-4 font-medium">Revenue</th>
                    <th className="text-right p-4 font-medium">Sales</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {universes.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-4 font-medium">{u.title}</td>
                      <td className="p-4">{u.instructor ? `${u.instructor.firstName} ${u.instructor.lastName}` : "—"}</td>
                      <td className="p-4">
                        <select
                          className="rounded border px-2 py-1 text-sm bg-background"
                          value={u.status}
                          onChange={(e) => updateStatus.mutate({ id: u.id, status: e.target.value })}
                        >
                          <option value="draft">Draft</option>
                          <option value="published">Published</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>
                      <td className="p-4 text-right">{u._count?.enrollments ?? 0}</td>
                      <td className="p-4 text-right">{u.avgProgress ?? 0}%</td>
                      <td className="p-4 text-right">{u._count?.certificates ?? 0}</td>
                      <td className="p-4 text-right font-medium">{formatINR(u.revenue ?? 0)}</td>
                      <td className="p-4 text-right">{u.paymentCount ?? 0}</td>
                      <td className="p-4 text-right">
                        <Button variant="outline" size="sm" onClick={() => openArchive(u.id)}>
                          Archive…
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {universes.length === 0 && <p className="p-12 text-center text-muted-foreground">No Learning Universes found.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
