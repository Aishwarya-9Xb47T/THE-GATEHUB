import { describe, expect, it } from "@jest/globals";
import { failedImportStatus, presentationOwnershipAllowed, reconcileInFlightRender } from "../presentationAccess.js";

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

  it("does not auto-restart a fresh in-flight render from another instance", () => {
    const now = 1_000_000;
    expect(
      reconcileInFlightRender({
        status: "rendering",
        rendered: 0,
        total: 11,
        exclusiveRunning: false,
        updatedAtMs: now - 5_000,
        nowMs: now,
      }),
    ).toBe("keep_rendering");
    expect(
      reconcileInFlightRender({
        status: "rendering",
        rendered: 0,
        total: 11,
        exclusiveRunning: false,
        updatedAtMs: now - 9 * 60 * 1000,
        nowMs: now,
      }),
    ).toBe("mark_failed");
    expect(
      reconcileInFlightRender({
        status: "rendering",
        rendered: 11,
        total: 11,
        exclusiveRunning: false,
        updatedAtMs: now - 9 * 60 * 1000,
        nowMs: now,
      }),
    ).toBe("ready");
  });
});
