import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { mediaMarkdownComponents } from "./mediaComponents";
import { MathSegmentView, parseMathSegments } from "./mathSegments";
import { parseContentBlocks } from "./contentBlocks";
import { CodeBlockRenderer } from "./CodeBlockRenderer";
import { TableRenderer } from "./TableRenderer";
import { resolveMediaUrl } from "./mediaMarkdown";
import { MediaAttachment } from "./MediaAttachment";
import { SafeAudio, SafeImage, SafeVideo } from "./SafeMedia";

interface MediaRendererProps {
  content: string;
  className?: string;
  emptyFallback?: React.ReactNode;
}

function renderTextSegment(text: string, key: string) {
  const segments = parseMathSegments(text);
  return segments.map((seg, i) => {
    if (seg.kind === "text") {
      if (!seg.value.trim()) return null;
      return (
        <ReactMarkdown key={`${key}-t-${i}`} remarkPlugins={[remarkGfm]} components={mediaMarkdownComponents}>
          {seg.value}
        </ReactMarkdown>
      );
    }
    return <MathSegmentView key={`${key}-m-${i}`} segment={seg} />;
  });
}

function renderMediaBlock(block: ReturnType<typeof parseContentBlocks>[number], key: string) {
  switch (block.type) {
    case "text":
      return <div key={key}>{renderTextSegment(block.content, key)}</div>;
    case "code":
      return (
        <CodeBlockRenderer
          key={key}
          content={block.content}
          language={block.language}
          readOnly
          showLineNumbers
        />
      );
    case "table":
      return <TableRenderer key={key} data={{ headers: block.headers, rows: block.rows }} className="my-3" showScrollHint />;
    case "formula":
      return (
        <MathSegmentView
          key={key}
          segment={{ kind: block.display === "block" ? "block" : "inline", value: block.latex }}
        />
      );
    case "image":
      return <SafeImage key={key} url={block.url} />;
    case "video":
      return <SafeVideo key={key} url={block.url} />;
    case "audio":
      return <SafeAudio key={key} url={block.url} />;
    case "attachment":
      return <MediaAttachment key={key} href={block.url} />;
    case "link":
      return (
        <a key={key} href={resolveMediaUrl(block.url) || block.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
          {block.label}
        </a>
      );
    default:
      return null;
  }
}

/**
 * Single renderer for all quiz / assessment rich content.
 * Supports structured blocks (code, table, media, formula) + markdown + LaTeX.
 */
export function MediaRenderer({ content, className, emptyFallback = null }: MediaRendererProps) {
  const source = content?.trim();
  if (!source) return emptyFallback ? <>{emptyFallback}</> : null;

  const blocks = parseContentBlocks(source);

  return (
    <div className={cn("media-renderer prose-gatehub w-full max-w-none space-y-3 [&_figure]:my-2", className)}>
      {blocks.map((block, i) => renderMediaBlock(block, `blk-${i}-${block.id}`))}
    </div>
  );
}
