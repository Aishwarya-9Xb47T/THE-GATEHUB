import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/paymentUtils";
import { Loader2, Receipt, Award } from "lucide-react";
import { useToastStore } from "@/store/toastStore";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  transactionId: string | null;
  productType: string;
  couponCode?: string | null;
  refundAmount?: number | null;
  createdAt: string;
  course?: { id: string; title: string; thumbnail?: string | null } | null;
  learningUniverse?: { id: string; title: string; thumbnail?: string | null } | null;
  order?: { orderNumber: string; status: string; id: string } | null;
  invoice?: { id: string; invoiceNumber: string; pdfPath: string | null } | null;
}

interface RefundRequest {
  id: string;
  paymentId: string;
  amount: number;
  status: string;
  reason: string;
  createdAt: string;
}

export function PurchaseHistoryPage() {
  const toast = useToastStore((s) => s.add);
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const { data: payments, isLoading, error, refetch } = useQuery({
    queryKey: ["my-payments"],
    queryFn: async () => {
      const res = await api<{ payments: Payment[] }>("/payments/my-payments");
      if (res.error) throw new Error(res.error);
      return res.data!.payments;
    },
  });

  const { data: refunds } = useQuery({
    queryKey: ["my-refunds"],
    queryFn: async () => {
      const res = await api<{ requests: RefundRequest[] }>("/commerce/refunds/mine");
      if (res.error) throw new Error(res.error);
      return res.data!.requests;
    },
  });

  const requestRefund = async () => {
    if (!refundPaymentId || !refundReason.trim()) return;
    const res = await api("/commerce/refunds", {
      method: "POST",
      body: { paymentId: refundPaymentId, reason: refundReason },
    });
    if (res.error) {
      toast({ title: "Refund request failed", description: res.error, variant: "destructive" });
    } else {
      setRefundPaymentId(null);
      setRefundReason("");
      refetch();
      toast({ title: "Refund requested", variant: "success" });
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
    return <div className="text-destructive">Failed to load purchase history.</div>;
  }

  const list = payments ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Purchase History</h1>
        <p className="mt-1 text-muted-foreground">Orders, invoices, payments, and refunds</p>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">No purchases yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {list.map((p) => {
            const title =
              p.course?.title ||
              p.learningUniverse?.title ||
              (p.productType === "learning_universe" ? "Learning Universe" : "Course");
            const refund = refunds?.find((r) => r.paymentId === p.id);

            return (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-primary" />
                    {title}
                  </CardTitle>
                  <span className="text-sm font-bold text-primary">{formatINR(p.amount)}</span>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Status: <span className="capitalize">{p.status}</span></p>
                  {p.order?.orderNumber && <p>Order: {p.order.orderNumber}</p>}
                  {p.couponCode && <p>Coupon: {p.couponCode}</p>}
                  <p>Date: {new Date(p.createdAt).toLocaleString()}</p>
                  {p.transactionId && <p className="font-mono text-xs">Txn: {p.transactionId}</p>}
                  {p.refundAmount != null && p.refundAmount > 0 && (
                    <p className="text-orange-600">Refunded: {formatINR(p.refundAmount)}</p>
                  )}
                  {refund && <p>Refund request: <span className="capitalize">{refund.status}</span></p>}
                  <div className="flex flex-wrap gap-3 pt-2">
                    {p.invoice?.pdfPath && (
                      <a
                        href={p.invoice.pdfPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Download invoice ({p.invoice.invoiceNumber})
                      </a>
                    )}
                    {p.course && p.status === "completed" && (
                      <a href={`/student/certificates`} className="text-primary hover:underline flex items-center gap-1">
                        <Award className="w-4 h-4" /> Certificate (if eligible)
                      </a>
                    )}
                    {p.status === "completed" && !refund && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRefundPaymentId(p.id)}
                      >
                        Request refund
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {refundPaymentId && (
        <Card>
          <CardHeader><CardTitle>Request Refund</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="w-full min-h-[80px] rounded-lg border p-3 bg-background text-sm"
              placeholder="Reason for refund..."
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={requestRefund}>Submit</Button>
              <Button variant="outline" onClick={() => setRefundPaymentId(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
