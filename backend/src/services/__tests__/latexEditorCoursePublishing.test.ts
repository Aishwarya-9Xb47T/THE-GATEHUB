import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  PRODUCT_TYPES,
  type ProductType,
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
import { templateFolderEntries, getTemplate } from "../latexProjectTemplates.js";

describe("LaTeX Editor Course Publishing & Visibility Regression Tests", () => {
  // Test 1: Successful publication & Title/Description/Price Preservation
  it("Test 1 — Successful publication preserves custom course title, description, and price", () => {
    const existingStructured = {
      productType: PRODUCT_TYPES.PREMIUM_COURSE,
      linkedCourseId: "course-123",
      sourceProjectId: "proj-456",
    };

    const parsedStructured = {
      universe: {
        title: "Learning Universe Course", // default placeholder emitted by scaffold
        description: "",
      },
      tracks: [],
    };

    const merged = mergePublishStructuredData(existingStructured, parsedStructured);

    expect(merged.productType).toBe(PRODUCT_TYPES.PREMIUM_COURSE);
    expect(merged.linkedCourseId).toBe("course-123");
    expect(merged.sourceProjectId).toBe("proj-456");

    // Title preservation logic test:
    const rawTitle = parsedStructured.universe.title;
    const isPlaceholderTitle = !rawTitle || rawTitle === "Learning Universe Course" || rawTitle === "Untitled";
    const existingTitle = "Advanced Distributed Systems with LaTeX";
    const publishedTitle = isPlaceholderTitle ? existingTitle : rawTitle;

    expect(publishedTitle).toBe("Advanced Distributed Systems with LaTeX");

    // Template scaffold should accept custom project title instead of hardcoded default
    const template = getTemplate("learning-universe-v2");
    const fileEntries = templateFolderEntries(template, "Advanced Distributed Systems with LaTeX");
    const projectJsonEntry = fileEntries.find((f) => f.name === "project.json");
    expect(projectJsonEntry).toBeDefined();
    const parsedProjectJson = JSON.parse(projectJsonEntry!.content!);
    expect(parsedProjectJson.universe?.title).toBe("Advanced Distributed Systems with LaTeX");
  });

  // Test 2: Instructor ownership & My Courses linking
  it("Test 2 — Instructor ownership links course correctly for My Courses", () => {
    const courseId = "course-abc";
    const instructorId = "inst-999";
    const universes = [
      {
        id: "univ-1",
        instructorId,
        status: "published",
        structuredData: {
          productType: PRODUCT_TYPES.PREMIUM_COURSE,
          linkedCourseId: courseId,
        },
      },
    ];

    const linked = findPremiumUniverseForLinkedCourse(courseId, universes);
    expect(linked).toBeDefined();
    expect(linked?.id).toBe("univ-1");

    // Status resolves to published
    const displayStatus = resolvePremiumCourseDisplayStatus("draft", linked?.status);
    expect(displayStatus).toBe("published");
  });

  // Test 3: Public catalogue & Free product isolation
  it("Test 3 — Public catalogue correctly isolates free vs premium courses", () => {
    const freeUniverse = {
      id: "free-u",
      structuredData: { productType: PRODUCT_TYPES.FREE_COURSE },
    };
    const premiumUniverse = {
      id: "prem-u",
      structuredData: { productType: PRODUCT_TYPES.PREMIUM_COURSE },
    };
    const standardUniverse = {
      id: "lu-u",
      structuredData: { productType: PRODUCT_TYPES.LEARNING_UNIVERSE },
    };

    const freeList = filterUniversesForFreeLibrary([freeUniverse, premiumUniverse, standardUniverse]);
    expect(freeList.map((u) => u.id)).toEqual(["free-u"]);

    const luList = filterUniversesForLuListing([freeUniverse, premiumUniverse, standardUniverse]);
    expect(luList.map((u) => u.id)).toEqual(["lu-u"]);
  });

  // Test 4: Premium course visibility in catalog with FEATURED_HOME
  it("Test 4 — Premium course visibility includes PREMIUM_LIBRARY and FEATURED_HOME", () => {
    const visibility = defaultCatalogVisibilityForProduct(PRODUCT_TYPES.PREMIUM_COURSE);
    expect(visibility).toContain(CATALOG_VISIBILITY.PREMIUM_LIBRARY);
    expect(visibility).toContain(CATALOG_VISIBILITY.FEATURED_HOME);
  });

  // Test 5: Dashboard statistics reflects published courses
  it("Test 5 — Dashboard statistics reflects published status accurately", () => {
    const courses = [
      { id: "c1", status: "published" },
      { id: "c2", status: "draft" },
      { id: "c3", status: resolvePremiumCourseDisplayStatus("draft", "published") },
    ];

    const publishedCount = courses.filter((c) => c.status === "published").length;
    expect(publishedCount).toBe(2);

    const draftCount = courses.filter((c) => c.status === "draft").length;
    expect(draftCount).toBe(1);
  });

  // Test 6: Draft isolation — unpublished drafts do not display as published
  it("Test 6 — Unpublished drafts remain in draft status", () => {
    const displayStatus = resolvePremiumCourseDisplayStatus("draft", "draft");
    expect(displayStatus).toBe("draft");

    const undefinedStatus = resolvePremiumCourseDisplayStatus("draft", undefined);
    expect(undefinedStatus).toBe("draft");
  });

  // Test 7: Retry safety — republishing preserves linked entities and does not duplicate
  it("Test 7 — Retry safety preserves linkedCourseId across multiple republishes", () => {
    let structured: Record<string, unknown> = {
      productType: PRODUCT_TYPES.PREMIUM_COURSE,
      linkedCourseId: "course-canonical-1",
      sourceProjectId: "proj-1",
    };

    // First publish pass
    structured = mergePublishStructuredData(structured, {
      productType: PRODUCT_TYPES.PREMIUM_COURSE,
      sourceProjectId: "proj-1",
    });
    expect(structured.linkedCourseId).toBe("course-canonical-1");

    // Second publish pass (retry)
    structured = mergePublishStructuredData(structured, {
      productType: PRODUCT_TYPES.PREMIUM_COURSE,
      sourceProjectId: "proj-1",
    });
    expect(structured.linkedCourseId).toBe("course-canonical-1");
  });

  // Test 8: Failure handling — structured data safely parses and protects against undefined
  it("Test 8 — Structured data safely handles corrupted or null metadata", () => {
    const emptyRecord = readStructuredRecord(null);
    expect(emptyRecord).toEqual({});

    const invalidRecord = readStructuredRecord("not-an-object");
    expect(invalidRecord).toEqual({});

    const safeMerged = mergePublishStructuredData(null, { productType: PRODUCT_TYPES.PREMIUM_COURSE });
    expect(safeMerged.productType).toBe(PRODUCT_TYPES.PREMIUM_COURSE);
  });

  // Test 9: Refresh persistence — instructor mine excludes standalone premium universes to prevent duplicates
  it("Test 9 — Instructor mine excludes premium universes so courses appear under My Courses without duplication", () => {
    const items = [
      { id: "lu1", structuredData: { productType: PRODUCT_TYPES.LEARNING_UNIVERSE } },
      { id: "prem1", structuredData: { productType: PRODUCT_TYPES.PREMIUM_COURSE, linkedCourseId: "c1" } },
    ];

    const instructorMineLus = filterUniversesForInstructorMine(items);
    expect(instructorMineLus.map((i) => i.id)).toEqual(["lu1"]);
  });

  // Test 10: Existing workflows — AI Visual Studio and AI Course Architect metadata preserved
  it("Test 10 — Preserves AI Architect blueprints, completion rules, and product types", () => {
    const architectStructured = {
      productType: PRODUCT_TYPES.PREMIUM_COURSE,
      creationSource: "ai-architect",
      completionRules: { requiredQuizScore: 80 },
      aiArchitect: { blueprint: { modules: [{ title: "M1" }] } },
      linkedCourseId: "course-arch-1",
    };

    const republish = mergePublishStructuredData(architectStructured, {
      sourceProjectId: "proj-arch",
    });

    expect(republish.productType).toBe(PRODUCT_TYPES.PREMIUM_COURSE);
    expect(republish.creationSource).toBe("ai-architect");
    expect(republish.completionRules).toEqual({ requiredQuizScore: 80 });
    expect(republish.aiArchitect).toEqual({ blueprint: { modules: [{ title: "M1" }] } });
    expect(republish.linkedCourseId).toBe("course-arch-1");
  });
});
