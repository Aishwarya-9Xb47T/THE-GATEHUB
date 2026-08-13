import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToastStore } from "@/store/toastStore";
import { useState } from "react";

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  suspended: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export function AdminManagement() {
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "admins"],
    queryFn: async () => {
      const res = await api<{ admins: AdminUser[] }>("/admin/admins");
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
  });

  const createAdmin = useMutation({
    mutationFn: async () => {
      const res = await api("/admin/admins", { method: "POST", body: form });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "admins"] });
      setShowCreate(false);
      setForm({ email: "", password: "", firstName: "", lastName: "" });
      toast({ title: "Admin created", variant: "success" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateAdmin = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AdminUser> }) => {
      const res = await api(`/admin/admins/${id}`, { method: "PATCH", body: data });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "admins"] });
      toast({ title: "Admin updated", variant: "success" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeAdmin = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(`/admin/admins/${id}`, { method: "DELETE" });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "admins"] });
      toast({ title: "Admin removed", variant: "success" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const admins = data?.admins ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Admin Management</h1>
          <p className="mt-1 text-muted-foreground">Super admin only — manage platform administrators</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>{showCreate ? "Cancel" : "Create Admin"}</Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
            <div><Label>First name</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div><Label>Last name</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <Button onClick={() => createAdmin.mutate()} disabled={createAdmin.isPending}>Create Admin Account</Button>
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
                    <th className="text-left p-4">Name</th>
                    <th className="text-left p-4">Email</th>
                    <th className="text-left p-4">Role</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Last Login</th>
                    <th className="text-right p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-4">{a.firstName} {a.lastName}</td>
                      <td className="p-4">{a.email}</td>
                      <td className="p-4 capitalize">{a.role.replace("_", " ")}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${a.suspended ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                          {a.suspended ? "Disabled" : "Active"}
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "—"}</td>
                      <td className="p-4 text-right space-x-2">
                        {a.role !== "super_admin" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => updateAdmin.mutate({ id: a.id, data: { suspended: !a.suspended } })}>
                              {a.suspended ? "Enable" : "Disable"}
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => removeAdmin.mutate(a.id)}>Demote</Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
