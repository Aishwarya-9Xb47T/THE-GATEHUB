import { describe, expect, it } from "vitest";
import {
  classroomImportErrorMessage,
  classroomImportPresentationId,
  parseClassroomImportNdjson,
  unwrapClassroomPresentation,
} from "./parseClassroomImportResponse";

describe("parseClassroomImportNdjson", () => {
  it("uses the final result line, not a progress line", () => {
    const text = [
      JSON.stringify({ type: "progress", percent: 8, message: "Saving PowerPoint…" }),
      JSON.stringify({ type: "result", success: true, presentationId: "cmt-real", overallStatus: "rendering", code: "CLASSROOM_RENDERING", slideCount: 11 }),
    ].join("\n");
    const payload = parseClassroomImportNdjson(text);
    expect(classroomImportPresentationId(payload)).toBe("cmt-real");
    expect(payload.overallStatus).toBe("rendering");
  });

  it("does not treat a failed import with error.presentationId as success", () => {
    const text = [
      JSON.stringify({ type: "progress", percent: 8 }),
      JSON.stringify({
        type: "result",
        success: false,
        presentationId: "cmt-deleted",
        error: { code: "CLASSROOM_B2_VERIFY_FAILED", message: "verify failed", presentationId: "cmt-deleted" },
      }),
    ].join("\n");
    const payload = parseClassroomImportNdjson(text);
    expect(payload.success).toBe(false);
    expect(classroomImportPresentationId(payload)).toBeNull();
    expect(classroomImportErrorMessage(payload)).toContain("CLASSROOM_B2_VERIFY_FAILED");
  });

  it("does not navigate using payload.id from an unrelated object", () => {
    expect(classroomImportPresentationId({ success: true, id: "slide-or-job" })).toBeNull();
    expect(classroomImportPresentationId({ success: true, presentation: { id: "cmt-nested" } })).toBe("cmt-nested");
  });
});

describe("unwrapClassroomPresentation", () => {
  it("accepts a direct presentation payload with slides", () => {
    const unwrapped = unwrapClassroomPresentation({ id: "cmt1", title: "k", slides: [{ id: "s1" }] });
    expect(unwrapped?.id).toBe("cmt1");
    expect(unwrapped?.slides).toHaveLength(1);
  });

  it("rejects payloads without slides so the editor does not crash into not-found", () => {
    expect(unwrapClassroomPresentation({ id: "cmt1" })).toBeNull();
    expect(unwrapClassroomPresentation({ success: true })).toBeNull();
  });
});
