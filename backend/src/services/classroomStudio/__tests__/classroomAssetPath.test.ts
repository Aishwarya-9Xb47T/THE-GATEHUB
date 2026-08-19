import { describe, expect, it } from "@jest/globals";
import {
  CLASSROOM_SOURCE_REST,
  PPTX_MIME,
  SVG_MIME,
  computeClassroomRenderProgress,
  slideVisualIsReady,
  canonicalSlideSvgRelative,
  getClassroomSourceKey,
  canonicalSourceRelative,
  canonicalExportPdfRelative,
  parseClassroomAssetFilename,
  sanitizeClassroomAssetRest,
  classroomStorageRelatives,
} from "../classroomAssetPath.js";
import { classroomAssetLookupRelatives } from "../classroomAssetUrls.js";

describe("classroomAssetPath", () => {
  it("rejects path traversal", () => {
    expect(sanitizeClassroomAssetRest("../secrets.pptx")).toBeNull();
    expect(sanitizeClassroomAssetRest("renders/../../x.svg")).toBeNull();
  });

  it("uses canonical classroom keys for PPTX and SVG", () => {
    expect(getClassroomSourceKey("pres-1")).toBe("uploads/classroom/pres-1/source/original.pptx");
    expect(canonicalSourceRelative("pres-1")).toBe("classroom/pres-1/source/original.pptx");
    expect(canonicalExportPdfRelative("pres-1")).toBe("classroom/pres-1/source/export.pdf");
    expect(canonicalSlideSvgRelative("pres-1", 2)).toBe("classroom/pres-1/renders/slide-002.svg");
    expect(classroomStorageRelatives("pres-1", CLASSROOM_SOURCE_REST)).toEqual([
      "classroom/pres-1/source/original.pptx",
      "classroom-studio/pres-1/source/original.pptx",
    ]);
  });

  it("parses authenticated asset filenames onto the canonical rest path", () => {
    expect(parseClassroomAssetFilename("source", "original.pptx")).toEqual({
      rest: "source/original.pptx",
      mime: PPTX_MIME,
    });
    expect(parseClassroomAssetFilename("renders", "slide-2.svg")).toEqual({
      rest: "renders/slide-002.svg",
      mime: SVG_MIME,
    });
    expect(parseClassroomAssetFilename("renders", "../slide-001.svg")).toBeNull();
    expect(parseClassroomAssetFilename("source", "notes.pdf")).toBeNull();
  });

  it("computes render progress from persisted slide visuals", () => {
    const progress = computeClassroomRenderProgress([
      { order: 1, content: { visual: { type: "svg", availability: "available" } } },
      { order: 2, content: { visual: { type: "pptx", availability: "missing" } } },
      { order: 3, content: { visual: { type: "pptx", availability: "missing" } } },
    ]);
    expect(slideVisualIsReady({ visual: { type: "svg", availability: "available" } })).toBe(true);
    expect(progress).toEqual({ rendered: 1, total: 3, currentSlide: 2 });
  });
});
