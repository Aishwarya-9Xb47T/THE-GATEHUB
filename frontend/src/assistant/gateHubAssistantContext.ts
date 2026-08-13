import { createContext, useContext } from "react";
import type { DocsAssistantSource } from "@/lib/api";
import type { PageContext } from "./resolvePageContext";

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  sources?: DocsAssistantSource[];
  relatedTopics?: string[];
  followUpSuggestions?: string[];
  streaming?: boolean;
}

export type AssistantStatus = "idle" | "thinking" | "streaming";

export interface GateHubAssistantContextValue {
  isOpen: boolean;
  messages: AssistantMessage[];
  status: AssistantStatus;
  input: string;
  pageContext: PageContext;
  quickActions: string[];
  setInput: (value: string) => void;
  open: (prefill?: string) => void;
  close: () => void;
  toggle: () => void;
  send: (text: string) => void;
  stopGenerating: () => void;
  clearChat: () => void;
  regenerateLast: () => void;
}

export const GateHubAssistantContext = createContext<GateHubAssistantContextValue | null>(null);

export function useGateHubAssistant(): GateHubAssistantContextValue {
  const ctx = useContext(GateHubAssistantContext);
  if (!ctx) {
    throw new Error("useGateHubAssistant must be used within GateHubAssistantProvider");
  }
  return ctx;
}

export function useGateHubAssistantOptional(): GateHubAssistantContextValue | null {
  return useContext(GateHubAssistantContext);
}
