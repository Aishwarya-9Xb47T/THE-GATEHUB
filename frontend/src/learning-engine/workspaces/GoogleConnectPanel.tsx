import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGoogleIntegration } from "./hooks/useGoogleIntegration";

interface GoogleConnectPanelProps {
  title?: string;
  description?: string;
  requireGoogle?: boolean;
  returnTo?: string;
  children: React.ReactNode;
}

export function GoogleConnectPanel({
  title = "Connect Google",
  description = "Sign in with Google to sync notebooks and research papers to your Drive. You only need to do this once.",
  requireGoogle = false,
  returnTo,
  children,
}: GoogleConnectPanelProps) {
  const { status, loading, connecting, connect } = useGoogleIntegration();

  if (!requireGoogle || status.connected) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[320px] text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Checking Google connection…
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center space-y-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">
          Google OAuth is not configured on this server. You can still use the workspace — Drive sync will be
          unavailable until an administrator sets <code>GOOGLE_CLIENT_ID</code> and{" "}
          <code>GOOGLE_CLIENT_SECRET</code>.
        </p>
        {children}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-10 text-center space-y-5">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-2xl font-bold text-primary">
        G
      </div>
      <div>
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-2">{description}</p>
      </div>
      <Button type="button" size="lg" disabled={connecting} onClick={() => void connect(returnTo)}>
        {connecting ? "Opening Google…" : "Continue with Google"}
      </Button>
      <p className="text-xs text-muted-foreground">THE GATEHUB · Secure OAuth · Drive file scope only</p>
    </div>
  );
}
