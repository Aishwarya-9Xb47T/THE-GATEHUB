import {
  Image,
  Video,
  Music,
  Paperclip,
  Link2,
  Sigma,
  FileCode2,
  Table,
  X,
  Pencil,
  Replace,
  Copy,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "./mediaMarkdown";
import { MathSegmentView } from "./mathSegments";
import { CodeBlockRenderer } from "./CodeBlockRenderer";
import { TableRenderer } from "./TableRenderer";
import type { ContentBlock } from "./contentBlocks";
import { extractYouTubeId } from "@/lib/videoSourceUtils";
import { MediaInteractionGuard } from "@/components/video/MediaInteractionGuard";

const ICONS = {
  image: Image,
  video: Video,
  audio: Music,
  attachment: Paperclip,
  link: Link2,
  formula: Sigma,
  code: FileCode2,
  table: Table,
} as const;

const WIDE_BLOCK_LABELS: Partial<Record<ContentBlock["type"], string>> = {
  code: "Code block",
  table: "Table",
  formula: "Formula",
};

function isWideBlock(block: ContentBlock): boolean {
  return block.type === "code" || block.type === "table" || block.type === "formula";
}

interface VisualBlockCardProps {
  block: ContentBlock;
  compact?: boolean;
  onEdit?: () => void;
  onReplace?: () => void;
  onDuplicate?: () => void;
  onRemove: () => void;
}

export function VisualBlockCard({ block, compact, onEdit, onReplace, onDuplicate, onRemove }: VisualBlockCardProps) {
  if (block.type === "text") return null;

  const Icon = ICONS[block.type] ?? Paperclip;
  const url = "url" in block ? resolveMediaUrl(block.url) : null;
  const wide = isWideBlock(block);

  const actionBar = (
    <div className="flex shrink-0 items-center gap-1">
      {onEdit && (
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      )}
      {onDuplicate && (
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </Button>
      )}
      {onReplace && (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onReplace} title="Replace">
          <Replace className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </div>
  );

  const blockBody = (
    <>
      {block.type === "image" && url && (
        <img src={url} alt="" className="max-h-40 rounded-lg object-contain" />
      )}
      {block.type === "video" && url && (() => {
        const ytId = extractYouTubeId(url);
        if (ytId) {
          return (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <MediaInteractionGuard mode="embed" className="h-full w-full" label="YouTube video">
                <iframe
                  src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`}
                  className="h-full w-full border-0"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  title="YouTube video"
                />
              </MediaInteractionGuard>
            </div>
          );
        }
        return (
          <video
            src={url}
            controls
            controlsList="nodownload"
            className="max-h-40 w-full rounded-lg"
            onContextMenu={(e) => e.preventDefault()}
          />
        );
      })()}
      {block.type === "audio" && url && (
        <audio src={url} controls className="w-full" />
      )}
      {(block.type === "attachment" || block.type === "link") && (
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{block.type === "link" ? block.label : "Attachment"}</p>
          <p className="truncate text-xs text-muted-foreground">{block.url}</p>
        </div>
      )}
      {block.type === "formula" && (
        <div className="py-1">
          <MathSegmentView
            segment={{
              kind: block.display === "block" ? "block" : "inline",
              value: block.latex,
            }}
          />
        </div>
      )}
      {block.type === "code" && (
        <CodeBlockRenderer
          content={block.content}
          language={block.language}
          readOnly
          showLineNumbers
          collapsible={false}
          className="w-full"
        />
      )}
      {block.type === "table" && (
        <TableRenderer
          data={{ headers: block.headers, rows: block.rows }}
          className="w-full"
          showScrollHint
        />
      )}
    </>
  );

  if (wide) {
    return (
      <div
        className={cn(
          "w-full max-w-full rounded-xl border border-border/60 bg-card shadow-sm",
          compact ? "p-2" : "p-0"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <span className="truncate">{WIDE_BLOCK_LABELS[block.type]}</span>
          </div>
          <div className="shrink-0">{actionBar}</div>
        </div>
        <div className={cn("w-full max-w-full", compact ? "p-2" : "p-3")}>{blockBody}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 to-muted/10 transition-all hover:border-primary/30 hover:shadow-md",
        compact ? "p-2" : "p-3"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">{blockBody}</div>

        <div className="flex shrink-0 gap-0.5">
          {onEdit && (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDuplicate && (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} title="Duplicate">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          {onReplace && (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onReplace} title="Replace">
              <Replace className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onRemove}
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
