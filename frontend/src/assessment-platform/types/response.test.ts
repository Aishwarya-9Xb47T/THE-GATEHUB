import { describe, it, expect } from "vitest";
import { createRendererResponse, toAttemptPayload } from "../types/response";

describe("response pipeline", () => {
  it("creates standardized renderer response", () => {
    const response = createRendererResponse("qv-1", "mcq-renderer", "choice-a", 1200, {
      confidence: 0.9,
      metadata: { source: "keyboard" },
    });

    expect(response.questionVersionId).toBe("qv-1");
    expect(response.rendererId).toBe("mcq-renderer");
    expect(response.answer).toBe("choice-a");
    expect(response.responseTimeMs).toBe(1200);
    expect(response.collectedAt).toBeTruthy();
  });

  it("maps to attempt engine payload", () => {
    const response = createRendererResponse("qv-2", "essay-renderer", "My answer", 5000);
    const payload = toAttemptPayload(response);

    expect(payload.questionVersionId).toBe("qv-2");
    expect(payload.answer).toBe("My answer");
    expect(payload.responseTimeMs).toBe(5000);
    expect(payload.metadata?.rendererId).toBe("essay-renderer");
  });
});
