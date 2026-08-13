import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function PlayerTimer({
  remainingSeconds,
  onExpire,
  strict = false,
}: {
  remainingSeconds: number;
  onExpire?: () => void;
  strict?: boolean;
}) {
  const [remaining, setRemaining] = useState(remainingSeconds);

  useEffect(() => {
    setRemaining(remainingSeconds);
  }, [remainingSeconds]);

  useEffect(() => {
    if (remaining <= 0) {
      onExpire?.();
      return;
    }
    const id = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(id);
  }, [remaining, onExpire]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const urgent = remaining <= 10;

  return (
    <div
      className={cn(
        "tabular-nums text-sm font-semibold px-3 py-1 rounded-lg border",
        urgent && "border-destructive text-destructive animate-pulse",
        strict && urgent && "bg-destructive/10"
      )}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Time remaining: ${mins} minutes ${secs} seconds`}
    >
      {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
    </div>
  );
}
