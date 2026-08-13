import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StudioFullscreenShellProps {
  eyebrow?: string;
  title: string;
  backTo: string;
  backLabel?: string;
  children: React.ReactNode;
  maxWidth?: "3xl" | "5xl" | "7xl";
  footer?: React.ReactNode;
}

const MAX_WIDTH: Record<NonNullable<StudioFullscreenShellProps["maxWidth"]>, string> = {
  "3xl": "max-w-3xl",
  "5xl": "max-w-5xl",
  "7xl": "max-w-7xl",
};

/** Fixed fullscreen shell — escapes dashboard padding/sidebar (same pattern as Quiz Room wizard). */
export function StudioFullscreenShell({
  eyebrow = "Quiz Room",
  title,
  backTo,
  backLabel = "Back",
  children,
  maxWidth = "7xl",
  footer,
}: StudioFullscreenShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <header className="relative z-10 shrink-0 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className={cn("mx-auto flex w-full items-center gap-4", MAX_WIDTH[maxWidth])}>
          <Button variant="ghost" size="icon" className="shrink-0 text-white/70 hover:bg-white/10 hover:text-white" asChild>
            <Link to={backTo} aria-label={backLabel}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-white/50">{eyebrow}</p>
            <p className="truncate text-sm font-semibold">{title}</p>
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-8">
        <div className={cn("mx-auto w-full", MAX_WIDTH[maxWidth])}>{children}</div>
      </main>

      {footer && (
        <footer className="relative z-10 shrink-0 border-t border-white/10 bg-white/5 px-4 py-4 backdrop-blur-xl sm:px-8">
          <div className={cn("mx-auto w-full", MAX_WIDTH[maxWidth])}>{footer}</div>
        </footer>
      )}
    </div>
  );
}
