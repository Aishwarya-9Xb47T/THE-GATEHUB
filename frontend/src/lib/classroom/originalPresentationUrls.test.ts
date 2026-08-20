import { describe, expect, it } from "vitest";
import { googleSlidesEmbedUrl, googleSlidesPresentationId, isOriginalPresentationVisual, usesOriginalPresentationSource } from "./originalPresentationUrls";

describe("originalPresentationUrls", () => {
  it("builds a Google Slides embed URL for a specific slide", () => {
    expect(googleSlidesPresentationId("https://docs.google.com/presentation/d/abc123/edit?usp=sharing")).toBe("abc123");
    expect(googleSlidesEmbedUrl("abc123", 2)).toContain("/presentation/d/abc123/embed");
    expect(googleSlidesEmbedUrl("abc123", 2)).toContain("slide=2");
  });

  it("recognizes original visual sources", () => {
    expect(isOriginalPresentationVisual({ type: "original_pptx", visualSource: "original_pptx" })).toBe(true);
    expect(isOriginalPresentationVisual({ type: "google_slides", visualSource: "google_embed" })).toBe(true);
    expect(isOriginalPresentationVisual({ type: "image" })).toBe(false);
    expect(usesOriginalPresentationSource("powerpoint", { type: "image" })).toBe(true);
    expect(usesOriginalPresentationSource("google_slides")).toBe(true);
  });
});
