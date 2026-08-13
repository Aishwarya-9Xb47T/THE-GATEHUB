import {
  buildAttachmentMarkdown,
  buildAudioMarkdown,
  buildImageMarkdown,
  buildVideoMarkdown,
  mediaKindFromUrl,
} from "./mediaMarkdown";
import { buildGfmTable } from "./tableMarkdown";

function markdownForUrl(url: string): string {
  const kind = mediaKindFromUrl(url);
  switch (kind) {
    case "video":
      return buildVideoMarkdown(url);
    case "audio":
      return buildAudioMarkdown(url);
    case "image":
      return buildImageMarkdown(url);
    default:
      return buildAttachmentMarkdown(url);
  }
}

/** Safely extract reading passage / context text without turning object metadata into "[object Object]". */
export function extractPassageOrContextText(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "[object Object]" || trimmed === "[object]" || trimmed === "[") return "";
    return trimmed;
  }
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.text === "string" && obj.text.trim()) return obj.text.trim();
    if (typeof obj.html === "string" && obj.html.trim()) return obj.html.trim();
    if (typeof obj.content === "string" && obj.content.trim()) return obj.content.trim();
  }
  return "";
}

/** Combine stem, context, and metadata media for display surfaces. */
export function buildQuestionDisplayMarkdown(
  text: string,
  metadata?: Record<string, unknown> | null
): string {
  const parts: string[] = [];
  const context = extractPassageOrContextText(metadata?.passage || metadata?.context);
  if (context) parts.push(context);

  const stem = text?.trim() || "";
  if (stem) parts.push(stem);

  const mediaUrl = String(
    metadata?.mediaUrl ||
    (metadata?.media as any)?.url ||
    (metadata?.diagram as any)?.dataUrl ||
    (metadata?.diagram as any)?.url ||
    (Array.isArray(metadata?.images) ? metadata.images[0]?.dataUrl || metadata.images[0]?.url : undefined) ||
    ""
  ).trim();

  if (mediaUrl && !stem.includes(mediaUrl) && !context.includes(mediaUrl)) {
    parts.push(markdownForUrl(mediaUrl));
  }

  // Code Block — check both metadata.code (object) and flat metadata.starterCode + metadata.language
  const codeObj =
    metadata?.code ||
    (Array.isArray(metadata?.codeBlocks) ? metadata.codeBlocks[0] : undefined) ||
    (metadata?.starterCode
      ? { content: metadata.starterCode, language: metadata.language ?? "python" }
      : undefined);
  if (codeObj) {
    const codeContent = typeof codeObj === "object" ? ((codeObj as any).content || (codeObj as any).code) : String(codeObj);
    const lang = (typeof codeObj === "object" ? (codeObj as any).language : undefined) || "python";
    if (codeContent && !stem.includes(codeContent)) {
      parts.push(`\`\`\`${lang}\n${codeContent}\n\`\`\``);
    }
  }

  // Table — convert {headers, rows} metadata into GFM markdown that parseContentBlocks can parse
  const tableObj = metadata?.table || (Array.isArray(metadata?.tables) ? metadata.tables[0] : undefined);
  if (tableObj && typeof tableObj === "object") {
    const obj = tableObj as Record<string, unknown>;
    const headers = Array.isArray(obj.headers) ? (obj.headers as unknown[]).map(String) : [];
    const rows = Array.isArray(obj.rows)
      ? (obj.rows as unknown[]).map((r) => (Array.isArray(r) ? (r as unknown[]).map(String) : []))
      : [];
    if (headers.length > 0 || rows.length > 0) {
      const gfm = buildGfmTable({ headers, rows });
      if (gfm && !stem.includes(gfm)) parts.push(gfm);
    }
  }

  // Math Formulas / Equations — use $$...$$ so parseContentBlocks creates a formula block (not \[...\] which breaks)
  const formulas = Array.isArray(metadata?.formulas)
    ? metadata.formulas
    : Array.isArray(metadata?.equations)
    ? metadata.equations.map((e: any) => e.latex || e)
    : [];
  if (formulas.length > 0) {
    const mathMd = (formulas as unknown[]).map((f) => `$$${String(f)}$$`).join("\n\n");
    if (!stem.includes(mathMd)) {
      parts.push(mathMd);
    }
  }

  // Hyperlinks
  const hyperlinks = Array.isArray(metadata?.hyperlinks)
    ? metadata.hyperlinks
    : metadata?.hyperlink
    ? [metadata.hyperlink]
    : [];
  if (hyperlinks.length > 0) {
    const linksMd = hyperlinks
      .map((link: any) => {
        const url = typeof link === "object" ? (link.url || link.href) : String(link);
        const label = typeof link === "object" ? (link.text || link.label || url) : String(link);
        return `[🔗 ${label}](${url})`;
      })
      .join(" | ");
    if (!stem.includes(linksMd)) {
      parts.push(linksMd);
    }
  }

  // Lists (Ordered / Bullet)
  const lists = Array.isArray(metadata?.lists)
    ? metadata.lists
    : metadata?.list
    ? [metadata.list]
    : [];
  if (lists.length > 0) {
    lists.forEach((l: any) => {
      if (Array.isArray(l.items)) {
        const listMd = l.items
          .map((item: string, idx: number) => (l.style === "ordered" ? `${idx + 1}. ${item}` : `- ${item}`))
          .join("\n");
        if (!stem.includes(listMd)) {
          parts.push(listMd);
        }
      }
    });
  }

  return parts.join("\n\n");
}

/** Metadata-only media (hotspot background, image choice stimulus). */
export function buildMetadataMediaMarkdown(metadata?: Record<string, unknown> | null): string | null {
  const mediaUrl = String(
    metadata?.mediaUrl ||
    (metadata?.media as any)?.url ||
    (metadata?.diagram as any)?.dataUrl ||
    (metadata?.diagram as any)?.url ||
    (Array.isArray(metadata?.images) ? metadata.images[0]?.dataUrl || metadata.images[0]?.url : undefined) ||
    ""
  ).trim();
  if (!mediaUrl) return null;
  return markdownForUrl(mediaUrl);
}
