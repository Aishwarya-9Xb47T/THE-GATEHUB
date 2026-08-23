import { describe, expect, it } from "@jest/globals";
import { parseContentRangeTotal, interpretUploadVerification } from "../b2StorageService.js";
import { getClassroomSourceKey } from "../classroomStudio/classroomAssetPath.js";

describe("B2 upload verification after PutObject", () => {
  it("does not treat HEAD 403 as a missing object when PutObject succeeded", () => {
    expect(
      interpretUploadVerification({
        putSucceeded: true,
        putBytes: 8187356,
        headStatus: 403,
        readableViaGetOrList: false,
      })
    ).toEqual({ accept: true, missing: false, permissionDenied: true });
  });

  it("accepts the object when GetObject/list can read it", () => {
    expect(
      interpretUploadVerification({
        putSucceeded: true,
        putBytes: 8187356,
        headStatus: 403,
        readableViaGetOrList: true,
      })
    ).toEqual({ accept: true, missing: false, permissionDenied: false });
  });

  it("rejects a true missing object after upload", () => {
    expect(
      interpretUploadVerification({
        putSucceeded: true,
        putBytes: 8187356,
        headStatus: 404,
        readableViaGetOrList: false,
      })
    ).toEqual({ accept: false, missing: true, permissionDenied: false });
  });
});

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
