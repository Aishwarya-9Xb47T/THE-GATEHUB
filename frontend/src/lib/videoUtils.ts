/** MIME type from a video file URL extension. */
export function inferUploadVideoMime(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "avi":
      return "video/x-msvideo";
    case "mkv":
      return "video/x-matroska";
    case "m4v":
      return "video/mp4";
    case "ogv":
    case "ogg":
      return "video/ogg";
    default:
      return "video/mp4";
  }
}

/** Human-readable quality label from intrinsic video dimensions. */
export function formatVideoQualityLabel(width: number, height: number): string {
  if (!width || !height) return "Auto";
  const shortSide = Math.min(width, height);
  if (shortSide >= 2160) return "4K";
  if (shortSide >= 1440) return "1440p";
  if (shortSide >= 1080) return "1080p";
  if (shortSide >= 720) return "720p";
  if (shortSide >= 480) return "480p";
  if (shortSide >= 360) return "360p";
  if (shortSide >= 240) return "240p";
  return `${width}×${height}`;
}

/** YouTube-style quality tiers (height = max short-side pixels). */
export type VideoQualityId = "auto" | "2160" | "1440" | "1080" | "720" | "480" | "360" | "240";

export interface VideoQualityOption {
  id: VideoQualityId;
  label: string;
  /** 0 = Auto (use full source). Otherwise max short-side height in px. */
  height: number;
}

export const VIDEO_QUALITY_TIERS: readonly VideoQualityOption[] = [
  { id: "auto", label: "Auto", height: 0 },
  { id: "2160", label: "4K", height: 2160 },
  { id: "1440", label: "1440p", height: 1440 },
  { id: "1080", label: "1080p", height: 1080 },
  { id: "720", label: "720p", height: 720 },
  { id: "480", label: "480p", height: 480 },
  { id: "360", label: "360p", height: 360 },
  { id: "240", label: "240p", height: 240 },
] as const;

/** Qualities available for a progressive local file (Auto + tiers ≤ source). */
export function buildAvailableVideoQualities(sourceWidth: number, sourceHeight: number): VideoQualityOption[] {
  const shortSide = Math.min(sourceWidth || 0, sourceHeight || 0);
  if (!shortSide) return [{ id: "auto", label: "Auto", height: 0 }];

  const tiers = VIDEO_QUALITY_TIERS.filter((t) => t.id === "auto" || t.height <= shortSide);

  return [...tiers].sort((a, b) => {
    if (a.id === "auto") return -1;
    if (b.id === "auto") return 1;
    return b.height - a.height;
  });
}

export function resolveQualityCapPx(
  qualityId: VideoQualityId | string,
  sourceWidth: number,
  sourceHeight: number
): number | null {
  if (!qualityId || qualityId === "auto") return null;
  const shortSide = Math.min(sourceWidth || 0, sourceHeight || 0);
  const tier = VIDEO_QUALITY_TIERS.find((t) => t.id === qualityId);
  const cap = tier?.height || Number(qualityId) || 0;
  if (!cap || !shortSide) return null;
  return Math.min(cap, shortSide);
}

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const SPEED_STORAGE_KEY = "gatehub-video-playback-speed";
const QUALITY_STORAGE_KEY = "gatehub-video-quality";

export function readStoredPlaybackSpeed(): number {
  try {
    const raw = localStorage.getItem(SPEED_STORAGE_KEY);
    const value = raw ? Number(raw) : 1;
    return (PLAYBACK_SPEEDS as readonly number[]).includes(value) ? value : 1;
  } catch {
    return 1;
  }
}

export function storePlaybackSpeed(speed: number): void {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(speed));
  } catch {
    /* ignore */
  }
}

export function readStoredVideoQuality(): VideoQualityId {
  try {
    const raw = localStorage.getItem(QUALITY_STORAGE_KEY) as VideoQualityId | null;
    if (raw && (raw === "auto" || VIDEO_QUALITY_TIERS.some((t) => t.id === raw))) return raw;
    return "auto";
  } catch {
    return "auto";
  }
}

export function storeVideoQuality(qualityId: VideoQualityId | string): void {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, qualityId);
  } catch {
    /* ignore */
  }
}
