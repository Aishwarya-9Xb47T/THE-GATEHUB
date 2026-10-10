import { describe, expect, it } from "vitest";
import {
  deriveCourseThumbnailCandidate,
  resolveCourseThumbnailUrl,
  resolveCourseBannerUrl,
  courseImageLoadedSet,
  preloadCourseImages,
} from "./courseBanner";

describe("course banner & thumbnail optimization", () => {
  it("derives /uploads/banners/thumbs/thumb-* from raw /uploads/banners/* path", () => {
    const raw = "/uploads/banners/1b406ad0-f47b-41bf-95ec-959a1354b3e9.jpg";
    const derived = deriveCourseThumbnailCandidate(raw);
    expect(derived).toBe("/uploads/banners/thumbs/thumb-1b406ad0-f47b-41bf-95ec-959a1354b3e9.jpg");
  });

  it("does not re-prefix already thumbnailed banners", () => {
    const thumb = "/uploads/banners/thumbs/thumb-1b406ad0-f47b-41bf-95ec-959a1354b3e9.jpg";
    expect(deriveCourseThumbnailCandidate(thumb)).toBeNull();
  });

  it("returns null for non-banner paths", () => {
    expect(deriveCourseThumbnailCandidate("https://example.com/img.jpg")).toBeNull();
    expect(deriveCourseThumbnailCandidate("/uploads/videos/lec.mp4")).toBeNull();
    expect(deriveCourseThumbnailCandidate(null)).toBeNull();
  });

  it("resolveCourseThumbnailUrl prefers the derived thumbnail path", () => {
    const raw = "/uploads/banners/1b406ad0-f47b-41bf-95ec-959a1354b3e9.jpg";
    const resolved = resolveCourseThumbnailUrl(raw);
    expect(resolved).toContain("/uploads/banners/thumbs/thumb-1b406ad0-f47b-41bf-95ec-959a1354b3e9.jpg");
  });

  it("maintains global memory set of loaded images", () => {
    courseImageLoadedSet.add("/uploads/banners/thumbs/thumb-test.jpg");
    expect(courseImageLoadedSet.has("/uploads/banners/thumbs/thumb-test.jpg")).toBe(true);
    expect(courseImageLoadedSet.has("/uploads/banners/other.jpg")).toBe(false);
  });

  it("handles empty or null gracefully in preloadCourseImages", () => {
    expect(() => preloadCourseImages([null, undefined, ""])).not.toThrow();
  });
});
