import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiUrl, api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/paymentUtils";
import { Loader2, Download, TrendingUp, CreditCard, Tag, RefreshCw } from "lucide-react";

export function AdminCommerceDashboard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-commerce-analytics"],
    queryFn: async () => {
      const res = await api<{ analytics: any }>("/commerce/admin/analytics");
      if (res.error) throw new Error(res.error);
      return res.data!.analytics;
    },
    refetchInterval: 60_000,
  });

  const exportCsv = () => {
    window.open(apiUrl("/api/commerce/admin/analytics/export?format=csv"), "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const a = data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Commerce Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Revenue, orders, coupons, refunds, and payouts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatINR(a?.revenue?.today ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">This Week</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatINR(a?.revenue?.week ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">This Month</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatINR(a?.revenue?.month ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">This Year</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatINR(a?.revenue?.year ?? 0)}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Payment Success</p>
              <p className="text-xl font-bold">{a?.paymentSuccessRate ?? 0}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">Payment Failure</p>
              <p className="text-xl font-bold">{a?.paymentFailureRate ?? 0}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Tag className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-sm text-muted-foreground">Coupon Uses</p>
              <p className="text-xl font-bold">{a?.couponUsage ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <RefreshCw className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-sm text-muted-foreground">Refund Rate</p>
              <p className="text-xl font-bold">{a?.refundRate ?? 0}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Top Courses</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(a?.topCourses ?? []).slice(0, 5).map((c: any) => (
              <div key={c.id} className="flex justify-between">
                <span className="truncate">{c.title}</span>
                <span className="font-medium">{formatINR(c.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top Learning Universes</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(a?.topLearningUniverses ?? []).slice(0, 5).map((lu: any) => (
              <div key={lu.id} className="flex justify-between">
                <span className="truncate">{lu.title}</span>
                <span className="font-medium">{formatINR(lu.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline"><Link to="/admin/commerce/coupons">Coupons</Link></Button>
          <Button asChild variant="outline"><Link to="/admin/commerce/refunds">Refunds</Link></Button>
          <Button asChild variant="outline"><Link to="/admin/payments">Payments</Link></Button>
          <Button asChild variant="outline"><Link to="/admin/settings">Tax & GST Settings</Link></Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Order</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(a?.recentOrders ?? []).map((o: any) => (
                <tr key={o.id} className="border-b">
                  <td className="p-2 font-mono text-xs">{o.orderNumber}</td>
                  <td className="p-2">{o.user?.email}</td>
                  <td className="p-2">{formatINR(o.payment?.amount ?? o.totalAmount)}</td>
                  <td className="p-2 capitalize">{o.payment?.status ?? o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4 text-sm">
        <Card><CardContent className="p-4">Products: <strong>{a?.counts?.products ?? 0}</strong></CardContent></Card>
        <Card><CardContent className="p-4">Coupons: <strong>{a?.counts?.coupons ?? 0}</strong></CardContent></Card>
        <Card><CardContent className="p-4">Refunds: <strong>{a?.counts?.refunds ?? 0}</strong></CardContent></Card>
        <Card><CardContent className="p-4">Pending Payouts: <strong>{a?.counts?.pendingPayouts ?? 0}</strong></CardContent></Card>
      </div>
    </div>
  );
}
