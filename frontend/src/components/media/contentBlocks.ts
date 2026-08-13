import {
  buildAttachmentMarkdown,
  buildAudioMarkdown,
  buildImageMarkdown,
  buildLinkMarkdown,
  buildVideoMarkdown,
  mediaKindFromUrl,
  MEDIA_LABELS,
} from "./mediaMarkdown";
import { buildGfmTable, normalizeInlineGfmTable, parseGfmTable } from "./tableMarkdown";

export type ContentBlock =
  | { id: string; type: "text"; content: string }
  | { id: string; type: "image"; url: string }
  | { id: string; type: "video"; url: string }
  | { id: string; type: "audio"; url: string }
  | { id: string; type: "attachment"; url: string; label?: string }
  | { id: string; type: "link"; url: string; label: string }
  | { id: string; type: "formula"; latex: string; display: "inline" | "block" }
  | { id: string; type: "code"; content: string; language?: string }
  | { id: string; type: "table"; headers: string[]; rows: string[][] };

let blockId = 0;
export function newBlockId(): string {
  blockId += 1;
  return `blk-${Date.now()}-${blockId}`;
}

const SPECIAL_RE = /(\$\$|```|!\[|\[|\$)/;

function normalizeMarkdownForBlocks(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .map((part) => {
      const trimmed = part.trim();
      if (trimmed.startsWith("|") && !trimmed.includes("\n")) {
        return normalizeInlineGfmTable(trimmed);
      }
      return part;
    })
    .join("\n\n");
}

export function parseContentBlocks(markdown: string): ContentBlock[] {
  const source = normalizeMarkdownForBlocks(markdown ?? "");
  if (!source.trim()) return [{ id: newBlockId(), type: "text", content: "" }];

  const blocks: ContentBlock[] = [];
  let remaining = source;

  while (remaining.length > 0) {
    const matched = tryParseBlockAtStart(remaining);
    if (matched) {
      blocks.push(matched.block);
      remaining = matched.rest;
      continue;
    }

    const specialAt = remaining.search(SPECIAL_RE);
    if (specialAt === -1) {
      const trimmed = remaining.trim();
      if (trimmed) {
        const promoted = promoteStructuredInBlocks([{ id: newBlockId(), type: "text", content: trimmed }]);
        blocks.push(...promoted);
      }
      break;
    }

    if (specialAt > 0) {
      const text = remaining.slice(0, specialAt).trim();
      if (text) blocks.push({ id: newBlockId(), type: "text", content: text });
      remaining = remaining.slice(specialAt);
      continue;
    }

    // Unrecognized special at start — treat as plain text and advance
    blocks.push({ id: newBlockId(), type: "text", content: remaining[0]! });
    remaining = remaining.slice(1);
  }

  return promoteStructuredInBlocks(blocks.length ? blocks : [{ id: newBlockId(), type: "text", content: "" }]);
}

/** Lift table/code markdown trapped inside text blocks into typed blocks. */
export function promoteStructuredInBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];

  for (const block of blocks) {
    if (block.type !== "text") {
      out.push(block);
      continue;
    }

    const trimmed = block.content.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("|")) {
      const source = trimmed.includes("\n") ? trimmed : normalizeInlineGfmTable(trimmed);
      const tableData = parseGfmTable(source);
      if (tableData) {
        out.push({
          id: block.id,
          type: "table",
          headers: tableData.headers,
          rows: tableData.rows,
        });
        continue;
      }
    }

    const codeMatch = trimmed.match(/^```(\w*)\n?([\s\S]*?)```$/);
    if (codeMatch) {
      out.push({
        id: block.id,
        type: "code",
        language: codeMatch[1] || undefined,
        content: codeMatch[2] ?? "",
      });
      continue;
    }

    out.push(block);
  }

  return out.length ? out : [{ id: newBlockId(), type: "text", content: "" }];
}

function tryParseBlockAtStart(input: string): { block: ContentBlock; rest: string } | null {
  const tableMatch = input.match(/^(\|.+\|\n\|[-:\s|]+\|\n(?:\|.+\|\n?)*)/);
  if (tableMatch) {
    const tableData = parseGfmTable(tableMatch[1]!);
    if (tableData) {
      return {
        block: { id: newBlockId(), type: "table", headers: tableData.headers, rows: tableData.rows },
        rest: input.slice(tableMatch[1]!.length),
      };
    }
  }

  const leading = input.length - input.trimStart().length;
  const trimmedStart = input.trimStart();
  if (trimmedStart.startsWith("|")) {
    const inlineChunk = trimmedStart.split(/\n\n/)[0]!;
    const tableData = parseGfmTable(inlineChunk.includes("\n") ? inlineChunk : normalizeInlineGfmTable(inlineChunk));
    if (tableData) {
      return {
        block: { id: newBlockId(), type: "table", headers: tableData.headers, rows: tableData.rows },
        rest: input.slice(leading + inlineChunk.length).trimStart(),
      };
    }
  }

  const rules: Array<{ re: RegExp; build: (m: RegExpMatchArray) => ContentBlock }> = [
    {
      re: /^\$\$([\s\S]*?)\$\$/,
      build: (m) => ({ id: newBlockId(), type: "formula", latex: m[1]!.trim(), display: "block" }),
    },
    {
      re: /^```(\w*)\n?([\s\S]*?)```/,
      build: (m) => ({
        id: newBlockId(),
        type: "code",
        language: m[1] || undefined,
        content: m[2] ?? "",
      }),
    },
    {
      re: /^!\[([^\]]*)\]\(([^)]+)\)/,
      build: (m) => {
        const alt = m[1]!.trim().toLowerCase();
        const url = m[2]!.trim();
        if (alt === "video" || alt === "video component") return { id: newBlockId(), type: "video", url };
        if (alt === "audio" || alt === "audio component") return { id: newBlockId(), type: "audio", url };
        if (alt === "image" || alt === "image component") return { id: newBlockId(), type: "image", url };
        const kind = mediaKindFromUrl(url);
        if (kind === "video") return { id: newBlockId(), type: "video", url };
        if (kind === "audio") return { id: newBlockId(), type: "audio", url };
        return { id: newBlockId(), type: "image", url };
      },
    },
    {
      re: /^\[([^\]]+)\]\(([^)]+)\)/,
      build: (m) => {
        const label = m[1]!.trim();
        const lowerLabel = label.toLowerCase();
        const url = m[2]!.trim();
        if (label === MEDIA_LABELS.attachment || lowerLabel === "attachment" || lowerLabel === "file") {
          return { id: newBlockId(), type: "attachment", url, label };
        }
        if (lowerLabel === "video" || label === MEDIA_LABELS.video || mediaKindFromUrl(url) === "video") {
          return { id: newBlockId(), type: "video", url };
        }
        if (lowerLabel === "audio" || label === MEDIA_LABELS.audio || mediaKindFromUrl(url) === "audio") {
          return { id: newBlockId(), type: "audio", url };
        }
        if (lowerLabel === "image" || label === MEDIA_LABELS.image || mediaKindFromUrl(url) === "image") {
          return { id: newBlockId(), type: "image", url };
        }
        return { id: newBlockId(), type: "link", url, label };
      },
    },
    {
      re: /^\$([^$\n]+?)\$/,
      build: (m) => ({ id: newBlockId(), type: "formula", latex: m[1]!.trim(), display: "inline" }),
    },
  ];

  for (const { re, build } of rules) {
    const m = input.match(re);
    if (m) return { block: build(m), rest: input.slice(m[0].length) };
  }
  return null;
}

export function serializeContentBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "text":
          return block.content;
        case "image":
          return buildImageMarkdown(block.url);
        case "video":
          return buildVideoMarkdown(block.url);
        case "audio":
          return buildAudioMarkdown(block.url);
        case "attachment":
          return buildAttachmentMarkdown(block.url);
        case "link":
          return buildLinkMarkdown(block.url, block.label);
        case "formula":
          // Empty formulas must round-trip as block math ($$$$); bare $$ is not parseable as inline.
          if (!String(block.latex || "").trim()) return "$$$$";
          return block.display === "block" ? `$$${block.latex}$$` : `$${block.latex}$`;
        case "code":
          return `\`\`\`${block.language || ""}\n${block.content ?? ""}\`\`\``;
        case "table":
          return buildGfmTable({ headers: block.headers, rows: block.rows });
        default:
          return "";
      }
    })
    .filter((s) => s.trim())
    .join("\n\n");
}

export function insertBlockAfter(
  blocks: ContentBlock[],
  afterId: string | null,
  block: ContentBlock
): ContentBlock[] {
  if (!afterId) return [...blocks, block];
  const idx = blocks.findIndex((b) => b.id === afterId);
  if (idx < 0) return [...blocks, block];
  const next = [...blocks];
  next.splice(idx + 1, 0, block);
  return next;
}

/** Re-parse markdown so tables/code in text promote to structured blocks. */
export function reparseStructuredBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return promoteStructuredInBlocks(parseContentBlocks(serializeContentBlocks(blocks)));
}

export function mergeAdjacentTextBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === "text" && out.length > 0 && out[out.length - 1]?.type === "text") {
      const prev = out[out.length - 1] as Extract<ContentBlock, { type: "text" }>;
      prev.content = [prev.content, block.content].filter(Boolean).join("\n");
    } else {
      out.push({ ...block });
    }
  }
  return out;
}
