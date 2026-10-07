import { createContext, useContext, type ReactNode } from "react";

interface DashboardSidebarContextValue {
  closeSidebar: (options?: { persist?: boolean }) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setIsSidebarOpen: (value: boolean | ((prev: boolean) => boolean), options?: { persist?: boolean }) => void;
}

const DashboardSidebarContext = createContext<DashboardSidebarContextValue | null>(null);

export function DashboardSidebarProvider({
  children,
  closeSidebar,
  isSidebarOpen,
  toggleSidebar,
  setIsSidebarOpen,
}: {
  children: ReactNode;
  closeSidebar: (options?: { persist?: boolean }) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setIsSidebarOpen: (value: boolean | ((prev: boolean) => boolean), options?: { persist?: boolean }) => void;
}) {
  return (
    <DashboardSidebarContext.Provider
      value={{ closeSidebar, isSidebarOpen, toggleSidebar, setIsSidebarOpen }}
    >
      {children}
    </DashboardSidebarContext.Provider>
  );
}

export function useDashboardSidebarContext() {
  return useContext(DashboardSidebarContext);
}
