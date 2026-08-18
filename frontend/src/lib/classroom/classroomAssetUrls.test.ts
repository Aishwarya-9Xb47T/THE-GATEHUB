import { describe, expect, it } from "vitest";
import {
  canonicalClassroomApiAsset,
  classroomVisualFetchUrls,
  decodeSlideAltText,
  isCompatiblePptxContentType,
  isCompatibleSvgContentType,
  isOfficeGeneratedAlt,
  isSvgMarkup,
  rewriteClassroomAssetRef,
} from "./classroomAssetUrls";

describe("classroomAssetUrls", () => {
  it("rewrites asset:// PowerPoint sources onto the canonical classroom prefix", () => {
    expect(rewriteClassroomAssetRef("asset://source/original.pptx", "abc")).toBe(
      "/uploads/classroom/abc/source/original.pptx",
    );
  });

  it("requests the authenticated SVG asset API for a stored visual", () => {
    const urls = classroomVisualFetchUrls(
      "/uploads/classroom/abc/renders/slide-002.svg",
      "abc",
      "svg",
    );
    expect(urls).toEqual([canonicalClassroomApiAsset("abc", "renders", "slide-002.svg")]);
  });

  it("requests the authenticated original PPTX for native fallback", () => {
    const urls = classroomVisualFetchUrls("asset://source/original.pptx", "abc", "pptx");
    expect(urls).toEqual([canonicalClassroomApiAsset("abc", "source", "original.pptx")]);
  });

  it("validates SVG and PPTX payloads / content types", () => {
    expect(isSvgMarkup("<svg xmlns='http://www.w3.org/2000/svg'></svg>")).toBe(true);
    expect(isSvgMarkup('{"success":false}')).toBe(false);
    expect(isCompatibleSvgContentType("image/svg+xml; charset=utf-8")).toBe(true);
    expect(isCompatibleSvgContentType("application/json")).toBe(false);
    expect(isCompatiblePptxContentType("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe(true);
    expect(isCompatiblePptxContentType("text/html")).toBe(false);
    expect(isCompatibleSvgContentType("application/json")).toBe(false);
    expect(isCompatiblePptxContentType("application/json")).toBe(false);
  });

  it("requests a stable API URL after refresh-style metadata reload", () => {
    const urls = classroomVisualFetchUrls(
      "/uploads/classroom/cmsy6g8sr00b7owbuj0gvy1rb/renders/slide-002.svg",
      "cmsy6g8sr00b7owbuj0gvy1rb",
      "svg",
    );
    expect(urls).toEqual([
      "/api/classroom-studio/presentations/cmsy6g8sr00b7owbuj0gvy1rb/assets/renders/slide-002.svg",
    ]);
  });

  it("cleans Office auto-generated alt text", () => {
    const raw = "A picture containing text, logo, font, graphics&#xA;&#xA;Description automatically generated";
    expect(isOfficeGeneratedAlt(raw)).toBe(true);
    expect(decodeSlideAltText(raw)).not.toContain("&#x");
  });
});
