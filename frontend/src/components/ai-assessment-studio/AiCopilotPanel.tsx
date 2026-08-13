import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, Mic, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAiAssessmentStore } from "@/lib/aiAssessmentStudio/store";
import { useAiCopilot } from "@/lib/aiAssessmentStudio/useAiCopilot";
import { getContextualSuggestions } from "@/lib/aiAssessmentStudio/assessmentAnalyzer";

export function AiCopilotPanel() {
  const [input, setInput] = useState("");
  const preview = useAiAssessmentStore((s) => s.preview);
  const messages = useAiAssessmentStore((s) => s.copilotMessages);
  const stream = useAiAssessmentStore((s) => s.copilotStream);
  const { sendCommand, isBusy } = useAiCopilot();

  const suggestions = getContextualSuggestions(preview);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || isBusy || !preview) return;
    setInput("");
    sendCommand(t);
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex h-full min-h-[480px] w-full flex-col rounded-2xl border border-white/10 bg-slate-950/80 shadow-2xl shadow-primary/5 backdrop-blur-xl lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]"
    >
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-2">
          <motion.div
            animate={stream.active ? { rotate: [0, 8, -8, 0] } : {}}
            transition={{ repeat: stream.active ? Infinity : 0, duration: 1.2 }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20"
          >
            <Sparkles className="h-4 w-4 text-primary" />
          </motion.div>
          <div>
            <h3 className="text-sm font-bold text-white">AI Copilot</h3>
            <p className="text-[11px] text-white/50">Ask AI to improve your assessment.</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {stream.active && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-primary/20 bg-primary/10 px-4 py-2"
          >
            <p className="flex items-center gap-2 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {stream.stage || "AI is thinking…"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-xl px-3 py-2 text-sm leading-relaxed",
              m.role === "user" ? "ml-6 bg-primary/20 text-white" : "mr-2 bg-white/5 text-white/85"
            )}
          >
            {m.text || (m.streaming ? "…" : "")}
            {m.streaming && <span className="ml-1 inline-block animate-pulse text-primary">▋</span>}
          </motion.div>
        ))}
      </div>

      <div className="border-t border-white/10 p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/35">Suggestions</p>
        <div className="mb-3 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={isBusy}
              onClick={() => submit(s)}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/55 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-white disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit(input)}
              placeholder="Make question 4 harder…"
              disabled={isBusy || !preview}
              className="border-white/10 bg-white/5 pr-9 text-white"
            />
            <button
              type="button"
              title="Voice input (coming soon)"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25"
              disabled
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
          <Button size="icon" onClick={() => submit(input)} disabled={isBusy || !input.trim() || !preview}>
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </motion.aside>
  );
}
