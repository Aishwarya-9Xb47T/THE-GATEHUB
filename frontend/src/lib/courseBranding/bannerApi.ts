import { api, apiFormData } from "@/lib/api";
import { resolveCourseMediaUrl } from "@/lib/courseMediaUrls";
import type { BannerType } from "./types";

export interface BannerAsset {
  bannerId?: string;
  bannerUrl: string;
  thumbnailUrl: string;
  source?: string;
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  source?: string;
}

const imageCache = new Map<string, string>();

export async function getBannerConfig() {
  return api<{
    success: boolean;
    data: {
      pexels: boolean;
      unsplash: boolean;
      google: boolean;
      openai: boolean;
      firebase: boolean;
      templates: boolean;
      curated?: boolean;
      search?: boolean;
    };
  }>("/banners/config");
}

export interface BannerProviderHealthEntry {
  configured: boolean;
  connected: boolean;
  status: "connected" | "failed" | "not_configured";
  message?: string;
}

export async function getBannerHealth() {
  return api<{
    success: boolean;
    data: {
      openai: BannerProviderHealthEntry;
      unsplash: BannerProviderHealthEntry;
      pexels: BannerProviderHealthEntry;
      templates: BannerProviderHealthEntry;
      curated: BannerProviderHealthEntry;
      firebase: BannerProviderHealthEntry;
      env?: {
        cwd: string;
        selectedProvider?: string;
        openai: "configured" | "not_configured";
        unsplash: "configured" | "not_configured";
        pexels: "configured" | "not_configured";
      };
    };
  }>("/banners/health");
}

export async function searchBanners(query: string, page = 1) {
  return api<{
    success: boolean;
    data: { results: SearchResult[]; hasMore: boolean; provider?: string };
  }>("/banners/search", { method: "POST", body: { query, page, perPage: 12 } });
}

export async function importBanner(url: string, source?: string, category?: string) {
  return api<{ success: boolean; data: BannerAsset & { bannerType: BannerType } }>("/banners/import", {
    method: "POST",
    body: { url, source, category },
  });
}

export async function generateBanners(
  prompt: string,
  style = "professional",
  category?: string
) {
  return api<{
    success: boolean;
    images?: (BannerAsset & { bannerType: BannerType; source?: string })[];
    provider?: string;
    warnings?: string[];
    data: {
      banners: (BannerAsset & { bannerType: BannerType; source?: string })[];
      bannerUrl: string;
      bannerId?: string;
      provider?: string;
      warnings?: string[];
    };
  }>("/banner/generate", {
    method: "POST",
    body: { prompt, style, category, count: 4 },
  });
}

export async function categoryFallbackBanner(categoryName: string) {
  return api<{ success: boolean; data: BannerAsset & { bannerType: BannerType } }>("/banners/category-fallback", {
    method: "POST",
    body: { categoryName },
  });
}

export async function uploadBannerFiles(banner: Blob, thumbnail?: Blob) {
  const form = new FormData();
  form.append("banner", banner, "banner.jpg");
  if (thumbnail) form.append("thumbnail", thumbnail, "thumb.jpg");
  return apiFormData<{ success: boolean; data: BannerAsset & { bannerType: BannerType } }>("/banners/upload", form);
}

export function bannerUrlHost(url: string): string {
  if (!url) return "empty";
  if (url.startsWith("blob:")) return "blob";
  if (url.startsWith("data:")) return "data";
  if (url.startsWith("/uploads/")) return "uploads";
  try {
    if (/^https?:\/\//i.test(url)) return new URL(url).hostname;
  } catch {
    /* ignore */
  }
  return "relative";
}

export function resolveBannerSrc(url: string): string {
  if (!url) return "";
  if (url.startsWith("blob:")) return url;
  const cached = imageCache.get(url);
  if (cached) return cached;
  const resolved = resolveCourseMediaUrl(url) || url;
  imageCache.set(url, resolved);
  return resolved;
}

export function preloadBannerImage(url: string): void {
  if (!url) return;
  const src = resolveBannerSrc(url);
  const img = new Image();
  img.src = src;
}
