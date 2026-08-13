import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/paymentUtils";
import { useToastStore } from "@/store/toastStore";
import { Loader2, DollarSign, TrendingUp, ShoppingBag, Wallet } from "lucide-react";

export function InstructorEarnings() {
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bankForm, setBankForm] = useState({ bankName: "", accountHolder: "", accountNumber: "", ifsc: "", upiId: "" });

  const { data, isLoading, error } = useQuery({
    queryKey: ["instructor-earnings"],
    queryFn: async () => {
      const res = await api<any>("/payments/instructor/earnings");
      if (res.error) throw new Error(res.error);
      return res.data;
    },
  });

  const { data: payoutData } = useQuery({
    queryKey: ["instructor-payouts"],
    queryFn: async () => {
      const res = await api<any>("/commerce/instructor/payouts");
      if (res.error) throw new Error(res.error);
      return res.data;
    },
  });

  const saveProfile = async () => {
    const res = await api("/commerce/instructor/payout-profile", { method: "PUT", body: bankForm });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else {
      toast({ title: "Payout details saved" });
      queryClient.invalidateQueries({ queryKey: ["instructor-payouts"] });
    }
  };

  const withdraw = async () => {
    const res = await api("/commerce/instructor/withdraw", {
      method: "POST",
      body: { amount: Number(withdrawAmount), method: bankForm.upiId ? "upi" : "bank" },
    });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else {
      toast({ title: "Withdrawal requested" });
      setWithdrawAmount("");
      queryClient.invalidateQueries({ queryKey: ["instructor-payouts"] });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return <div className="text-destructive">Failed to load earnings.</div>;
  }

  const summary = data?.summary;
  const payments = data?.payments ?? [];
  const payout = payoutData?.summary;
  const profile = payoutData?.profile;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Earnings & Payouts</h1>
        <p className="mt-1 text-muted-foreground">
          Revenue, withdrawals, and payout history ({summary?.instructorSharePercent ?? 80}% instructor share)
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Lifetime Revenue</CardTitle>
            <DollarSign className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatINR(payout?.lifetimeRevenue ?? summary?.totalRevenue ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Available Balance</CardTitle>
            <Wallet className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent className="text-2xl font-bold text-primary">{formatINR(payout?.availableBalance ?? summary?.netEarnings ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Withdrawn</CardTitle>
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatINR(payout?.withdrawn ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Students Purchased</CardTitle>
            <ShoppingBag className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-2xl font-bold">{payout?.studentsPurchased ?? summary?.purchaseCount ?? 0}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Bank / UPI Details</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Input placeholder="Bank name" value={bankForm.bankName || profile?.bankName || ""} onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })} />
            <Input placeholder="Account holder" value={bankForm.accountHolder || profile?.accountHolder || ""} onChange={(e) => setBankForm({ ...bankForm, accountHolder: e.target.value })} />
            <Input placeholder="Account number" value={bankForm.accountNumber || profile?.accountNumber || ""} onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })} />
            <Input placeholder="IFSC" value={bankForm.ifsc || profile?.ifsc || ""} onChange={(e) => setBankForm({ ...bankForm, ifsc: e.target.value })} />
            <Input placeholder="UPI ID" value={bankForm.upiId || profile?.upiId || ""} onChange={(e) => setBankForm({ ...bankForm, upiId: e.target.value })} />
            <Button onClick={saveProfile}>Save payout details</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Request Withdrawal</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Pending: {formatINR(payout?.pendingWithdrawals ?? 0)}</p>
            <Input type="number" placeholder="Amount" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
            <Button onClick={withdraw}>Request withdrawal</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Top Courses</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(data?.topCourses ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No course sales yet.</p>
            ) : (
              data.topCourses.map((c: any) => (
                <div key={c.id} className="flex justify-between text-sm">
                  <span>{c.title}</span>
                  <span className="font-bold">{formatINR(c.revenue)} ({c.count})</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Payout History</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(payout?.withdrawals ?? []).length === 0 ? (
              <p className="text-muted-foreground">No withdrawals yet.</p>
            ) : (
              payout.withdrawals.map((w: any) => (
                <div key={w.id} className="flex justify-between border-b pb-2">
                  <span className="capitalize">{w.status}</span>
                  <span>{formatINR(w.amount)} — {new Date(w.createdAt).toLocaleDateString()}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Purchases</CardTitle></CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No purchases yet.</p>
          ) : (
            <div className="space-y-3">
              {payments.slice(0, 20).map((p: any) => (
                <div key={p.id} className="flex justify-between items-center border-b border-border/50 pb-2 text-sm">
                  <div>
                    <p className="font-medium">{p.course?.title || p.learningUniverse?.title}</p>
                    <p className="text-muted-foreground">{p.user?.firstName} {p.user?.lastName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">{formatINR(p.instructorEarning ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
