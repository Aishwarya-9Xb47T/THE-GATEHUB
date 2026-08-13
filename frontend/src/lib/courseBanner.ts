import { resolveCourseMediaUrl } from "@/lib/courseMediaUrls";

/** Canonical 16:9 banner ratio used across all course cards. */
export const COURSE_BANNER_ASPECT = 16 / 9;

export function resolveCourseBannerUrl(src?: string | null): string | null {
  if (!src?.trim()) return null;
  // Single canonical path for banner/media URLs, including upload auth token handling.
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

export function placeholderHueFromSeed(seed: string): number {
  return seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
}
