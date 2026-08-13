import {
  Sparkles,
  Wand2,
  Lightbulb,
  BookOpen,
  Languages,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Copy,
  ListPlus,
} from "lucide-react";
import type { QuizQuestion } from "@/lib/quizBuilder/types";
import { QuestionAiAssist } from "./QuestionAiAssist";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AI_STUDIO_ACTIONS = [
  { id: "generate", label: "Generate Question", icon: Wand2 },
  { id: "generate10", label: "Generate 10 Questions", icon: ListPlus },
  { id: "similar", label: "Generate Similar", icon: Copy },
  { id: "improve", label: "Improve", icon: Sparkles },
  { id: "simplify", label: "Simplify", icon: TrendingDown },
  { id: "harder", label: "Make Harder", icon: TrendingUp },
  { id: "hint", label: "Generate Hint", icon: Lightbulb },
  { id: "explanation", label: "Generate Explanation", icon: BookOpen },
  { id: "distractors", label: "Optimize Distractors", icon: BarChart3 },
  { id: "translate", label: "Translate", icon: Languages },
  { id: "bloom", label: "Bloom Analysis", icon: BarChart3 },
  { id: "difficulty", label: "Difficulty Analysis", icon: TrendingUp },
];

interface AiStudioPanelProps {
  question: QuizQuestion | null;
  onApply: (patch: Partial<QuizQuestion>) => void;
  onClose?: () => void;
  className?: string;
}

export function AiStudioPanel({ question, onApply, onClose, className }: AiStudioPanelProps) {
  if (!question) {
    return (
      <div className={cn("flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground", className)}>
        Select a question to use AI Studio
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="border-b border-border/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Studio
          </h2>
          {onClose && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">Suggestions only — you approve every change</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid gap-2">
          {AI_STUDIO_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Button key={a.id} variant="outline" className="h-9 justify-start text-xs" onClick={() => {/* delegated to assist */}}>
                <Icon className="mr-2 h-3.5 w-3.5 text-primary" />
                {a.label}
              </Button>
            );
          })}
        </div>
        <QuestionAiAssist question={question} onApply={onApply} />
      </div>
    </div>
  );
}
