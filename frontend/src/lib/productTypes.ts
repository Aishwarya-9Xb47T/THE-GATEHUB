/** Learning product types — same editor & project structure, different publish rules */
import { getAcademicStudioUniverseUrl } from "@/lib/academicStudio/studioContract";

export const PRODUCT_TYPES = {
  LEARNING_UNIVERSE: "learning-universe",
  PREMIUM_COURSE: "premium-course",
  FREE_COURSE: "free-course",
  FREE_RESOURCE: "free-learning-resource",
} as const;

export type ProductType = (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES];

export const DEFAULT_PRODUCT_TYPE = PRODUCT_TYPES.LEARNING_UNIVERSE;

export function parseProductType(value: string | null | undefined): ProductType {
  if (value === PRODUCT_TYPES.PREMIUM_COURSE) return PRODUCT_TYPES.PREMIUM_COURSE;
  if (value === PRODUCT_TYPES.FREE_COURSE) return PRODUCT_TYPES.FREE_COURSE;
  if (value === PRODUCT_TYPES.FREE_RESOURCE) return PRODUCT_TYPES.FREE_RESOURCE;
  return PRODUCT_TYPES.LEARNING_UNIVERSE;
}

export function productTypeLabel(productType: ProductType): string {
  switch (productType) {
    case PRODUCT_TYPES.PREMIUM_COURSE:
      return "Premium Course";
    case PRODUCT_TYPES.FREE_COURSE:
      return "Free Learning Course";
    case PRODUCT_TYPES.FREE_RESOURCE:
      return "Free Learning Resource";
    default:
      return "Learning Universe";
  }
}

/** Visual Authoring Studio URL — universe id + optional productType. */
export function getVisualStudioPath(universeId: string, productType: ProductType): string {
  const params = new URLSearchParams();
  params.set("universe", universeId);
  if (productType !== PRODUCT_TYPES.LEARNING_UNIVERSE) {
    params.set("productType", productType);
  }
  return `/instructor/learning-universe/new/visual?${params.toString()}`;
}

/** Academic Studio URL — always uses universe id; productType preserved in query. */
export function getAcademicStudioPath(universeId: string, productType: ProductType): string {
  return getAcademicStudioUniverseUrl(universeId, productType);
}

/** Instructor dashboard section where this product type should appear after creation. */
export function getProductDashboardPath(productType: ProductType): string {
  switch (productType) {
    case PRODUCT_TYPES.FREE_COURSE:
    case PRODUCT_TYPES.FREE_RESOURCE:
      return "/manage-courses";
    case PRODUCT_TYPES.PREMIUM_COURSE:
      return "/instructor/courses";
    default:
      return "/instructor/dashboard";
  }
}
