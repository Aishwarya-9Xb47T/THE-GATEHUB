/**
 * SINGLE CONTENT ENGINE — the only supported path from blocks to AST and PDF.
 *
 * Parser → AST → Compiler → Renderer → Publish → Experience → PDF
 *
 * All consumers must use these helpers. Do not add parallel parsers or renderers.
 */
import type { DocumentNode } from "./documentTypes";
import {
  COMPILED_DOCUMENT_BLOCK_TYPE,
  INTERACTIVE_BLOCK_TYPES,
} from "./pipelineContract";
import { legacyBlockToDocument } from "./documentPipeline";
import { renderDocumentAstToLatex } from "./parseDocument";
import {
  buildLessonLearnUrl,
  buildWorkspaceLearnUrl,
  renderPdfCodingLabCard,
  renderPdfDownloadCard,
  renderPdfInteractiveCard,
  renderPdfQuizBlock,
  renderPdfResearchPaperCard,
  renderPdfUnsupportedNodeCard,
  renderPdfVideoCard,
  resolvePdfVideoWatchUrl,
  type PdfLinkContext,
} from "./pdfNodeCards";

export type { PdfLinkContext } from "./pdfNodeCards";

export interface ContentBlockLike {
  type: string;
  id?: string;
  nodes?: DocumentNode[];
  content?: string;
  sourceTex?: string;
  language?: string;
  kernel?: string;
  videoUrl?: string;
  pdfUrl?: string;
  [key: string]: unknown;
}

export function nodesFromContentBlock(block: ContentBlockLike): DocumentNode[] | null {
  if (Array.isArray(block.nodes) && block.nodes.length > 0) {
    return block.nodes;
  }
  const doc = legacyBlockToDocument(block);
  return doc?.nodes && doc.nodes.length > 0 ? doc.nodes : null;
}

/**
 * Convenience wrapper over nodesFromContentBlock.
 * Keep behavior identical to nodesFromContentBlock to avoid pipeline divergence.
 */
export function nodesFromContentBlocks(block: ContentBlockLike): DocumentNode[] | null {
  return nodesFromContentBlock(block);
}

export function nodesFromContentBlockMigration(block: ContentBlockLike): DocumentNode[] | null {
  const compiled = nodesFromContentBlock(block);
  if (compiled && compiled.length > 0) {
    return compiled;
  }
  return null;
}

export function titleFromContentBlock(block: ContentBlockLike): string {
  if (typeof block.title === "string" && block.title.trim()) {
    return block.title.trim();
  }
  return "Untitled Section";
}

export function fingerprintDocumentNodes(nodes: DocumentNode[] | undefined | null): string {
  if (!nodes || nodes.length === 0) return "empty";
  return JSON.stringify(nodes.map((n) => n.kind || n.type));
}

export function renderContentBlockToLatex(
  block: ContentBlockLike,
  options?: { linkContext?: PdfLinkContext }
): string {
  if (block.type === COMPILED_DOCUMENT_BLOCK_TYPE) {
    const nodes = nodesFromContentBlock(block);
    if (nodes && nodes.length > 0) {
      return renderDocumentAstToLatex(nodes, options?.linkContext);
    }
  }

  if (block.type === "video") {
    const rawUrl = String(block.videoUrl ?? block.url ?? "");
    const title = String(block.title ?? "Video Lesson");
    const watchUrl = resolvePdfVideoWatchUrl({ url: rawUrl, title }, options?.linkContext);
    return renderPdfVideoCard({ title, ref: rawUrl, watchUrl });
  }

  if (block.type === "quiz") {
    const title = String(block.title ?? "Lesson Quiz");
    const fullUrl = buildLessonLearnUrl(options?.linkContext);
    return renderPdfQuizBlock({ title, onlineUrl: fullUrl });
  }

  if (block.type === "pdf") {
    const rawUrl = String(block.pdfUrl ?? block.url ?? "");
    const title = String(block.title ?? "Resource Attachment");
    const fullUrl = rawUrl.startsWith("http") ? rawUrl : buildWorkspaceLearnUrl(options?.linkContext, "project");
    return renderPdfDownloadCard({ title, filename: title, url: fullUrl });
  }

  if (block.type === "codinglab" || block.type === "coding-lab") {
    const title = String(block.title ?? "Coding Lab");
    const lang = String(block.language ?? "python");
    const fullUrl = buildWorkspaceLearnUrl(options?.linkContext, "coding-lab");
    return renderPdfCodingLabCard({ title, language: lang, onlineUrl: fullUrl });
  }

  if (block.type === "researchpaper" || block.type === "research-paper") {
    const title = String(block.title ?? "Research Paper");
    const fullUrl = buildWorkspaceLearnUrl(options?.linkContext, "research");
    return renderPdfResearchPaperCard({ title, onlineUrl: fullUrl });
  }

  if (INTERACTIVE_BLOCK_TYPES.has(block.type)) {
    const title = String(block.title ?? block.type);
    const kind = String(block.type);
    const fullUrl = buildLessonLearnUrl(options?.linkContext);
    return renderPdfInteractiveCard({ title, activityType: kind, url: fullUrl });
  }

  const nodes = nodesFromContentBlock(block);
  if (nodes && nodes.length > 0) {
    return renderDocumentAstToLatex(nodes, options?.linkContext);
  }

  if (typeof block.content === "string" && block.content.trim()) {
    return block.content.trim();
  }

  return renderPdfUnsupportedNodeCard(String(block.type ?? "unknown"));
}
