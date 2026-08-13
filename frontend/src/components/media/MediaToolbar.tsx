import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Image,
  Quote,
  Table,
  Sigma,
  Heading2,
  Highlighter,
  Video,
  Music,
  Paperclip,
  FileCode2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MediaInsertKind } from "./types";

export type FormatAction = {
  icon: typeof Bold;
  title: string;
  prefix: string;
  suffix: string;
  block?: boolean;
};

export type MediaToolbarAction = {
  icon: typeof Image;
  title: string;
  kind: MediaInsertKind | "code" | "math" | "table" | "link";
  disabled?: boolean;
};

export const TEXT_FORMAT_ACTIONS: FormatAction[] = [
  { icon: Bold, title: "Bold", prefix: "**", suffix: "**" },
  { icon: Italic, title: "Italic", prefix: "_", suffix: "_" },
  { icon: Underline, title: "Underline", prefix: "<u>", suffix: "</u>" },
  { icon: Heading2, title: "Heading", prefix: "## ", suffix: "", block: true },
  { icon: Highlighter, title: "Highlight", prefix: "==", suffix: "==" },
  { icon: List, title: "Bullet list", prefix: "- ", suffix: "", block: true },
  { icon: ListOrdered, title: "Numbered list", prefix: "1. ", suffix: "", block: true },
  { icon: Quote, title: "Quote", prefix: "> ", suffix: "", block: true },
];

export const MEDIA_TOOLBAR_ACTIONS: MediaToolbarAction[] = [
  { icon: Image, title: "Image", kind: "image" },
  { icon: Video, title: "Video", kind: "video" },
  { icon: Music, title: "Audio", kind: "audio" },
  { icon: Paperclip, title: "File", kind: "attachment" },
  { icon: Link2, title: "Link", kind: "link" },
  { icon: Sigma, title: "Formula", kind: "math" },
  { icon: FileCode2, title: "Code", kind: "code" },
  { icon: Table, title: "Table", kind: "table" },
];

interface MediaToolbarProps {
  onFormat: (action: FormatAction) => void;
  onMedia: (action: MediaToolbarAction) => void;
  className?: string;
  showTextFormats?: boolean;
  disabledActions?: Set<string>;
  /** Image + formula only — for compact option answer fields */
  minimalMediaOnly?: boolean;
}

export function MediaToolbar({
  onFormat,
  onMedia,
  className,
  showTextFormats = true,
  disabledActions,
  minimalMediaOnly = false,
}: MediaToolbarProps) {
  const mediaActions = minimalMediaOnly
    ? MEDIA_TOOLBAR_ACTIONS.filter((a) => a.kind === "image" || a.kind === "math")
    : MEDIA_TOOLBAR_ACTIONS;
  return (
    <div
      className={cn("flex flex-wrap items-center gap-1 px-2 py-1.5", className)}
      role="toolbar"
      aria-label="Formatting toolbar"
    >
      {showTextFormats && (
        <div className="flex items-center gap-0.5 rounded-full border border-border/40 bg-background/80 p-0.5 shadow-sm" role="group" aria-label="Text formatting">
          {TEXT_FORMAT_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.title}
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full hover:bg-primary/10 hover:text-primary"
                title={action.title}
                aria-label={action.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onFormat(action)}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-0.5 rounded-full border border-border/40 bg-background/80 p-0.5 shadow-sm" role="group" aria-label="Insert media">
        {mediaActions.map((action) => {
          const Icon = action.icon;
          const isDisabled = action.disabled || disabledActions?.has(action.kind);
          return (
            <Button
              key={action.title}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-full px-2.5 text-xs hover:bg-primary/10 hover:text-primary"
              title={action.title}
              aria-label={action.title}
              disabled={isDisabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => !isDisabled && onMedia(action)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{action.title}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
