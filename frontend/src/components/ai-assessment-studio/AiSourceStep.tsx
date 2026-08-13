import { motion } from "framer-motion";
import {
  Sparkles,
  FileText,
  FileType,
  Presentation,
  Globe,
  Youtube,
  FileCode,
  Image as ImageIcon,
  BookOpen,
  ClipboardList,
} from "lucide-react";
import { AI_SOURCES, SMART_PROMPTS, type AiSourceType } from "@/lib/aiAssessmentStudio";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Sparkles> = {
  sparkles: Sparkles,
  text: FileText,
  pdf: FileText,
  docx: FileType,
  pptx: Presentation,
  globe: Globe,
  youtube: Youtube,
  md: FileCode,
  gdocs: FileType,
  syllabus: ClipboardList,
  notes: BookOpen,
  image: ImageIcon,
};

interface AiSourceStepProps {
  selected: AiSourceType | null;
  onSelect: (id: AiSourceType) => void;
  onPrompt: (text: string) => void;
}

export function AiSourceStep({ selected, onSelect, onPrompt }: AiSourceStepProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">Choose your source</h2>
        <p className="mt-1 text-sm text-white/50">One primary source — AI handles the rest.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AI_SOURCES.map((src, i) => {
          const Icon = ICONS[src.icon] || Sparkles;
          return (
            <motion.button
              key={src.id}
              type="button"
              disabled={!src.enabled}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => src.enabled && onSelect(src.id)}
              className={cn(
                "group rounded-2xl border p-5 text-left transition-all",
                src.enabled
                  ? "border-white/10 bg-white/5 hover:border-primary/40 hover:bg-white/10 hover:shadow-lg hover:shadow-primary/10"
                  : "cursor-not-allowed border-white/5 opacity-40",
                selected === src.id && "border-primary/60 bg-primary/10 ring-1 ring-primary/30"
              )}
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary group-hover:bg-primary/25">
                <Icon className="h-5 w-5" />
              </div>
              <p className="font-semibold text-white">{src.label}</p>
              <p className="mt-1 text-xs text-white/50 line-clamp-2">{src.description}</p>
              {!src.enabled && <span className="mt-2 inline-block text-[10px] text-white/40">Coming soon</span>}
            </motion.button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/40">Smart prompts</p>
        <div className="flex flex-wrap gap-2">
          {SMART_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPrompt(p)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-white"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
