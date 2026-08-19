import { describe, expect, it } from "@jest/globals";
import { failedImportStatus, presentationOwnershipAllowed } from "../presentationAccess.js";

describe("presentation ownership", () => {
  it("allows the creating instructor to GET the presentation", () => {
    expect(
      presentationOwnershipAllowed({
        presentationOwnerId: "inst-1",
        requesterId: "inst-1",
      }),
    ).toEqual({ allowed: true, reason: "ok" });
  });

  it("rejects a different user", () => {
    expect(
      presentationOwnershipAllowed({
        presentationOwnerId: "inst-1",
        requesterId: "other",
      }),
    ).toEqual({ allowed: false, reason: "owner_mismatch" });
  });
});

describe("failed import status", () => {
  it("keeps a failed source upload as import_failed, not deleted/not-found", () => {
    expect(failedImportStatus({ sourceStored: false })).toBe("import_failed");
    expect(failedImportStatus({ sourceStored: false, code: "CLASSROOM_B2_VERIFY_FAILED" })).toBe("import_failed");
  });

  it("keeps a render failure as render_failed so the editor can still open", () => {
    expect(failedImportStatus({ sourceStored: true, code: "CLASSROOM_RENDER_FAILED" })).toBe("render_failed");
  });
});
