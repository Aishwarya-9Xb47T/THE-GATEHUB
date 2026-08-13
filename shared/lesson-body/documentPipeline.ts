/**
 * Universal document pipeline — single path from TeX/source to Document AST blocks.
 * Publish, experience engine, preview, and PDF must all use these helpers.
 *
 * IMPORTANT: The signatures of commandInnerToDocument and toDocumentBlock must match
 * what learning-universe-parser.ts expects. Do NOT change these signatures without
 * updating every call site in learning-universe-parser.ts.
 */
import type { DocumentNode, LessonDocument } from "./documentTypes";
import { RICH_BODY_BLOCK_TYPES } from "./documentTypes";
import {
  parseLessonDocument,
  parseLessonDocumentFromContent,
  renderDocumentAstToLatex,
} from "./parseDocument";

export interface DocumentBlockContent {
  title?: string;
  nodes: DocumentNode[];
  /** Original authored TeX/markdown preserved for round-trip and media injection. */
  sourceTex?: string;
}

export interface DocumentContentBlock {
  type: string;
  id?: string;
  content?: string | Record<string, unknown>;
  sourceTex?: string;
  nodes?: DocumentNode[];
  title?: string;
  [key: string]: unknown;
}

/**
 * Parse a raw TeX command body into a titled document.
 * Signature: commandInnerToDocument(cmdName: string, rawBody: string) → { title?, nodes }
 *
 * The parser calls: commandInnerToDocument("overviewmarkdown", trimmed)
 *                   commandInnerToDocument(cmd.type, cmd.content)
 */
export function commandInnerToDocument(
  cmdName: string,
  rawBody: string
): LessonDocument & { title?: string } {
  const content = (rawBody || "").trim();

  const outerCmds = content.match(
    /\\(text|formula|callout|code|table|diagram|image|video|audio|quiz|codinglab|notebook|researchpaper|mathproof|casestudy|audiolecture|flashcards|discussion|labexercise|cheatsheet|summary)\s*\{/i
  );

  const doc: LessonDocument = parseLessonDocument(content);

  // Extract title from first node if present
  const firstNode = doc.nodes[0];
  const title = firstNode?.title ?? undefined;

  return { ...doc, title };
}

/**
 * Build a "document" content block from a DocumentBlockContent shape + sourceTex.
 * Signature: toDocumentBlock(blockContent: { title?, nodes }, sourceTex: string) → DocumentContentBlock
 *
 * The parser calls: toDocumentBlock({ title: doc.title ?? "Overview", nodes: doc.nodes }, trimmed)
 *                   toDocumentBlock({ title, nodes: doc.nodes }, `\\cmdType{content}`)
 */
export function toDocumentBlock(
  blockContent: { title?: string; nodes: DocumentNode[] },
  sourceTex: string
): DocumentContentBlock {
  return {
    type: "document",
    title: blockContent.title,
    content: renderDocumentAstToLatex(blockContent.nodes),
    sourceTex,
    nodes: blockContent.nodes,
  };
}

/**
 * Build content blocks from DocumentNode array, extracting video nodes as separate blocks.
 * This ensures video DocumentNodes become proper video content blocks instead of being hidden in document blocks.
 */
export function documentNodesToBlocks(
  nodes: DocumentNode[],
  sourceTex: string,
  title?: string
): DocumentContentBlock[] {
  const blocks: DocumentContentBlock[] = [];
  const documentNodes: DocumentNode[] = [];
  
  for (const node of nodes) {
    if (node.kind === "video" || node.type === "video") {
      // Extract video node as a separate video block
      blocks.push({
        type: "video",
        title: node.title || title,
        videoUrl: node.url || node.file || "",
        videoType: node.sourceType || (node.url?.includes("youtu") ? "youtube" : "upload"),
        src: node.url || node.file || "",
        sourceTex,
      });
    } else {
      documentNodes.push(node);
    }
  }
  
  // If there are non-video nodes, create a document block for them
  if (documentNodes.length > 0) {
    blocks.push({
      type: "document",
      title,
      content: renderDocumentAstToLatex(documentNodes),
      sourceTex,
      nodes: documentNodes,
    });
  }
  
  return blocks;
}

export function legacyBlockToDocument(block: {
  type: string;
  content?: string | Record<string, unknown>;
  sourceTex?: string;
  nodes?: DocumentNode[];
  [key: string]: unknown;
}): LessonDocument | null {
  if (Array.isArray(block.nodes) && block.nodes.length > 0) {
    return { nodes: block.nodes };
  }

  const text =
    typeof block.sourceTex === "string" && block.sourceTex.trim()
      ? block.sourceTex
      : typeof block.content === "string"
      ? block.content
      : "";

  if (!text.trim()) {
    return null;
  }

  return parseLessonDocument(text);
}

export function isCurriculumRichBlockType(type: string): boolean {
  return (
    type === "theory" ||
    type === "objectives" ||
    type === "prerequisites" ||
    type === "recap" ||
    RICH_BODY_BLOCK_TYPES.includes(type as (typeof RICH_BODY_BLOCK_TYPES)[number])
  );
}

export function enrichLessonToDocumentBlocks<T extends DocumentContentBlock>(blocks: T[]): T[] {
  return blocks.map((b) => {
    if (!b || typeof b !== "object" || !b.type) return b;
    if (b.nodes && b.nodes.length > 0) return b;

    const source =
      typeof b.sourceTex === "string" && b.sourceTex.trim()
        ? b.sourceTex
        : typeof b.content === "string"
        ? b.content
        : "";

    if (!source.trim()) return b;

    const doc = parseLessonDocument(source);
    if (doc.nodes && doc.nodes.length > 0) {
      return { ...b, nodes: doc.nodes };
    }
    return b;
  });
}

export function appendGraphicsToDocumentBlock<T extends DocumentContentBlock>(
  block: T,
  graphicsOptions: string,
  imageRelPath: string
): T {
  const figCmd = `\\image{url={${imageRelPath}},options={${graphicsOptions}}}`;
  const existingTex =
    typeof block.sourceTex === "string" && block.sourceTex.trim()
      ? block.sourceTex
      : typeof block.content === "string"
      ? block.content
      : "";

  const newTex = existingTex.trim() ? `${existingTex.trim()}\n\n${figCmd}` : figCmd;
  const doc = parseLessonDocument(newTex);

  return {
    ...block,
    sourceTex: newTex,
    content: renderDocumentAstToLatex(doc.nodes),
    nodes: doc.nodes,
  };
}

export function documentBlockFromContent(
  cmdName: string,
  content: string,
  title?: string
): DocumentContentBlock {
  const doc = commandInnerToDocument(cmdName, content);
  return toDocumentBlock({ title: title ?? doc.title, nodes: doc.nodes }, content);
}
