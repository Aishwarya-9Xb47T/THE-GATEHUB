import { describe, it, expect } from "vitest";
import { getModeConfig, mergeModeSettings, MODE_PRESETS } from "../types/modeConfig";

describe("modePresets", () => {
  it("defines all assessment modes", () => {
    expect(Object.keys(MODE_PRESETS)).toHaveLength(11);
  });

  it("practice mode allows skip and review", () => {
    const config = getModeConfig("practice");
    expect(config.allowSkip).toBe(true);
    expect(config.allowReview).toBe(true);
    expect(config.offlineCapable).toBe(true);
  });

  it("live quiz disables navigation", () => {
    const config = getModeConfig("live_quiz");
    expect(config.showNavigation).toBe(false);
    expect(config.gamificationOverlay).toBe(true);
  });

  it("merges mode settings with overrides", () => {
    const settings = mergeModeSettings("homework", { maxAttempts: 5 });
    expect(settings.maxAttempts).toBe(5);
    expect(settings.showExplanations).toBe(true);
  });
});
