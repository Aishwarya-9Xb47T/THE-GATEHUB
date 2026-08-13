import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { loadRazorpayScript } from "@/lib/paymentUtils";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export type PurchaseTarget =
  | { productType: "course"; courseId: string; title: string }
  | { productType: "learning_universe"; learningUniverseId: string; title: string };

interface UseRazorpayCheckoutOptions {
  user?: { firstName: string; lastName: string; email: string } | null;
  couponCode?: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

export function useRazorpayCheckout({ user, couponCode, onSuccess, onError }: UseRazorpayCheckoutOptions) {
  const [isProcessing, setIsProcessing] = useState(false);

  const checkout = useCallback(
    async (target: PurchaseTarget) => {
      setIsProcessing(true);
      try {
        await loadRazorpayScript();

        const keyRes = await api<{ keyId: string }>("/payments/razorpay/key");
        if (keyRes.error || !keyRes.data?.keyId) {
          throw new Error(keyRes.error || "Could not fetch payment key");
        }

        const body =
          target.productType === "course"
            ? { courseId: target.courseId, couponCode }
            : { learningUniverseId: target.learningUniverseId, couponCode };

        const orderRes = await api<{
          orderId: string;
          amount: number;
          currency: string;
          alreadyPaid?: boolean;
        }>("/payments/razorpay/create-order", { method: "POST", body });

        if (orderRes.error) throw new Error(orderRes.error);
        if (orderRes.data?.alreadyPaid) {
          onSuccess?.();
          return;
        }

        const { orderId, amount, currency } = orderRes.data!;

        await new Promise<void>((resolve, reject) => {
          const options = {
            key: keyRes.data!.keyId,
            amount,
            currency,
            name: "THE GATEHUB",
            description: target.title,
            order_id: orderId,
            handler: async (response: any) => {
              try {
                const verifyBody = {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  ...(target.productType === "course"
                    ? { courseId: target.courseId }
                    : { learningUniverseId: target.learningUniverseId }),
                };
                const verifyRes = await api("/payments/razorpay/verify", {
                  method: "POST",
                  body: verifyBody,
                });
                if (verifyRes.error) throw new Error(verifyRes.error);
                onSuccess?.();
                resolve();
              } catch (err: any) {
                onError?.(err.message || "Verification failed");
                reject(err);
              }
            },
            prefill: {
              name: user ? `${user.firstName} ${user.lastName}` : "",
              email: user?.email || "",
            },
            theme: { color: "#06b6d4" },
            modal: {
              ondismiss: () => {
                setIsProcessing(false);
                reject(new Error("Payment cancelled"));
              },
            },
          };

          const rzp = new window.Razorpay(options);
          rzp.open();
        });
      } catch (err: any) {
        if (err.message !== "Payment cancelled") {
          onError?.(err.message || "Payment failed");
        }
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [user, couponCode, onSuccess, onError]
  );

  return { checkout, isProcessing };
}
