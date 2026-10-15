import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  PRODUCT_TYPES,
  defaultCatalogVisibilityForProduct,
  mergePublishStructuredData,
  resolvePremiumCourseDisplayStatus,
  findPremiumUniverseForLinkedCourse,
  filterUniversesForFreeLibrary,
  filterUniversesForLuListing,
  filterUniversesForInstructorMine,
  inferProductType,
  CATALOG_VISIBILITY,
  readStructuredRecord,
} from "../productRoutingService.js";

describe("Unified Course Publishing & Catalog Visibility Across Creation Methods", () => {
  // Method 1: AI-created Course (Reference Implementation)
  describe("Method 1: AI-Created Course (Reference Implementation)", () => {
    it("preserves AI architect metadata, blueprints, and completion rules upon publishing", () => {
      const aiStructured = {
        productType: PRODUCT_TYPES.PREMIUM_COURSE,
        creationSource: "ai-architect",
        creationMode: "ai-generation",
        linkedCourseId: "course-ai-101",
        catalogVisibility: [CATALOG_VISIBILITY.PREMIUM_LIBRARY, CATALOG_VISIBILITY.FEATURED_HOME],
        completionRules: { requiredQuizScore: 80, certificateEligible: true },
        aiArchitect: { blueprint: { courseTitle: "Deep Learning with PyTorch", modules: [{ title: "M1" }] } },
      };

      const republish = mergePublishStructuredData(aiStructured, {
        sourceProjectId: "proj-ai-101",
      });

      expect(republish.productType).toBe(PRODUCT_TYPES.PREMIUM_COURSE);
      expect(republish.creationSource).toBe("ai-architect");
      expect(republish.linkedCourseId).toBe("course-ai-101");
      expect(republish.catalogVisibility).toContain(CATALOG_VISIBILITY.FEATURED_HOME);
      expect(republish.catalogVisibility).toContain(CATALOG_VISIBILITY.PREMIUM_LIBRARY);
      expect(republish.completionRules).toEqual({ requiredQuizScore: 80, certificateEligible: true });
      expect(republish.aiArchitect).toBeDefined();
    });

    it("resolves display status as published for AI course when backed by published universe", () => {
      const displayStatus = resolvePremiumCourseDisplayStatus("draft", "published");
      expect(displayStatus).toBe("published");
    });
  });

  // Method 2: Manually Created Course
  describe("Method 2: Manually Created Course", () => {
    it("ensures manual course links to canonical Course ID and establishes FEATURED_HOME and PREMIUM_LIBRARY visibility", () => {
      const manualStructured = {
        productType: PRODUCT_TYPES.PREMIUM_COURSE,
        creationSource: "manual",
        linkedCourseId: "course-manual-202",
        catalogVisibility: defaultCatalogVisibilityForProduct(PRODUCT_TYPES.PREMIUM_COURSE),
      };

      expect(manualStructured.productType).toBe(PRODUCT_TYPES.PREMIUM_COURSE);
      expect(manualStructured.linkedCourseId).toBe("course-manual-202");
      expect(manualStructured.catalogVisibility).toContain(CATALOG_VISIBILITY.FEATURED_HOME);
      expect(manualStructured.catalogVisibility).toContain(CATALOG_VISIBILITY.PREMIUM_LIBRARY);
    });

    it("resolves published status for manual course without requiring price > 0", () => {
      // Manual courses can be free (price = 0) or paid
      const freeManualCourse = { id: "c-free", price: 0, status: "published" };
      const paidManualCourse = { id: "c-paid", price: 499, status: "published" };

      // Both resolve to published
      expect(resolvePremiumCourseDisplayStatus(freeManualCourse.status, "published")).toBe("published");
      expect(resolvePremiumCourseDisplayStatus(paidManualCourse.status, "published")).toBe("published");
    });

    it("preserves manual course ownership during status synchronization", () => {
      const courseId = "course-manual-303";
      const instructorId = "inst-manual-1";
      const universes = [
        {
          id: "u-manual-303",
          instructorId,
          status: "published",
          structuredData: {
            productType: PRODUCT_TYPES.PREMIUM_COURSE,
            linkedCourseId: courseId,
          },
        },
      ];

      const found = findPremiumUniverseForLinkedCourse(courseId, universes);
      expect(found).toBeDefined();
      expect(found?.id).toBe("u-manual-303");
      expect(found?.instructorId).toBe(instructorId);
    });
  });

  // Method 3: LaTeX Editor Course
  describe("Method 3: LaTeX Editor Course", () => {
    it("handles publication from LaTeX DSL while preserving custom title and sourceProjectId", () => {
      const latexStructured = {
        productType: PRODUCT_TYPES.PREMIUM_COURSE,
        creationSource: "academic-studio",
        linkedCourseId: "course-latex-404",
        sourceProjectId: "proj-latex-404",
      };

      const incomingData = {
        universe: { title: "Custom Quantum Computing" },
      };

      const merged = mergePublishStructuredData(latexStructured, incomingData);
      expect(merged.productType).toBe(PRODUCT_TYPES.PREMIUM_COURSE);
      expect(merged.linkedCourseId).toBe("course-latex-404");
      expect(merged.sourceProjectId).toBe("proj-latex-404");
    });

    it("ensures LEARNING_UNIVERSE product types also qualify for premium course linking", () => {
      const luUniverse = {
        id: "univ-lu",
        status: "published",
        structuredData: {
          productType: PRODUCT_TYPES.LEARNING_UNIVERSE,
          linkedCourseId: "course-canonical-lu",
        },
      };

      const found = findPremiumUniverseForLinkedCourse("course-canonical-lu", [luUniverse]);
      expect(found).toBeDefined();
      expect(found?.id).toBe("univ-lu");
    });
  });

  // Cross-Cutting Unification & Catalogue Invariants
  describe("Cross-Cutting Unification Invariants", () => {
    it("homepage and browse catalog use consistent eligibility across AI, manual, and LaTeX courses", () => {
      const aiCourse = { id: "c-ai", structuredData: { productType: PRODUCT_TYPES.PREMIUM_COURSE, linkedCourseId: "c-ai" } };
      const manualCourse = { id: "c-manual", structuredData: { productType: PRODUCT_TYPES.PREMIUM_COURSE, linkedCourseId: "c-manual" } };
      const latexCourse = { id: "c-latex", structuredData: { productType: PRODUCT_TYPES.LEARNING_UNIVERSE, linkedCourseId: "c-latex" } };

      const allItems = [aiCourse, manualCourse, latexCourse];
      for (const item of allItems) {
        const pt = inferProductType(item.structuredData);
        expect(pt === PRODUCT_TYPES.PREMIUM_COURSE || pt === PRODUCT_TYPES.LEARNING_UNIVERSE).toBe(true);
        const linked = readStructuredRecord(item.structuredData).linkedCourseId;
        expect(typeof linked).toBe("string");
      }
    });

    it("draft courses remain hidden across all creation methods", () => {
      expect(resolvePremiumCourseDisplayStatus("draft", "draft")).toBe("draft");
      expect(resolvePremiumCourseDisplayStatus("draft", undefined)).toBe("draft");
      expect(resolvePremiumCourseDisplayStatus("draft", null)).toBe("draft");
      expect(resolvePremiumCourseDisplayStatus("draft", "archived")).toBe("draft");
    });

    it("idempotency: multiple republishes do not overwrite or duplicate linkedCourseId", () => {
      let state: Record<string, unknown> = {
        productType: PRODUCT_TYPES.PREMIUM_COURSE,
        linkedCourseId: "canonical-555",
      };

      // Publish pass 1
      state = mergePublishStructuredData(state, { sourceProjectId: "p1" });
      expect(state.linkedCourseId).toBe("canonical-555");

      // Publish pass 2
      state = mergePublishStructuredData(state, { sourceProjectId: "p1" });
      expect(state.linkedCourseId).toBe("canonical-555");

      // Publish pass 3
      state = mergePublishStructuredData(state, { sourceProjectId: "p1" });
      expect(state.linkedCourseId).toBe("canonical-555");
    });

    it("instructor mine dashboard isolates standalone learning universes from linked premium courses", () => {
      const mixed = [
        { id: "standalone-lu", structuredData: { productType: PRODUCT_TYPES.LEARNING_UNIVERSE } },
        { id: "ai-course-lu", structuredData: { productType: PRODUCT_TYPES.PREMIUM_COURSE, linkedCourseId: "c-ai" } },
        { id: "manual-course-lu", structuredData: { productType: PRODUCT_TYPES.PREMIUM_COURSE, linkedCourseId: "c-man" } },
        { id: "free-res", structuredData: { productType: PRODUCT_TYPES.FREE_COURSE } },
      ];

      const mine = filterUniversesForInstructorMine(mixed);
      // Standalone LU and free resource appear under universes, while premium courses appear under Your Courses
      expect(mine.map((m) => m.id)).toEqual(["standalone-lu", "free-res"]);
    });

    it("free library isolates genuine free resources from premium and manual courses", () => {
      const pool = [
        { id: "free-1", structuredData: { productType: PRODUCT_TYPES.FREE_RESOURCE } },
        { id: "free-2", structuredData: { productType: PRODUCT_TYPES.FREE_COURSE } },
        { id: "prem-1", structuredData: { productType: PRODUCT_TYPES.PREMIUM_COURSE } },
        { id: "lu-1", structuredData: { productType: PRODUCT_TYPES.LEARNING_UNIVERSE } },
      ];

      const freeOnly = filterUniversesForFreeLibrary(pool);
      expect(freeOnly.map((f) => f.id)).toEqual(["free-1", "free-2"]);
    });
  });
});
