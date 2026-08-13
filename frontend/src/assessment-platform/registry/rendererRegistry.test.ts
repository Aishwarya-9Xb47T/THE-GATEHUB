import { describe, it, expect, beforeEach } from "vitest";
import { bootstrapAssessmentPlatform } from "../bootstrap";
import {
  getRenderer,
  hasRenderer,
  listRendererTypeSlugs,
  loadRenderer,
} from "../registry/rendererRegistry";

describe("rendererRegistry", () => {
  beforeEach(() => {
    bootstrapAssessmentPlatform();
  });

  it("registers built-in renderers without switch statements", () => {
    expect(hasRenderer("multiple_choice")).toBe(true);
    expect(hasRenderer("essay")).toBe(true);
    expect(hasRenderer("true_false")).toBe(true);
    expect(hasRenderer("poll")).toBe(true);
    expect(hasRenderer("multiple_select")).toBe(true);
  });

  it("resolves renderer plugin by typeSlug", () => {
    const plugin = getRenderer("multiple_choice");
    expect(plugin?.id).toBe("mcq-renderer");
    expect(plugin?.validateInput).toBeTypeOf("function");
    expect(plugin?.collectResponse).toBeTypeOf("function");
  });

  it("lazy loads coding renderer", async () => {
    expect(hasRenderer("coding")).toBe(true);
    const plugin = await loadRenderer("coding");
    expect(plugin?.typeSlug).toBe("coding");
  });

  it("lists all registered type slugs", () => {
    const slugs = listRendererTypeSlugs();
    expect(slugs).toContain("multiple_choice");
    expect(slugs).toContain("coding");
  });
});
