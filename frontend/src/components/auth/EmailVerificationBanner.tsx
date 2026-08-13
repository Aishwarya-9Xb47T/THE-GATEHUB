import { useState } from "react";
import { useUserStore } from "@/store/userStore";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";

/** Shown when the signed-in user still needs email verification. */
export function EmailVerificationBanner() {
  const user = useUserStore((s) => s.user);
  const toast = useToastStore((s) => s.add);
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  if (!user || user.emailVerified !== false) return null;

  const onCooldown = Date.now() < cooldownUntil;

  const resend = async () => {
    if (onCooldown || sending) return;
    setSending(true);
    const res = await api("/auth/resend-verification", {
      method: "POST",
      body: { email: user.email },
    });
    setSending(false);
    setCooldownUntil(Date.now() + 60_000);
    toast({
      title: res.error ? "Could not resend" : "Check your inbox",
      description: res.error || "If verification is still needed, a new link has been sent.",
      variant: res.error ? "destructive" : "success",
    });
  };

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>
          Please verify your email (<span className="font-medium">{user.email}</span>) to unlock full account access.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={sending || onCooldown}
          onClick={resend}
          className="border-amber-600/40"
        >
          {onCooldown ? "Resend available soon" : sending ? "Sending…" : "Resend verification"}
        </Button>
      </div>
    </div>
  );
}
