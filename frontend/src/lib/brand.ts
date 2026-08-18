/** Official THE GATEHUB brand assets — single source of truth */
export const BRAND_NAME = "THE GATEHUB";

/** Favicon / certificate asset path. Not rendered as in-app chrome. */
export const BRAND_LOGO_SRC = "/logo.png";

export const BRAND_LOGO_HEIGHT = {
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
} as const;

export type BrandLogoSize = keyof typeof BRAND_LOGO_HEIGHT;
