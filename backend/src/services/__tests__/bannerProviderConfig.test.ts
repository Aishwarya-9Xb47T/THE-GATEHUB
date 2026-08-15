import { describe, expect, it } from "@jest/globals";
import {
  formatBannerProviderStartupLines,
  getBannerFallbackChain,
  getSelectedBannerProvider,
  isOpenAiBannerKeyConfigured,
  isOpenAiRequiredForBannerFlow,
  isPexelsConfigured,
  isUnsplashConfigured,
  publicBannerKeyPresence,
  unsplashAuthorizationHeader,
} from "../bannerProviderConfig";

const FAKE_UNSPLASH = "test-unsplash-access-key-value";
const FAKE_PEXELS = "test-pexels-access-key-value";
const FAKE_OPENAI = "test-openai-key-value-xxxxx";

describe("Banner Studio Unsplash provider configuration", () => {
  it("treats a present UNSPLASH_API_KEY as configured / Connected", () => {
    expect(isUnsplashConfigured({ UNSPLASH_API_KEY: FAKE_UNSPLASH })).toBe(true);
    expect(publicBannerKeyPresence({ UNSPLASH_API_KEY: FAKE_UNSPLASH }).unsplash).toBe("configured");
  });

  it("treats a missing UNSPLASH_API_KEY as not configured", () => {
    expect(isUnsplashConfigured({})).toBe(false);
    expect(publicBannerKeyPresence({}).unsplash).toBe("not_configured");
  });

  it("treats an empty UNSPLASH_API_KEY as not configured", () => {
    expect(isUnsplashConfigured({ UNSPLASH_API_KEY: "   " })).toBe(false);
    expect(isUnsplashConfigured({ UNSPLASH_API_KEY: "" })).toBe(false);
  });

  it("does not treat UNSPLASH_SECRET_KEY as the Unsplash access key", () => {
    expect(isUnsplashConfigured({
      UNSPLASH_SECRET_KEY: "application-secret-must-not-count",
      UNSPLASH_API_KEY: "",
    })).toBe(false);
  });

  it("uses Unsplash Client-ID authentication for the current search API", () => {
    expect(unsplashAuthorizationHeader(FAKE_UNSPLASH)).toBe(`Client-ID ${FAKE_UNSPLASH}`);
  });

  it("never logs secret values in startup status lines", () => {
    const lines = formatBannerProviderStartupLines({
      BANNER_PROVIDER: "pexels",
      PEXELS_API_KEY: FAKE_PEXELS,
      UNSPLASH_API_KEY: FAKE_UNSPLASH,
      OPENAI_API_KEY: FAKE_OPENAI,
    }).join("\n");

    expect(lines).toContain("UNSPLASH_API_KEY: OPTIONAL / CONFIGURED");
    expect(lines).toContain("PEXELS_API_KEY: REQUIRED / CONFIGURED");
    expect(lines).not.toContain(FAKE_UNSPLASH);
    expect(lines).not.toContain(FAKE_PEXELS);
    expect(lines).not.toContain(FAKE_OPENAI);
    expect(lines).not.toMatch(/[A-Za-z0-9]{8}…[A-Za-z0-9]{4}/);
  });

  it("keeps Pexels functional when Unsplash is unavailable", () => {
    const env = { BANNER_PROVIDER: "pexels", PEXELS_API_KEY: FAKE_PEXELS };
    expect(getSelectedBannerProvider(env)).toBe("pexels");
    expect(isPexelsConfigured(env)).toBe(true);
    expect(isUnsplashConfigured(env)).toBe(false);
    expect(getBannerFallbackChain("pexels")[0]).toBe("pexels");
    expect(getBannerFallbackChain("pexels")).toContain("curated");
  });

  it("falls back to Unsplash when Pexels fails and Unsplash is configured", () => {
    const chain = getBannerFallbackChain("pexels");
    expect(chain).toEqual(["pexels", "unsplash", "curated"]);
    expect(isUnsplashConfigured({ UNSPLASH_API_KEY: FAKE_UNSPLASH })).toBe(true);
  });

  it("does not require OPENAI_API_KEY for the Pexels banner flow", () => {
    expect(getSelectedBannerProvider({ BANNER_PROVIDER: "pexels" })).toBe("pexels");
    expect(isOpenAiRequiredForBannerFlow("pexels")).toBe(false);
    expect(isOpenAiBannerKeyConfigured({ OPENAI_API_KEY: "" })).toBe(false);
    const lines = formatBannerProviderStartupLines({
      BANNER_PROVIDER: "pexels",
      PEXELS_API_KEY: FAKE_PEXELS,
    }).join("\n");
    expect(lines).toContain("OPENAI_API_KEY: OPTIONAL / NOT CONFIGURED");
  });
});
