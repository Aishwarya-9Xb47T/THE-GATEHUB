import { describe, it, expect } from "vitest";
import {
  createEmptyOfflineState,
  queuePendingSubmission,
  resolveSyncConflicts,
} from "../services/offlineCache";
import { createRendererResponse } from "../types/response";

describe("offlineCache", () => {
  it("queues pending submissions", () => {
    const state = createEmptyOfflineState("att-1", "dep-1");
    const response = createRendererResponse("qv-1", "mcq", "a", 100);
    const updated = queuePendingSubmission(state, response);

    expect(updated.pendingSubmissions).toHaveLength(1);
    expect(updated.drafts["qv-1"]).toEqual(response);
  });

  it("resolves sync conflicts", () => {
    const local = [
      createRendererResponse("qv-1", "mcq", "a", 100),
      createRendererResponse("qv-2", "mcq", "b", 200),
    ];
    const { accepted, conflicts } = resolveSyncConflicts(local, ["qv-1"]);

    expect(accepted).toHaveLength(2);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.questionVersionId).toBe("qv-2");
  });
});
