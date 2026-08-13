import { cn } from "@/lib/utils";
import { MediaRenderer } from "./MediaRenderer";

interface MediaPreviewProps {
  content: string;
  label?: string;
  className?: string;
}

/** Live preview panel — renders media only, no internal metadata. */
export function MediaPreview({ content, label = "Live preview", className }: MediaPreviewProps) {
  if (!content.trim()) return null;

  return (
    <div className={cn("rounded-xl border border-border/40 bg-muted/20 p-4", className)}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <MediaRenderer content={content} />
    </div>
  );
}
