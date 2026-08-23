import { describe, expect, it } from "vitest";
import { relativeUploadPathFromRef, architectUploadStorageRefs } from "../videoAssignmentEngine.js";
import { emitVideosTex } from "../../luProject/luCourseRenderer.js";

describe("canonical video storage key contract", () => {
  it("keeps videos/ prefix from upload URL", () => {
    expect(relativeUploadPathFromRef("/uploads/videos/abc-uuid.mp4")).toBe("videos/abc-uuid.mp4");
  });

  it("architectUploadStorageRefs prefers durable videos/ key", () => {
    const refs = architectUploadStorageRefs({
      file: "videos/abc-uuid.mp4",
      url: "/uploads/videos/abc-uuid.mp4",
    });
    expect(refs[0]).toBe("/uploads/videos/abc-uuid.mp4");
    expect(refs).toContain("/uploads/abc-uuid.mp4");
  });

  it("emitVideosTex preserves durable relative path (no basename strip)", () => {
    const tex = emitVideosTex([
      {
        type: "upload",
        file: "videos/abc-uuid.mp4",
        url: "/uploads/videos/abc-uuid.mp4",
        title: "Lecture",
      },
    ]);
    expect(tex).toContain("file={videos/abc-uuid.mp4}");
    expect(tex).not.toMatch(/file=\{abc-uuid\.mp4\}/);
  });
});
