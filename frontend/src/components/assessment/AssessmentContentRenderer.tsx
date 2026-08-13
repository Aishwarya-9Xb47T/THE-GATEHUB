import type { ReactNode } from "react";
import { MediaRenderer } from "@/components/media/MediaRenderer";
import {
  buildMetadataMediaMarkdown,
  buildQuestionDisplayMarkdown,
  extractPassageOrContextText,
} from "@/components/media/questionDisplay";
import { cn } from "@/lib/utils";

export type AssessmentContentVariant = "stem" | "option" | "explanation" | "feedback" | "context" | "plain";

export interface AssessmentContentRendererProps {
  /** Question stem or rich text field. */
  content?: string | null;
  /** Question metadata (context, mediaUrl, etc.). */
  metadata?: Record<string, unknown> | null;
  variant?: AssessmentContentVariant;
  className?: string;
  emptyFallback?: ReactNode;
}

/**
 * Canonical assessment content renderer.
 * All student-facing and instructor preview surfaces must use this component.
 */
export function AssessmentContentRenderer({
  content,
  metadata,
  variant = "plain",
  className,
  emptyFallback = null,
}: AssessmentContentRendererProps) {
  let markdown = content?.trim() || "";

  if (variant === "stem") {
    markdown = buildQuestionDisplayMarkdown(content || "", metadata);
  } else if (variant === "context") {
    markdown = extractPassageOrContextText(metadata?.passage || metadata?.context);
  } else if (variant === "plain") {
    markdown = content?.trim() || "";
  }

  if (!markdown && variant === "stem") {
    const mediaOnly = buildMetadataMediaMarkdown(metadata);
    if (mediaOnly) markdown = mediaOnly;
  }

  return (
    <MediaRenderer
      content={markdown}
      className={cn(
        variant === "option" && "text-sm",
        variant === "explanation" && "text-sm text-muted-foreground",
        variant === "feedback" && "text-sm",
        className
      )}
      emptyFallback={emptyFallback}
    />
  );
}

/** Render a full question stem (context + text + stimulus media). */
export function AssessmentQuestionStem({
  text,
  metadata,
  className,
}: {
  text: string;
  metadata?: Record<string, unknown> | null;
  className?: string;
}) {
  return <AssessmentContentRenderer content={text} metadata={metadata} variant="stem" className={className} />;
}
