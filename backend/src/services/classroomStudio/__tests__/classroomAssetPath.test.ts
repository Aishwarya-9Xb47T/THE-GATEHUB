import { describe, expect, it } from "@jest/globals";
import { classroomStorageRelatives, sanitizeClassroomAssetRest } from "../classroomAssetPath.js";
import { classroomAssetLookupRelatives } from "../classroomAssetUrls.js";

describe("classroomAssetPath", () => {
  it("rejects path traversal", () => {
    expect(sanitizeClassroomAssetRest("../secrets.pptx")).toBeNull();
    expect(sanitizeClassroomAssetRest("renders/../../x.svg")).toBeNull();
  });

  it("keeps slide visuals under the presentation prefix", () => {
    expect(sanitizeClassroomAssetRest("renders/slide-002.svg")).toBe("renders/slide-002.svg");
    expect(classroomStorageRelatives("pres-1", "source/original.pptx")).toEqual([
      "classroom/pres-1/source/original.pptx",
      "classroom-studio/pres-1/source/original.pptx",
    ]);
  });

  it("looks up padded and unpadded slide SVG keys", () => {
    const keys = classroomAssetLookupRelatives("classroom/pres-1/renders/slide-2.svg");
    expect(keys).toContain("classroom/pres-1/renders/slide-002.svg");
    expect(keys).toContain("classroom-studio/pres-1/renders/slide-2.svg");
  });
});
