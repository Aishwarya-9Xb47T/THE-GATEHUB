import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ExperienceRendererProps } from "./ExperienceRenderer";

export function NextLessonCta({ step, universeId, onNavigateLesson }: ExperienceRendererProps) {
  const nextId = String(step.payload.nextLessonId ?? "");
  const nextTitle = String(step.payload.nextLessonTitle ?? "Next lesson");

  return (
    <Card className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-primary/5 border-primary/20">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Up next</p>
        <p className="text-lg font-semibold">{nextTitle}</p>
      </div>
      <Button
        type="button"
        className="gap-2"
        onClick={() => {
          if (nextId && onNavigateLesson) onNavigateLesson(nextId);
          else if (nextId) window.location.href = `/learning-universe/${universeId}/learn/${nextId}`;
        }}
      >
        Continue
        <ArrowRight className="w-4 h-4" />
      </Button>
    </Card>
  );
}
