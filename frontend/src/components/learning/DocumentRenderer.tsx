import { useEffect, useState } from "react";
import { AlertTriangle, Download, ExternalLink } from "lucide-react";
import { BlockMath, InlineMath } from "react-katex";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "./MarkdownContent";
import { MermaidRenderer } from "./MermaidRenderer";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { resolveLearningUniverseAsset } from "@/lib/resolveLearningUniverseAsset";
import { resolveVideoSource } from "@/lib/videoSourceUtils";
import type { DocumentNode, LessonDocument } from "@gatehub/lesson-body";

export interface DocumentRendererProps {
  document: LessonDocument;
  className?: string;
  resolveImageUrl: (ref: string) => string;
  universeId?: string;
  assets?: { filename: string; storedFilename: string }[];
}

function DocumentImage({
  node,
  resolveImageUrl,
}: {
  node: DocumentNode;
  resolveImageUrl: (ref: string) => string;
}) {
  const [failed, setFailed] = useState(false);
  const nodeData = node as any;
  const src = resolveImageUrl(nodeData.ref || "");
  const imgStyle = nodeData.widthCss ? { width: nodeData.widthCss, maxWidth: "100%" } : undefined;

  if (!src || failed) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground",
          nodeData.centered && "mx-auto w-full"
        )}
        style={imgStyle}
      >
        <AlertTriangle className="mx-auto mb-2 h-5 w-5 opacity-70" />
        <p className="font-medium">Image not found</p>
        <p className="mt-1 truncate text-xs opacity-80">{nodeData.ref || ""}</p>
      </div>
    );
  }

  const nodeRef = nodeData.ref || "";
  const altText =
    (typeof nodeData.caption === "string" && nodeData.caption?.trim()) ||
    (typeof nodeData.alt === "string" && nodeData.alt?.trim()) ||
    (typeof nodeData.title === "string" && nodeData.title?.trim()) ||
    `Lesson image: ${nodeRef.split("/").pop() || nodeRef}`;

  const image = (
    <img
      src={src}
      alt={altText}
      className="lesson-image block h-auto max-w-full rounded-xl"
      style={imgStyle}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );

  return nodeData.centered ? (
    <div className="tex-center my-6 flex w-full justify-center">{image}</div>
  ) : (
    <div className="my-4 w-full">{image}</div>
  );
}

function DocumentNodeView({
  node,
  index,
  className,
  resolveImageUrl,
  universeId = "preview",
  assets,
}: {
  node: DocumentNode;
  index: number;
  className?: string;
  resolveImageUrl: (ref: string) => string;
  universeId?: string;
  assets?: { filename: string; storedFilename: string }[];
}) {
  switch (node.type) {
    case "markdown":
    case "paragraph":
    case "heading":
    case "text":
      return (
        <MarkdownContent key={`doc-md-${index}`} className={className}>
          {node.type === "heading"
            ? `${"#".repeat(Math.min(6, Math.max(1, Number((node as any).level) || 2)))} ${String((node as any).content || "")}`
            : String((node as any).content || "")}
        </MarkdownContent>
      );
    case "image":
      return (
        <DocumentImage
          key={`doc-img-${index}-${(node as any).ref}`}
          node={node}
          resolveImageUrl={resolveImageUrl}
        />
      );
    case "equation":
      const nodeLatex = (node as any).latex || "";
      return (
        <div
          key={`doc-eq-${index}`}
          className={cn(
            "my-4 w-full overflow-x-auto",
            (node as any).display && "katex-display-wrapper flex justify-center"
          )}
        >
          {(node as any).display ? (
            <BlockMath math={nodeLatex} />
          ) : (
            <InlineMath math={nodeLatex} />
          )}
        </div>
      );
    case "code":
      const nodeContent = String((node as any).content || "");
      if (/^(flowchart|graph|sequenceDiagram|stateDiagram|classDiagram)/i.test(nodeContent.trim())) {
        return <MermaidRenderer key={`doc-mermaid-${index}`} chart={nodeContent} />;
      }
      return (
        <pre
          key={`doc-code-${index}`}
          className="my-4 w-full overflow-x-auto rounded-xl bg-muted p-4 text-sm font-mono"
        >
          <code>{nodeContent}</code>
        </pre>
      );
    case "diagram":
      return <MermaidRenderer key={`doc-diagram-${index}`} chart={(node as any).code || String((node as any).content || "")} />;
    case "table": {
      const headers = Array.isArray((node as any).headers)
        ? ((node as any).headers as unknown[]).map(String)
        : [];
      const rows = Array.isArray((node as any).rows)
        ? ((node as any).rows as unknown[]).map((r) =>
            Array.isArray(r) ? r.map(String) : [String(r)],
          )
        : [];
      // Prefer structured table data; fall back to parsing legacy monospace content.
      if (headers.length || rows.length) {
        const cols = Math.max(headers.length, ...rows.map((r) => r.length), 1);
        return (
          <div
            key={`doc-table-${index}`}
            className="my-4 w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border bg-card [scrollbar-width:thin]"
            data-content-type="table"
          >
            <table className="w-max min-w-full border-collapse text-sm">
              {headers.length > 0 && (
                <thead>
                  <tr>
                    {Array.from({ length: cols }).map((_, i) => (
                      <th
                        key={i}
                        className="min-w-[5.5rem] whitespace-nowrap border border-border/60 bg-muted/40 px-3 py-2 text-left font-semibold"
                      >
                        {headers[i] || ""}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="even:bg-muted/20">
                    {Array.from({ length: cols }).map((_, ci) => (
                      <td
                        key={ci}
                        className="min-w-[5.5rem] break-words border border-border/60 px-3 py-2 align-top"
                      >
                        {row[ci] || ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      const legacy = String((node as any).content || "").trim();
      if (!legacy) {
        return (
          <div
            key={`doc-table-${index}`}
            className="my-4 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
          >
            Table content unavailable
          </div>
        );
      }
      return (
        <pre
          key={`doc-table-${index}`}
          className="my-4 w-full overflow-x-auto rounded-xl border bg-card p-3 text-xs font-mono"
        >
          {legacy}
        </pre>
      );
    }
    case "list": {
      const Tag = (node as any).ordered ? "ol" : "ul";
      const items = (node as any).items || [];
      return (
        <Tag
          key={`doc-list-${index}`}
          className={cn(
            "my-4 w-full pl-6 text-foreground",
            (node as any).ordered ? "list-decimal" : "list-disc"
          )}
        >
          {items.map((item: string, i: number) => (
            <li key={i} className="mb-1">
              <MarkdownContent className={className}>{item}</MarkdownContent>
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote
          key={`doc-quote-${index}`}
          className="my-4 w-full border-l-4 border-primary/40 pl-4 italic text-muted-foreground"
        >
          <MarkdownContent className={className}>{String((node as any).content || "")}</MarkdownContent>
        </blockquote>
      );
    case "callout":
      return (
        <div
          key={`doc-callout-${index}`}
          className={cn(
            "content-card my-4 w-full rounded-xl border p-4",
            (node as any).variant === "warning" && "content-card--warning",
            (node as any).variant === "tip" && "content-card--tip",
            (node as any).variant === "note" && "content-card--note",
            (node as any).variant === "info" && "content-card--definition"
          )}
        >
          {(node as any).title ? (
            <p className="content-card__label mb-2 font-medium">{(node as any).title}</p>
          ) : null}
          <MarkdownContent className={className}>{String((node as any).content || "")}</MarkdownContent>
        </div>
      );
    case "video": {
      const nodeRef = (node as any).ref || "";
      const watchUrl = /^https?:\/\//i.test(nodeRef)
        ? nodeRef
        : resolveLearningUniverseAsset(nodeRef, universeId, assets).resolvedUrl || nodeRef;
      const resolved = resolveVideoSource(
        {
          url: watchUrl,
          file: nodeRef,
          type: (node as any).sourceType,
          title: (node as any).title,
        },
        resolveImageUrl
      );
      if (!resolved) {
        return (
          <div
            key={`doc-video-${index}`}
            className="my-4 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground"
          >
            <p className="font-medium">{(node as any).title || "Video"}</p>
            <p className="mt-1 truncate">{nodeRef}</p>
          </div>
        );
      }
      return (
        <div key={`doc-video-${index}`} className="my-4 w-full space-y-2">
          {(node as any).title ? <p className="text-sm font-medium">{(node as any).title}</p> : null}
          <VideoPlayer
            videoUrl={resolved.url}
            videoType={resolved.type}
            title={String((node as any).title ?? resolved.title ?? "Video")}
            embedUrl={resolved.embedUrl}
            youtubeId={resolved.youtubeId}
            vimeoId={resolved.vimeoId}
            className="aspect-video w-full overflow-hidden rounded-xl"
          />
        </div>
      );
    }
    case "link":
      return (
        <p key={`doc-link-${index}`} className="my-2">
          <a
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            {node.label || node.url}
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </a>
        </p>
      );
    case "download": {
      const href =
        node.url ||
        resolveLearningUniverseAsset(node.ref, universeId, assets).resolvedUrl ||
        node.ref;
      return (
        <div
          key={`doc-download-${index}`}
          className="my-4 flex w-full items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4"
        >
          <div className="min-w-0">
            <p className="font-medium">{node.title || node.ref}</p>
            <p className="truncate text-xs text-muted-foreground">{node.ref}</p>
          </div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      );
    }
    default:
      return (
        <div
          key={`doc-unsupported-${index}`}
          className="my-4 rounded-xl border border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
        >
          <p className="font-medium">Unsupported content</p>
          <p className="mt-1 text-xs opacity-80">{(node as { type: string }).type}</p>
        </div>
      );
  }
}

/**
 * Universal document renderer — iterates AST nodes in source order.
 * Lesson-type agnostic: only the document model matters.
 */
export function DocumentRenderer({
  document,
  className,
  resolveImageUrl,
  universeId,
  assets,
}: DocumentRendererProps) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("traceDocs")) return;
    console.group("[GH_TRACE] DocumentRenderer");
    console.log("props.document", document);
    console.log("node types", document.nodes.map((n) => n.type));
    console.groupEnd();
  }, [document]);

  if (!document.nodes.length) return null;

  return (
    <div className={cn("lesson-document w-full max-w-none space-y-4", className)}>
      {document.nodes.map((node, index) => (
        <DocumentNodeView
          key={`doc-node-${index}`}
          node={node}
          index={index}
          className={className}
          resolveImageUrl={resolveImageUrl}
          universeId={universeId}
          assets={assets}
        />
      ))}
    </div>
  );
}
