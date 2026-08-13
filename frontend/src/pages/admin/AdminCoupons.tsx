import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastStore } from "@/store/toastStore";
import { Loader2, Plus, Copy, Trash2, Pencil } from "lucide-react";

interface Coupon {
  id: string;
  code: string;
  description?: string | null;
  discountType: string;
  discountValue: number;
  maxUses?: number | null;
  usedCount: number;
  minOrderAmount: number;
  maxDiscount?: number | null;
  expiresAt?: string | null;
  active: boolean;
  firstPurchaseOnly: boolean;
  globalScope: boolean;
  courseId?: string | null;
  learningUniverseId?: string | null;
  categoryId?: string | null;
  productType?: string | null;
}

const emptyForm = {
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: 10,
  maxUses: "",
  minOrderAmount: 0,
  maxDiscount: "",
  expiresAt: "",
  firstPurchaseOnly: false,
  globalScope: false,
  active: true,
};

export function AdminCoupons() {
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const res = await api<{ coupons: Coupon[] }>("/payments/admin/coupons");
      if (res.error) throw new Error(res.error);
      return res.data!.coupons;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        discountValue: Number(form.discountValue),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        minOrderAmount: Number(form.minOrderAmount),
        expiresAt: form.expiresAt || null,
      };
      if (editing) {
        const res = await api(`/commerce/admin/coupons/${editing.id}`, { method: "PATCH", body });
        if (res.error) throw new Error(res.error);
      } else {
        const res = await api("/payments/admin/coupons", { method: "POST", body });
        if (res.error) throw new Error(res.error);
      }
    },
    onSuccess: () => {
      toast({ title: editing ? "Coupon updated" : "Coupon created" });
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const coupons = (data ?? []).filter(
    (c) => !search || c.code.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      description: c.description || "",
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxUses: c.maxUses?.toString() || "",
      minOrderAmount: c.minOrderAmount,
      maxDiscount: c.maxDiscount?.toString() || "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      firstPurchaseOnly: c.firstPurchaseOnly,
      globalScope: c.globalScope,
      active: c.active,
    });
    setShowForm(true);
  };

  const duplicate = async (id: string) => {
    const res = await api(`/commerce/admin/coupons/${id}/duplicate`, { method: "POST" });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else {
      toast({ title: "Coupon duplicated" });
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this coupon?")) return;
    const res = await api(`/commerce/admin/coupons/${id}`, { method: "DELETE" });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  const toggleActive = async (c: Coupon) => {
    const res = await api(`/commerce/admin/coupons/${c.id}`, {
      method: "PATCH",
      body: { active: !c.active },
    });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Coupon Management</h1>
          <p className="mt-1 text-muted-foreground">Create, edit, and monitor discount codes</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New Coupon
        </Button>
      </div>

      <Input placeholder="Search coupons..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{editing ? "Edit Coupon" : "Create Coupon"}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Input placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <select className="h-10 rounded-lg border px-3 bg-background" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
              <option value="percentage">Percentage</option>
              <option value="flat">Flat discount</option>
            </select>
            <Input type="number" placeholder="Discount value" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} />
            <Input type="number" placeholder="Min order amount" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: Number(e.target.value) })} />
            <Input type="number" placeholder="Max discount (optional)" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} />
            <Input type="number" placeholder="Max uses (optional)" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
            <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.firstPurchaseOnly} onChange={(e) => setForm({ ...form, firstPurchaseOnly: e.target.checked })} />
              First purchase only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.globalScope} onChange={(e) => setForm({ ...form, globalScope: e.target.checked })} />
              Global coupon
            </label>
            <div className="sm:col-span-2 flex gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Save</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3">Code</th>
                <th className="p-3">Discount</th>
                <th className="p-3">Usage</th>
                <th className="p-3">Min</th>
                <th className="p-3">Expiry</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-3 font-mono font-medium">{c.code}</td>
                  <td className="p-3">
                    {c.discountType === "percentage" ? `${c.discountValue}%` : `₹${c.discountValue}`}
                    {c.maxDiscount ? ` (max ₹${c.maxDiscount})` : ""}
                  </td>
                  <td className="p-3">{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}</td>
                  <td className="p-3">₹{c.minOrderAmount}</td>
                  <td className="p-3">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}</td>
                  <td className="p-3">
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(c)}>
                      {c.active ? "Active" : "Disabled"}
                    </Button>
                  </td>
                  <td className="p-3 flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => duplicate(c.id)}><Copy className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(c.id)}><Trash2 className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
