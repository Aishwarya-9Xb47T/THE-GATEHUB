import { describe, expect, it } from "vitest";
import {
  classroomVisualUrlCandidates,
  decodeSlideAltText,
  isOfficeGeneratedAlt,
  rewriteClassroomAssetRef,
} from "./classroomAssetUrls";

describe("classroomAssetUrls", () => {
  it("rewrites asset:// PowerPoint sources", () => {
    expect(rewriteClassroomAssetRef("asset://source/original.pptx", "abc")).toBe(
      "/uploads/classroom/abc/source/original.pptx",
    );
  });

  it("tries classroom-studio when the current prefix 404s", () => {
    const urls = classroomVisualUrlCandidates("/uploads/classroom/abc/source/original.pptx", "abc");
    expect(urls[0]).toBe("/uploads/classroom/abc/source/original.pptx");
    expect(urls).toContain("/uploads/classroom-studio/abc/source/original.pptx");
  });

  it("cleans Office auto-generated alt text", () => {
    const raw = "A picture containing text, logo, font, graphics&#xA;&#xA;Description automatically generated";
    expect(isOfficeGeneratedAlt(raw)).toBe(true);
    expect(decodeSlideAltText(raw)).not.toContain("&#x");
  });
});
