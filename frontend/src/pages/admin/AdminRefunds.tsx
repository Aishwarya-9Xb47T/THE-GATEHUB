import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastStore } from "@/store/toastStore";
import { formatINR } from "@/lib/paymentUtils";
import { Loader2 } from "lucide-react";

interface RefundRequest {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  status: string;
  adminNote?: string | null;
  gatewayRef?: string | null;
  createdAt: string;
  processedAt?: string | null;
  user: { email: string; firstName: string; lastName: string };
  order?: { orderNumber: string; productTitle: string; totalAmount: number } | null;
}

export function AdminRefunds() {
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [partialAmount, setPartialAmount] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin-refunds", statusFilter],
    queryFn: async () => {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const res = await api<{ requests: RefundRequest[] }>(`/commerce/admin/refunds${params}`);
      if (res.error) throw new Error(res.error);
      return res.data!.requests;
    },
  });

  const process = async (id: string, action: "approve" | "reject" | "partial", amount?: number) => {
    const res = await api(`/commerce/admin/refunds/${id}/process`, {
      method: "POST",
      body: { action, amount, adminNote: action === "reject" ? "Rejected by admin" : undefined },
    });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else {
      toast({ title: `Refund ${action === "reject" ? "rejected" : "processed"}` });
      queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const requests = data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Refund Management</h1>
        <p className="mt-1 text-muted-foreground">Review and process student refund requests</p>
      </div>

      <select
        className="h-10 rounded-lg border px-3 bg-background"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        <option value="">All</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="partial">Partial</option>
        <option value="rejected">Rejected</option>
      </select>

      {requests.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No refund requests.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{r.order?.productTitle || "Purchase"}</CardTitle>
                  <p className="text-sm text-muted-foreground">{r.user.email}</p>
                </div>
                <span className="text-sm font-bold capitalize px-2 py-1 rounded bg-muted">{r.status}</span>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p><strong>Amount:</strong> {formatINR(r.amount)}</p>
                <p><strong>Reason:</strong> {r.reason}</p>
                {r.order?.orderNumber && <p><strong>Order:</strong> {r.order.orderNumber}</p>}
                <p><strong>Requested:</strong> {new Date(r.createdAt).toLocaleString()}</p>
                {r.processedAt && <p><strong>Processed:</strong> {new Date(r.processedAt).toLocaleString()}</p>}
                {r.gatewayRef && <p><strong>Gateway:</strong> {r.gatewayRef}</p>}

                {r.status === "pending" && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" onClick={() => process(r.id, "approve")}>Full Refund</Button>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        placeholder="Partial amount"
                        className="w-32 h-9"
                        value={partialAmount[r.id] || ""}
                        onChange={(e) => setPartialAmount({ ...partialAmount, [r.id]: e.target.value })}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => process(r.id, "partial", Number(partialAmount[r.id]))}
                      >
                        Partial Refund
                      </Button>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => process(r.id, "reject")}>Reject</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
