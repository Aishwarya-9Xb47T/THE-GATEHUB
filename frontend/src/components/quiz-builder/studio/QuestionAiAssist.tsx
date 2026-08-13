import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toastStore";
import type { QuizQuestion } from "@/lib/quizBuilder/types";
import { cn } from "@/lib/utils";

const AI_ACTIONS = [
  { id: "improve", label: "Improve" },
  { id: "simplify", label: "Simplify" },
  { id: "harder", label: "Make Harder" },
  { id: "hint", label: "Generate Hint" },
  { id: "explanation", label: "Generate Explanation" },
  { id: "similar", label: "Similar Question" },
  { id: "grammar", label: "Fix Grammar" },
  { id: "bloom", label: "Bloom Analysis" },
  { id: "distractors", label: "Optimize Distractors" },
] as const;

interface QuestionAiAssistProps {
  question: QuizQuestion;
  onApply: (patch: Partial<QuizQuestion>) => void;
  className?: string;
}

export function QuestionAiAssist({ question, onApply, className }: QuestionAiAssistProps) {
  const toast = useToastStore((s) => s.add);

  const runAction = async (actionId: string) => {
    // Client-side stubs until Phase 6 AI endpoints — never silently modify without user action
    switch (actionId) {
      case "hint":
        if (!question.hints.length) {
          onApply({ hints: ["Consider the key concept in the question stem."] });
          toast({ title: "Hint added", description: "Review and refine the generated hint.", variant: "success" });
        } else {
          toast({ title: "Hints already exist", variant: "default" });
        }
        break;
      case "explanation":
        if (!question.explanation?.trim()) {
          onApply({
            explanation: "_AI draft:_ Explain why the correct answer is right and why other options are incorrect.",
          });
          toast({ title: "Explanation draft added", description: "Edit before publishing.", variant: "success" });
        } else {
          toast({ title: "Explanation already set", variant: "default" });
        }
        break;
      case "bloom":
        toast({
          title: `Bloom: ${question.bloomLevel || "L2"}`,
          description: "Full AI Bloom analysis ships in Phase 6.",
        });
        break;
      default:
        toast({
          title: "AI assist",
          description: `"${actionId}" will connect to the AI pipeline in Phase 6. Your content was not changed.`,
        });
    }
  };

  return (
    <div className={cn("rounded-xl border border-primary/20 bg-primary/5 p-4", className)}>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">AI Assistant</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {AI_ACTIONS.map((a) => (
          <Button
            key={a.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-primary/20 bg-background/60 text-xs hover:bg-primary/10"
            onClick={() => runAction(a.id)}
          >
            <Sparkles className="mr-1 h-3 w-3 text-primary" />
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function QuestionAiAssistLoading() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      AI thinking…
    </div>
  );
}
