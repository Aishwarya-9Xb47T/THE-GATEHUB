import { describe, it, expect, beforeEach } from "vitest";
import { bootstrapAssessmentPlatform } from "../bootstrap";
import { getOverlay, listOverlaysForMode } from "../registry/overlayRegistry";

describe("overlayRegistry", () => {
  beforeEach(() => {
    bootstrapAssessmentPlatform();
  });

  it("registers learning overlay plugins", () => {
    expect(getOverlay("ai_hint")).toBeDefined();
    expect(getOverlay("calculator")).toBeDefined();
    expect(getOverlay("bookmark")).toBeDefined();
  });

  it("filters overlays by assessment mode", () => {
    const practice = listOverlaysForMode("practice");
    expect(practice.some((o) => o.id === "ai_hint")).toBe(true);

    const live = listOverlaysForMode("live_quiz");
    expect(live.some((o) => o.id === "calculator")).toBe(false);
  });
});
