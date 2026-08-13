import { describe, it, expect } from "vitest";
import { createThemeEngine } from "../services/themeEngine";

describe("themeEngine", () => {
  it("provides theme tokens without hardcoded renderer styles", () => {
    const engine = createThemeEngine("light");
    const tokens = engine.getTokens();
    expect(tokens.id).toBe("light");
    expect(tokens.primary).toBeTruthy();
    expect(tokens.correct).toBeTruthy();
  });

  it("supports high contrast theme", () => {
    const engine = createThemeEngine("high_contrast");
    engine.setFontScale(1.25);
    const tokens = engine.getTokens();
    expect(tokens.id).toBe("high_contrast");
    expect(tokens.fontScale).toBe(1.25);
  });
});
