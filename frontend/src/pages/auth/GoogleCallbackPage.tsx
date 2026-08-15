import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUserStore, getHomeRoute } from "@/store/userStore";
import { useToastStore } from "@/store/toastStore";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

/**
 * Google OAuth callback.
 * Backend redirects with a short-lived one-time `code` (not a JWT in the URL).
 * Legacy `?token=` is still accepted briefly for compatibility.
 */
export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setToken, setUser, fetchUser } = useUserStore();
  const toast = useToastStore((s) => s.add);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const code = searchParams.get("code");
    const legacyToken = searchParams.get("token");
    const error = searchParams.get("error");
    const returnTo = sessionStorage.getItem("oauth_return_to");
    sessionStorage.removeItem("oauth_return_to");

    const fail = (description: string) => {
      toast({ title: "Sign-in failed", description, variant: "destructive" });
      navigate("/login", { replace: true });
    };

    if (error) {
      const messages: Record<string, string> = {
        auth_failed: "Google authentication failed. Please try again.",
        google_auth_failed: "Could not sign in with Google. Please try again.",
        not_configured: "Google Sign-In is not configured on this server.",
        registrations_disabled: "New registrations are currently disabled by the administrator.",
        user_suspended: "This GateHub account is suspended. Contact support if you believe this is a mistake.",
        user_deleted:
          "This email belongs to a removed GateHub account. Sign in with email and password, or contact support to restore access.",
        invalid_google_profile: "Google did not return a complete profile. Please try again.",
        session_failed: "Could not create a sign-in session. Please try again.",
        google_account_mismatch:
          "This email is already linked to a different Google account. Sign in with email and password.",
      };
      fail(messages[error] || "Google sign-in could not be completed. Please try again.");
      return;
    }

    const finish = async (token: string) => {
      setToken(token);
      await fetchUser();
      const { user } = useUserStore.getState();
      if (!user) {
        fail("Could not load your profile. Please try again.");
        return;
      }
      toast({
        title: `Welcome${user.firstName ? `, ${user.firstName}` : ""}!`,
        description: "Signed in with Google successfully.",
        variant: "success",
      });
      const destination = returnTo && returnTo !== "/login" ? returnTo : getHomeRoute(user.role);
      navigate(destination, { replace: true });
    };

    (async () => {
      if (code) {
        const res = await api<{ token: string; user: any }>("/auth/google/exchange", {
          method: "POST",
          body: { code },
        });
        if (res.error || !res.data?.token) {
          fail(res.error || "Invalid or expired sign-in code.");
          return;
        }
        if (res.data.user) setUser(res.data.user);
        await finish(res.data.token);
        return;
      }

      if (legacyToken) {
        await finish(legacyToken);
        return;
      }

      fail("No authentication code received from Google.");
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div className="text-center">
          <p className="text-lg font-semibold">Signing you in with Google</p>
          <p className="text-sm text-muted-foreground mt-1">Setting up your account…</p>
        </div>
      </div>
    </div>
  );
}
