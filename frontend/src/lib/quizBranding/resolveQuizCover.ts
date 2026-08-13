import type { CSSProperties } from "react";
import type { QuizThemeId } from "./types";
import { themeToGradient } from "./types";

/** Branding fields carried on quiz list items, previews, and live sessions. */
export interface QuizCoverFields {
  id?: string;
  bannerUrl?: string | null;
  thumbnailUrl?: string | null;
  coverImageUrl?: string | null;
  coverGradient?: string | null;
  theme?: QuizThemeId | string | null;
}

export function isCssGradient(value: string): boolean {
  return /^(linear|radial|conic)-gradient\(/i.test(value.trim());
}

/** Resolve banner image URL from metadata or list item fields. */
export function resolveQuizBannerUrl(fields: QuizCoverFields): string | null {
  const url = fields.bannerUrl || fields.coverImageUrl || fields.thumbnailUrl;
  return url?.trim() || null;
}

const SEED_GRADIENTS = [
  "from-amber-700 via-amber-600 to-yellow-500",
  "from-blue-700 via-blue-600 to-cyan-500",
  "from-purple-700 via-violet-600 to-fuchsia-500",
  "from-emerald-700 via-green-600 to-lime-500",
  "from-indigo-700 via-purple-600 to-pink-500",
  "from-cyan-700 via-teal-600 to-emerald-500",
];

/** Tailwind gradient classes for theme fallback (never gray placeholder). */
export function resolveQuizTailwindGradient(
  fields: QuizCoverFields,
  seed?: string
): string {
  const raw = fields.coverGradient?.trim();
  if (raw && !isCssGradient(raw)) return raw;
  const theme = fields.theme as QuizThemeId | undefined;
  if (theme && theme !== "dark" && theme !== "light") return themeToGradient(theme);

  const key = seed || fields.id || "quiz";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % SEED_GRADIENTS.length;
  return SEED_GRADIENTS[idx];
}

/** Inline style when coverGradient is a CSS gradient string (templates). */
export function resolveQuizCoverStyle(fields: QuizCoverFields): CSSProperties | undefined {
  const raw = fields.coverGradient?.trim();
  if (raw && isCssGradient(raw)) return { background: raw };
  return undefined;
}

export function resolveQuizCoverSeed(fields: QuizCoverFields): string {
  return fields.id || "quiz";
}
