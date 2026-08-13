/** Normalize and classify video URLs for THE GATEHUB players. */

export type VideoSourceType = "youtube" | "vimeo" | "upload" | "external";

export interface ResolvedVideoSource {
  type: VideoSourceType;
  url: string;
  title?: string;
  youtubeId?: string;
  vimeoId?: string;
  embedUrl?: string;
  thumbnailUrl?: string;
}

export function unescapeLatexVideoUrl(value: string): string {
  return value.replace(/\\&/g, "&").replace(/\\%/g, "%").replace(/\\#/g, "#").replace(/\\_/g, "_").trim();
}

/** Extract YouTube video ID from any common URL format. */
export function extractYouTubeId(url: string): string | null {
  const raw = unescapeLatexVideoUrl(url);
  if (!raw) return null;

  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id && /^[\w-]{11}$/.test(id) ? id : id || null;
    }

    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (parsed.pathname.startsWith("/embed/")) {
        const id = parsed.pathname.split("/")[2];
        return id || null;
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/")[2];
        return id || null;
      }
      const v = parsed.searchParams.get("v");
      if (v) return v;
    }
  } catch {
    /* fall through to regex */
  }

  const patterns = [
    /(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([\w-]{11})/i,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/i,
    /(?:youtu\.be\/)([\w-]{11})/i,
    /(?:youtube\.com\/watch\?.*v=)([\w-]{11})/i,
    /(?:[?&]v=)([\w-]{11})/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function extractVimeoId(url: string): string | null {
  const raw = unescapeLatexVideoUrl(url);
  const match = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return match ? match[1] : null;
}

export function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|m3u8)(\?|$)/i.test(url.split("?")[0]);
}

export function detectVideoSourceType(url: string, explicit?: string): VideoSourceType {
  const normalized = unescapeLatexVideoUrl(url).toLowerCase();
  const type = explicit?.toLowerCase().trim();

  if (type === "youtube" || type === "youtu") return "youtube";
  if (type === "vimeo") return "vimeo";
  if (type === "upload" || type === "local") return "upload";

  if (!normalized) return "upload";
  if (normalized.includes("youtu")) return "youtube";
  if (normalized.includes("vimeo.com")) return "vimeo";
  if (/^https?:\/\//i.test(normalized) && isDirectVideoUrl(normalized)) return "external";
  if (/^https?:\/\//i.test(normalized)) return "external";
  return "upload";
}

export function buildYouTubeEmbedUrl(videoId: string, opts?: { autoplay?: boolean; start?: number }): string {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    enablejsapi: "1",
  });
  if (opts?.autoplay) params.set("autoplay", "1");
  if (opts?.start && opts.start > 0) params.set("start", String(Math.floor(opts.start)));
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function buildVimeoEmbedUrl(videoId: string): string {
  return `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0`;
}

export function youTubeThumbnailUrl(videoId: string, quality: "default" | "hq" | "max" = "hq"): string {
  if (quality === "max") return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  if (quality === "hq") return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  return `https://img.youtube.com/vi/${videoId}/default.jpg`;
}

export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}

export function normalizeYouTubeWatchUrl(url: string): string {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url.trim();
}

export function resolveVideoSource(
  raw: { url?: string; file?: string; type?: string; title?: string; youtubeId?: string; vimeoId?: string },
  resolveUpload?: (ref: string) => string
): ResolvedVideoSource | null {
  const file = typeof raw.file === "string" ? raw.file : "";
  let url = unescapeLatexVideoUrl(typeof raw.url === "string" ? raw.url : file);
  if (!url && raw.youtubeId) {
    url = `https://www.youtube.com/watch?v=${raw.youtubeId}`;
  }
  if (!url && raw.vimeoId) {
    url = `https://vimeo.com/${raw.vimeoId}`;
  }
  if (!url) return null;

  let type = detectVideoSourceType(url, raw.type);
  if (raw.youtubeId && type !== "youtube") type = "youtube";
  if (raw.vimeoId && type !== "vimeo") type = "vimeo";

  if (type === "upload" && url && !/^https?:\/\//i.test(url)) {
    url = resolveUpload ? resolveUpload(url) : url;
  }

  if (type === "youtube") {
    const youtubeId = raw.youtubeId || extractYouTubeId(url);
    if (!youtubeId) {
      if (isDirectVideoUrl(url)) type = "external";
      else return null;
    } else {
      return {
        type: "youtube",
        url,
        title: raw.title,
        youtubeId,
        embedUrl: buildYouTubeEmbedUrl(youtubeId),
        thumbnailUrl: youTubeThumbnailUrl(youtubeId),
      };
    }
  }

  if (type === "vimeo") {
    const vimeoId = raw.vimeoId || extractVimeoId(url);
    if (!vimeoId) return null;
    return {
      type: "vimeo",
      url,
      title: raw.title,
      vimeoId,
      embedUrl: buildVimeoEmbedUrl(vimeoId),
    };
  }

  if (type === "external" && /^https?:\/\//i.test(url)) {
    return { type: "external", url, title: raw.title };
  }

  return { type: "upload", url, title: raw.title };
}

export function defaultVideoLabel(type: VideoSourceType, index: number): string {
  switch (type) {
    case "youtube":
      return index === 0 ? "YouTube Walkthrough" : `YouTube Video ${index + 1}`;
    case "vimeo":
      return index === 0 ? "Vimeo Video" : `Vimeo Video ${index + 1}`;
    case "upload":
      return index === 0 ? "Local Recording" : `Uploaded Video ${index + 1}`;
    case "external":
      return index === 0 ? "Supplementary Video" : `Video ${index + 1}`;
    default:
      return `Video ${index + 1}`;
  }
}

export interface YouTubeOEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

export async function fetchYouTubeOEmbed(url: string): Promise<YouTubeOEmbed | null> {
  const id = extractYouTubeId(url);
  if (!id) return null;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`
    );
    if (!res.ok) return null;
    return (await res.json()) as YouTubeOEmbed;
  } catch {
    return null;
  }
}
