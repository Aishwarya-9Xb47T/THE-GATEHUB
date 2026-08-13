import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StudentLearnLayoutProps {
  sidebar: ReactNode;
  sidebarOpen: boolean;
  isMobile: boolean;
  mobileDrawer: ReactNode;
  children: ReactNode;
}

/**
 * Application shell: [ Course Outline | Lesson Workspace ]
 * Uses global app-shell-grid — sidebar and workspace never overlap.
 */
export function StudentLearnLayout({
  sidebar,
  sidebarOpen,
  isMobile,
  mobileDrawer,
  children,
}: StudentLearnLayoutProps) {
  const showInlineSidebar = sidebarOpen && !isMobile;

  return (
    <>
      <a
        href="#lesson-step-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to lesson content
      </a>
      {isMobile ? mobileDrawer : null}
      <div
        className={cn(
          "app-shell-grid flex-1 min-h-0 w-full",
          showInlineSidebar && "app-shell-grid--sidebar"
        )}
      >
        {showInlineSidebar ? (
          <aside
            data-floating-obstacle="learn-sidebar"
            className="app-shell-grid__sidebar"
            aria-label="Course outline"
            id="course-outline-panel"
          >
            {sidebar}
          </aside>
        ) : null}
        <div className="app-shell-grid__workspace">{children}</div>
      </div>
    </>
  );
}

interface LessonWorkspacePaneProps {
  children: ReactNode;
  scrollRef?: React.RefObject<HTMLElement | null> | undefined;
  workspaceMode?: boolean;
  ariaLabel?: string;
}

export function LessonWorkspacePane({
  children,
  scrollRef,
  workspaceMode,
  ariaLabel = "Lesson content",
}: LessonWorkspacePaneProps) {
  return (
    <main
      ref={scrollRef as React.RefObject<HTMLElement>}
      data-floating-workspace="learn-main"
      className={cn("app-shell-grid__scroll", workspaceMode && "overflow-hidden")}
      aria-label={ariaLabel}
    >
      {children}
    </main>
  );
}

export function LessonWorkspaceContent({
  children,
  workspaceMode,
  className,
}: {
  children: ReactNode;
  workspaceMode?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "app-workspace w-full min-w-0 max-w-none box-border",
        workspaceMode ? "h-full flex flex-col p-4 !px-4" : "app-workspace--section",
        className
      )}
    >
      {children}
    </div>
  );
}
