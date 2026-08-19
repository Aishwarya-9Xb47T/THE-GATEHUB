import { describe, expect, it } from "@jest/globals";
import { AppError } from "../../../middlewares/errorHandler.js";
import { getClassroomSourceKey } from "../classroomAssetPath.js";
import {
  isCompatiblePptxContentType,
  isValidPptxBuffer,
  persistPptxBuffer,
  storeClassroomSourcePptx,
} from "../classroomSourceResolver.js";

describe("classroom PPTX source storage", () => {
  it("uses one canonical B2 key for original.pptx", () => {
    expect(getClassroomSourceKey("abc123")).toBe("uploads/classroom/abc123/source/original.pptx");
  });

  it("accepts legitimate PPTX MIME values including octet-stream", () => {
    expect(isCompatiblePptxContentType("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe(true);
    expect(isCompatiblePptxContentType("application/octet-stream")).toBe(true);
    expect(isCompatiblePptxContentType("application/zip")).toBe(true);
    expect(isCompatiblePptxContentType("application/json")).toBe(false);
  });

  it("rejects corrupted PPTX before any B2 upload", async () => {
    await expect(storeClassroomSourcePptx("pres-1", Buffer.from("not-a-pptx"))).rejects.toBeInstanceOf(AppError);
    try {
      await persistPptxBuffer("pres-1", Buffer.from("<html>nope</html>"));
      throw new Error("expected CLASSROOM_PPTX_INVALID");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).details?.code).toBe("CLASSROOM_PPTX_INVALID");
      expect((error as AppError).message).not.toMatch(/B2 upload verification failed/);
    }
  });

  it("treats ZIP magic as a valid PPTX envelope", () => {
    expect(isValidPptxBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe(true);
    expect(isValidPptxBuffer(Buffer.alloc(0))).toBe(false);
    expect(isValidPptxBuffer(Buffer.from("{}"))).toBe(false);
  });
});
