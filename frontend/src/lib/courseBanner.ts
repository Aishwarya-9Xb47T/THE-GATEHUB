import { resolveCourseMediaUrl } from "@/lib/courseMediaUrls";

/** Canonical 16:9 banner ratio used across all course cards. */
export const COURSE_BANNER_ASPECT = 16 / 9;

/** Global in-memory cache of already-loaded / decoded images across page transitions */
export const courseImageLoadedSet = new Set<string>();

/**
 * Derive an optimized thumbnail candidate path from a full banner URL.
 * e.g., /uploads/banners/<uuid>.jpg -> /uploads/banners/thumbs/thumb-<uuid>.jpg
 */
export function deriveCourseThumbnailCandidate(url?: string | null): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.includes("/uploads/banners/") && !trimmed.includes("/thumbs/thumb-")) {
    return trimmed.replace(/\/uploads\/banners\/([^/?#]+)/, "/uploads/banners/thumbs/thumb-$1");
  }
  return null;
}

export function resolveCourseBannerUrl(src?: string | null): string | null {
  if (!src?.trim()) return null;
  // Single canonical path for banner/media URLs, including upload auth token handling.
  return resolveCourseMediaUrl(src);
}

/**
 * Resolves a thumbnail URL, attempting the optimized thumbnail derivative first if applicable.
 */
export function resolveCourseThumbnailUrl(src?: string | null): string | null {
  if (!src?.trim()) return null;
  const thumbCandidate = deriveCourseThumbnailCandidate(src);
  if (thumbCandidate) {
    const resolvedThumb = resolveCourseMediaUrl(thumbCandidate);
    if (resolvedThumb) return resolvedThumb;
  }
  return resolveCourseMediaUrl(src);
}

export function pickCourseBannerSrc(options: {
  bannerUrl?: string | null;
  thumbnailUrl?: string | null;
  thumbnail?: string | null;
}): string | null {
  for (const candidate of [options.bannerUrl, options.thumbnailUrl, options.thumbnail]) {
    const resolved = resolveCourseBannerUrl(candidate);
    if (resolved) return resolved;
  }
  return null;
}

/** Preload critical course card images eagerly into browser cache */
export function preloadCourseImages(urls: (string | null | undefined)[]) {
  if (typeof window === "undefined") return;
  for (const raw of urls) {
    if (!raw) continue;
    // Preload both derived thumb and raw banner if applicable
    const candidates = [deriveCourseThumbnailCandidate(raw), raw];
    for (const cand of candidates) {
      if (!cand) continue;
      const resolved = resolveCourseBannerUrl(cand);
      if (!resolved || courseImageLoadedSet.has(resolved)) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = resolved;
      img.onload = () => {
        courseImageLoadedSet.add(resolved);
      };
    }
  }
}

export function placeholderHueFromSeed(seed: string): number {
  return seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
}
