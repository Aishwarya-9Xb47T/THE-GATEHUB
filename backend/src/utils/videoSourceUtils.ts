/** Shared video URL normalization for parser + learning experience engine. */

export type VideoSourceType = "youtube" | "vimeo" | "upload" | "external";

export function unescapeLatexVideoUrl(value: string): string {
  return value.replace(/\\&/g, "&").replace(/\\%/g, "%").replace(/\\#/g, "#").replace(/\\_/g, "_").trim();
}

export function extractYouTubeId(url: string): string | null {
  const raw = unescapeLatexVideoUrl(url);
  if (!raw) return null;

  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (parsed.pathname.startsWith("/embed/") || parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      const v = parsed.searchParams.get("v");
      if (v) return v;
    }
  } catch {
    /* regex fallback */
  }

  const patterns = [
    /(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([\w-]{11})/i,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/i,
    /(?:youtu\.be\/)([\w-]{11})/i,
    /(?:youtube\.com\/watch\?.*v=)([\w-]{11})/i,
    /(?:[?&]v=)([\w-]{11})/i,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|m3u8)(\?|$)/i.test(url.split("?")[0]);
}

export function detectVideoSourceType(url: string, explicit?: string): VideoSourceType {
  const normalized = unescapeLatexVideoUrl(url).toLowerCase();
  const type = explicit?.toLowerCase().trim();
  if (type === "youtube") return "youtube";
  if (type === "vimeo") return "vimeo";
  if (type === "upload" || type === "local") return "upload";
  if (!normalized) return "upload";
  if (normalized.includes("youtu") || extractYouTubeId(normalized)) return "youtube";
  if (normalized.includes("vimeo.com")) return "vimeo";
  if (/^https?:\/\//i.test(normalized) && isDirectVideoUrl(normalized)) return "external";
  if (/^https?:\/\//i.test(normalized)) return "external";
  return "upload";
}

export function normalizeVideoPayload(raw: Record<string, unknown>): {
  type: string;
  url: string;
  title?: string;
  file?: string;
  youtubeId?: string;
} {
  const file = typeof raw.file === "string" ? raw.file : "";
  let url = unescapeLatexVideoUrl(typeof raw.url === "string" ? raw.url : file);
  let type = detectVideoSourceType(url, typeof raw.type === "string" ? raw.type : undefined);

  if (type === "upload" && !url && file) url = file;
  if (type === "external") type = "upload";

  const youtubeId = type === "youtube" ? extractYouTubeId(url) : undefined;
  if (type === "youtube" && !youtubeId) {
    type = isDirectVideoUrl(url) ? "upload" : "youtube";
  }

  return {
    type,
    url,
    file: file || undefined,
    title: typeof raw.title === "string" ? raw.title : undefined,
    youtubeId: youtubeId ?? undefined,
  };
}

export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}
