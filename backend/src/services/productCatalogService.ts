import { prisma } from "../utils/prisma.js";
import { inferProductType, PRODUCT_TYPES, readStructuredRecord } from "./productRoutingService.js";

function slugify(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "product"}-${id.slice(-6)}`;
}

function effectivePrice(price: number, discountPrice?: number | null): number {
  if (discountPrice != null && discountPrice > 0 && discountPrice < price) return discountPrice;
  return price;
}

export async function syncProductFromCourse(courseId: string): Promise<void> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      subtitle: true,
      description: true,
      thumbnail: true,
      bannerUrl: true,
      price: true,
      categoryId: true,
      instructorId: true,
      status: true,
      aiContent: true,
    },
  });
  if (!course) return;

  let learningUniverseId: string | null = null;
  if (course.aiContent) {
    try {
      const parsed = JSON.parse(course.aiContent) as {
        academicStudio?: { learningUniverseId?: string };
        learningUniverseId?: string;
      };
      learningUniverseId =
        parsed.academicStudio?.learningUniverseId || parsed.learningUniverseId || null;
    } catch {
      /* ignore */
    }
  }
  if (!learningUniverseId) {
    const lus = await prisma.learningUniverse.findMany({
      where: { instructorId: course.instructorId },
      select: { id: true, structuredData: true },
      take: 100,
      orderBy: { updatedAt: "desc" },
    });
    for (const u of lus) {
      const sd = readStructuredRecord(u.structuredData);
      if (sd.linkedCourseId === course.id) {
        learningUniverseId = u.id;
        break;
      }
    }
  }

  const published = course.status === "published";
  const slug = slugify(course.title, course.id);

  await prisma.product.upsert({
    where: { courseId: course.id },
    create: {
      productType: "premium_course",
      slug,
      displayName: course.title,
      description: course.description || course.subtitle || null,
      thumbnail: course.thumbnail ?? course.bannerUrl,
      banner: course.bannerUrl ?? course.thumbnail,
      instructorId: course.instructorId,
      categoryId: course.categoryId,
      courseId: course.id,
      learningUniverseId: learningUniverseId || undefined,
      price: course.price,
      discountPrice: null,
      published,
      visible: published,
      featured: false,
    },
    update: {
      displayName: course.title,
      description: course.description || course.subtitle || null,
      thumbnail: course.thumbnail ?? course.bannerUrl,
      banner: course.bannerUrl ?? course.thumbnail,
      instructorId: course.instructorId,
      categoryId: course.categoryId,
      price: course.price,
      published,
      visible: published,
      featured: false,
      ...(learningUniverseId ? { learningUniverseId } : {}),
    },
  });
}

export async function syncProductFromLearningUniverse(universeId: string): Promise<void> {
  const lu = await prisma.learningUniverse.findUnique({
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
      instructorId: true,
      status: true,
      structuredData: true,
    },
  });
  if (!lu) return;

  const structured = readStructuredRecord(lu.structuredData);
  const inferred = inferProductType(structured);
  const productType =
    inferred === PRODUCT_TYPES.PREMIUM_COURSE ? "premium_course" : "learning_universe";

  if (inferred === PRODUCT_TYPES.PREMIUM_COURSE) {
    const linkedCourseId =
      typeof structured.linkedCourseId === "string" ? structured.linkedCourseId : null;
    if (linkedCourseId) {
      await syncProductFromCourse(linkedCourseId);
      return;
    }
  }

  const published = lu.status === "published";
  const slug = slugify(lu.title, lu.id);

  await prisma.product.upsert({
    where: { learningUniverseId: lu.id },
    create: {
      productType,
      slug,
      displayName: lu.title,
      description: lu.description || lu.subtitle || null,
      thumbnail: lu.thumbnail ?? lu.bannerUrl,
      banner: lu.bannerUrl ?? lu.thumbnail,
      instructorId: lu.instructorId,
      categoryId: lu.categoryId,
      learningUniverseId: lu.id,
      price: lu.price,
      published,
      visible: published,
      featured: structured.featuredHome === true || structured.featureOnHomepage === true,
    },
    update: {
      displayName: lu.title,
      description: lu.description || lu.subtitle || null,
      thumbnail: lu.thumbnail ?? lu.bannerUrl,
      banner: lu.bannerUrl ?? lu.thumbnail,
      instructorId: lu.instructorId,
      categoryId: lu.categoryId,
      price: lu.price,
      published,
      visible: published,
      featured: structured.featuredHome === true || structured.featureOnHomepage === true,
    },
  });
}

export async function syncProductOnUnpublish(
  ref: { courseId?: string; learningUniverseId?: string }
): Promise<void> {
  if (ref.courseId) {
    await prisma.product.updateMany({
      where: { courseId: ref.courseId },
      data: { published: false, visible: false },
    });
  }
  if (ref.learningUniverseId) {
    await prisma.product.updateMany({
      where: { learningUniverseId: ref.learningUniverseId },
      data: { published: false, visible: false },
    });
  }
}

export async function listProducts(filters?: {
  productType?: string;
  categoryId?: string;
  featured?: boolean;
  search?: string;
  instructorId?: string;
  limit?: number;
}) {
  const where: Record<string, unknown> = { published: true, visible: true };
  if (filters?.productType) where.productType = filters.productType;
  if (filters?.categoryId) where.categoryId = filters.categoryId;
  if (filters?.featured) where.featured = true;
  if (filters?.instructorId) where.instructorId = filters.instructorId;

  const products = await prisma.product.findMany({
    where,
    include: {
      course: { select: { id: true, title: true, thumbnail: true, price: true } },
      learningUniverse: { select: { id: true, title: true, thumbnail: true, price: true } },
      bundle: { select: { id: true, title: true, thumbnail: true, price: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: filters?.limit ?? 100,
  });

  if (!filters?.search) return products;

  const q = filters.search.toLowerCase();
  return products.filter((p) => p.displayName.toLowerCase().includes(q));
}

export async function getProductById(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    include: {
      course: true,
      learningUniverse: true,
      bundle: { include: { items: true } },
    },
  });
}

export function resolveProductSalePrice(product: {
  price: number;
  discountPrice?: number | null;
}): number {
  return effectivePrice(product.price, product.discountPrice);
}
