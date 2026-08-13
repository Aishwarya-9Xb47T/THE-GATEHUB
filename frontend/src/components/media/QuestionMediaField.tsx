import { useState } from "react";
import { Image, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaRenderer } from "./MediaRenderer";
import { MediaUploader } from "./MediaUploader";
import {
  buildImageMarkdown,
  buildVideoMarkdown,
  buildAudioMarkdown,
  buildAttachmentMarkdown,
  mediaKindFromUrl,
} from "./mediaMarkdown";
import type { MediaInsertKind } from "./types";
import { cn } from "@/lib/utils";

interface QuestionMediaFieldProps {
  label?: string;
  mediaUrl: string;
  onMediaUrlChange: (url: string) => void;
  defaultKind?: MediaInsertKind;
}

/** Visual media attachment — no markdown editing. */
export function QuestionMediaField({
  mediaUrl,
  onMediaUrlChange,
  defaultKind = "image",
}: QuestionMediaFieldProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MediaInsertKind>(defaultKind);

  const previewContent = mediaUrl
    ? mediaKindFromUrl(mediaUrl) === "video"
      ? buildVideoMarkdown(mediaUrl)
      : mediaKindFromUrl(mediaUrl) === "audio"
        ? buildAudioMarkdown(mediaUrl)
        : mediaKindFromUrl(mediaUrl) === "image" || defaultKind === "image"
          ? buildImageMarkdown(mediaUrl)
          : buildAttachmentMarkdown(mediaUrl)
    : "";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border-2 border-dashed transition-colors",
        mediaUrl ? "border-border/50 bg-card" : "border-border/40 bg-muted/20 hover:border-primary/30"
      )}
    >
      {previewContent ? (
        <div className="relative">
          <div className="p-4">
            <MediaRenderer content={previewContent} />
          </div>
          <div className="absolute right-2 top-2 flex gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1 rounded-full shadow-sm"
              onClick={() => {
                setKind(defaultKind);
                setOpen(true);
              }}
            >
              <Upload className="h-3.5 w-3.5" />
              Replace
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full shadow-sm"
              onClick={() => onMediaUrlChange("")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setKind(defaultKind);
            setOpen(true);
          }}
          className="flex w-full flex-col items-center justify-center gap-2 px-6 py-10 text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Image className="h-6 w-6" />
          </div>
          <span className="text-sm font-medium">Click to add media</span>
          <span className="text-xs">Image, video, or audio</span>
        </button>
      )}

      <MediaUploader
        open={open}
        onOpenChange={setOpen}
        defaultKind={kind}
        onInsert={(md) => {
          const match = md.match(/\(([^)]+)\)/);
          if (match?.[1]) onMediaUrlChange(match[1]);
        }}
      />
    </div>
  );
}
