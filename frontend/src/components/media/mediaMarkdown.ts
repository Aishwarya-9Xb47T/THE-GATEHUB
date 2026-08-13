import { resolveCourseMediaUrl } from "@/lib/courseMediaUrls";

const PLACEHOLDER_SRC = new Set(["text", "url", "https://", "http://", "media", "image", ""]);

/** Public-facing labels — never expose internal filenames. */
export const MEDIA_LABELS = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  attachment: "Attachment",
  link: "Link",
} as const;

export function resolveMediaUrl(src?: string | null): string | null {
  if (!src?.trim()) return null;
  const trimmed = src.trim();
  if (PLACEHOLDER_SRC.has(trimmed.toLowerCase())) return null;
  return resolveCourseMediaUrl(trimmed) || trimmed;
}

export function isRenderableMediaUrl(src?: string | null): boolean {
  if (!src?.trim()) return false;
  const trimmed = src.trim();
  if (PLACEHOLDER_SRC.has(trimmed.toLowerCase())) return false;
  if (/^(data:|blob:|https?:\/\/|\/)/i.test(trimmed)) return true;
  return trimmed.includes(".") || trimmed.includes("/");
}

/** Detect if alt/link text looks like an internal filename (never show in preview). */
export function isInternalMetadataLabel(text?: string | null): boolean {
  if (!text?.trim()) return true;
  const t = text.trim();
  if (PLACEHOLDER_SRC.has(t.toLowerCase())) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) return true;
  if (/\.(png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|pdf|docx?|pptx?)$/i.test(t)) return true;
  if (t.includes("/uploads/")) return true;
  return false;
}

export function sanitizeDisplayLabel(text?: string | null, fallback = "Link"): string {
  if (!text || isInternalMetadataLabel(text)) return fallback;
  return text;
}

/** Store markdown without exposing filenames in alt or link text. */
export function buildImageMarkdown(url: string): string {
  return `![image](${url})`;
}

export function buildVideoMarkdown(url: string): string {
  return `![video](${url})`;
}

export function buildAudioMarkdown(url: string): string {
  return `![audio](${url})`;
}

export function buildAttachmentMarkdown(url: string): string {
  return `[${MEDIA_LABELS.attachment}](${url})`;
}

export function buildLinkMarkdown(url: string, label?: string): string {
  const text = label && !isInternalMetadataLabel(label) ? label : MEDIA_LABELS.link;
  return `[${text}](${url})`;
}

export function insertAtCursor(
  value: string,
  insert: string,
  selection: { start: number; end: number }
): { next: string; cursor: number } {
  const { start, end } = selection;
  const needsGap = start > 0 && value[start - 1] !== "\n" && !insert.startsWith("\n");
  const prefix = needsGap ? "\n\n" : "";
  const payload = prefix + insert + (insert.endsWith("\n") ? "" : "\n");
  const next = value.slice(0, start) + payload + value.slice(end);
  const cursor = start + payload.length;
  return { next, cursor };
}

export function mediaKindFromUrl(url: string): "image" | "video" | "audio" | "file" {
  if (!url) return "file";
  const lower = url.toLowerCase().trim();
  if (lower.startsWith("data:video/")) return "video";
  if (lower.startsWith("data:audio/")) return "audio";
  if (lower.startsWith("data:image/") || lower.startsWith("blob:")) return "image";
  if (/\.(mp4|webm|ogg|mov|m4v|mkv|avi)(\?|$)/i.test(lower) || /youtube\.com|youtu\.be/.test(lower)) return "video";
  if (/\.(mp3|wav|m4a|aac|flac|ogg)(\?|$)/i.test(lower)) return "audio";
  if (/\.(png|jpe?g|gif|webp|svg|bmp|tiff?|ico|avif)(\?|$)/i.test(lower)) return "image";
  return "file";
}
