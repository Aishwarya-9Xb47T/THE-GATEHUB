import { Paperclip } from "lucide-react";
import { resolveMediaUrl, MEDIA_LABELS } from "./mediaMarkdown";

interface MediaAttachmentProps {
  href: string;
  className?: string;
}

/** Renders a file attachment without exposing internal filenames. */
export function MediaAttachment({ href, className }: MediaAttachmentProps) {
  const resolved = resolveMediaUrl(href) || href;
  return (
    <a
      href={resolved}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/40 ${className ?? ""}`}
    >
      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {MEDIA_LABELS.attachment}
    </a>
  );
}
