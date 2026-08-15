/**
 * Banner Studio provider configuration.
 * Unsplash uses the public Access Key only (`UNSPLASH_API_KEY`).
 * `UNSPLASH_SECRET_KEY` is not read by this integration.
 */

export type BannerProviderMode = "pexels" | "unsplash" | "openai" | "auto";
export type BannerFallbackStep = "pexels" | "unsplash" | "openai" | "curated";
export type PublicKeyPresence = "configured" | "not_configured";

const PLACEHOLDER_KEYS = new Set([
  "your-openai-api-key",
  "your-pexels-api-key",
  "your-unsplash-api-key",
]);

export function isNonEmptyEnvValue(value?: string | null): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_KEYS.has(trimmed);
}

export function isUnsplashConfigured(env: NodeJS.Dict<string> = process.env): boolean {
  return isNonEmptyEnvValue(env.UNSPLASH_API_KEY);
}

export function isPexelsConfigured(env: NodeJS.Dict<string> = process.env): boolean {
  return isNonEmptyEnvValue(env.PEXELS_API_KEY);
}

export function isOpenAiBannerKeyConfigured(env: NodeJS.Dict<string> = process.env): boolean {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key || key.length < 20 || PLACEHOLDER_KEYS.has(key)) return false;
  return true;
}

export function getSelectedBannerProvider(env: NodeJS.Dict<string> = process.env): BannerProviderMode {
  const val = (env.BANNER_PROVIDER || "pexels").toLowerCase().trim();
  if (val === "pexels" || val === "unsplash" || val === "openai" || val === "auto") {
    return val;
  }
  return "pexels";
}

export function getBannerFallbackChain(provider: BannerProviderMode): BannerFallbackStep[] {
  if (provider === "pexels") return ["pexels", "unsplash", "curated"];
  if (provider === "unsplash") return ["unsplash", "pexels", "curated"];
  if (provider === "openai") return ["openai", "pexels", "unsplash", "curated"];
  return ["pexels", "unsplash", "openai", "curated"];
}

export function isOpenAiRequiredForBannerFlow(provider: BannerProviderMode): boolean {
  return getBannerFallbackChain(provider).includes("openai");
}

export function unsplashAuthorizationHeader(accessKey: string): string {
  return `Client-ID ${accessKey}`;
}

export function publicKeyPresence(configured: boolean): PublicKeyPresence {
  return configured ? "configured" : "not_configured";
}

export function formatBannerProviderStartupLines(env: NodeJS.Dict<string> = process.env): string[] {
  const selected = getSelectedBannerProvider(env);
  const pexels = isPexelsConfigured(env);
  const unsplash = isUnsplashConfigured(env);
  const openai = isOpenAiBannerKeyConfigured(env);
  const openaiRequired = isOpenAiRequiredForBannerFlow(selected);

  return [
    "[Banner Studio] Provider configuration:",
    `  BANNER_PROVIDER: ${selected}`,
    `  PEXELS_API_KEY: ${pexels ? "REQUIRED / CONFIGURED" : selected === "pexels" ? "REQUIRED / MISSING" : "OPTIONAL / NOT CONFIGURED"}`,
    `  UNSPLASH_API_KEY: ${unsplash ? "OPTIONAL / CONFIGURED" : "OPTIONAL / NOT CONFIGURED"}`,
    `  OPENAI_API_KEY: ${openai ? (openaiRequired ? "REQUIRED / CONFIGURED" : "OPTIONAL / CONFIGURED") : openaiRequired ? "REQUIRED / MISSING" : "OPTIONAL / NOT CONFIGURED"}`,
  ];
}

export function publicBannerKeyPresence(env: NodeJS.Dict<string> = process.env): {
  openai: PublicKeyPresence;
  unsplash: PublicKeyPresence;
  pexels: PublicKeyPresence;
} {
  return {
    openai: publicKeyPresence(isOpenAiBannerKeyConfigured(env)),
    unsplash: publicKeyPresence(isUnsplashConfigured(env)),
    pexels: publicKeyPresence(isPexelsConfigured(env)),
  };
}
