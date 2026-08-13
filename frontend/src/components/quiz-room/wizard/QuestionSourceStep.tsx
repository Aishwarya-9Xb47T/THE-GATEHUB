import {
  Sparkles,
  Library,
  Shuffle,
  Code2,
  ClipboardList,
  FolderKanban,
  MessageSquare,
  Microscope,
  Layers,
  FileQuestion,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { QuestionSourceOption, QuizRoomSourceType } from "./wizardTypes";

const SOURCES: QuestionSourceOption[] = [
  {
    id: "existing_quiz",
    label: "Existing Quiz",
    description: "Use the quiz from your selected lecture.",
    enabled: true,
  },
  {
    id: "ai_generated",
    label: "AI Generated",
    description: "Questions created by AI Course Architect.",
    enabled: true,
    badge: "AI",
  },
  {
    id: "question_bank",
    label: "Question Bank",
    description: "Pick from your centralized question library.",
    enabled: true,
  },
  {
    id: "mixed",
    label: "Mixed",
    description: "Combine multiple sources in one room.",
    enabled: true,
  },
  {
    id: "random",
    label: "Random",
    description: "Random subset from the selected quiz.",
    enabled: false,
    badge: "Soon",
  },
  {
    id: "coding_challenge",
    label: "Coding Challenge",
    description: "Live programming contest with sandbox.",
    enabled: false,
    badge: "Phase 8",
  },
  {
    id: "assignment",
    label: "Assignment",
    description: "Pull from course assignments.",
    enabled: false,
    badge: "Soon",
  },
  {
    id: "project",
    label: "Project",
    description: "Project-based assessment room.",
    enabled: false,
    badge: "Soon",
  },
  {
    id: "research",
    label: "Research Discussion",
    description: "Research paper discussion format.",
    enabled: false,
    badge: "Soon",
  },
];

const ICONS: Record<string, typeof FileQuestion> = {
  existing_quiz: FileQuestion,
  ai_generated: Sparkles,
  question_bank: Library,
  mixed: Layers,
  random: Shuffle,
  coding_challenge: Code2,
  assignment: ClipboardList,
  project: FolderKanban,
  research: Microscope,
};

interface QuestionSourceStepProps {
  value: QuizRoomSourceType;
  onChange: (v: QuizRoomSourceType) => void;
}

export function QuestionSourceStep({ value, onChange }: QuestionSourceStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Question source</h2>
        <p className="mt-1 text-white/60">How should this room get its questions?</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SOURCES.map((source) => {
          const Icon = ICONS[source.id] || FileQuestion;
          const selected = value === source.id;

          return (
            <button
              key={source.id}
              type="button"
              disabled={!source.enabled}
              onClick={() => source.enabled && onChange(source.id as QuizRoomSourceType)}
              className={cn(
                "relative rounded-2xl border p-5 text-left transition-all",
                !source.enabled && "cursor-not-allowed opacity-50",
                selected
                  ? "border-primary bg-primary/15 ring-2 ring-primary/30"
                  : source.enabled
                    ? "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                    : "border-white/5 bg-white/[0.02]"
              )}
            >
              {source.badge && (
                <Badge
                  className={cn(
                    "absolute right-3 top-3 text-[10px]",
                    source.badge === "AI" ? "bg-primary/30 text-primary" : "bg-white/10 text-white/60"
                  )}
                >
                  {source.badge}
                </Badge>
              )}
              <Icon className={cn("mb-3 h-8 w-8", selected ? "text-primary" : "text-white/50")} />
              <p className="font-semibold text-white">{source.label}</p>
              <p className="mt-1 text-xs text-white/50">{source.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
