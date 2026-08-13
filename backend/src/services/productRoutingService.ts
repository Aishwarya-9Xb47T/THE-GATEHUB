/**
 * Product type routing — immutable productType from creation flow → correct listing/storage.
 */
import { AppError } from "../middlewares/errorHandler.js";
import { prisma } from "../utils/prisma.js";

export const PRODUCT_TYPES = {
  LEARNING_UNIVERSE: "learning-universe",
  PREMIUM_COURSE: "premium-course",
  FREE_COURSE: "free-course",
  FREE_RESOURCE: "free-learning-resource",
} as const;

export type ProductType = (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES];

export type CreationSource = "ai-architect" | "branding-draft" | "manual" | "academic-studio";

export type ListingTable = "learning_universe" | "resource_course" | "course";

/** Catalog visibility flags — stored in LearningUniverse.structuredData.catalogVisibility */
export const CATALOG_VISIBILITY = {
  FREE_LIBRARY: "FREE_LIBRARY",
  PREMIUM_LIBRARY: "PREMIUM_LIBRARY",
  LEARNING_UNIVERSE_LIBRARY: "LEARNING_UNIVERSE_LIBRARY",
  FEATURED_HOME: "FEATURED_HOME",
  TRENDING: "TRENDING",
  EDITOR_PICK: "EDITOR_PICK",
  AI_RECOMMENDED: "AI_RECOMMENDED",
} as const;

export type CatalogVisibilityFlag = (typeof CATALOG_VISIBILITY)[keyof typeof CATALOG_VISIBILITY];

export const LANDING_VISIBILITY_FLAGS: CatalogVisibilityFlag[] = [
  CATALOG_VISIBILITY.FEATURED_HOME,
  CATALOG_VISIBILITY.TRENDING,
  CATALOG_VISIBILITY.EDITOR_PICK,
  CATALOG_VISIBILITY.AI_RECOMMENDED,
];

export interface ProductSyncInput {
  universeId: string;
  productType: ProductType;
  instructorId: string;
  title: string;
  subtitle?: string;
  description?: string;
  thumbnail?: string | null;
  categoryId?: string | null;
  difficulty?: string;
  price?: number;
  sourceProjectId?: string;
  creationSource: CreationSource;
}

export interface ProductSyncResult {
  productType: ProductType;
  universeId: string;
  listingEntityId: string;
  listingTable: ListingTable;
  linkedCourseId?: string;
  linkedResourceCourseId?: string;
}

export function parseProductType(value: string | null | undefined, fallback?: ProductType): ProductType {
  const v = (value || "").trim();
  if (v === PRODUCT_TYPES.PREMIUM_COURSE) return PRODUCT_TYPES.PREMIUM_COURSE;
  if (v === PRODUCT_TYPES.FREE_COURSE) return PRODUCT_TYPES.FREE_COURSE;
  if (v === PRODUCT_TYPES.FREE_RESOURCE) return PRODUCT_TYPES.FREE_RESOURCE;
  if (v === PRODUCT_TYPES.LEARNING_UNIVERSE) return PRODUCT_TYPES.LEARNING_UNIVERSE;
  if (fallback) return fallback;
  return PRODUCT_TYPES.LEARNING_UNIVERSE;
}

export function getProductTypeFromStructuredData(structuredData: unknown): ProductType | null {
  if (!structuredData || typeof structuredData !== "object" || Array.isArray(structuredData)) return null;
  const pt = (structuredData as Record<string, unknown>).productType;
  return typeof pt === "string" ? parseProductType(pt) : null;
}

/** Resolve product type from explicit field or legacy link metadata. */
export function inferProductType(structuredData: unknown): ProductType {
  const explicit = getProductTypeFromStructuredData(structuredData);
  if (explicit) return explicit;
  const rec = readStructuredRecord(structuredData);
  if (hasCatalogVisibility(rec, CATALOG_VISIBILITY.FREE_LIBRARY)) {
    return PRODUCT_TYPES.FREE_COURSE;
  }
  if (hasCatalogVisibility(rec, CATALOG_VISIBILITY.PREMIUM_LIBRARY)) {
    return PRODUCT_TYPES.PREMIUM_COURSE;
  }
  if (typeof rec.linkedResourceCourseId === "string" && rec.linkedResourceCourseId) {
    return PRODUCT_TYPES.FREE_COURSE;
  }
  if (typeof rec.linkedCourseId === "string" && rec.linkedCourseId) {
    return PRODUCT_TYPES.PREMIUM_COURSE;
  }
  return PRODUCT_TYPES.LEARNING_UNIVERSE;
}

export function isLearningUniverseListingProduct(productType: ProductType): boolean {
  return productType === PRODUCT_TYPES.LEARNING_UNIVERSE;
}

export function isFreeLearningProduct(productType: ProductType): boolean {
  return productType === PRODUCT_TYPES.FREE_COURSE || productType === PRODUCT_TYPES.FREE_RESOURCE;
}

export function defaultCatalogVisibilityForProduct(productType: ProductType): CatalogVisibilityFlag[] {
  switch (productType) {
    case PRODUCT_TYPES.FREE_COURSE:
    case PRODUCT_TYPES.FREE_RESOURCE:
      return [CATALOG_VISIBILITY.FREE_LIBRARY];
    case PRODUCT_TYPES.PREMIUM_COURSE:
      return [CATALOG_VISIBILITY.PREMIUM_LIBRARY];
    default:
      return [CATALOG_VISIBILITY.LEARNING_UNIVERSE_LIBRARY];
  }
}

export function getCatalogVisibility(structuredData: unknown): CatalogVisibilityFlag[] {
  const rec = readStructuredRecord(structuredData);
  const raw = rec.catalogVisibility;
  if (Array.isArray(raw)) {
    return raw.filter((v): v is CatalogVisibilityFlag => typeof v === "string");
  }
  const pt = getProductTypeFromStructuredData(rec) ?? PRODUCT_TYPES.LEARNING_UNIVERSE;
  const base = defaultCatalogVisibilityForProduct(pt);
  if (rec.featureOnHomepage === true || rec.featuredHome === true) {
    return [...base, CATALOG_VISIBILITY.FEATURED_HOME];
  }
  return base;
}

export function hasCatalogVisibility(structuredData: unknown, flag: CatalogVisibilityFlag): boolean {
  return getCatalogVisibility(structuredData).includes(flag);
}

export function isFeaturedOnHomepage(structuredData: unknown): boolean {
  const rec = readStructuredRecord(structuredData);
  if (rec.featureOnHomepage === true || rec.featuredHome === true) return true;
  return LANDING_VISIBILITY_FLAGS.some((f) => hasCatalogVisibility(structuredData, f));
}

export function mergePublishStructuredData(
  existing: unknown,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const prev = readStructuredRecord(existing);
  const productType =
    getProductTypeFromStructuredData(prev) ??
    getProductTypeFromStructuredData(incoming) ??
    PRODUCT_TYPES.LEARNING_UNIVERSE;

  let visibility = getCatalogVisibility(prev);
  if (!visibility.length) {
    visibility = defaultCatalogVisibilityForProduct(productType);
  }

  return {
    ...incoming,
    productType: prev.productType ?? incoming.productType ?? productType,
    creationSource: prev.creationSource ?? incoming.creationSource,
    creationMode: prev.creationMode ?? incoming.creationMode,
    immutableProductType: prev.immutableProductType ?? true,
    linkedCourseId: prev.linkedCourseId ?? incoming.linkedCourseId,
    linkedResourceCourseId: prev.linkedResourceCourseId ?? incoming.linkedResourceCourseId,
    sourceProjectId: incoming.sourceProjectId ?? prev.sourceProjectId,
    catalogVisibility: visibility,
    featureOnHomepage: prev.featureOnHomepage ?? false,
    featuredHome: prev.featuredHome ?? false,
    // Preserve Architect certificate settings across republish (do not wipe → default true)
    completionRules: prev.completionRules ?? incoming.completionRules,
    aiArchitect: prev.aiArchitect ?? incoming.aiArchitect,
  };
}

/** After publish — route listing records to the correct catalog only. */
export async function syncCatalogOnPublish(universeId: string): Promise<void> {
  const universe = await prisma.learningUniverse.findUnique({
    where: { id: universeId },
    select: {
      id: true,
      title: true,
      subtitle: true,
      description: true,
      thumbnail: true,
      bannerUrl: true,
      price: true,
      categoryId: true,
      difficulty: true,
      instructorId: true,
      structuredData: true,
    },
  });
  if (!universe) return;

  const structured = readStructuredRecord(universe.structuredData);
  const productType = inferProductType(structured);
  let linkedCourseId =
    typeof structured.linkedCourseId === "string" ? structured.linkedCourseId : undefined;
  const cardImage = resolveProductCardImage(universe.bannerUrl, universe.thumbnail);

  const baseVisibility = defaultCatalogVisibilityForProduct(productType);
  const visibility = new Set<CatalogVisibilityFlag>(baseVisibility);
  for (const flag of getCatalogVisibility(structured)) {
    if (LANDING_VISIBILITY_FLAGS.includes(flag)) visibility.add(flag);
  }
  if (structured.featureOnHomepage === true || structured.featuredHome === true) {
    visibility.add(CATALOG_VISIBILITY.FEATURED_HOME);
  }

  await prisma.learningUniverse.update({
    where: { id: universeId },
    data: {
      structuredData: {
        ...structured,
        productType,
        immutableProductType: true,
        catalogVisibility: [...visibility],
      } as object,
      ...(cardImage ? { thumbnail: cardImage } : {}),
    },
  });

  if (isFreeLearningProduct(productType)) {
    await prisma.resourceCourse.upsert({
      where: { id: universeId },
      create: {
        id: universeId,
        title: universe.title,
        description: universe.description || universe.subtitle || "",
        thumbnail: cardImage,
        instructorId: universe.instructorId,
        published: true,
      },
      update: {
        title: universe.title,
        description: universe.description || universe.subtitle || "",
        thumbnail: cardImage,
        published: true,
      },
    });

    if (linkedCourseId) {
      await prisma.course
        .update({
          where: { id: linkedCourseId },
          data: { status: "draft" },
        })
        .catch(() => {});
    }
    return;
  }

  await prisma.resourceCourse
    .updateMany({
      where: { id: universeId },
      data: { published: false },
    })
    .catch(() => {});

  if (productType === PRODUCT_TYPES.PREMIUM_COURSE) {
    if (!linkedCourseId) {
      const synced = await syncProductListingRecord({
        universeId,
        productType: PRODUCT_TYPES.PREMIUM_COURSE,
        instructorId: universe.instructorId,
        title: universe.title,
        subtitle: universe.subtitle ?? undefined,
        description: universe.description ?? undefined,
        thumbnail: cardImage ?? null,
        categoryId: universe.categoryId,
        difficulty: universe.difficulty ?? undefined,
        price: universe.price,
        creationSource: "academic-studio",
      });
      linkedCourseId = synced.linkedCourseId;
    }

    if (linkedCourseId) {
      await prisma.course
        .update({
          where: { id: linkedCourseId },
          data: {
            status: "published",
            publishedAt: new Date(),
            title: universe.title,
            subtitle: universe.subtitle ?? undefined,
            description: universe.description ?? undefined,
            price: universe.price,
            thumbnail: cardImage,
            bannerUrl: universe.bannerUrl || cardImage,
            categoryId: universe.categoryId ?? undefined,
            difficulty: normalizeDifficulty(universe.difficulty),
          },
        })
        .catch(() => {});
    }
  } else if (linkedCourseId) {
    await prisma.course
      .update({
        where: { id: linkedCourseId },
        data: { status: "draft" },
      })
      .catch(() => {});
  }

  const { syncProductFromLearningUniverse } = await import("./productCatalogService.js");
  await syncProductFromLearningUniverse(universeId).catch(() => {});
}

/** Remove sibling catalog listings when a universe is unpublished. */
export async function syncCatalogOnUnpublish(universeId: string): Promise<void> {
  const universe = await prisma.learningUniverse.findUnique({
    where: { id: universeId },
    select: { structuredData: true },
  });
  if (!universe) return;

  const structured = readStructuredRecord(universe.structuredData);
  const productType = inferProductType(structured);
  const linkedCourseId =
    typeof structured.linkedCourseId === "string" ? structured.linkedCourseId : undefined;

  await prisma.resourceCourse
    .updateMany({
      where: { id: universeId },
      data: { published: false },
    })
    .catch(() => {});

  if (productType === PRODUCT_TYPES.PREMIUM_COURSE && linkedCourseId) {
    await prisma.course
      .update({
        where: { id: linkedCourseId },
        data: { status: "draft" },
      })
      .catch(() => {});
  }

  const { syncProductOnUnpublish } = await import("./productCatalogService.js");
  await syncProductOnUnpublish({ learningUniverseId: universeId }).catch(() => {});
}

export function assertProductTypeMatch(
  expected: ProductType,
  actual: ProductType | null | undefined,
  context: string
): void {
  if (!actual) return;
  if (actual !== expected) {
    throw new AppError(
      422,
      `Product type mismatch in ${context}: expected "${expected}" but found "${actual}". Generation aborted.`
    );
  }
}

export function expectedListingTable(productType: ProductType): ListingTable {
  switch (productType) {
    case PRODUCT_TYPES.FREE_COURSE:
    case PRODUCT_TYPES.FREE_RESOURCE:
      return "resource_course";
    case PRODUCT_TYPES.PREMIUM_COURSE:
      return "course";
    default:
      return "learning_universe";
  }
}

function normalizeDifficulty(raw?: string): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower.includes("begin")) return "beginner";
  if (lower.includes("inter")) return "intermediate";
  if (lower.includes("adv")) return "advanced";
  return undefined;
}

export function readStructuredRecord(structuredData: unknown): Record<string, unknown> {
  if (!structuredData || typeof structuredData !== "object" || Array.isArray(structuredData)) return {};
  return structuredData as Record<string, unknown>;
}

export function validateProductPersistence(
  expectedProductType: ProductType,
  syncResult: ProductSyncResult
): void {
  if (syncResult.productType !== expectedProductType) {
    throw new AppError(
      422,
      `Product routing failed: expected "${expectedProductType}" but routed as "${syncResult.productType}".`
    );
  }
  const expectedTable = expectedListingTable(expectedProductType);
  if (syncResult.listingTable !== expectedTable) {
    throw new AppError(
      422,
      `Storage mismatch: "${expectedProductType}" must use "${expectedTable}" but got "${syncResult.listingTable}".`
    );
  }
}

export async function syncProductListingRecord(input: ProductSyncInput): Promise<ProductSyncResult> {
  const universe = await prisma.learningUniverse.findUnique({ where: { id: input.universeId } });
  if (!universe) throw new AppError(404, "Learning Universe draft not found for product sync");
  if (universe.instructorId !== input.instructorId) throw new AppError(403, "Unauthorized product sync");

  const existingStructured = readStructuredRecord(universe.structuredData);
  const existingProductType = getProductTypeFromStructuredData(existingStructured);

  if (existingProductType && existingProductType !== input.productType) {
    throw new AppError(
      422,
      `Product type is immutable: this draft is "${existingProductType}" and cannot become "${input.productType}".`
    );
  }

  assertProductTypeMatch(input.productType, existingProductType, "structuredData");

  let linkedCourseId = typeof existingStructured.linkedCourseId === "string" ? existingStructured.linkedCourseId : undefined;
  let linkedResourceCourseId =
    typeof existingStructured.linkedResourceCourseId === "string"
      ? existingStructured.linkedResourceCourseId
      : undefined;

  const desc = input.description || input.subtitle || "";
  const listingTable = expectedListingTable(input.productType);
  let listingEntityId = input.universeId;

  if (input.productType === PRODUCT_TYPES.FREE_COURSE || input.productType === PRODUCT_TYPES.FREE_RESOURCE) {
    linkedResourceCourseId = input.universeId;
    await prisma.resourceCourse.upsert({
      where: { id: input.universeId },
      create: {
        id: input.universeId,
        title: input.title,
        description: desc,
        thumbnail: input.thumbnail || undefined,
        instructorId: input.instructorId,
        published: false,
      },
      update: {
        title: input.title,
        description: desc,
        thumbnail: input.thumbnail || undefined,
      },
    });
    listingEntityId = input.universeId;
  } else if (input.productType === PRODUCT_TYPES.PREMIUM_COURSE) {
    if (linkedCourseId) {
      const existingCourse = await prisma.course.findFirst({
        where: { id: linkedCourseId, instructorId: input.instructorId },
      });
      if (existingCourse) {
        await prisma.course.update({
          where: { id: linkedCourseId },
          data: {
            title: input.title,
            subtitle: input.subtitle,
            description: desc,
            thumbnail: input.thumbnail || undefined,
            bannerUrl: input.thumbnail || undefined,
            categoryId: input.categoryId || undefined,
            difficulty: normalizeDifficulty(input.difficulty),
            price: typeof input.price === "number" ? input.price : existingCourse.price,
          },
        });
      } else {
        linkedCourseId = undefined;
      }
    }

    if (!linkedCourseId) {
      const course = await prisma.course.create({
        data: {
          title: input.title,
          subtitle: input.subtitle,
          description: desc,
          price: typeof input.price === "number" ? input.price : 0,
          thumbnail: input.thumbnail || undefined,
          bannerUrl: input.thumbnail || undefined,
          categoryId: input.categoryId || undefined,
          difficulty: normalizeDifficulty(input.difficulty),
          language: "en",
          status: "draft",
          instructorId: input.instructorId,
          aiContent: JSON.stringify({
            productType: PRODUCT_TYPES.PREMIUM_COURSE,
            academicStudio: {
              learningUniverseId: input.universeId,
              sourceProjectId: input.sourceProjectId,
            },
          }),
        },
      });
      linkedCourseId = course.id;
    }
    listingEntityId = linkedCourseId;

    if (linkedCourseId) {
      import("../controllers/coursesController.js")
        .then((m) => m.populateCourseSectionsFromBackingStore(linkedCourseId!))
        .catch(() => {});
    }
  }

  const structuredData = {
    ...existingStructured,
    productType: input.productType,
    creationSource: input.creationSource,
    creationMode: input.creationSource === "ai-architect" ? "ai-generation" : "authoring",
    immutableProductType: true,
    sourceProjectId:
      typeof input.sourceProjectId === "string"
        ? input.sourceProjectId
        : typeof existingStructured.sourceProjectId === "string"
          ? existingStructured.sourceProjectId
          : undefined,
    linkedCourseId,
    linkedResourceCourseId,
  };

  await prisma.learningUniverse.update({
    where: { id: input.universeId },
    data: { structuredData: structuredData as object },
  });

  return {
    productType: input.productType,
    universeId: input.universeId,
    listingEntityId,
    listingTable,
    linkedCourseId,
    linkedResourceCourseId,
  };
}

export function buildStructuredDataProductMeta(
  productType: ProductType,
  creationSource: CreationSource,
  extras?: Record<string, unknown>
): Record<string, unknown> {
  return {
    productType,
    creationSource,
    creationMode: creationSource === "ai-architect" ? "ai-generation" : "authoring",
    immutableProductType: true,
    ...extras,
  };
}

export function filterUniversesForLuListing<T extends { structuredData: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => inferProductType(row.structuredData) === PRODUCT_TYPES.LEARNING_UNIVERSE);
}

/** Instructor dashboard — premium courses are listed under Courses via linkedCourseId. */
export function filterUniversesForInstructorMine<T extends { structuredData: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => inferProductType(row.structuredData) !== PRODUCT_TYPES.PREMIUM_COURSE);
}

export function findPremiumUniverseForLinkedCourse<T extends { id: string; structuredData: unknown }>(
  courseId: string,
  universes: T[]
): T | undefined {
  return universes.find((u) => {
    if (inferProductType(u.structuredData) !== PRODUCT_TYPES.PREMIUM_COURSE) return false;
    const linked = readStructuredRecord(u.structuredData).linkedCourseId;
    return linked === courseId;
  });
}

/** Single publish status for premium courses backed by a Learning Universe. */
export function resolvePremiumCourseDisplayStatus(
  courseStatus: string,
  universeStatus?: string | null
): "draft" | "published" {
  if (courseStatus === "published" || universeStatus === "published") return "published";
  return "draft";
}

export async function syncPremiumUniverseStatusFromCourse(
  courseId: string,
  status: "draft" | "published",
  instructorId: string
): Promise<void> {
  const universes = await prisma.learningUniverse.findMany({
    where: { instructorId },
    select: { id: true, structuredData: true },
  });
  const linked = findPremiumUniverseForLinkedCourse(courseId, universes);
  if (!linked) return;

  await prisma.learningUniverse.update({
    where: { id: linked.id },
    data: {
      status,
      publishedAt: status === "published" ? new Date() : null,
    },
  });

  if (status === "published") {
    await syncCatalogOnPublish(linked.id);
  } else {
    await syncCatalogOnUnpublish(linked.id);
  }
}

export async function resolveLinkedCourseIdForProject(
  projectId: string,
  instructorId: string
): Promise<string | undefined> {
  const universe = await prisma.learningUniverse.findFirst({
    where: { sourceProjectId: projectId, instructorId },
    select: { structuredData: true },
  });
  if (!universe) return undefined;
  const linked = readStructuredRecord(universe.structuredData).linkedCourseId;
  return typeof linked === "string" ? linked : undefined;
}

export function filterUniversesForFreeLibrary<T extends { structuredData: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => isFreeLearningProduct(inferProductType(row.structuredData)));
}

export function filterFeaturedHomeUniverses<T extends { structuredData: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => isFeaturedOnHomepage(row.structuredData));
}

/** Published premium courses — includes legacy standalone courses, excludes free-learning only. */
export async function ensurePremiumLinkedCoursesPublished(): Promise<void> {
  const publishedUniverses = await prisma.learningUniverse.findMany({
    where: { status: "published" },
    select: { structuredData: true, bannerUrl: true, thumbnail: true },
  });

  const cardImage = (bannerUrl?: string | null, thumbnail?: string | null) =>
    resolveProductCardImage(bannerUrl, thumbnail);

  for (const universe of publishedUniverses) {
    if (inferProductType(universe.structuredData) !== PRODUCT_TYPES.PREMIUM_COURSE) continue;
    const linkedCourseId = readStructuredRecord(universe.structuredData).linkedCourseId;
    if (typeof linkedCourseId !== "string") continue;
    const image = cardImage(universe.bannerUrl, universe.thumbnail);
    await prisma.course
      .updateMany({
        where: { id: linkedCourseId, status: { not: "published" } },
        data: {
          status: "published",
          publishedAt: new Date(),
          ...(image ? { thumbnail: image, bannerUrl: universe.bannerUrl || image } : {}),
        },
      })
      .catch(() => {});
  }
}

export async function resolvePublishedPremiumCourseIds(): Promise<string[]> {
  await ensurePremiumLinkedCoursesPublished();

  const [allUniverses, publishedCourses] = await Promise.all([
    prisma.learningUniverse.findMany({
      select: { id: true, status: true, structuredData: true },
    }),
    prisma.course.findMany({
      where: { status: "published" },
      select: { id: true, price: true, aiContent: true },
    }),
  ]);

  const publishedUniverses = allUniverses.filter((u) => u.status === "published");

  const freeLuIds = new Set<string>();
  const freeLinkedCourseIds = new Set<string>();
  const premiumLuByLinkedCourse = new Map<string, { status: string }>();

  for (const universe of allUniverses) {
    const pt = inferProductType(universe.structuredData);
    if (isFreeLearningProduct(pt)) {
      if (universe.status === "published") freeLuIds.add(universe.id);
      const linked = readStructuredRecord(universe.structuredData).linkedCourseId;
      if (typeof linked === "string") freeLinkedCourseIds.add(linked);
    }
    if (pt === PRODUCT_TYPES.PREMIUM_COURSE) {
      const linked = readStructuredRecord(universe.structuredData).linkedCourseId;
      if (typeof linked === "string") {
        premiumLuByLinkedCourse.set(linked, { status: universe.status });
      }
    }
  }

  const premiumIds = new Set<string>();

  for (const course of publishedCourses) {
    if (freeLinkedCourseIds.has(course.id)) continue;
    if (freeLuIds.has(course.id)) continue;

    const backingLu = publishedUniverses.find((u) => u.id === course.id);
    if (backingLu && isFreeLearningProduct(inferProductType(backingLu.structuredData))) continue;

    const luBacker = premiumLuByLinkedCourse.get(course.id);
    if (luBacker && luBacker.status !== "published") continue;

    let linkedLuId: string | undefined;
    if (course.aiContent) {
      try {
        const parsed = JSON.parse(course.aiContent) as {
          academicStudio?: { learningUniverseId?: string };
        };
        linkedLuId = parsed.academicStudio?.learningUniverseId;
      } catch {
        /* ignore */
      }
    }
    if (linkedLuId) {
      const lu = allUniverses.find((u) => u.id === linkedLuId);
      if (lu && isFreeLearningProduct(inferProductType(lu.structuredData))) continue;
      if (
        lu &&
        inferProductType(lu.structuredData) === PRODUCT_TYPES.PREMIUM_COURSE &&
        lu.status !== "published"
      ) {
        continue;
      }
    }

    const explicitlyPremium =
      luBacker?.status === "published" ||
      (linkedLuId
        ? allUniverses.some(
            (u) =>
              u.id === linkedLuId &&
              inferProductType(u.structuredData) === PRODUCT_TYPES.PREMIUM_COURSE &&
              u.status === "published"
          )
        : false);

    if (course.price <= 0 && !explicitlyPremium) continue;

    premiumIds.add(course.id);
  }

  return [...premiumIds];
}

/** Course IDs flagged for homepage featured section (premium only, published LU). */
export async function resolveFeaturedHomePremiumCourseIds(): Promise<string[]> {
  const premiumIds = new Set(await resolvePublishedPremiumCourseIds());
  const universes = await prisma.learningUniverse.findMany({
    where: { status: "published" },
    select: { structuredData: true },
  });

  const featured: string[] = [];
  for (const u of universes) {
    if (!hasCatalogVisibility(u.structuredData, CATALOG_VISIBILITY.FEATURED_HOME)) continue;
    if (inferProductType(u.structuredData) !== PRODUCT_TYPES.PREMIUM_COURSE) continue;
    const linked = readStructuredRecord(u.structuredData).linkedCourseId;
    if (typeof linked === "string" && premiumIds.has(linked)) featured.push(linked);
  }
  return featured;
}

/** Card image — instructor banner always wins over DSL thumbnail. */
export function resolveProductCardImage(bannerUrl?: string | null, thumbnail?: string | null): string | undefined {
  return bannerUrl || thumbnail || undefined;
}
