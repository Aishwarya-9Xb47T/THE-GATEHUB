import type { LuNodeKind, LuNodeStatus } from "./types";

export const NODE_ICONS: Record<LuNodeKind, string> = {
  universe: "🌐",
  track: "🎓",
  module: "📚",
  lesson: "📖",
  overview: "📋",
  objectives: "🎯",
  topics: "💡",
  examples: "🔍",
  practice: "⌨️",
  "coding-lab": "🧪",
  notebook: "📓",
  resources: "📎",
  quiz: "❓",
  project: "🛠️",
  "research-paper": "📄",
  assignment: "📝",
  discussion: "💬",
  checkpoint: "✅",
  reflection: "🪞",
  references: "📚",
  question: "◻️",
  "resource-item": "🔗",
  assessment: "✅",
  video: "🎥",
};

export const STATUS_DOT: Record<LuNodeStatus, string> = {
  complete: "🟢",
  draft: "🟡",
  error: "🔴",
  empty: "⚪",
};

export const STATUS_CLASS: Record<LuNodeStatus, string> = {
  complete: "text-emerald-400",
  draft: "text-amber-400",
  error: "text-red-400",
  empty: "text-slate-500",
};
