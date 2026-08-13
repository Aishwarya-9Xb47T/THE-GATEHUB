import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type AppWorkspaceSize = "default" | "lg" | "xl";

interface AppWorkspaceProps {
  children: ReactNode;
  className?: string;
  /** Add vertical section padding */
  section?: boolean;
  size?: AppWorkspaceSize;
  as?: "div" | "main" | "section" | "article";
}

const sizeClass: Record<AppWorkspaceSize, string> = {
  default: "app-workspace",
  lg: "app-workspace app-workspace--lg",
  xl: "app-workspace app-workspace--xl",
};

/** Fluid page workspace — full viewport width with responsive gutters only. */
export function AppWorkspace({
  children,
  className,
  section,
  size = "default",
  as: Tag = "div",
}: AppWorkspaceProps) {
  return (
    <Tag
      className={cn(
        sizeClass[size],
        section && "app-workspace--section",
        "w-full min-w-0 max-w-none",
        className
      )}
    >
      {children}
    </Tag>
  );
}

interface AppFluidGridProps {
  children: ReactNode;
  className?: string;
  density?: "sm" | "md" | "lg" | "default";
}

/** Responsive card/grid that auto-fits columns to available width. */
export function AppFluidGrid({ children, className, density = "default" }: AppFluidGridProps) {
  const densityClass =
    density === "sm"
      ? "app-fluid-grid--sm"
      : density === "md"
        ? "app-fluid-grid--md"
        : density === "lg"
          ? "app-fluid-grid--lg"
          : "app-fluid-grid";

  return <div className={cn(densityClass, className)}>{children}</div>;
}
