import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FooterAssistantAction } from "./FooterAssistantAction";

export interface AppAssistantFooterProps {
  children?: ReactNode;
  className?: string;
  innerClassName?: string;
  compact?: boolean;
  /** Sticky footer bar on small viewports (learn player, workspaces) */
  sticky?: boolean;
  /** `bar` = horizontal toolbar; `corner` = bottom-right utility (site/help doc footers) */
  layout?: "bar" | "corner";
}

/**
 * Single reusable application footer bar with AI Assistant on the right.
 * Static layout only — scrolls with page content.
 */
export function AppAssistantFooter({
  children,
  className,
  innerClassName,
  compact,
  sticky,
  layout = "bar",
}: AppAssistantFooterProps) {
  if (layout === "corner") {
    return (
      <footer
        className={cn("app-assistant-footer app-assistant-footer--corner", className)}
        aria-label="Footer utility actions"
      >
        <div className={cn("app-assistant-footer__corner", innerClassName)}>
          <FooterAssistantAction compact={compact} />
        </div>
      </footer>
    );
  }

  return (
    <footer
      className={cn(
        "app-assistant-footer",
        sticky && "app-assistant-footer--sticky",
        className
      )}
    >
      <div className={cn("app-assistant-footer__inner", !children && "justify-end", innerClassName)}>
        {children ? <div className="app-assistant-footer__start">{children}</div> : null}
        <FooterAssistantAction compact={compact} />
      </div>
    </footer>
  );
}
