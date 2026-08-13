import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  EmbeddedLessonMedia,
  readEmbeddedMediaFromBlockContent,
  type EmbeddedMediaItem,
} from "./EmbeddedLessonMedia";
import { DocumentRenderer } from "./DocumentRenderer";
import { videosOnly } from "@/lib/learning/lessonRichContent";
import { nodesFromContentBlock, type LessonDocument } from "@gatehub/lesson-body";

export interface LessonContainerProps {
  title?: string;
  content?: unknown;
  document?: LessonDocument;
  embeddedBefore?: EmbeddedMediaItem[];
  embeddedAfter?: EmbeddedMediaItem[];
  resolveImageUrl: (ref: string) => string;
  universeId?: string;
  assets?: { filename: string; storedFilename: string }[];
  className?: string;
  cardClassName?: string;
  titleClassName?: string;
  showTitle?: boolean;
  variant?: "studio" | "published";
}

/**
 * Universal lesson layout — one container for every lesson type.
 * LessonContainer → DocumentRenderer → responsive nodes.
 */
export function LessonContainer({
  title,
  content,
  document: documentProp,
  embeddedBefore = [],
  embeddedAfter = [],
  resolveImageUrl,
  universeId = "preview",
  assets,
  className,
  cardClassName,
  titleClassName,
  showTitle = true,
  variant = "studio",
}: LessonContainerProps) {
  const embedded =
    embeddedBefore.length || embeddedAfter.length
      ? { before: embeddedBefore, after: embeddedAfter }
      : readEmbeddedMediaFromBlockContent(
          typeof content === "object" && content ? (content as Record<string, unknown>) : undefined
        );

  const document = useMemo((): LessonDocument => {
    if (documentProp?.nodes?.length) {
      return { ...documentProp, title: title ?? documentProp.title };
    }
    if (variant === "published") {
      return { title, nodes: [] };
    }
    const block = {
      type: "document",
      content: typeof content === "object" && content ? JSON.stringify(content) : typeof content === "string" ? content : "{}",
    };
    const nodes = nodesFromContentBlock(block);
    return { title, nodes: nodes ?? [] };
  }, [content, documentProp, title, variant]);

  const videosBefore = videosOnly(embedded.before);
  const videosAfter = videosOnly(embedded.after);
  const proseClass =
    variant === "published"
      ? "prose-gatehub w-full max-w-none"
      : "prose-gatehub prose-sm w-full max-w-none";

  const displayTitle = showTitle ? document.title ?? title : undefined;

  return (
    <Card
      className={cn(
        "lesson-container w-full max-w-none rounded-3xl border border-border/60 bg-card/95 shadow-premium",
        variant === "published" ? "p-6 md:p-8 lg:p-10" : "p-4 md:p-6",
        cardClassName
      )}
    >
      <div className={cn("lesson-reading-layout w-full max-w-none", className)}>
        {displayTitle ? (
          <h2
            className={cn(
              variant === "published" ? "type-h3 mb-4 text-foreground" : "text-lg font-semibold mb-2",
              titleClassName
            )}
          >
            {displayTitle}
          </h2>
        ) : null}
        <EmbeddedLessonMedia
          items={videosBefore}
          universeId={universeId}
          resolveUrl={resolveImageUrl}
          className="space-y-3 mb-3"
        />
        <DocumentRenderer
          document={document}
          className={proseClass}
          resolveImageUrl={resolveImageUrl}
          universeId={universeId}
          assets={assets}
        />
        <EmbeddedLessonMedia
          items={videosAfter}
          universeId={universeId}
          resolveUrl={resolveImageUrl}
          className="space-y-3 mt-3"
        />
      </div>
    </Card>
  );
}
