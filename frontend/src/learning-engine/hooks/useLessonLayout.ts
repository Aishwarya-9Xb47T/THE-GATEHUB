import { useCallback, useEffect, useState } from "react";

const SIDEBAR_OPEN_KEY = "lu-student-outline-open";
const MOBILE_MAX = 767;
const TABLET_MAX = 1023;

function readStoredSidebarOpen(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function getBreakpoint(width: number) {
  if (width <= MOBILE_MAX) return "mobile" as const;
  if (width <= TABLET_MAX) return "tablet" as const;
  return "desktop" as const;
}

export function useLessonLayout() {
  const [breakpoint, setBreakpoint] = useState<"mobile" | "tablet" | "desktop">(() =>
    typeof window !== "undefined" ? getBreakpoint(window.innerWidth) : "desktop"
  );
  const [sidebarOpen, setSidebarOpenState] = useState(readStoredSidebarOpen);

  const isMobile = breakpoint === "mobile";
  const isTablet = breakpoint === "tablet";

  useEffect(() => {
    const onResize = () => {
      const next = getBreakpoint(window.innerWidth);
      setBreakpoint(next);
      if (next === "mobile") setSidebarOpenState(false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setSidebarOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setSidebarOpenState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      try {
        localStorage.setItem(SIDEBAR_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((v) => !v);
  }, [setSidebarOpen]);

  /** Desktop: open by default; tablet: respect stored preference; mobile: drawer only */
  const showInlineSidebar = sidebarOpen && !isMobile;

  return {
    isMobile,
    isTablet,
    sidebarOpen,
    showInlineSidebar,
    setSidebarOpen,
    toggleSidebar,
  };
}
