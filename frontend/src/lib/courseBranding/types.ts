export type BannerType = "upload" | "search" | "ai" | "template";

export type AiBannerStyle = "professional" | "technology" | "academic" | "modern" | "corporate";

export interface CourseBrandingData {
  title: string;
  subtitle: string;
  description: string;
  categoryId: string;
  categoryName?: string;
  difficulty: string;
  /** Premium course price in INR (0 = free enrollment). */
  price?: number;
  bannerUrl: string;
  thumbnailUrl: string;
  bannerType: BannerType;
  bannerId?: string;
}

export type { BannerTemplate } from "./templates";
export { BANNER_TEMPLATES, TEMPLATE_CATEGORIES, findTemplateById, matchTemplateToCategory } from "./templates";

export const DIFFICULTY_OPTIONS = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Beginner to Advanced",
  "Expert",
] as const;

export const AI_BANNER_STYLES: { id: AiBannerStyle; label: string; description: string }[] = [
  { id: "professional", label: "Professional", description: "Polished corporate look" },
  { id: "technology", label: "Technology", description: "Futuristic digital aesthetic" },
  { id: "academic", label: "Academic", description: "Scholarly university style" },
  { id: "modern", label: "Modern", description: "Bold contemporary design" },
  { id: "corporate", label: "Corporate", description: "Executive business tone" },
];

export const SUGGESTED_SEARCHES = [
  "Artificial Intelligence",
  "Machine Learning",
  "Data Science",
  "Software Engineering",
  "Cyber Security",
  "Cloud Computing",
  "DevOps",
  "Programming",
  "Research",
  "Technology",
] as const;

export const BRANDING_SESSION_KEY = "gatehub-course-branding";

import type { ProductType } from "@/lib/productTypes";

export function saveBrandingSession(data: CourseBrandingData & { universeId?: string; productType?: ProductType }) {
  sessionStorage.setItem(BRANDING_SESSION_KEY, JSON.stringify(data));
}

export function loadBrandingSession(): (CourseBrandingData & { universeId?: string; productType?: ProductType }) | null {
  try {
    const raw = sessionStorage.getItem(BRANDING_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearBrandingSession() {
  sessionStorage.removeItem(BRANDING_SESSION_KEY);
}
