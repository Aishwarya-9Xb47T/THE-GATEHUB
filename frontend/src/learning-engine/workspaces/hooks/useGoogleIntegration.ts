import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface GoogleIntegrationStatus {
  connected: boolean;
  configured: boolean;
  email?: string;
}

export function useGoogleIntegration() {
  const [status, setStatus] = useState<GoogleIntegrationStatus>({ connected: false, configured: false });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await api<GoogleIntegrationStatus & { success: boolean }>("/integrations/google/status");
    if (!res.error && res.data) {
      setStatus({
        connected: Boolean(res.data.connected),
        configured: Boolean(res.data.configured),
        email: res.data.email,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      void refresh();
      params.delete("google");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, [refresh]);

  const connect = useCallback(async (returnTo?: string) => {
    setConnecting(true);
    try {
      const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
      const res = await api<{ success: boolean; url: string }>(`/integrations/google/connect${qs}`);
      if (res.error || !res.data?.url) throw new Error(res.error || "Could not start Google sign-in");

      const popup = window.open(res.data.url, "gatehub-google-oauth", "width=520,height=720");
      if (!popup) {
        throw new Error("Popup blocked. Allow popups for THE GATEHUB to sign in with Google.");
      }

      await new Promise<void>((resolve) => {
        const timer = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(timer);
            resolve();
          }
        }, 400);
      });
      await refresh();
    } finally {
      setConnecting(false);
    }
  }, [refresh]);

  const disconnect = useCallback(async () => {
    await api("/integrations/google/disconnect", { method: "POST" });
    await refresh();
  }, [refresh]);

  return { status, loading, connecting, connect, disconnect, refresh };
}
