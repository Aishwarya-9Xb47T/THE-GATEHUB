import { describe, expect, it } from "vitest";
import {
  classroomVisualFetchUrls,
  classroomVisualUrlCandidates,
  decodeSlideAltText,
  isOfficeGeneratedAlt,
  isSvgMarkup,
  rewriteClassroomAssetRef,
  toClassroomApiAssetUrl,
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

  it("does not treat a PowerPoint file as an SVG candidate", () => {
    const svgUrls = classroomVisualFetchUrls(
      "/uploads/classroom/abc/renders/slide-002.svg",
      "abc",
      "svg",
    );
    expect(svgUrls.every((url) => /\.svg($|\?)/i.test(url) || url.includes("/assets/renders/"))).toBe(true);
    expect(svgUrls.some((url) => url.endsWith(".pptx"))).toBe(false);
    expect(svgUrls[0]).toBe("/api/classroom-studio/presentations/abc/assets/renders/slide-002.svg");
  });

  it("prefers the authenticated classroom asset API for PPTX", () => {
    const urls = classroomVisualFetchUrls("asset://source/original.pptx", "abc", "pptx");
    expect(urls[0]).toBe("/api/classroom-studio/presentations/abc/assets/source/original.pptx");
    expect(toClassroomApiAssetUrl("/uploads/classroom-studio/abc/source.pptx")).toBe(
      "/api/classroom-studio/presentations/abc/assets/source.pptx",
    );
  });

  it("rejects non-SVG payloads", () => {
    expect(isSvgMarkup("<svg xmlns='http://www.w3.org/2000/svg'></svg>")).toBe(true);
    expect(isSvgMarkup('{"success":false}')).toBe(false);
    expect(isSvgMarkup("PK\u0003\u0004")).toBe(false);
  });

  it("cleans Office auto-generated alt text", () => {
    const raw = "A picture containing text, logo, font, graphics&#xA;&#xA;Description automatically generated";
    expect(isOfficeGeneratedAlt(raw)).toBe(true);
    expect(decodeSlideAltText(raw)).not.toContain("&#x");
  });
});
