import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import { isFirebaseConfigured, uploadBannerToFirebase, type BannerStorageRecord } from "./firebaseStorageService.js";
import { isB2Configured } from "./b2StorageService.js";
import { persistGeneratedFile } from "../middlewares/persistUpload.js";
import { isStoredBannerPath } from "./bannerUrl.js";
import {
  formatBannerProviderStartupLines,
  getBannerFallbackChain,
  getSelectedBannerProvider,
  isOpenAiBannerKeyConfigured,
  isPexelsConfigured,
  isUnsplashConfigured,
  publicBannerKeyPresence,
  unsplashAuthorizationHeader,
  type BannerProviderMode,
} from "./bannerProviderConfig.js";

export { isStoredBannerPath } from "./bannerUrl.js";
export { getSelectedBannerProvider, type BannerProviderMode };

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");
const BANNERS_DIR = path.join(UPLOAD_DIR, "banners");
const THUMBS_DIR = path.join(BANNERS_DIR, "thumbs");

[BANNERS_DIR, THUMBS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const OPENAI_IMAGE_MODELS = ["gpt-image-1", "gpt-image-1.5", "dall-e-3"] as const;
const OPENAI_IMAGE_SIZE = "1536x1024" as const;

let openaiClient: OpenAI | null | undefined;

function getOpenAIApiKey(): string | null {
  if (!isOpenAiBannerKeyConfigured()) return null;
  return process.env.OPENAI_API_KEY?.trim() || null;
}

function getOpenAIClient(): OpenAI | null {
  if (openaiClient !== undefined) return openaiClient;
  const key = getOpenAIApiKey();
  openaiClient = key ? new OpenAI({ apiKey: key }) : null;
  return openaiClient;
}

export type BannerProviderHealth = {
  configured: boolean;
  connected: boolean;
  status: "connected" | "failed" | "not_configured";
  message?: string;
};

function errorPriority(message: string): number {
  if (message.includes("billing") || message.includes("quota")) return 100;
  if (message.includes("Invalid OPENAI_API_KEY")) return 90;
  if (message.includes("rate limit")) return 80;
  if (message.includes("unavailable")) return 70;
  if (message.includes("timed out")) return 60;
  if (message.includes("does not exist")) return 10;
  return 50;
}

function pickBetterError(current: string, next: string): string {
  return errorPriority(next) >= errorPriority(current) ? next : current;
}

function classifyOpenAIError(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string };
  const msg = e.message || String(err);
  if (e.status === 401 || msg.includes("Incorrect API key")) return "Invalid OPENAI_API_KEY";
  if (e.status === 429 || msg.includes("rate limit")) return "OpenAI rate limit exceeded";
  if (msg.includes("Billing hard limit") || msg.includes("insufficient_quota")) return "OpenAI billing limit reached";
  if (e.status === 503 || msg.includes("overloaded")) return "OpenAI service unavailable";
  if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) return "OpenAI request timed out";
  if (msg.includes("does not exist")) return `OpenAI image model unavailable: ${msg}`;
  return msg.slice(0, 200);
}

const AI_STYLE_PROMPTS: Record<string, string> = {
  professional: "clean corporate professional photography, polished lighting, educational technology",
  technology: "futuristic technology environment, neural networks, digital intelligence, blue purple tones",
  academic: "university research laboratory, scholarly innovation atmosphere, scientific discovery",
  modern: "minimal modern design, bold contemporary gradients, premium e-learning aesthetic",
  corporate: "executive business environment, trustworthy enterprise technology",
};

const TOPIC_PROMPT_HINTS: Record<string, string> = {
  ai: "Futuristic AI learning environment, neural networks, digital intelligence, educational technology, premium banner, professional, no text, 16:9",
  "artificial intelligence": "Futuristic AI learning environment, neural networks, digital intelligence, educational technology, premium banner, professional, no text, 16:9",
  "machine learning": "Machine learning visualization, data patterns, algorithmic intelligence, educational technology, professional, no text, 16:9",
  "deep learning": "Deep neural network visualization, layered intelligence, advanced computing, educational, no text, 16:9",
  "generative ai": "Generative AI creative studio, diffusion models, creative technology, professional educational banner, no text, 16:9",
  "cyber security": "Cyber defense operations center, digital security visualization, professional educational banner, no text, 16:9",
  "ethical hacking": "Ethical hacking visualization, penetration testing lab, cybersecurity education, professional, no text, 16:9",
  "software engineering": "Modern software development workspace, coding systems, cloud architecture, engineering excellence, premium educational banner, no text, 16:9",
  research: "Technology research laboratory, innovation ecosystem, scientific discovery, advanced computing, educational excellence, no text, 16:9",
  programming: "Modern software development workspace, coding systems, programming excellence, professional educational banner, no text, 16:9",
  "cloud computing": "Cloud infrastructure visualization, distributed systems, enterprise technology, professional educational banner, no text, 16:9",
  blockchain: "Blockchain technology visualization, decentralized networks, digital innovation, professional educational banner, no text, 16:9",
  "data science": "Data science visualization, analytics dashboards, machine intelligence, professional educational banner, no text, 16:9",
  "academic writing": "Academic research workspace, scholarly writing environment, university library atmosphere, professional educational banner, no text, 16:9",
};

export interface BannerSearchResult {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  source?: string;
  width?: number;
  height?: number;
}

export interface StoredBanner extends BannerStorageRecord {
  bannerType?: string;
}

interface SearchCacheEntry {
  results: BannerSearchResult[];
  expiresAt: number;
}

const searchCache = new Map<string, SearchCacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function pexelsUrl(photoId: number, width = 1920): string {
  return `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=${width}&h=${Math.round(width * 9 / 16)}&fit=crop`;
}

/** Category → verified Pexels sources for smart fallback */
export const CATEGORY_FALLBACK_SOURCES: Record<string, string> = {
  ai: pexelsUrl(2599244),
  "artificial intelligence": pexelsUrl(2599244),
  "machine learning": pexelsUrl(3861969),
  "deep learning": pexelsUrl(8386440),
  "generative ai": pexelsUrl(17483868),
  programming: pexelsUrl(1181671),
  development: pexelsUrl(1181671),
  "software engineering": pexelsUrl(1181671),
  "web development": pexelsUrl(270348),
  "frontend development": pexelsUrl(11035371),
  "backend development": pexelsUrl(442150),
  "full stack development": pexelsUrl(5468190),
  "mobile development": pexelsUrl(607812),
  "cyber security": pexelsUrl(8108728),
  cybersecurity: pexelsUrl(8108728),
  "ethical hacking": pexelsUrl(4974915),
  cloud: pexelsUrl(325229),
  "cloud computing": pexelsUrl(325229),
  "data science": pexelsUrl(669622),
  "data analytics": pexelsUrl(590022),
  devops: pexelsUrl(577585),
  research: pexelsUrl(2280549),
  "research paper": pexelsUrl(261763),
  blockchain: pexelsUrl(844124),
  iot: pexelsUrl(1631007),
  "ar/vr": pexelsUrl(8439096),
  "product management": pexelsUrl(3184465),
  "ui/ux": pexelsUrl(196644),
  "ui/ux design": pexelsUrl(196644),
  "digital marketing": pexelsUrl(265087),
  "business intelligence": pexelsUrl(669610),
  "data structures & algorithms": pexelsUrl(1181671),
  "cloud & devops": pexelsUrl(325229),
  "career preparation": pexelsUrl(3184465),
  default: pexelsUrl(3861969),
};

function publicUrl(relativePath: string): string {
  // Return a root-relative path so the frontend's resolveCourseMediaUrl() resolves it
  // against the correct backend origin at runtime, rather than baking in a potentially
  // stale API_URL that breaks when the host changes or when run locally.
  return relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
}

function googleCseId(): string | undefined {
  return process.env.GOOGLE_CUSTOM_SEARCH_CX || process.env.GOOGLE_CSE_ID;
}

function cacheKey(query: string, page: number) {
  return `${query.toLowerCase().trim()}:${page}`;
}

async function generateThumbnail(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    return sharp(buffer)
      .resize(640, 360, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (err) {
    console.warn("sharp unavailable — using full-size image as thumbnail:", err);
    return buffer;
  }
}

async function persistBanner(
  bannerBuffer: Buffer,
  meta: { source: string; category?: string; ext?: string }
): Promise<StoredBanner> {
  const thumbBuffer = await generateThumbnail(bannerBuffer);
  const ext = meta.ext || ".jpg";

  const firebaseRecord = await uploadBannerToFirebase(bannerBuffer, thumbBuffer, meta);
  if (firebaseRecord) {
    return { ...firebaseRecord, bannerType: meta.source };
  }

  const bannerId = randomUUID();
  const now = new Date().toISOString();
  const filename = `${bannerId}${ext}`;
  const thumbFilename = `thumb-${bannerId}${ext}`;

  if (isB2Configured()) {
    const bannerTmp = path.join(BANNERS_DIR, filename);
    const thumbTmp = path.join(THUMBS_DIR, thumbFilename);
    fs.mkdirSync(THUMBS_DIR, { recursive: true });
    fs.writeFileSync(bannerTmp, bannerBuffer);
    fs.writeFileSync(thumbTmp, thumbBuffer);
    await persistGeneratedFile({
      localPath: bannerTmp,
      prefix: "banners",
      fileName: filename,
      contentType: ext === ".png" ? "image/png" : "image/jpeg",
    });
    await persistGeneratedFile({
      localPath: thumbTmp,
      prefix: "banners",
      extraPath: "thumbs",
      fileName: thumbFilename,
      contentType: ext === ".png" ? "image/png" : "image/jpeg",
    });
    return {
      bannerId,
      bannerUrl: publicUrl(`/uploads/banners/${filename}`),
      thumbnailUrl: publicUrl(`/uploads/banners/thumbs/${thumbFilename}`),
      source: meta.source,
      category: meta.category,
      createdAt: now,
      updatedAt: now,
    };
  }

  fs.writeFileSync(path.join(BANNERS_DIR, filename), bannerBuffer);
  fs.writeFileSync(path.join(THUMBS_DIR, thumbFilename), thumbBuffer);

  return {
    bannerId,
    bannerUrl: publicUrl(`/uploads/banners/${filename}`),
    thumbnailUrl: publicUrl(`/uploads/banners/thumbs/${thumbFilename}`),
    source: meta.source,
    category: meta.category,
    createdAt: now,
    updatedAt: now,
  };
}

async function downloadImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; ext: string }> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error("Failed to download image");
  const buffer = Buffer.from(await res.arrayBuffer());
  let ext = ".jpg";
  try {
    const pathname = new URL(imageUrl).pathname;
    const parsed = path.extname(pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(parsed)) ext = parsed === ".jpeg" ? ".jpg" : parsed;
  } catch {
    /* keep default */
  }
  return { buffer, ext };
}

export async function storeBannerBuffer(buffer: Buffer, ext = ".jpg", source = "upload"): Promise<StoredBanner> {
  return persistBanner(buffer, { source, ext });
}

async function searchPexels(query: string, page: number, perPage: number): Promise<BannerSearchResult[]> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return [];

  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=landscape`,
    { headers: { Authorization: key } }
  );
  if (!res.ok) return [];

  const data = (await res.json()) as {
    photos?: Array<{
      id: number;
      alt?: string;
      src: { large2x?: string; large?: string; medium?: string };
      width?: number;
      height?: number;
    }>;
  };

  return (data.photos || []).map((p) => ({
    id: `pexels-${p.id}`,
    title: p.alt || query,
    url: p.src.large2x || p.src.large || p.src.medium || "",
    thumbnailUrl: p.src.medium || p.src.large || "",
    source: "Pexels",
    width: p.width,
    height: p.height,
  }));
}

async function searchUnsplash(query: string, page: number, perPage: number): Promise<BannerSearchResult[]> {
  const key = process.env.UNSPLASH_API_KEY?.trim();
  if (!key) return [];

  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=landscape`,
    { headers: { Authorization: unsplashAuthorizationHeader(key) } }
  );
  if (!res.ok) return [];

  const data = (await res.json()) as {
    results?: Array<{
      id: string;
      alt_description?: string;
      description?: string;
      urls: { raw?: string; full?: string; regular?: string; small?: string; thumb?: string };
      width?: number;
      height?: number;
    }>;
  };

  return (data.results || []).map((p) => ({
    id: `unsplash-${p.id}`,
    title: p.alt_description || p.description || query,
    url: p.urls.regular || p.urls.full || p.urls.raw || "",
    thumbnailUrl: p.urls.small || p.urls.thumb || p.urls.regular || "",
    source: "Unsplash",
    width: p.width,
    height: p.height,
  }));
}

async function searchGoogle(query: string, page: number, perPage: number): Promise<BannerSearchResult[]> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = googleCseId();
  if (!apiKey || !cx) return [];

  const start = (page - 1) * perPage + 1;
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: `${query} technology education professional`,
    searchType: "image",
    num: String(Math.min(perPage, 10)),
    start: String(start),
    safe: "active",
    imgSize: "large",
    imgType: "photo",
    imgColorType: "color",
  });

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!res.ok) return [];

  const data = (await res.json()) as {
    items?: Array<{
      title?: string;
      link?: string;
      image?: { thumbnailLink?: string; width?: number; height?: number };
      displayLink?: string;
    }>;
  };

  return (data.items || [])
    .filter((item) => item.link && (item.image?.width ?? 0) >= 800)
    .map((item, i) => ({
      id: `google-${page}-${i}-${item.link}`,
      title: item.title || query,
      url: item.link!,
      thumbnailUrl: item.image?.thumbnailLink || item.link!,
      source: item.displayLink || "Google",
      width: item.image?.width,
      height: item.image?.height,
    }));
}

function dedupeResults(results: BannerSearchResult[]): BannerSearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.url.split("?")[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function curatedTitle(key: string): string {
  return key
    .split(" ")
    .map((w) => (w.length <= 3 && w !== "ai" ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\bAr\/vr\b/i, "AR/VR")
    .replace(/\bUi\/ux\b/i, "UI/UX");
}

function curatedThumbnailUrl(url: string): string {
  return url.replace(/w=\d+/, "w=640").replace(/h=\d+/, `h=${Math.round((640 * 9) / 16)}`);
}

function scoreCuratedMatch(key: string, query: string): number {
  const k = key.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  if (k === q) return 100;
  if (k.includes(q) || q.includes(k)) return 80;
  const words = q.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const word of words) {
    if (k.includes(word)) score += 25;
    else if (word.length > 3 && k.split(/\s+/).some((part) => part.startsWith(word.slice(0, 4)))) score += 10;
  }
  return score;
}

/** Verified Pexels CDN images — works without PEXELS_API_KEY */
function searchCuratedLibrary(query: string, page: number, perPage: number): BannerSearchResult[] {
  const ranked = Object.entries(CATEGORY_FALLBACK_SOURCES)
    .filter(([key]) => key !== "default")
    .map(([key, url]) => ({
      id: `curated-${key.replace(/[^a-z0-9]+/g, "-")}`,
      title: curatedTitle(key),
      url,
      thumbnailUrl: curatedThumbnailUrl(url),
      source: "THE GATE HUB",
      score: scoreCuratedMatch(key, query),
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const pool = ranked.some((e) => e.score > 0) ? ranked.filter((e) => e.score > 0) : ranked;
  const start = (page - 1) * perPage;
  return pool.slice(start, start + perPage).map(({ score: _score, ...item }) => item);
}

export async function searchBannerImages(
  query: string,
  page = 1,
  perPage = 12
): Promise<{ results: BannerSearchResult[]; hasMore: boolean; provider: string }> {
  const key = cacheKey(query, page);
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { results: cached.results, hasMore: cached.results.length >= perPage, provider: "cache" };
  }

  let results = await searchPexels(query, page, perPage);
  const providers: string[] = results.length > 0 ? ["pexels"] : [];

  if (results.length < perPage) {
    const unsplashResults = await searchUnsplash(query, page, perPage - results.length);
    if (unsplashResults.length > 0) {
      results = dedupeResults([...results, ...unsplashResults]);
      providers.push("unsplash");
    }
  }

  if (results.length < perPage) {
    const googleResults = await searchGoogle(query, page, perPage - results.length);
    if (googleResults.length > 0) {
      results = dedupeResults([...results, ...googleResults]);
      providers.push("google");
    }
  }

  let provider = providers.length > 0 ? providers.join("+") : "none";

  if (results.length === 0) {
    results = searchCuratedLibrary(query, page, perPage);
    provider = "curated";
  }

  if (results.length === 0) {
    throw new Error("No banner images found for this search.");
  }

  searchCache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });

  return { results, hasMore: results.length >= perPage, provider };
}

export async function importBannerFromUrl(
  imageUrl: string,
  meta?: { source?: string; category?: string }
): Promise<StoredBanner> {
  const { buffer, ext } = await downloadImageBuffer(imageUrl);
  return persistBanner(buffer, { source: meta?.source || "import", category: meta?.category, ext });
}

function bannerLogHost(url: string): string {
  if (!url) return "empty";
  if (/^(blob:|data:)/i.test(url)) return url.slice(0, 4);
  if (url.startsWith("/uploads/")) return "uploads";
  try {
    if (/^https?:\/\//i.test(url)) return new URL(url).hostname;
  } catch {
    /* ignore */
  }
  return "relative";
}

/** Persist a selected search/upload banner into B2 `/uploads/banners` when the URL is still remote. */
export async function persistRemoteBannerIfNeeded(input: {
  bannerUrl?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  bannerType?: string;
}): Promise<{ bannerUrl?: string; thumbnailUrl?: string }> {
  const primary = input.bannerUrl?.trim() || undefined;
  const thumb = input.thumbnailUrl?.trim() || primary;
  const source = input.sourceUrl?.trim() || undefined;

  if (primary && /^(blob:|data:)/i.test(primary)) {
    console.warn("[BANNER PERSIST] rejected ephemeral URL", { host: bannerLogHost(primary) });
    const fallback = source && !/^(blob:|data:)/i.test(source) ? source : undefined;
    if (!fallback) return { bannerUrl: undefined, thumbnailUrl: undefined };
    return persistRemoteBannerIfNeeded({ ...input, bannerUrl: fallback, sourceUrl: undefined });
  }

  if (primary && isStoredBannerPath(primary)) {
    return { bannerUrl: primary, thumbnailUrl: thumb };
  }

  const remote =
    (primary && /^https?:\/\//i.test(primary) ? primary : undefined) ||
    (source && /^https?:\/\//i.test(source) ? source : undefined);

  if (!remote) {
    return { bannerUrl: primary, thumbnailUrl: thumb };
  }

  try {
    const stored = await importBannerFromUrl(remote, { source: input.bannerType || "search" });
    console.info("[BANNER PERSIST] imported remote image", {
      host: bannerLogHost(remote),
      persistent: isStoredBannerPath(stored.bannerUrl),
      hasBannerId: Boolean(stored.bannerId),
    });
    return {
      bannerUrl: stored.bannerUrl,
      thumbnailUrl: thumb || stored.thumbnailUrl || stored.bannerUrl,
    };
  } catch (err) {
    console.error("[BANNER PERSIST] import failed; keeping selected remote URL", {
      host: bannerLogHost(remote),
      message: err instanceof Error ? err.message : String(err),
    });
    return { bannerUrl: primary || remote, thumbnailUrl: thumb || remote };
  }
}

function resolveTopicPrompt(topic: string, style: string): string {
  const key = topic.toLowerCase().trim();
  for (const [k, hint] of Object.entries(TOPIC_PROMPT_HINTS)) {
    if (key.includes(k)) return hint;
  }
  const styleHint = AI_STYLE_PROMPTS[style] || AI_STYLE_PROMPTS.professional;
  return `${styleHint}. Professional e-learning course banner, landscape 16:9, high quality, educational, no text, no logos, no watermarks. Topic: ${topic}`;
}

async function imageResultToBanner(
  item: { url?: string | null; b64_json?: string | null },
  category?: string
): Promise<StoredBanner | null> {
  if (item.b64_json) {
    const buffer = Buffer.from(item.b64_json, "base64");
    return persistBanner(buffer, { source: "ai", category, ext: ".png" });
  }
  if (item.url) {
    const { buffer, ext } = await downloadImageBuffer(item.url);
    return persistBanner(buffer, { source: "ai", category, ext });
  }
  return null;
}

async function generateOneAiBanner(
  topic: string,
  style: string,
  variation = "",
  category?: string
): Promise<{ banner: StoredBanner | null; error?: string }> {
  const client = getOpenAIClient();
  if (!client) return { banner: null, error: "OPENAI_API_KEY not configured" };

  const basePrompt = resolveTopicPrompt(topic, style);
  const prompt = variation ? `${basePrompt} ${variation}` : basePrompt;
  const preferredModel = process.env.OPENAI_IMAGE_MODEL?.trim();
  const models = preferredModel ? [preferredModel, ...OPENAI_IMAGE_MODELS] : [...OPENAI_IMAGE_MODELS];
  const uniqueModels = [...new Set(models)];

  let lastError = "OpenAI image generation failed";

  for (const model of uniqueModels) {
    try {
      const params: OpenAI.Images.ImageGenerateParams = {
        model,
        prompt,
        size: OPENAI_IMAGE_SIZE,
        n: 1,
      };
      if (model.includes("dall-e")) {
        params.size = "1792x1024";
        params.quality = "hd";
      }

      const result = await client.images.generate(params);
      const item = result.data?.[0];
      if (!item) {
        lastError = "OpenAI returned an empty image response";
        continue;
      }

      const banner = await imageResultToBanner(item, category);
      if (banner) return { banner };
      lastError = "OpenAI image could not be saved";
    } catch (err) {
      lastError = pickBetterError(lastError, classifyOpenAIError(err));
      console.error(`[Banner Studio] OpenAI generate failed (${model}):`, lastError);
    }
  }

  return { banner: null, error: lastError };
}

async function generateOpenAiBanners(
  topic: string,
  style: keyof typeof AI_STYLE_PROMPTS,
  count: number,
  category?: string
): Promise<{ banners: StoredBanner[]; error?: string }> {
  const variations = [
    "Wide cinematic composition with depth and atmosphere.",
    "Bold vibrant colors, dynamic professional lighting.",
    "Minimal clean aesthetic with subtle premium gradients.",
    "Rich detailed environment, ultra premium educational quality.",
  ];

  const banners: StoredBanner[] = [];
  let lastError: string | undefined;

  for (let i = 0; i < Math.min(count, variations.length); i++) {
    const { banner, error } = await generateOneAiBanner(topic, style, variations[i], category);
    if (banner) banners.push(banner);
    if (error) lastError = pickBetterError(lastError || error, error);
    if (banners.length >= count) break;
  }

  return { banners, error: banners.length ? undefined : lastError };
}

async function importSearchResultsAsBanners(
  results: BannerSearchResult[],
  source: string,
  category?: string
): Promise<StoredBanner[]> {
  const banners: StoredBanner[] = [];
  for (const result of results) {
    try {
      const stored = await importBannerFromUrl(result.url, { source, category });
      banners.push(stored);
    } catch (err) {
      console.warn(`[Banner Studio] Failed to import ${source} image:`, err);
    }
  }
  return banners;
}

async function generateFallbackBanners(
  query: string,
  count: number,
  category?: string
): Promise<{ banners: StoredBanner[]; provider: string }> {
  const searchQuery = `${query} technology education professional landscape`;

  let results = await searchUnsplash(searchQuery, 1, count);
  let provider = results.length > 0 ? "unsplash" : "";

  if (results.length < count) {
    const pexelsResults = await searchPexels(searchQuery, 1, count - results.length);
    if (pexelsResults.length > 0) {
      results = dedupeResults([...results, ...pexelsResults]);
      provider = results.some((r) => r.source === "Unsplash") && pexelsResults.length > 0
        ? "unsplash+pexels"
        : "pexels";
    }
  }

  if (results.length < count) {
    const curated = searchCuratedLibrary(query, 1, count - results.length);
    if (curated.length > 0) {
      results = dedupeResults([...results, ...curated]);
      provider = provider ? `${provider}+curated` : "curated";
    }
  }

  const source = provider.startsWith("unsplash") ? "unsplash" : provider.startsWith("pexels") ? "pexels" : "template";
  const banners = await importSearchResultsAsBanners(results.slice(0, count), source, category);
  return { banners, provider: provider || "curated" };
}

export type BannerAttemptLog = {
  provider: string;
  success: boolean;
  count: number;
  reason?: string;
};

export type BannerGenerateResult = {
  banners: StoredBanner[];
  provider: string;
  selectedProvider: BannerProviderMode;
  attempts: BannerAttemptLog[];
  warnings: string[];
  usedFallback: boolean;
};

export async function generateBannersWithFallback(
  prompt: string,
  style: keyof typeof AI_STYLE_PROMPTS = "professional",
  category?: string,
  count = 4
): Promise<BannerGenerateResult> {
  const warnings: string[] = [];
  const topic = prompt.trim();
  const selectedProvider = getSelectedBannerProvider();

  console.log(`[Banner Studio] Selected provider mode: ${selectedProvider}`);

  const fallbackChain = getBannerFallbackChain(selectedProvider);

  const banners: StoredBanner[] = [];
  const attempts: BannerAttemptLog[] = [];
  const usedProviders = new Set<string>();

  const cleanTopic = topic.replace(/&/g, " ").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const cleanCat = (category || "").replace(/&/g, " ").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const searchQuery = cleanCat ? `${cleanTopic} ${cleanCat}` : cleanTopic;

  for (const provider of fallbackChain) {
    if (banners.length >= count) break;
    const needed = count - banners.length;

    console.log(`[Banner Studio] Provider attempted: ${provider}`);

    if (provider === "pexels") {
      try {
        let results = await searchPexels(searchQuery, 1, needed);
        if (results.length === 0 && cleanTopic.includes(" ")) {
          const firstWord = cleanTopic.split(" ")[0];
          results = await searchPexels(firstWord, 1, needed);
        }
        if (results.length === 0) {
          results = await searchPexels("technology", 1, needed);
        }
        if (results.length > 0) {
          const imported = await importSearchResultsAsBanners(results, "pexels", category);
          if (imported.length > 0) {
            banners.push(...imported);
            usedProviders.add("pexels");
            attempts.push({ provider: "pexels", success: true, count: imported.length });
            console.log(`[Banner Studio] Provider succeeded: pexels (fetched ${imported.length} banners)`);
          } else {
            const reason = "Failed to download Pexels banner images";
            attempts.push({ provider: "pexels", success: false, count: 0, reason });
            console.log(`[Banner Studio] Fallback reason: ${reason}`);
          }
        } else {
          const reason = "Pexels returned 0 search results";
          attempts.push({ provider: "pexels", success: false, count: 0, reason });
          console.log(`[Banner Studio] Fallback reason: ${reason}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        attempts.push({ provider: "pexels", success: false, count: 0, reason });
        console.log(`[Banner Studio] Fallback reason: ${reason}`);
      }
    } else if (provider === "unsplash") {
      try {
        let results = await searchUnsplash(searchQuery, 1, needed);
        if (results.length === 0 && cleanTopic.includes(" ")) {
          const firstWord = cleanTopic.split(" ")[0];
          results = await searchUnsplash(firstWord, 1, needed);
        }
        if (results.length === 0) {
          results = await searchUnsplash("technology", 1, needed);
        }
        if (results.length > 0) {
          const imported = await importSearchResultsAsBanners(results, "unsplash", category);
          if (imported.length > 0) {
            banners.push(...imported);
            usedProviders.add("unsplash");
            attempts.push({ provider: "unsplash", success: true, count: imported.length });
            console.log(`[Banner Studio] Provider succeeded: unsplash (fetched ${imported.length} banners)`);
          } else {
            const reason = "Failed to download Unsplash banner images";
            attempts.push({ provider: "unsplash", success: false, count: 0, reason });
            console.log(`[Banner Studio] Fallback reason: ${reason}`);
          }
        } else {
          const reason = "Unsplash returned 0 search results";
          attempts.push({ provider: "unsplash", success: false, count: 0, reason });
          console.log(`[Banner Studio] Fallback reason: ${reason}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        attempts.push({ provider: "unsplash", success: false, count: 0, reason });
        console.log(`[Banner Studio] Fallback reason: ${reason}`);
      }
    } else if (provider === "openai") {
      try {
        const openaiResult = await generateOpenAiBanners(topic, style, needed, category);
        if (openaiResult.banners.length > 0) {
          banners.push(...openaiResult.banners);
          usedProviders.add("openai");
          attempts.push({ provider: "openai", success: true, count: openaiResult.banners.length });
          console.log(`[Banner Studio] Provider succeeded: openai (fetched ${openaiResult.banners.length} banners)`);
        } else {
          const reason = openaiResult.error || "OpenAI failed to generate images";
          attempts.push({ provider: "openai", success: false, count: 0, reason });
          warnings.push(reason);
          console.log(`[Banner Studio] Fallback reason: ${reason}`);
        }
      } catch (err) {
        const reason = classifyOpenAIError(err);
        attempts.push({ provider: "openai", success: false, count: 0, reason });
        warnings.push(reason);
        console.log(`[Banner Studio] Fallback reason: ${reason}`);
      }
    } else if (provider === "curated") {
      try {
        const curated = searchCuratedLibrary(topic, 1, needed);
        if (curated.length > 0) {
          const imported = await importSearchResultsAsBanners(curated, "template", category);
          if (imported.length > 0) {
            banners.push(...imported);
            usedProviders.add("curated");
            attempts.push({ provider: "curated", success: true, count: imported.length });
            console.log(`[Banner Studio] Provider succeeded: curated (fetched ${imported.length} banners)`);
          } else {
            const reason = "Failed to load curated template images";
            attempts.push({ provider: "curated", success: false, count: 0, reason });
            console.log(`[Banner Studio] Fallback reason: ${reason}`);
          }
        } else {
          const reason = "Curated library returned 0 images";
          attempts.push({ provider: "curated", success: false, count: 0, reason });
          console.log(`[Banner Studio] Fallback reason: ${reason}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        attempts.push({ provider: "curated", success: false, count: 0, reason });
        console.log(`[Banner Studio] Fallback reason: ${reason}`);
      }
    }
  }

  const finalBanners = banners.slice(0, count);
  if (!finalBanners.length) {
    throw new Error("All configured banner providers failed. Check API keys and network connectivity.");
  }

  const activeProvider = Array.from(usedProviders).join("+") || "none";
  const primaryAttempt = attempts[0];
  const usedFallback = primaryAttempt ? !primaryAttempt.success || finalBanners.length > primaryAttempt.count : false;

  return {
    banners: finalBanners,
    provider: activeProvider,
    selectedProvider,
    attempts,
    warnings,
    usedFallback,
  };
}

/** @deprecated Use generateBannersWithFallback — kept for internal compatibility */
export async function generateAiBanners(
  topic: string,
  style: keyof typeof AI_STYLE_PROMPTS = "professional"
): Promise<StoredBanner[]> {
  const result = await generateBannersWithFallback(topic, style, undefined, 4);
  return result.banners;
}

export function resolveCategoryFallbackSource(categoryName: string): string {
  const key = categoryName.toLowerCase().trim();
  if (CATEGORY_FALLBACK_SOURCES[key]) return CATEGORY_FALLBACK_SOURCES[key];

  for (const [k, url] of Object.entries(CATEGORY_FALLBACK_SOURCES)) {
    if (k !== "default" && (key.includes(k) || k.includes(key))) return url;
  }

  if (key.includes("career") || key.includes("interview") || key.includes("resume")) return CATEGORY_FALLBACK_SOURCES["product management"];
  if (key.includes("algorithm") || key.includes("data structure") || key.includes("dsa")) return CATEGORY_FALLBACK_SOURCES.programming;
  if (key.includes("security") || key.includes("cyber") || key.includes("hack")) return CATEGORY_FALLBACK_SOURCES.cybersecurity;
  if (key.includes("devops") || key.includes("cloud")) return CATEGORY_FALLBACK_SOURCES["cloud computing"];
  if (key.includes("data")) return CATEGORY_FALLBACK_SOURCES["data science"];
  if (key.includes("ai") || key.includes("ml") || key.includes("neural")) return CATEGORY_FALLBACK_SOURCES.ai;
  if (key.includes("web") || key.includes("frontend")) return CATEGORY_FALLBACK_SOURCES["web development"];
  if (key.includes("mobile")) return CATEGORY_FALLBACK_SOURCES["mobile development"];
  if (key.includes("research") || key.includes("innovation")) return CATEGORY_FALLBACK_SOURCES.research;
  if (key.includes("blockchain") || key.includes("crypto")) return CATEGORY_FALLBACK_SOURCES.blockchain;
  if (key.includes("ux") || key.includes("ui")) return CATEGORY_FALLBACK_SOURCES["ui/ux design"];
  if (key.includes("marketing")) return CATEGORY_FALLBACK_SOURCES["digital marketing"];

  return CATEGORY_FALLBACK_SOURCES.default;
}

export async function getCategoryFallbackBanner(categoryName: string): Promise<StoredBanner> {
  const source = resolveCategoryFallbackSource(categoryName);
  return importBannerFromUrl(source, { source: "template", category: categoryName });
}

async function testUnsplashHealth(): Promise<BannerProviderHealth> {
  const key = process.env.UNSPLASH_API_KEY?.trim();
  if (!key) return { configured: false, connected: false, status: "not_configured" };

  try {
    const res = await fetch("https://api.unsplash.com/photos/random?count=1", {
      headers: { Authorization: unsplashAuthorizationHeader(key) },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { configured: true, connected: true, status: "connected" };
    const body = await res.text();
    return { configured: true, connected: false, status: "failed", message: `HTTP ${res.status}: ${body.slice(0, 120)}` };
  } catch (err) {
    return { configured: true, connected: false, status: "failed", message: err instanceof Error ? err.message : "Unsplash unreachable" };
  }
}

async function testPexelsHealth(): Promise<BannerProviderHealth> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return { configured: false, connected: false, status: "not_configured" };

  try {
    const res = await fetch("https://api.pexels.com/v1/search?query=technology&per_page=1", {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { configured: true, connected: true, status: "connected" };
    const body = await res.text();
    return { configured: true, connected: false, status: "failed", message: `HTTP ${res.status}: ${body.slice(0, 120)}` };
  } catch (err) {
    return { configured: true, connected: false, status: "failed", message: err instanceof Error ? err.message : "Pexels unreachable" };
  }
}

async function testOpenAIHealth(): Promise<BannerProviderHealth> {
  const key = getOpenAIApiKey();
  if (!key) return { configured: false, connected: false, status: "not_configured", message: "OPENAI_API_KEY missing or malformed" };

  try {
    const client = new OpenAI({ apiKey: key });
    const models = await client.models.list({ limit: 100 });
    const imageModels = models.data.filter((m) => /image|dall/i.test(m.id)).map((m) => m.id);
    if (imageModels.length === 0) {
      return { configured: true, connected: false, status: "failed", message: "No image generation models available on this API key" };
    }
    return {
      configured: true,
      connected: true,
      status: "connected",
      message: `Models: ${imageModels.slice(0, 3).join(", ")}`,
    };
  } catch (err) {
    return { configured: true, connected: false, status: "failed", message: classifyOpenAIError(err) };
  }
}

export async function testBannerProviderHealth() {
  const [openai, unsplash, pexels] = await Promise.all([
    testOpenAIHealth(),
    testUnsplashHealth(),
    testPexelsHealth(),
  ]);

  return {
    selectedProvider: getSelectedBannerProvider(),
    openai,
    unsplash,
    pexels,
    templates: { configured: true, connected: true, status: "connected" as const },
    curated: { configured: true, connected: true, status: "connected" as const },
    firebase: {
      configured: isFirebaseConfigured(),
      connected: isFirebaseConfigured(),
      status: (isFirebaseConfigured() ? "connected" : "not_configured") as "connected" | "not_configured",
    },
    env: {
      cwd: process.cwd(),
      selectedProvider: getSelectedBannerProvider(),
      ...publicBannerKeyPresence(),
    },
  };
}

export function logBannerStudioStartupStatus() {
  for (const line of formatBannerProviderStartupLines()) {
    console.log(line);
  }
  console.log(`  Upload dir: ${BANNERS_DIR}`);
}

/** Static provider flags (fast, no network) */
export function getBannerProviderStatus() {
  return {
    pexels: isPexelsConfigured(),
    unsplash: isUnsplashConfigured(),
    google: !!(process.env.GOOGLE_CUSTOM_SEARCH_API_KEY?.trim() && googleCseId()),
    openai: isOpenAiBannerKeyConfigured(),
    firebase: isFirebaseConfigured(),
    templates: true,
    curated: true,
    search: true,
  };
}

export function suggestBannerKeywords(title: string, categoryName?: string): string[] {
  const t = `${title} ${categoryName || ""}`.toLowerCase();
  const keywords = new Set<string>();

  const rules: Array<{ match: RegExp | string; suggestions: string[] }> = [
    { match: /artificial intelligence|\bai\b/, suggestions: ["Artificial Intelligence", "Machine Learning", "Neural Networks", "Deep Learning"] },
    { match: /machine learning|\bml\b/, suggestions: ["Machine Learning", "Data Science", "Neural Networks", "AI Technology"] },
    { match: /deep learning/, suggestions: ["Deep Learning", "Neural Networks", "AI Research", "Machine Learning"] },
    { match: /generative|\bgpt\b|\bllm\b/, suggestions: ["Generative AI", "Artificial Intelligence", "Machine Learning", "Technology"] },
    { match: /software|engineering|programming|developer/, suggestions: ["Software Engineering", "Programming", "Full Stack", "Cloud Computing"] },
    { match: /web|frontend|backend|full.?stack/, suggestions: ["Web Development", "Frontend Development", "Backend Development", "Programming"] },
    { match: /mobile|android|ios|flutter/, suggestions: ["Mobile Development", "App Development", "Programming", "Technology"] },
    { match: /cyber|security|hacking|penetration/, suggestions: ["Cyber Security", "Ethical Hacking", "Network Security", "SOC Operations"] },
    { match: /cloud|aws|azure|gcp/, suggestions: ["Cloud Computing", "DevOps", "Infrastructure", "Technology"] },
    { match: /devops|ci\/?cd|kubernetes|docker/, suggestions: ["DevOps", "Cloud Computing", "Automation", "Infrastructure"] },
    { match: /data science|analytics|big data/, suggestions: ["Data Science", "Data Analytics", "Machine Learning", "Business Intelligence"] },
    { match: /research|innovation|academic|paper/, suggestions: ["Research", "Innovation", "Academic Research", "Scientific Computing"] },
    { match: /blockchain|crypto|web3/, suggestions: ["Blockchain", "Cryptocurrency", "Technology", "Programming"] },
    { match: /iot|internet of things/, suggestions: ["IoT", "Technology", "Embedded Systems", "Innovation"] },
    { match: /ar\/vr|virtual reality|augmented/, suggestions: ["AR/VR", "Technology", "Innovation", "3D Computing"] },
    { match: /product management/, suggestions: ["Product Management", "Business Strategy", "Technology", "Innovation"] },
    { match: /ui\/ux|design|user experience/, suggestions: ["UI/UX Design", "Digital Design", "Technology", "Creative"] },
    { match: /marketing|seo|social media/, suggestions: ["Digital Marketing", "Business", "Technology", "Analytics"] },
    { match: /business intelligence|\bbi\b/, suggestions: ["Business Intelligence", "Data Analytics", "Data Science", "Technology"] },
  ];

  for (const rule of rules) {
    const matches = typeof rule.match === "string" ? t.includes(rule.match) : rule.match.test(t);
    if (matches) rule.suggestions.forEach((s) => keywords.add(s));
  }

  if (keywords.size === 0) {
    ["Technology", "Programming", "Education", "Innovation", "Research"].forEach((s) => keywords.add(s));
  }

  if (title.trim()) keywords.add(title.trim());

  return Array.from(keywords).slice(0, 8);
}
