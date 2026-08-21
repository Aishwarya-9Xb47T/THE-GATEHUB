import { canonicalClassroomApiAsset } from "./classroomAssetUrls";

export function googleSlidesPresentationId(url?: string | null): string | null {
  if (!url) return null;
  const match = String(url).match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

export function buildGoogleSlidesEmbedUrl(presentationId: string, slideNumber = 1): string {
  const id = String(presentationId || "").trim();
  const n = Math.max(1, Math.floor(Number(slideNumber) || 1));
  if (!id) return "";
  return `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/embed?start=false&loop=false&delayms=3000000&slide=${n}`;
}

export const googleSlidesEmbedUrl = buildGoogleSlidesEmbedUrl;

export function shouldUseGoogleSlidesEmbed(args: {
  sourceType?: string | null;
  visualSource?: string | null;
  googleSlidesId?: string | null;
  sourceUrl?: string | null;
}): boolean {
  if (args.visualSource === "original_pptx" || args.visualSource === "rendered_image") return false;
  const id = args.googleSlidesId || googleSlidesPresentationId(args.sourceUrl);
  if (!id) return false;
  return args.visualSource === "google_embed";
}

export function classroomOriginalPptxUrl(presentationId: string): string {
  return canonicalClassroomApiAsset(presentationId, "source", "original.pptx");
}

export function classroomSlideVisualUrls(presentationId: string, slideNumber: number): string[] {
  const n = Math.max(1, Math.floor(Number(slideNumber) || 1));
  const padded = String(n).padStart(3, "0");
  return [
    canonicalClassroomApiAsset(presentationId, "visuals", `${n}.svg`),
    canonicalClassroomApiAsset(presentationId, "visuals", `${n}.png`),
    canonicalClassroomApiAsset(presentationId, "renders", `slide-${padded}.svg`),
    canonicalClassroomApiAsset(presentationId, "renders", `slide-${padded}.png`),
  ];
}

export function isOriginalPresentationVisual(visual?: {
  type?: string;
  visualSource?: string;
} | null): boolean {
  if (!visual) return false;
  return visual.visualSource === "original_pptx"
    || visual.visualSource === "google_embed"
    || visual.visualSource === "rendered_image"
    || visual.type === "original_pptx"
    || visual.type === "google_slides"
    || visual.type === "rendered_image";
}

export function usesOriginalPresentationSource(
  sourceType?: string | null,
  visual?: { type?: string; visualSource?: string } | null,
): boolean {
  return sourceType === "powerpoint"
    || sourceType === "google_slides"
    || isOriginalPresentationVisual(visual);
}

