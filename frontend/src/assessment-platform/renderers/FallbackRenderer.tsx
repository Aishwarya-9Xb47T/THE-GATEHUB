import { memo } from "react";
import { cn } from "@/lib/utils";
import type { QuestionRendererProps } from "../types/renderer";

export const FallbackRendererComponent = memo(function FallbackRendererComponent({
  question,
}: QuestionRendererProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed p-6 text-center text-muted-foreground"
      )}
      role="alert"
    >
      <p className="font-medium">Renderer not available</p>
      <p className="text-sm mt-1">
        No renderer registered for type: <code>{question.typeSlug}</code>
      </p>
    </div>
  );
});
