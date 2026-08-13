import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/paymentUtils";
import { loadRazorpayScript } from "@/lib/paymentUtils";
import { useUserStore } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { Loader2, ShoppingCart, Trash2, Heart } from "lucide-react";
import { resolveCourseBannerUrl } from "@/lib/courseBanner";

interface CartData {
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    owned: boolean;
    product: {
      displayName: string;
      thumbnail?: string | null;
      productType: string;
      courseId?: string | null;
      learningUniverseId?: string | null;
    };
  }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  platformFee: number;
  grandTotal: number;
  currency: string;
  gstPercent: number;
  couponCode?: string | null;
}

export function CartPage() {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);

  const { data: cart, isLoading } = useQuery({
    queryKey: ["cart"],
    queryFn: async () => {
      const res = await api<{ data: CartData }>("/commerce/cart");
      if (res.error) throw new Error(res.error);
      return res.data!.data;
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (code?: string) => {
      const res = await api<{ data: CartData }>("/commerce/cart/preview", {
        method: "POST",
        body: { couponCode: code || appliedCoupon },
      });
      if (res.error) throw new Error(res.error);
      return res.data!.data;
    },
  });

  const display = previewMutation.data ?? cart;

  const removeItem = async (productId: string) => {
    const res = await api(`/commerce/cart/items/${productId}`, { method: "DELETE" });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      previewMutation.reset();
    }
  };

  const moveToWishlist = async (productId: string) => {
    const res = await api(`/commerce/cart/items/${productId}/wishlist`, { method: "POST" });
    if (res.error) toast({ title: "Error", description: res.error, variant: "destructive" });
    else {
      toast({ title: "Moved to wishlist" });
      queryClient.invalidateQueries({ queryKey: ["cart", "wishlist"] });
      previewMutation.reset();
    }
  };

  const applyCoupon = async () => {
    try {
      const data = await previewMutation.mutateAsync(couponCode);
      setAppliedCoupon(data.couponCode || couponCode);
      toast({ title: "Coupon applied" });
    } catch (e: any) {
      toast({ title: "Coupon invalid", description: e.message, variant: "destructive" });
    }
  };

  const checkout = async () => {
    setCheckingOut(true);
    try {
      await loadRazorpayScript();
      const keyRes = await api<{ keyId: string }>("/payments/razorpay/key");
      if (keyRes.error || !keyRes.data?.keyId) throw new Error(keyRes.error || "Payment unavailable");

      const orderRes = await api<{
        orderId: string;
        amount: number;
        currency: string;
        title: string;
      }>("/commerce/cart/checkout", {
        method: "POST",
        body: { couponCode: appliedCoupon || undefined },
      });
      if (orderRes.error) throw new Error(orderRes.error);

      const { orderId, amount, currency, title } = orderRes.data!;

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: keyRes.data!.keyId,
          amount,
          currency,
          name: "THE GATEHUB",
          description: title,
          order_id: orderId,
          handler: async (response: any) => {
            const verifyRes = await api("/commerce/cart/verify", {
              method: "POST",
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            });
            if (verifyRes.error) {
              toast({ title: "Verification failed", description: verifyRes.error, variant: "destructive" });
              reject(new Error(verifyRes.error));
              return;
            }
            toast({ title: "Payment successful!" });
            queryClient.invalidateQueries({ queryKey: ["cart", "my-payments"] });
            navigate("/student/purchases");
            resolve();
          },
          prefill: {
            name: user ? `${user.firstName} ${user.lastName}` : "",
            email: user?.email || "",
          },
          theme: { color: "#06b6d4" },
          modal: { ondismiss: () => reject(new Error("cancelled")) },
        });
        rzp.open();
      });
    } catch (e: any) {
      if (e.message !== "cancelled") {
        toast({ title: "Checkout failed", description: e.message, variant: "destructive" });
      }
    } finally {
      setCheckingOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const items = display?.items?.filter((i) => !i.owned) ?? [];

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <ShoppingCart className="w-8 h-8" /> Shopping Cart
        </h1>
        <p className="mt-1 text-muted-foreground">Review items before secure checkout</p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Your cart is empty.{" "}
            <Button variant="link" onClick={() => navigate("/student/browse")}>
              Browse courses
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex gap-4 p-4">
                  {item.product.thumbnail && (
                    <img
                      src={resolveCourseBannerUrl(item.product.thumbnail) || item.product.thumbnail}
                      alt=""
                      className="w-24 h-16 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.product.displayName}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {item.product.productType.replace(/_/g, " ")}
                    </p>
                    <p className="text-primary font-semibold mt-1">{formatINR(item.lineTotal)}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button variant="ghost" size="sm" onClick={() => moveToWishlist(item.productId)}>
                      <Heart className="w-4 h-4 mr-1" /> Save
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeItem(item.productId)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatINR(display?.subtotal ?? 0)}</span>
              </div>
              {(display?.discountAmount ?? 0) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-{formatINR(display!.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>GST ({display?.gstPercent ?? 0}%)</span>
                <span>{formatINR(display?.taxAmount ?? 0)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Platform fee (info)</span>
                <span>{formatINR(display?.platformFee ?? 0)}</span>
              </div>
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                />
                <Button variant="outline" onClick={applyCoupon} disabled={previewMutation.isPending}>
                  Apply
                </Button>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-3">
                <span>Total</span>
                <span className="text-primary">{formatINR(display?.grandTotal ?? 0)}</span>
              </div>
              <Button className="w-full" onClick={checkout} disabled={checkingOut}>
                {checkingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : "Proceed to Checkout"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    Razorpay: any;
  }
}
