import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import {
  askDocsAssistant,
  streamDocsAssistant,
  type ChatHistoryMessage,
} from "@/lib/api";
import { useUserStore } from "@/store/userStore";
import {
  GateHubAssistantContext,
  type AssistantMessage,
  type AssistantStatus,
  type GateHubAssistantContextValue,
} from "./gateHubAssistantContext";
import { resolvePageContext, resolveQuickActions } from "./resolvePageContext";
import {
  getLearningLessonContext,
  learningContextHints,
  subscribeLearningLessonContext,
  type LearningLessonContext,
} from "./learningLessonContext";

const OPEN_EVENT = "gatehub-assistant-open";
const STORAGE_KEY = "gatehub-assistant-messages-v1";

function loadStoredMessages(): AssistantMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AssistantMessage[];
    return Array.isArray(parsed) ? parsed.filter((m) => m.role && typeof m.content === "string").slice(-50) : [];
  } catch {
    return [];
  }
}

export function openGateHubAssistant(prefill?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { prefill } }));
}

export const openDocsAssistant = openGateHubAssistant;

export function GateHubAssistantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useUserStore();
  const abortRef = useRef<AbortController | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => loadStoredMessages());
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [learningCtx, setLearningCtx] = useState<LearningLessonContext | null>(() => getLearningLessonContext());

  useEffect(() => subscribeLearningLessonContext(setLearningCtx), []);

  const pageContext = useMemo(() => {
    const base = resolvePageContext(location.pathname);
    if (!learningCtx) return base;
    return {
      ...base,
      label: `${learningCtx.lessonTitle}${learningCtx.stepTitle ? ` · ${learningCtx.stepTitle}` : ""}`,
      area: "learning-lesson",
      hints: learningContextHints(learningCtx),
      learning: {
        universeId: learningCtx.universeId,
        universeTitle: learningCtx.universeTitle,
        lessonId: learningCtx.lessonId,
        lessonTitle: learningCtx.lessonTitle,
        stepId: learningCtx.stepId,
        stepTitle: learningCtx.stepTitle,
        stepKind: learningCtx.stepKind,
        progressPercent: learningCtx.progressPercent,
      },
    };
  }, [location.pathname, learningCtx]);

  const quickActions = useMemo(() => {
    if (learningCtx) return learningContextHints(learningCtx).slice(0, 4);
    return resolveQuickActions(location.pathname, user?.role);
  }, [location.pathname, user?.role, learningCtx]);

  const apiContext = useMemo(
    () => ({
      pathname: pageContext.pathname,
      label: pageContext.label,
      area: pageContext.area,
      role: user?.role,
      hints: pageContext.hints,
      learning: pageContext.learning,
    }),
    [pageContext, user?.role]
  );

  const open = useCallback((prefill?: string) => {
    setIsOpen(true);
    if (prefill) setInput(prefill);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setMessages((m) => {
      const copy = [...m];
      const last = copy[copy.length - 1];
      if (last?.role === "assistant") {
        copy[copy.length - 1] = { ...last, streaming: false };
      }
      return copy;
    });
  }, []);

  const clearChat = useCallback(() => {
    stopGenerating();
    setMessages([]);
    setInput("");
    localStorage.removeItem(STORAGE_KEY);
  }, [stopGenerating]);

  useEffect(() => {
    if (messages.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const toStore = messages.filter((m) => !m.streaming && m.content.trim());
    if (toStore.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore.slice(-50)));
    }
  }, [messages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const prefill = (e as CustomEvent<{ prefill?: string }>).detail?.prefill;
      open(prefill);
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, [open]);

  const toHistory = useCallback((msgs: AssistantMessage[]): ChatHistoryMessage[] => {
    return msgs
      .filter((m) => !m.streaming && m.content.trim())
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
  }, []);

  const runStream = useCallback(
    async (question: string, historyBefore: ChatHistoryMessage[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      let streamed = "";
      let completed = false;

      const patchAssistant = (patch: Partial<AssistantMessage>) => {
        setMessages((m) => {
          const copy = [...m];
          const idx = copy.length - 1;
          if (copy[idx]?.role === "assistant") {
            copy[idx] = { ...copy[idx], ...patch };
          }
          return copy;
        });
      };

      try {
        await streamDocsAssistant(
          question,
          apiContext,
          {
            onEvent: (event) => {
              if (event.type === "thinking") setStatus("thinking");
              else if (event.type === "start") setStatus("streaming");
              else if (event.type === "token") {
                streamed += event.content;
                patchAssistant({ content: streamed, streaming: true });
              } else if (event.type === "done") {
                completed = true;
                streamed = event.answer || streamed;
                patchAssistant({
                  content: streamed,
                  sources: event.sources || [],
                  relatedTopics: event.relatedTopics,
                  followUpSuggestions: event.followUpSuggestions,
                  streaming: false,
                });
                setStatus("idle");
              }
            },
            onError: async () => {
              const fallback = await askDocsAssistant(question, apiContext, historyBefore);
              patchAssistant({
                content: fallback.data?.answer || "I'm currently unavailable. Please try again later.",
                sources: fallback.data?.sources || [],
                relatedTopics: fallback.data?.relatedTopics,
                followUpSuggestions: fallback.data?.followUpSuggestions,
                streaming: false,
              });
              setStatus("idle");
              completed = true;
            },
          },
          historyBefore,
          controller.signal
        );
      } catch {
        if (!controller.signal.aborted) setStatus("idle");
        return;
      }

      if (!completed && !controller.signal.aborted) {
        const fallback = await askDocsAssistant(question, apiContext, historyBefore);
        patchAssistant({
          content: fallback.data?.answer || "I'm currently unavailable. Please try again later.",
          sources: fallback.data?.sources || [],
          relatedTopics: fallback.data?.relatedTopics,
          followUpSuggestions: fallback.data?.followUpSuggestions,
          streaming: false,
        });
        setStatus("idle");
      }
    },
    [apiContext]
  );

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || status !== "idle") return;
      const question = text.trim();
      setInput("");
      setStatus("thinking");
      setIsOpen(true);

      const historyBefore = toHistory(messages);

      setMessages((m) => [
        ...m,
        { role: "user", content: question },
        { role: "assistant", content: "", sources: [], streaming: true },
      ]);

      await runStream(question, historyBefore);
    },
    [status, messages, toHistory, runStream]
  );

  const regenerateLast = useCallback(() => {
    if (status !== "idle") return;
    const lastUserIdx = [...messages].map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0).pop();
    if (lastUserIdx === undefined) return;
    const question = messages[lastUserIdx].content;
    const trimmed = messages.slice(0, lastUserIdx);
    setMessages([...trimmed, { role: "user", content: question }, { role: "assistant", content: "", sources: [], streaming: true }]);
    setStatus("thinking");
    void runStream(question, toHistory(trimmed));
  }, [status, messages, toHistory, runStream]);

  const value = useMemo<GateHubAssistantContextValue>(
    () => ({
      isOpen,
      messages,
      status,
      input,
      pageContext,
      quickActions,
      setInput,
      open,
      close,
      toggle,
      send,
      stopGenerating,
      clearChat,
      regenerateLast,
    }),
    [
      isOpen,
      messages,
      status,
      input,
      pageContext,
      quickActions,
      open,
      close,
      toggle,
      send,
      stopGenerating,
      clearChat,
      regenerateLast,
    ]
  );

  return (
    <GateHubAssistantContext.Provider value={value}>
      {children}
    </GateHubAssistantContext.Provider>
  );
}
