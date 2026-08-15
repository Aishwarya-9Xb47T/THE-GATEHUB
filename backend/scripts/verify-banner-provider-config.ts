/**
 * Lightweight Banner Studio provider config checks (avoids full Jest OOM).
 * Run: npx tsx scripts/verify-banner-provider-config.ts
 */
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
} from "../src/services/bannerProviderConfig.js";

const FAKE_UNSPLASH = "test-unsplash-access-key-value";
const FAKE_PEXELS = "test-pexels-access-key-value";
const FAKE_OPENAI = "test-openai-key-value-xxxxx";

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  passed += 1;
  console.log("ok -", msg);
}

assert(isUnsplashConfigured({ UNSPLASH_API_KEY: FAKE_UNSPLASH }) === true, "present UNSPLASH_API_KEY → configured");
assert(publicBannerKeyPresence({ UNSPLASH_API_KEY: FAKE_UNSPLASH }).unsplash === "configured", "presence → configured");
assert(isUnsplashConfigured({}) === false, "missing UNSPLASH_API_KEY → not configured");
assert(publicBannerKeyPresence({}).unsplash === "not_configured", "presence → not configured");
assert(isUnsplashConfigured({ UNSPLASH_API_KEY: "   " }) === false, "whitespace → not configured");
assert(isUnsplashConfigured({ UNSPLASH_API_KEY: "" }) === false, "empty → not configured");
assert(
  isUnsplashConfigured({ UNSPLASH_SECRET_KEY: "application-secret-must-not-count", UNSPLASH_API_KEY: "" }) === false,
  "UNSPLASH_SECRET_KEY alone does not configure Unsplash",
);
assert(unsplashAuthorizationHeader(FAKE_UNSPLASH) === `Client-ID ${FAKE_UNSPLASH}`, "uses Client-ID auth");

const lines = formatBannerProviderStartupLines({
  BANNER_PROVIDER: "pexels",
  PEXELS_API_KEY: FAKE_PEXELS,
  UNSPLASH_API_KEY: FAKE_UNSPLASH,
  OPENAI_API_KEY: FAKE_OPENAI,
}).join("\n");
assert(lines.includes("UNSPLASH_API_KEY: OPTIONAL / CONFIGURED"), "startup marks Unsplash optional/configured");
assert(lines.includes("PEXELS_API_KEY: REQUIRED / CONFIGURED"), "startup marks Pexels required/configured");
assert(!lines.includes(FAKE_UNSPLASH), "never logs Unsplash secret");
assert(!lines.includes(FAKE_PEXELS), "never logs Pexels secret");
assert(!lines.includes(FAKE_OPENAI), "never logs OpenAI secret");
assert(!/[A-Za-z0-9]{8}…[A-Za-z0-9]{4}/.test(lines), "no masked key fragments in logs");

const env = { BANNER_PROVIDER: "pexels", PEXELS_API_KEY: FAKE_PEXELS };
assert(getSelectedBannerProvider(env) === "pexels", "BANNER_PROVIDER=pexels");
assert(isPexelsConfigured(env) === true, "Pexels remains functional without Unsplash");
assert(isUnsplashConfigured(env) === false, "Unsplash unavailable is allowed");
assert(JSON.stringify(getBannerFallbackChain("pexels")) === JSON.stringify(["pexels", "unsplash", "curated"]), "fallback chain");
assert(isUnsplashConfigured({ UNSPLASH_API_KEY: FAKE_UNSPLASH }) === true, "Unsplash fallback available when keyed");
assert(isOpenAiRequiredForBannerFlow("pexels") === false, "OPENAI not required for Pexels flow");
assert(isOpenAiBannerKeyConfigured({ OPENAI_API_KEY: "" }) === false, "empty OPENAI not configured");
assert(
  formatBannerProviderStartupLines({ BANNER_PROVIDER: "pexels", PEXELS_API_KEY: FAKE_PEXELS })
    .join("\n")
    .includes("OPENAI_API_KEY: OPTIONAL / NOT CONFIGURED"),
  "OPENAI optional / not configured for Pexels",
);

console.log(`PASSED ${passed}`);
