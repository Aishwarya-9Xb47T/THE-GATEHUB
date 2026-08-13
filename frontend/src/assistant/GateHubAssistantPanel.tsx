import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Copy,
  Check,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { marked } from "marked";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandAvatar } from "@/components/common/Logo";
import { cn } from "@/lib/utils";
import { useGateHubAssistant } from "./gateHubAssistantContext";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

marked.setOptions({ gfm: true, breaks: true });

function AssistantMarkdown({ content, onNavigate }: { content: string; onNavigate?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const html = sanitizeHtml(marked.parse(content) as string);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href^='/']") as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      navigate(a.getAttribute("href") || "/");
      onNavigate?.();
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [html, navigate, onNavigate]);

  return (
    <div
      ref={ref}
      className={cn(
        "assistant-markdown prose prose-sm dark:prose-invert max-w-none",
        "prose-p:my-1.5 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
        "prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-code:text-foreground prose-pre:bg-muted/80"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function GateHubAssistantLauncher({
  compact,
  variant = "default",
}: {
  compact?: boolean;
  variant?: "default" | "landing";
}) {
  const { open } = useGateHubAssistant();

  if (compact || variant === "landing") {
    return (
      <button
        type="button"
        onClick={() => open()}
        className={cn(
          "gatehub-assistant-fab",
          variant === "landing" && "gatehub-assistant-fab--landing"
        )}
        aria-label="Open THE GATEHUB Assistant"
      >
        <BrandAvatar size={variant === "landing" ? 48 : 44} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => open()}
      className="gatehub-assistant-launcher flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:opacity-95 transition-all whitespace-nowrap"
      aria-label="Open THE GATEHUB Assistant"
    >
      <BrandAvatar size={32} />
      <span className="text-sm font-medium hidden sm:inline">Ask Assistant</span>
    </button>
  );
}

function MessageActions({
  content,
  onRegenerate,
  showRegenerate,
}: {
  content: string;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <button type="button" onClick={copy} className="assistant-msg-action" aria-label="Copy">
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </button>
      {showRegenerate && onRegenerate && (
        <button type="button" onClick={onRegenerate} className="assistant-msg-action" aria-label="Regenerate">
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function GateHubAssistantPanel() {
  const {
    close,
    messages,
    status,
    input,
    setInput,
    send,
    pageContext,
    quickActions,
    stopGenerating,
    clearChat,
    regenerateLast,
  } = useGateHubAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isBusy = status !== "idle";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  return (
    <div
      className="gatehub-assistant-panel flex flex-col h-full min-h-0 rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
      role="dialog"
      aria-label="THE GATEHUB Assistant"
      aria-modal="true"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-muted/30">
        <div className="flex items-center gap-3 min-w-0">
          <BrandAvatar size={36} />
          <div className="min-w-0">
            <span className="font-semibold text-sm block">THE GATEHUB Assistant</span>
            <span className="text-[11px] text-muted-foreground truncate block">{pageContext.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearChat} aria-label="Clear chat">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={close} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 assistant-chat-scroll">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {pageContext.learning ? (
                <>
                  I can help with your current lesson{" "}
                  <strong className="text-foreground font-medium">{pageContext.learning.lessonTitle}</strong>
                  {pageContext.learning.stepTitle ? (
                    <>
                      {" "}
                      · step <strong className="text-foreground font-medium">{pageContext.learning.stepTitle}</strong>
                    </>
                  ) : null}
                  . Ask for explanations, study tips, or checkpoint prep.
                </>
              ) : (
                <>
                  I know you&apos;re on <strong className="text-foreground font-medium">{pageContext.label}</strong>.
                  Ask anything about THE GATEHUB — courses, Learning Universes, Colab, Overleaf, certificates, publishing, and more.
                </>
              )}
            </p>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Suggested for this page
              </p>
              <div className="flex flex-wrap gap-2">
                {quickActions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    disabled={isBusy}
                    className="text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted/60 hover:border-primary/40 transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
          return (
            <div
              key={i}
              className={cn(
                "group rounded-xl p-4 text-sm",
                msg.role === "user"
                  ? "bg-primary/10 ml-6 border border-primary/10"
                  : "bg-muted/50 mr-1 border border-border/50"
              )}
            >
              {msg.role === "assistant" && msg.streaming && !msg.content && status === "thinking" && (
                <p className="text-muted-foreground flex items-center gap-2">
                  <span className="assistant-thinking-dots" aria-hidden />
                  <Sparkles className="w-4 h-4 animate-pulse text-primary" />
                  Searching documentation…
                </p>
              )}
              {msg.content &&
                (msg.role === "assistant" ? (
                  <AssistantMarkdown content={msg.content} onNavigate={close} />
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ))}
              {msg.streaming && msg.content && (
                <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5 align-middle rounded-sm" />
              )}

              {msg.role === "assistant" && msg.content && !msg.streaming && (
                <MessageActions
                  content={msg.content}
                  showRegenerate={isLastAssistant}
                  onRegenerate={regenerateLast}
                />
              )}

              {msg.sources && msg.sources.length > 0 && !msg.streaming && (
                <div className="mt-4 pt-3 border-t border-border/60 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sources</p>
                  <div className="flex flex-wrap gap-2">
                    {msg.sources.map((s, j) => (
                      <Link
                        key={j}
                        to={s.href}
                        className="text-xs px-2.5 py-1.5 rounded-md bg-background border border-border hover:border-primary/50 hover:text-primary transition-colors"
                        onClick={close}
                      >
                        {s.manual} › {s.section}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {msg.followUpSuggestions && msg.followUpSuggestions.length > 0 && !msg.streaming && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {msg.followUpSuggestions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      disabled={isBusy}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-primary/30 text-primary hover:bg-primary/5"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-border flex gap-2 shrink-0 bg-muted/20">
        <Input
          placeholder="Ask anything about THE GATEHUB…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
          disabled={isBusy}
          className="h-10"
        />
        {isBusy ? (
          <Button size="icon" className="h-10 w-10 shrink-0" onClick={stopGenerating} aria-label="Stop generating">
            <Square className="w-4 h-4 fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => send(input)}
            disabled={!input.trim()}
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
