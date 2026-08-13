import { createContext, useContext, type ReactNode } from "react";

interface DashboardSidebarContextValue {
  closeSidebar: () => void;
  isSidebarOpen: boolean;
}

const DashboardSidebarContext = createContext<DashboardSidebarContextValue | null>(null);

export function DashboardSidebarProvider({
  children,
  closeSidebar,
  isSidebarOpen,
}: {
  children: ReactNode;
  closeSidebar: () => void;
  isSidebarOpen: boolean;
}) {
  return (
    <DashboardSidebarContext.Provider value={{ closeSidebar, isSidebarOpen }}>
      {children}
    </DashboardSidebarContext.Provider>
  );
}

export function useDashboardSidebarContext() {
  return useContext(DashboardSidebarContext);
}
