/**
 * P3.1 — Course ↔ Product ↔ Learning Universe consistency audit.
 * AUDIT ONLY by default. Set P3_REPAIR=1 for deterministic non-destructive repairs.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { prisma } from "../src/utils/prisma.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";
import { readStructuredRecord } from "../src/services/productRoutingService.js";
import { syncProductFromCourse, syncProductFromLearningUniverse } from "../src/services/productCatalogService.js";

const OUT_DIR = path.resolve("scripts/p3-results");
mkdirSync(OUT_DIR, { recursive: true });
const REPAIR = process.env.P3_REPAIR === "1";

type Finding = {
  severity: "info" | "warn" | "error" | "ambiguous";
  code: string;
  message: string;
  record: Record<string, unknown>;
  recommendedAction: string;
  repaired?: boolean;
};

async function main() {
  const findings: Finding[] = [];
  const publishedCourses = await prisma.course.findMany({
    where: { status: "published" },
    select: {
      id: true,
      title: true,
      status: true,
      instructorId: true,
      price: true,
      aiContent: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          courseId: true,
          learningUniverseId: true,
          published: true,
          visible: true,
          price: true,
          displayName: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const allProducts = await prisma.product.findMany({
    select: {
      id: true,
      courseId: true,
      learningUniverseId: true,
      published: true,
      visible: true,
      displayName: true,
      productType: true,
      price: true,
    },
  });

  const allLus = await prisma.learningUniverse.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      instructorId: true,
      price: true,
      structuredData: true,
      product: { select: { id: true, courseId: true, learningUniverseId: true, published: true, visible: true } },
    },
  });

  const luByLinkedCourse = new Map<string, string[]>();
  for (const lu of allLus) {
    const sd = readStructuredRecord(lu.structuredData);
    const linked = typeof sd.linkedCourseId === "string" ? sd.linkedCourseId : null;
    if (linked) {
      const arr = luByLinkedCourse.get(linked) || [];
      arr.push(lu.id);
      luByLinkedCourse.set(linked, arr);
    }
  }

  const productsByCourse = new Map<string, typeof allProducts>();
  for (const p of allProducts) {
    if (!p.courseId) continue;
    const arr = productsByCourse.get(p.courseId) || [];
    arr.push(p);
    productsByCourse.set(p.courseId, arr);
  }

  const productsByLu = new Map<string, typeof allProducts>();
  for (const p of allProducts) {
    if (!p.learningUniverseId) continue;
    const arr = productsByLu.get(p.learningUniverseId) || [];
    arr.push(p);
    productsByLu.set(p.learningUniverseId, arr);
  }

  for (const course of publishedCourses) {
    const resolvedLu = await resolveCanonicalUniverseId(course.id);
    const linkedLus = luByLinkedCourse.get(course.id) || [];
    const products = productsByCourse.get(course.id) || [];

    if (!course.product && products.length === 0) {
      findings.push({
        severity: "warn",
        code: "course_without_product",
        message: "Published course has no Product",
        record: { courseId: course.id, title: course.title },
        recommendedAction: "Run syncProductFromCourse(courseId)",
      });
      if (REPAIR) {
        await syncProductFromCourse(course.id);
        findings[findings.length - 1].repaired = true;
      }
    }

    if (products.length > 1) {
      findings.push({
        severity: "ambiguous",
        code: "duplicate_products_for_course",
        message: "Multiple Product rows point at the same courseId (schema unique should prevent; check orphans)",
        record: { courseId: course.id, productIds: products.map((p) => p.id) },
        recommendedAction: "STOP — inspect manually; do not auto-delete",
      });
    }

    if (!resolvedLu && linkedLus.length === 0) {
      findings.push({
        severity: "warn",
        code: "course_without_lu",
        message: "Published course has no resolvable Learning Universe (classic-only or bridge gap)",
        record: { courseId: course.id, title: course.title },
        recommendedAction: "Report only — classic courses may be intentional; do not invent LU",
      });
    }

    if (linkedLus.length > 1) {
      findings.push({
        severity: "ambiguous",
        code: "duplicate_lu_for_course",
        message: "Multiple LUs have structuredData.linkedCourseId for this published course",
        record: { courseId: course.id, luIds: linkedLus, resolvedLu },
        recommendedAction: "STOP — keep canonical resolved LU; report extras; do not delete",
      });
    }

    if (course.product) {
      if (resolvedLu && course.product.learningUniverseId && course.product.learningUniverseId !== resolvedLu) {
        findings.push({
          severity: "error",
          code: "product_lu_mismatch",
          message: "Product.learningUniverseId differs from resolveCanonicalUniverseId(course)",
          record: {
            courseId: course.id,
            productId: course.product.id,
            productLu: course.product.learningUniverseId,
            resolvedLu,
          },
          recommendedAction: "Set Product.learningUniverseId to resolved LU if linkedCourseId agrees",
        });
        if (REPAIR && linkedLus.includes(resolvedLu)) {
          await prisma.product.update({
            where: { id: course.product.id },
            data: { learningUniverseId: resolvedLu },
          });
          findings[findings.length - 1].repaired = true;
        }
      }

      if (course.product.published !== true || course.product.visible !== true) {
        findings.push({
          severity: "warn",
          code: "product_not_visible_for_published_course",
          message: "Published course Product is unpublished or hidden",
          record: {
            courseId: course.id,
            productId: course.product.id,
            published: course.product.published,
            visible: course.product.visible,
          },
          recommendedAction: "syncProductFromCourse to align published/visible",
        });
        if (REPAIR) {
          await syncProductFromCourse(course.id);
          findings[findings.length - 1].repaired = true;
        }
      }
    }
  }

  // Orphan products
  for (const p of allProducts) {
    if (p.courseId) {
      const c = await prisma.course.findUnique({ where: { id: p.courseId }, select: { id: true } });
      if (!c) {
        findings.push({
          severity: "error",
          code: "orphan_product_course",
          message: "Product.courseId points to missing Course",
          record: { productId: p.id, courseId: p.courseId },
          recommendedAction: "STOP — inspect; cascade delete may have failed; do not guess",
        });
      }
    }
    if (p.learningUniverseId) {
      const lu = await prisma.learningUniverse.findUnique({
        where: { id: p.learningUniverseId },
        select: { id: true },
      });
      if (!lu) {
        findings.push({
          severity: "error",
          code: "orphan_product_lu",
          message: "Product.learningUniverseId points to missing LU",
          record: { productId: p.id, learningUniverseId: p.learningUniverseId },
          recommendedAction: "STOP — inspect manually",
        });
      }
    }
    if (!p.courseId && !p.learningUniverseId && !p.productType?.includes("bundle")) {
      findings.push({
        severity: "warn",
        code: "orphan_product_unlinked",
        message: "Product has neither courseId nor learningUniverseId",
        record: { productId: p.id, displayName: p.displayName, productType: p.productType },
        recommendedAction: "Report — may be incomplete draft listing",
      });
    }
  }

  // Published LUs without product / without linked course
  for (const lu of allLus.filter((u) => u.status === "published")) {
    const sd = readStructuredRecord(lu.structuredData);
    const linkedCourseId = typeof sd.linkedCourseId === "string" ? sd.linkedCourseId : null;
    const products = productsByLu.get(lu.id) || [];

    if (!lu.product && products.length === 0) {
      findings.push({
        severity: "warn",
        code: "lu_without_product",
        message: "Published Learning Universe has no Product",
        record: { luId: lu.id, title: lu.title, linkedCourseId },
        recommendedAction: "syncProductFromLearningUniverse(luId) if product type expects listing",
      });
      if (REPAIR) {
        await syncProductFromLearningUniverse(lu.id).catch(() => {});
        findings[findings.length - 1].repaired = true;
      }
    }

    if (linkedCourseId) {
      const course = await prisma.course.findUnique({
        where: { id: linkedCourseId },
        select: { id: true, status: true, title: true },
      });
      if (!course) {
        findings.push({
          severity: "error",
          code: "lu_linked_course_missing",
          message: "LU linkedCourseId points to missing Course",
          record: { luId: lu.id, linkedCourseId },
          recommendedAction: "STOP — do not invent course; clear link only after manual confirmation",
        });
      } else if (lu.status === "published" && course.status !== "published") {
        findings.push({
          severity: "warn",
          code: "lu_published_course_not_published",
          message: "Published LU linked to non-published Course",
          record: { luId: lu.id, courseId: course.id, courseStatus: course.status },
          recommendedAction: "Align statuses via instructor publish path or admin sync (not auto-publish)",
        });
      }
    }
  }

  // Enrollment bridge audit for published courses with LU
  const enrollmentFindings: Finding[] = [];
  for (const course of publishedCourses) {
    const luId = await resolveCanonicalUniverseId(course.id);
    if (!luId) continue;
    const courseEnrollments = await prisma.enrollment.findMany({
      where: { courseId: course.id },
      select: { userId: true, id: true },
    });
    for (const en of courseEnrollments) {
      const luEn = await prisma.learningUniverseEnrollment.findUnique({
        where: {
          userId_learningUniverseId: { userId: en.userId, learningUniverseId: luId },
        },
        select: { id: true },
      });
      if (!luEn) {
        enrollmentFindings.push({
          severity: "warn",
          code: "course_enroll_missing_lu_bridge",
          message: "Course enrollment lacks linked LU enrollment",
          record: { courseId: course.id, luId, userId: en.userId, enrollmentId: en.id },
          recommendedAction: "ensureLinkedLearningUniverseEnrollment(userId, courseId)",
        });
      }
    }
  }

  const summary = {
    publishedCourses: publishedCourses.length,
    products: allProducts.length,
    learningUniverses: allLus.length,
    publishedLus: allLus.filter((u) => u.status === "published").length,
    findings: findings.length,
    enrollmentFindings: enrollmentFindings.length,
    bySeverity: {
      error: findings.filter((f) => f.severity === "error").length,
      ambiguous: findings.filter((f) => f.severity === "ambiguous").length,
      warn: findings.filter((f) => f.severity === "warn").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
    repaired: findings.filter((f) => f.repaired).length,
    repairMode: REPAIR,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    findings,
    enrollmentFindings,
  };

  const out = path.join(OUT_DIR, "p3-1-course-product-lu-audit.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log("Wrote", out);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
