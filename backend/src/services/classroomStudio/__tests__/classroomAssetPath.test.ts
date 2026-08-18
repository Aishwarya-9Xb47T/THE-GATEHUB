import { describe, expect, it } from "@jest/globals";
import {
  CLASSROOM_SOURCE_REST,
  PPTX_MIME,
  SVG_MIME,
  canonicalSlideSvgRelative,
  canonicalSourceRelative,
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
    expect(canonicalSourceRelative("pres-1")).toBe("classroom/pres-1/source/original.pptx");
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

  it("looks up padded and unpadded slide SVG keys", () => {
    const keys = classroomAssetLookupRelatives("classroom/pres-1/renders/slide-2.svg");
    expect(keys).toContain("classroom/pres-1/renders/slide-002.svg");
    expect(keys).toContain("classroom-studio/pres-1/renders/slide-2.svg");
  });
});
