import { Sparkles } from "lucide-react";

export function DevelopmentNoticeBanner() {
  return (
    <aside
      aria-label="Platform Announcement"
      className="relative z-40 w-full border-b border-border/60 bg-gradient-to-r from-primary/[0.05] via-card/90 to-primary/[0.05] backdrop-blur-md transition-colors"
    >
      <div className="app-workspace app-workspace--bar app-workspace--lg py-2.5 sm:py-3">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3.5 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] sm:text-xs font-semibold text-primary shrink-0 tracking-wide uppercase shadow-sm">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
            <span>Notice</span>
          </div>

          <p className="text-xs sm:text-sm text-muted-foreground leading-normal">
            <span className="font-semibold text-foreground">
              We're currently building something great!
            </span>{" "}
            The GateHub platform is under development. We'll notify you as soon as it's ready. Stay tuned!
          </p>
        </div>
      </div>
    </aside>
  );
}
