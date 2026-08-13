import { resolveCourseMediaUrl } from "@/lib/courseMediaUrls";

export interface VideoCaptionTrack {
  language: string;
  label: string;
  url: string;
  default?: boolean;
}

export const CAPTION_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "te", label: "Telugu" },
  { code: "ta", label: "Tamil" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "bn", label: "Bengali" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ru", label: "Russian" },
] as const;

const CAPTION_PREF_KEY = "gatehub-video-caption-language";

export function parseVideoCaptions(raw: unknown): VideoCaptionTrack[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is VideoCaptionTrack => {
      if (!item || typeof item !== "object") return false;
      const t = item as VideoCaptionTrack;
      return Boolean(t.language && t.label && t.url);
    })
    .map((t) => ({
      language: String(t.language),
      label: String(t.label),
      url: String(t.url),
      default: Boolean(t.default),
    }));
}

export function resolveCaptionTrackUrl(url: string): string {
  return resolveCourseMediaUrl(url) || url;
}

export function readStoredCaptionLanguage(): string {
  try {
    return localStorage.getItem(CAPTION_PREF_KEY) || "off";
  } catch {
    return "off";
  }
}

export function storeCaptionLanguage(language: string): void {
  try {
    localStorage.setItem(CAPTION_PREF_KEY, language);
  } catch {
    /* ignore */
  }
}

/** Convert SRT subtitle content to WebVTT for HTML5 video tracks. */
export function srtToVtt(srt: string): string {
  const normalized = srt.replace(/\r/g, "").trim();
  const blocks = normalized.split(/\n\s*\n/);
  const cues: string[] = ["WEBVTT", ""];

  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    if (lines.length < 2) continue;

    let timeLineIdx = 0;
    if (/^\d+$/.test(lines[0].trim())) timeLineIdx = 1;
    const timeLine = lines[timeLineIdx];
    if (!timeLine?.includes("-->")) continue;

    const timing = timeLine
      .replace(/,/g, ".")
      .replace(/\s*-->\s*/, " --> ");
    const text = lines.slice(timeLineIdx + 1).join("\n");
    cues.push(timing, text, "");
  }

  return cues.join("\n");
}

export async function uploadCaptionFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  let blob: Blob = file;
  let filename = file.name;

  if (ext === "srt") {
    const text = await file.text();
    blob = new Blob([srtToVtt(text)], { type: "text/vtt" });
    filename = file.name.replace(/\.srt$/i, ".vtt");
  }

  const formData = new FormData();
  formData.append("file", blob, filename);

  const token = localStorage.getItem("lms_token");
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || "Caption upload failed");
  return json.url as string;
}
