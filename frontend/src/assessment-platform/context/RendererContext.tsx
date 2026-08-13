import { createContext, useContext } from "react";
import type { RendererContext } from "../types/renderer";

const RendererContextReact = createContext<RendererContext | null>(null);

export function RendererContextProvider({
  value,
  children,
}: {
  value: RendererContext;
  children: React.ReactNode;
}) {
  return (
    <RendererContextReact.Provider value={value}>{children}</RendererContextReact.Provider>
  );
}

export function useRendererContext(): RendererContext {
  const ctx = useContext(RendererContextReact);
  if (!ctx) throw new Error("useRendererContext must be used within RendererContextProvider");
  return ctx;
}
