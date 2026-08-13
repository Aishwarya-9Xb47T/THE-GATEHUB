import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gatehub-dashboard-sidebar-open";
const DESKTOP_MIN = 1024;

function readStored(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStored(open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function useDashboardSidebar() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= DESKTOP_MIN
  );
  const [isSidebarOpen, setIsSidebarOpenState] = useState(() => {
    const stored = readStored();
    if (stored !== null) return stored;
    return typeof window !== "undefined" && window.innerWidth >= DESKTOP_MIN;
  });

  useEffect(() => {
    const onResize = () => {
      const desktop = window.innerWidth >= DESKTOP_MIN;
      setIsDesktop(desktop);
      if (!desktop) setIsSidebarOpenState(false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setIsSidebarOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean), options?: { persist?: boolean }) => {
      setIsSidebarOpenState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        if (options?.persist !== false) writeStored(next);
        return next;
      });
    },
    []
  );

  const closeSidebar = useCallback(
    (options?: { persist?: boolean }) => setIsSidebarOpen(false, options),
    [setIsSidebarOpen]
  );

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((v) => !v);
  }, [setIsSidebarOpen]);

  const closeSidebarOnNavigate = useCallback(() => {
    if (!isDesktop) setIsSidebarOpen(false);
  }, [isDesktop, setIsSidebarOpen]);

  return {
    isDesktop,
    isSidebarOpen,
    setIsSidebarOpen,
    closeSidebar,
    toggleSidebar,
    closeSidebarOnNavigate,
  };
}
