import { canonicalClassroomApiAsset } from "./classroomAssetUrls";

export function googleSlidesPresentationId(url?: string | null): string | null {
  if (!url) return null;
  const match = String(url).match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

export function googleSlidesEmbedUrl(presentationId: string, slideNumber: number): string {
  const n = Math.max(1, Math.floor(Number(slideNumber) || 1));
  return `https://docs.google.com/presentation/d/${encodeURIComponent(presentationId)}/embed?start=false&loop=false&delayms=600000&rm=minimal&slide=${n}`;
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
    || visual.type === "original_pptx"
    || visual.type === "google_slides";
}

export function usesOriginalPresentationSource(
  sourceType?: string | null,
  visual?: { type?: string; visualSource?: string } | null,
): boolean {
  return sourceType === "powerpoint"
    || sourceType === "google_slides"
    || isOriginalPresentationVisual(visual);
}
