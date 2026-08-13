import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, ShieldCheck, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserStore } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout";
import { formatINR } from "@/lib/paymentUtils";
import { AuthModal } from "@/components/auth/AuthModal";

interface CheckoutPreview {
  productType: string;
  productId: string;
  title: string;
  thumbnail?: string | null;
  instructorName?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  couponCode?: string | null;
  gstPercent: number;
  alreadyPaid: boolean;
}

export function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("courseId") || undefined;
  const learningUniverseId = searchParams.get("learningUniverseId") || undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, token } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>();
  const [showAuth, setShowAuth] = useState(false);

  const productRef = courseId
    ? { courseId, learningUniverseId: undefined as string | undefined }
    : { courseId: undefined as string | undefined, learningUniverseId };

  const { data: preview, isLoading, refetch } = useQuery({
    queryKey: ["checkout-preview", courseId, learningUniverseId, appliedCoupon],
    queryFn: async () => {
      const res = await api<{ data: CheckoutPreview }>("/payments/checkout/preview", {
        method: "POST",
        body: { ...productRef, couponCode: appliedCoupon },
      });
      if (res.error) throw new Error(res.error);
      return res.data!.data;
    },
    enabled: !!token && (!!courseId || !!learningUniverseId),
  });

  const { checkout, isProcessing } = useRazorpayCheckout({
    user,
    couponCode: appliedCoupon,
    onSuccess: () => {
      toast({ title: "Payment successful!", description: "You are now enrolled.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["my-payments"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      queryClient.invalidateQueries({ queryKey: ["enrollment-check"] });
      if (courseId) {
        navigate(`/course/${courseId}/learn`);
      } else if (learningUniverseId) {
        navigate(`/learning-universe/${learningUniverseId}/learn`);
      }
    },
    onError: (msg) => toast({ title: "Payment failed", description: msg, variant: "destructive" }),
  });

  useEffect(() => {
    if (!courseId && !learningUniverseId) {
      navigate("/courses", { replace: true });
    }
  }, [courseId, learningUniverseId, navigate]);

  useEffect(() => {
    if (!token) setShowAuth(true);
  }, [token]);

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setAppliedCoupon(code);
    await refetch();
    toast({ title: "Coupon applied", variant: "success" });
  };

  const handlePay = async () => {
    if (!preview || preview.alreadyPaid) return;
    const target =
      preview.productType === "course"
        ? { productType: "course" as const, courseId: preview.productId, title: preview.title }
        : {
            productType: "learning_universe" as const,
            learningUniverseId: preview.productId,
            title: preview.title,
          };
    await checkout(target);
  };

  const backHref = courseId ? `/course/${courseId}` : `/learning-universe/${learningUniverseId}/course`;

  if (!courseId && !learningUniverseId) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="border-b border-border">
        <div className="max-w-3xl mx-auto flex items-center gap-4 px-6 py-6">
          <Button variant="ghost" size="sm" asChild>
            <Link to={backHref}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Checkout</h1>
            <p className="text-sm text-muted-foreground">Secure payment via Razorpay</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {!token ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground mb-4">Sign in to complete your purchase</p>
              <Button onClick={() => setShowAuth(true)}>Sign In</Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : preview ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{preview.title}</CardTitle>
                {preview.instructorName && (
                  <p className="text-sm text-muted-foreground">By {preview.instructorName}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatINR(preview.subtotal)}</span>
                </div>
                {preview.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount{preview.couponCode ? ` (${preview.couponCode})` : ""}</span>
                    <span>-{formatINR(preview.discountAmount)}</span>
                  </div>
                )}
                {preview.taxAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Tax ({preview.gstPercent}%)</span>
                    <span>{formatINR(preview.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total</span>
                  <span>{formatINR(preview.totalAmount)}</span>
                </div>
              </CardContent>
            </Card>

            {!preview.alreadyPaid && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Coupon code
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                  />
                  <Button variant="outline" onClick={applyCoupon}>
                    Apply
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-green-600" />
              Payments are verified on our servers. Enrollment unlocks only after confirmation.
            </div>

            {preview.alreadyPaid ? (
              <Button className="w-full" size="lg" asChild>
                <Link to={courseId ? `/course/${courseId}/learn` : `/learning-universe/${learningUniverseId}/learn`}>
                  Continue Learning
                </Link>
              </Button>
            ) : (
              <Button className="w-full" size="lg" onClick={handlePay} disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing…
                  </>
                ) : (
                  `Pay ${formatINR(preview.totalAmount)}`
                )}
              </Button>
            )}
          </>
        ) : null}
      </div>

      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} message="Sign in to complete your purchase" />
    </div>
  );
}
