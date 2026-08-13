import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import {
  isInternalMetadataLabel,
  isRenderableMediaUrl,
  mediaKindFromUrl,
  resolveMediaUrl,
  sanitizeDisplayLabel,
  MEDIA_LABELS,
} from "./mediaMarkdown";
import { MediaAttachment } from "./MediaAttachment";
import { CodeBlockRenderer, parseMarkdownCodeChildren } from "./CodeBlockRenderer";
import { TableRenderer } from "./TableRenderer";
import { parseGfmTable } from "./tableMarkdown";

function MediaImage({ src, className }: { src: string; className?: string }) {
  const resolved = resolveMediaUrl(src);
  if (!resolved || !isRenderableMediaUrl(src)) return null;

  const kind = mediaKindFromUrl(resolved);

  if (kind === "video") {
    if (/youtube\.com|youtu\.be/i.test(resolved)) {
      return (
        <a
          href={resolved}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm font-medium text-primary hover:bg-muted/50", className)}
        >
          ▶ {MEDIA_LABELS.video}
        </a>
      );
    }
    return (
      <video
        controls
        src={resolved}
        className={cn("max-h-[min(420px,60vh)] w-full max-w-full rounded-lg bg-black/5", className)}
        preload="metadata"
      />
    );
  }

  if (kind === "audio") {
    return <audio controls src={resolved} className={cn("w-full max-w-md", className)} preload="metadata" />;
  }

  return (
    <img
      src={resolved}
      alt=""
      role="presentation"
      loading="lazy"
      decoding="async"
      className={cn("max-h-[min(420px,60vh)] w-auto max-w-full rounded-lg object-contain", className)}
    />
  );
}

/** Markdown component overrides for quiz / assessment surfaces — no filenames, no figcaptions. */
export function createMediaMarkdownComponents(): Components {
  return {
    p({ children }) {
      return <p className="leading-relaxed">{children}</p>;
    },
    strong({ children }) {
      return <strong className="font-semibold">{children}</strong>;
    },
    em({ children }) {
      return <em>{children}</em>;
    },
    u({ children }) {
      return <u>{children}</u>;
    },
    h1({ children }) {
      return <h1 className="text-xl font-bold">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="text-lg font-bold">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="text-base font-semibold">{children}</h3>;
    },
    ul({ children }) {
      return <ul className="list-disc space-y-1 pl-5">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="list-decimal space-y-1 pl-5">{children}</ol>;
    },
    li({ children }) {
      return <li>{children}</li>;
    },
    blockquote({ children }) {
      return <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground">{children}</blockquote>;
    },
    code({ className, children, node: _node }) {
      const isBlock = Boolean(className);
      if (!isBlock) {
        return (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
            {children}
          </code>
        );
      }
      const { language, content } = parseMarkdownCodeChildren(children);
      return <CodeBlockRenderer content={content} language={language} readOnly showLineNumbers className="my-3" />;
    },
    pre({ children }) {
      return <>{children}</>;
    },
    table({ children }) {
      const text = String(children ?? "");
      const parsed = parseGfmTable(`| h |\n| --- |\n${text}`);
      if (parsed) return <TableRenderer data={parsed} className="my-3" />;
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">{children}</table>
        </div>
      );
    },
    th({ children }) {
      return <th className="border border-border/60 bg-muted/40 px-3 py-2 text-left font-semibold">{children}</th>;
    },
    td({ children }) {
      return <td className="border border-border/60 px-3 py-2">{children}</td>;
    },
    img({ src }) {
      if (!src) return null;
      return (
        <figure className="my-2">
          <MediaImage src={src} />
        </figure>
      );
    },
    a({ href, children }) {
      if (!href) return <>{children}</>;
      const resolved = resolveMediaUrl(href) || href;
      const childText = typeof children === "string" ? children : undefined;
      const isAttachment =
        childText?.includes("📎") ||
        childText === MEDIA_LABELS.attachment ||
        isInternalMetadataLabel(childText) ||
        /\.(pdf|docx?|pptx?|zip|txt|csv)(\?|$)/i.test(resolved);

      if (isAttachment) {
        return <MediaAttachment href={resolved} />;
      }

      const label = sanitizeDisplayLabel(childText, MEDIA_LABELS.link);
      return (
        <a href={resolved} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
          {label}
        </a>
      );
    },
  };
}

export const mediaMarkdownComponents = createMediaMarkdownComponents();
