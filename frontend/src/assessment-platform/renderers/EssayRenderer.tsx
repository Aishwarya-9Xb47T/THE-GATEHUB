import { memo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { MediaRenderer } from "@/components/media";
import type { QuestionRendererProps } from "../types/renderer";

export const EssayRendererComponent = memo(function EssayRendererComponent({
  question,
  value,
  onChange,
  disabled,
  ariaLabel,
}: QuestionRendererProps) {
  return (
    <div className="space-y-3">
      <MediaRenderer content={question.stem} className="text-base font-medium leading-relaxed" />
      <Textarea
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel ?? question.stem}
        rows={8}
        className="resize-y min-h-[8rem]"
        style={{ fontSize: "calc(0.875rem * var(--player-font-scale, 1))" }}
      />
    </div>
  );
});
