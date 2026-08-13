import { motion } from "framer-motion";
import { Sparkles, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Make all questions harder",
  "Add more coding questions",
  "Generate explanations for all",
  "Remove duplicate topics",
  "Convert to case studies",
];

interface AiCopilotSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function AiCopilotSidebar({ open, onClose }: AiCopilotSidebarProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: "I'm your AI copilot. After generation, ask me to refine difficulty, types, or tone. Full copilot actions ship in the next update — for now, edit cards directly or regenerate.",
    },
  ]);

  if (!open) return null;

  const send = (text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [
      ...m,
      { role: "user", text },
      {
        role: "assistant",
        text: "Copilot refine is coming soon. Use the question card actions to edit, or go back and regenerate with updated config.",
      },
    ]);
    setInput("");
  };

  return (
    <motion.aside
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      className="fixed right-0 top-0 z-[60] flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Copilot
        </h3>
        <Button variant="ghost" size="sm" className="text-white/60" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl px-3 py-2 text-sm",
              m.role === "user" ? "ml-8 bg-primary/20 text-white" : "mr-4 bg-white/5 text-white/80"
            )}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/50 hover:border-primary/40"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask AI to refine…"
            className="border-white/10 bg-white/5 text-white"
          />
          <Button size="icon" onClick={() => send(input)}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.aside>
  );
}
