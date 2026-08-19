import { describe, expect, it } from "@jest/globals";
import { parseContentRangeTotal } from "../b2StorageService.js";
import { getClassroomSourceKey } from "../classroomStudio/classroomAssetPath.js";

describe("B2 object size parsing", () => {
  it("parses Content-Range totals from a 1-byte probe", () => {
    expect(parseContentRangeTotal("bytes 0-0/17605178")).toBe(17605178);
    expect(parseContentRangeTotal("bytes 0-0/8")).toBe(8);
    expect(parseContentRangeTotal(undefined)).toBeUndefined();
  });

  it("uses one canonical classroom source key for upload, verify, resolver, and renderer", () => {
    const key = getClassroomSourceKey("pres-1");
    expect(key).toBe("uploads/classroom/pres-1/source/original.pptx");
    expect(key).toBe(`uploads/classroom/pres-1/source/original.pptx`);
  });
});
