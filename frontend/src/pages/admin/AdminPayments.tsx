import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/paymentUtils";
import { Loader2 } from "lucide-react";

export function AdminPayments() {
  const [status, setStatus] = useState("");
  const [productType, setProductType] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "payments", status, productType, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (productType) params.set("productType", productType);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await api<any>(`/payments/admin/summary?${params}`);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: 60_000,
  });

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const summary = data?.summary;
  const payments = data?.payments ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Payments</h1>
        <p className="mt-1 text-muted-foreground">Platform revenue and transactions — totals from all completed payments</p>
      </div>

      {isError && <Card><CardContent className="p-4 text-destructive">{(error as Error).message}</CardContent></Card>}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatINR(summary?.totalRevenue ?? 0)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Platform Revenue (20%)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatINR(summary?.platformRevenue ?? 0)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Instructor Revenue (80%)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatINR(summary?.instructorRevenue ?? 0)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Refunds</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary?.refundCount ?? 0} ({formatINR(summary?.refundAmount ?? 0)})</CardContent></Card>
      </div>

      {summary?.filteredCount != null && summary.filteredCount !== summary.transactionCount && (
        <p className="text-sm text-muted-foreground">
          Showing {summary.filteredCount} filtered transactions ({formatINR(summary.filteredRevenue ?? 0)} filtered revenue)
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search email, txn, title..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select className="h-10 rounded-lg border px-3 text-sm bg-background" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <select className="h-10 rounded-lg border px-3 text-sm bg-background" value={productType} onChange={(e) => setProductType(e.target.value)}>
          <option value="">All products</option>
          <option value="course">Courses</option>
          <option value="learning_universe">Learning Universes</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Student</th>
                <th className="text-left p-3">Product</th>
                <th className="text-left p-3">Type</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-right p-3">Platform</th>
                <th className="text-right p-3">Instructor</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Txn ID</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-3">{new Date(p.createdAt).toLocaleString()}</td>
                  <td className="p-3">{p.user?.email}</td>
                  <td className="p-3">{p.course?.title || p.learningUniverse?.title}</td>
                  <td className="p-3 capitalize">{p.productType?.replace("_", " ")}</td>
                  <td className="p-3 text-right font-medium">{formatINR(p.amount)}</td>
                  <td className="p-3 text-right">{formatINR(p.platformFee ?? 0)}</td>
                  <td className="p-3 text-right">{formatINR(p.instructorEarning ?? 0)}</td>
                  <td className="p-3 capitalize">{p.status}</td>
                  <td className="p-3 font-mono text-xs">{p.transactionId}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && (
            <p className="p-12 text-center text-muted-foreground">No transactions found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
