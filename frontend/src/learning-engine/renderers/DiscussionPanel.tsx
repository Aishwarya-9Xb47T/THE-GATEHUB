import { MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ExperienceRendererProps } from "./ExperienceRenderer";

export function DiscussionPanel({ step }: ExperienceRendererProps) {
  const prompt = String(step.payload.prompt ?? step.payload.topic ?? "Share your thoughts with fellow learners.");

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" />
        {step.title}
      </h2>
      <p className="text-muted-foreground mb-4">{prompt}</p>
      <p className="text-xs text-muted-foreground italic">Discussion participation will be available in a future release.</p>
    </Card>
  );
}
