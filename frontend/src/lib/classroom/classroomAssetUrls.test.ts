import { describe, expect, it } from "vitest";
import {
  canonicalClassroomApiAsset,
  classroomAssetErrorFromBody,
  classroomRenderedImageUrl,
  classroomThumbnailCandidateUrls,
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

  it("keeps canonical API SVG URLs on the authenticated asset route", () => {
    const urls = classroomVisualFetchUrls(
      "/api/classroom-studio/presentations/abc/assets/renders/slide-001.svg",
      "abc",
      "svg",
    );
    expect(urls).toEqual([canonicalClassroomApiAsset("abc", "renders", "slide-001.svg")]);
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

  it("builds thumbnail candidates from the visual cache first", () => {
    expect(classroomThumbnailCandidateUrls("abc", 2)[0]).toBe(
      "/api/classroom-studio/presentations/abc/assets/visuals/2.svg",
    );
  });

  it("builds the canonical PNG classroom visual URL from slide number", () => {
    expect(classroomRenderedImageUrl("abc", 1)).toBe(
      "/api/classroom-studio/presentations/abc/assets/renders/slide-001.png",
    );
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

  it("parses regenerate error bodies for instructor-safe codes", () => {
    expect(
      classroomAssetErrorFromBody({
        error: { code: "CLASSROOM_SOURCE_NOT_FOUND", message: "The original PowerPoint file was not found in storage" },
      }),
    ).toEqual({
      code: "CLASSROOM_SOURCE_NOT_FOUND",
      message: "The original PowerPoint file was not found in storage",
    });
  });

  it("cleans Office auto-generated alt text", () => {
    const raw = "A picture containing text, logo, font, graphics&#xA;&#xA;Description automatically generated";
    expect(isOfficeGeneratedAlt(raw)).toBe(true);
    expect(decodeSlideAltText(raw)).not.toContain("&#x");
  });
});
