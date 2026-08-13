import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastStore } from "@/store/toastStore";
import { useUserStore, isSuperAdminRole } from "@/store/userStore";
import { formatRoleLabel, isAdminRole } from "@/lib/roles";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  suspended: boolean;
  deletedAt?: string | null;
  createdAt: string;
  _count?: {
    enrollments: number;
    luEnrollments: number;
    payments: number;
    certificates: number;
    luCertificates: number;
    luProjectSubmissions: number;
  };
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    student: "bg-blue-100 text-blue-800",
    instructor: "bg-purple-100 text-purple-800",
    admin: "bg-amber-100 text-amber-800",
    super_admin: "bg-red-100 text-red-800",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[role] ?? "bg-gray-100 text-gray-700"}`}>
      {formatRoleLabel(role)}
    </span>
  );
}

export function AdminUsers() {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);
  const { user: currentUser } = useUserStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "users", page, search, roleFilter, showDeleted],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (showDeleted && isSuperAdmin) params.set("includeDeleted", "true");
      const res = await api<{ users: User[]; total: number; page: number; limit: number }>(`/admin/users?${params}`);
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const { data: detail } = useQuery({
    queryKey: ["admin", "users", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const res = await api<{ user: any }>(`/admin/users/${selectedId}`);
      if (res.error) throw new Error(res.error);
      return res.data!.user;
    },
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<User> }) => {
      const res = await api(`/admin/users/${id}`, { method: "PATCH", body: data });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users", vars.id] });
      toast({ title: "User updated", variant: "success" });
    },
    onError: (err: Error) => toast({ title: "Failed to update user", description: err.message, variant: "destructive" }),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(`/admin/users/${id}`, { method: "DELETE" });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setSelectedId(null);
      toast({ title: "User deleted", variant: "success" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const restoreUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(`/admin/users/${id}/restore`, { method: "POST" });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({ title: "User restored", variant: "success" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const users = data?.users ?? [];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Users</h1>
        <p className="mt-1 text-muted-foreground">Manage platform users, enrollments, and activity</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search name or email..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="max-w-xs" />
        <select className="h-10 rounded-lg border px-3 text-sm bg-background" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          <option value="student">Student</option>
          <option value="instructor">Instructor</option>
          <option value="admin">Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
        {isSuperAdmin && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
            Show deleted
          </label>
        )}
        {data && <span className="text-sm text-muted-foreground self-center">{data.total} users</span>}
      </div>

      {isError && (
        <Card><CardContent className="p-4 text-destructive">{(error as Error).message}</CardContent></Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            {isLoading ? <div className="p-6 animate-pulse h-48" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="text-left p-4 font-medium">Name</th>
                      <th className="text-left p-4 font-medium">Email</th>
                      <th className="text-left p-4 font-medium">Role</th>
                      <th className="text-left p-4 font-medium">Joined</th>
                      <th className="text-left p-4 font-medium">Enrolled</th>
                      <th className="text-left p-4 font-medium">Certs</th>
                      <th className="text-left p-4 font-medium">Payments</th>
                      <th className="text-left p-4 font-medium">Status</th>
                      <th className="text-right p-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer ${selectedId === u.id ? "bg-muted/50" : ""}`} onClick={() => setSelectedId(u.id)}>
                        <td className="p-4">{u?.firstName || ""} {u?.lastName || ""}</td>
                        <td className="p-4">{u.email}</td>
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          {isAdminRole(u.role) ? (
                            <RoleBadge role={u.role} />
                          ) : (
                            <select
                              className="rounded border px-2 py-1 text-sm bg-background"
                              value={u.role}
                              onChange={(e) => updateUser.mutate({ id: u.id, data: { role: e.target.value } })}
                            >
                              <option value="student">Student</option>
                              <option value="instructor">Instructor</option>
                              {isSuperAdmin && <option value="admin">Admin</option>}
                            </select>
                          )}
                          {isSuperAdmin && u.role === "admin" && (
                            <Button variant="ghost" size="sm" className="ml-1 text-xs" onClick={() => updateUser.mutate({ id: u.id, data: { role: "student" } })}>Demote</Button>
                          )}
                        </td>
                        <td className="p-4 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="p-4">{(u._count?.enrollments ?? 0) + (u._count?.luEnrollments ?? 0)}</td>
                        <td className="p-4">{(u._count?.certificates ?? 0) + (u._count?.luCertificates ?? 0)}</td>
                        <td className="p-4">{u._count?.payments ?? 0}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.deletedAt ? "bg-gray-100 text-gray-700" : u.suspended ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            {u.deletedAt ? "Deleted" : u.suspended ? "Suspended" : "Active"}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                          {!u.deletedAt && u.role !== "super_admin" && (
                            <Button variant={u.suspended ? "outline" : "destructive"} size="sm" onClick={() => updateUser.mutate({ id: u.id, data: { suspended: !u.suspended } })}>
                              {u.suspended ? "Unsuspend" : "Suspend"}
                            </Button>
                          )}
                          {isSuperAdmin && u.role !== "super_admin" && !u.deletedAt && u.role !== "admin" && (
                            <Button variant="outline" size="sm" onClick={() => updateUser.mutate({ id: u.id, data: { role: "admin" } })}>Promote</Button>
                          )}
                          {isSuperAdmin && u.role !== "super_admin" && !u.deletedAt && (
                            <Button variant="destructive" size="sm" onClick={() => deleteUser.mutate(u.id)}>Delete</Button>
                          )}
                          {isSuperAdmin && u.deletedAt && (
                            <Button variant="outline" size="sm" onClick={() => restoreUser.mutate(u.id)}>Restore</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 p-4 border-t">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm self-center">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">User Details</h3>
            {!selectedId ? (
              <p className="text-muted-foreground text-sm">Select a user to view profile, activity, payments, and progress.</p>
            ) : !detail ? (
              <div className="animate-pulse h-32" />
            ) : (
              <div className="space-y-4 text-sm">
                <div>
                  <p><strong>{detail.firstName} {detail.lastName}</strong></p>
                  <p className="text-muted-foreground">{detail.email}</p>
                  <RoleBadge role={detail.role} />
                  <p className="text-muted-foreground mt-1">Joined {new Date(detail.createdAt).toLocaleDateString()}</p>
                  {detail.lastLoginAt && <p className="text-muted-foreground">Last login {new Date(detail.lastLoginAt).toLocaleString()}</p>}
                </div>
                <div>
                  <p className="font-medium mb-1">Course Enrollments ({detail.enrollments?.length ?? 0})</p>
                  <ul className="text-muted-foreground space-y-1 max-h-24 overflow-y-auto">
                    {detail.enrollments?.map((e: any) => <li key={e.id}>{e.course?.title}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-1">LU Enrollments ({detail.luEnrollments?.length ?? 0})</p>
                  <ul className="text-muted-foreground space-y-1 max-h-24 overflow-y-auto">
                    {detail.luEnrollments?.map((e: any) => <li key={e.id}>{e.learningUniverse?.title}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-1">Payments ({detail.payments?.length ?? 0})</p>
                  <ul className="text-muted-foreground space-y-1 max-h-24 overflow-y-auto">
                    {detail.payments?.map((p: any) => <li key={p.id}>{p.productType} — {p.status} — ₹{p.amount}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-1">Certificates</p>
                  <ul className="text-muted-foreground space-y-1">
                    {detail.certificates?.map((c: any) => <li key={c.id}>{c.course?.title}</li>)}
                    {detail.luCertificates?.map((c: any) => <li key={c.id}>{c.learningUniverse?.title}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-1">Projects ({detail.luProjectSubmissions?.length ?? 0})</p>
                  <ul className="text-muted-foreground space-y-1 max-h-24 overflow-y-auto">
                    {detail.luProjectSubmissions?.map((s: any) => (
                      <li key={s.id}>{s.project?.title} — {s.status}{s.grade != null ? ` (${s.grade})` : ""}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
