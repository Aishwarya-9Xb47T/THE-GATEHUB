import { describe, expect, it } from "vitest";
import {
  buildGoogleSlidesEmbedUrl,
  googleSlidesEmbedUrl,
  googleSlidesPresentationId,
  classroomSlideVisualUrls,
  isOriginalPresentationVisual,
  usesOriginalPresentationSource,
  shouldUseGoogleSlidesEmbed,
} from "./originalPresentationUrls";

describe("originalPresentationUrls", () => {
  it("builds a Google Slides embed URL for a specific slide", () => {
    expect(googleSlidesPresentationId("https://docs.google.com/presentation/d/abc123/edit?usp=sharing")).toBe("abc123");
    expect(buildGoogleSlidesEmbedUrl("abc123", 1)).toContain("/presentation/d/abc123/embed");
    expect(buildGoogleSlidesEmbedUrl("abc123", 1)).toContain("slide=1");
    expect(googleSlidesEmbedUrl("abc123", 2)).toContain("/presentation/d/abc123/embed");
    expect(googleSlidesEmbedUrl("abc123", 2)).toContain("slide=2");
    expect(buildGoogleSlidesEmbedUrl("abc123", 10)).toContain("slide=10");
    expect(buildGoogleSlidesEmbedUrl("abc123", 10)).not.toMatch(/\?.*\?/);
    expect(buildGoogleSlidesEmbedUrl("abc123", 10).split("?").length).toBe(2);
  });

  it("uses Google embed for public google_slides and PPTX only for the private fallback", () => {
    expect(shouldUseGoogleSlidesEmbed({
      sourceType: "google_slides",
      visualSource: "google_embed",
      sourceUrl: "https://docs.google.com/presentation/d/abc123/edit",
    })).toBe(true);
    expect(shouldUseGoogleSlidesEmbed({
      sourceType: "google_slides",
      sourceUrl: "https://docs.google.com/presentation/d/abc123/edit",
    })).toBe(true);
    expect(shouldUseGoogleSlidesEmbed({
      sourceType: "google_slides",
      visualSource: "original_pptx",
      sourceUrl: "https://docs.google.com/presentation/d/abc123/edit",
    })).toBe(false);
    expect(shouldUseGoogleSlidesEmbed({
      sourceType: "powerpoint",
      visualSource: "original_pptx",
    })).toBe(false);
  });

  it("recognizes original visual sources", () => {
    expect(isOriginalPresentationVisual({ type: "original_pptx", visualSource: "original_pptx" })).toBe(true);
    expect(isOriginalPresentationVisual({ type: "google_slides", visualSource: "google_embed" })).toBe(true);
    expect(isOriginalPresentationVisual({ type: "image" })).toBe(false);
    expect(usesOriginalPresentationSource("powerpoint", { type: "image" })).toBe(true);
    expect(usesOriginalPresentationSource("google_slides")).toBe(true);
  });

  it("builds visual-cache URLs without using PDF assets", () => {
    expect(classroomSlideVisualUrls("pres-1", 2)).toEqual([
      "/api/classroom-studio/presentations/pres-1/assets/visuals/2.svg",
      "/api/classroom-studio/presentations/pres-1/assets/visuals/2.png",
      "/api/classroom-studio/presentations/pres-1/assets/renders/slide-002.svg",
      "/api/classroom-studio/presentations/pres-1/assets/renders/slide-002.png",
    ]);
  });
});
