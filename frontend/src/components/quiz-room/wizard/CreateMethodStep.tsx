import {
  PenLine,
  Upload,
  Sparkles,
  Gamepad2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type QuizCreationMethod =
  | "manual"
  | "build_from_content"
  | "ai"
  | "duplicate"
  | "templates"
  | "question_bank"
  | "wayground";

const METHODS: Array<{
  id: QuizCreationMethod;
  label: string;
  description: string;
  icon: typeof PenLine;
  enabled: boolean;
  badge?: string;
  accent?: string;
}> = [
  {
    id: "manual",
    label: "Create Manually",
    description: "Open the visual quiz builder — all question types, rich media, drag-and-drop.",
    icon: PenLine,
    enabled: true,
  },
  {
    id: "build_from_content",
    label: "Build from Content",
    description: "Upload PDFs, DOCX, PPTX, images, or pull from Google Workspace — GateHub extracts every question automatically.",
    icon: Upload,
    enabled: true,
  },
  {
    id: "ai",
    label: "AI Quiz Designer",
    description: "Guided 16-step wizard — like an expert instructional designer beside you.",
    icon: Sparkles,
    enabled: true,
  },
  {
    id: "wayground",
    label: "Wayground",
    description: "Browse millions of community quizzes, flashcards & activities from Wayground (formerly Quizizz) — embed directly into your quiz.",
    icon: Gamepad2,
    enabled: true,
    badge: "NEW",
    accent: "wayground",
  },
];

interface CreateMethodStepProps {
  onSelect: (method: QuizCreationMethod) => void;
  busy?: boolean;
}

export function CreateMethodStep({ onSelect, busy }: CreateMethodStepProps) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          How would you like to create this quiz?
        </h1>
        <p className="mt-3 text-white/60">Pick one option — no dropdowns, just one click.</p>
      </div>

      <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
        {METHODS.map((method) => {
          const Icon = method.icon;
          const isWayground = method.id === "wayground";
          return (
            <button
              key={method.id}
              type="button"
              disabled={!method.enabled || busy}
              onClick={() => method.enabled && !busy && onSelect(method.id)}
              className={cn(
                "relative rounded-2xl border p-6 text-left transition-all",
                method.enabled
                  ? isWayground
                    ? "border-purple-500/30 bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-white/5 hover:border-purple-400/60 hover:bg-purple-500/15 hover:shadow-lg hover:shadow-purple-500/20"
                    : "border-white/10 bg-white/5 hover:border-primary/50 hover:bg-white/10 hover:shadow-lg hover:shadow-primary/10"
                  : "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-60"
              )}
            >
              {method.badge && (
                <Badge
                  className={cn(
                    "absolute right-3 top-3 text-[10px]",
                    isWayground
                      ? "bg-purple-600/80 text-white border-purple-500/40"
                      : "bg-white/10 text-white/70"
                  )}
                >
                  ⭐ {method.badge}
                </Badge>
              )}
              <div
                className={cn(
                  "mb-4 flex h-12 w-12 items-center justify-center rounded-xl",
                  isWayground
                    ? "bg-gradient-to-tr from-pink-500/30 to-purple-600/30 text-purple-300"
                    : "bg-primary/20 text-primary"
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <p className={cn("text-lg font-semibold", isWayground ? "text-white" : "text-white")}>
                {method.label}
              </p>
              <p className="mt-2 text-sm text-white/50">{method.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
