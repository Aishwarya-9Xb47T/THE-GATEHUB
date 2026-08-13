import { Wifi, WifiOff, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionPhase } from "@/lib/liveSession/playerStateMachine";

interface LiveConnectionBannerProps {
  phase: ConnectionPhase;
  wasRestored?: boolean;
  className?: string;
}

export function LiveConnectionBanner({ phase, wasRestored, className }: LiveConnectionBannerProps) {
  if (phase === "connected" && wasRestored) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-800 dark:text-emerald-200",
          className
        )}
        role="status"
      >
        <Wifi className="h-4 w-4 shrink-0" />
        You're back online — progress saved.
      </div>
    );
  }

  if (phase === "reconnecting") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-100",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
        Reconnecting… your answers are safe.
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive",
          className
        )}
        role="alert"
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        Connection lost. Refresh the page to rejoin.
      </div>
    );
  }

  return null;
}
