import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ExperienceRendererProps } from "./ExperienceRenderer";

export function AssignmentPanel({ step }: ExperienceRendererProps) {
  const instructions = String(step.payload.instructions ?? step.payload.prompt ?? "");
  const points = String(step.payload.points ?? "100");

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <FileText className="w-5 h-5" />
        {step.title}
      </h2>
      <p className="text-xs text-muted-foreground mb-4">{points} points</p>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{instructions}</p>
    </Card>
  );
}
