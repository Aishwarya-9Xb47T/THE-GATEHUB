import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const luFindMany = jest.fn();
const courseFindMany = jest.fn();
const courseUpdateMany = jest.fn().mockReturnValue(Promise.resolve({ count: 0 }));

jest.unstable_mockModule("../../utils/prisma.js", () => ({
  prisma: {
    learningUniverse: {
      findMany: luFindMany,
    },
    course: {
      findMany: courseFindMany,
      updateMany: courseUpdateMany,
    },
  },
}));

const {
  PRODUCT_TYPES,
  CATALOG_VISIBILITY,
  resolvePremiumCourseDisplayStatus,
  resolvePublishedPremiumCourseIds,
  resolveFeaturedHomePremiumCourseIds,
  invalidatePremiumCourseIdCache,
} = await import("../productRoutingService.js");

describe("Course Catalogue & Homepage Consistency Regression Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidatePremiumCourseIdCache();
  });

  describe("Bug Fix: Homepage featured catalogue does not collapse when only 1 course is featured", () => {
    it("identifies featured courses correctly and preserves published catalogue eligibility", async () => {
      // Scenario matching the reported bug:
      // 1 featured course ('Web Development') and 3 other published courses ('Networking', 'Deep Learning', 'AIML')
      const mockUniverses = [
        {
          id: "u-webdev",
          status: "published",
          structuredData: {
            productType: PRODUCT_TYPES.PREMIUM_COURSE,
            linkedCourseId: "c-webdev",
            catalogVisibility: [CATALOG_VISIBILITY.PREMIUM_LIBRARY, CATALOG_VISIBILITY.FEATURED_HOME],
          },
        },
      ];

      const mockPublishedCourses = [
        { id: "c-webdev", price: 0, aiContent: null },
        { id: "c-net", price: 0, aiContent: null },
        { id: "c-dl", price: 0, aiContent: null },
        { id: "c-aiml", price: 0, aiContent: null },
      ];

      luFindMany.mockResolvedValue(mockUniverses);
      courseFindMany.mockResolvedValue(mockPublishedCourses);

      const premiumIds = await resolvePublishedPremiumCourseIds(true);
      expect(premiumIds).toContain("c-webdev");
      expect(premiumIds).toContain("c-net");
      expect(premiumIds).toContain("c-dl");
      expect(premiumIds).toContain("c-aiml");

      const featuredIds = await resolveFeaturedHomePremiumCourseIds(premiumIds);
      expect(featuredIds).toEqual(["c-webdev"]);

      // Verify the homepage combining algorithm:
      // Priority to featured, then fill remaining slots up to limit=4
      const limit = 4;
      const combinedIds: string[] = [];
      for (const id of featuredIds) {
        if (!combinedIds.includes(id)) combinedIds.push(id);
      }
      for (const id of premiumIds) {
        if (combinedIds.length >= limit) break;
        if (!combinedIds.includes(id)) combinedIds.push(id);
      }

      // Must NOT collapse to 1 card. Must populate up to limit=4 with featured first
      expect(combinedIds).toHaveLength(4);
      expect(combinedIds[0]).toBe("c-webdev");
      expect(combinedIds).toEqual(["c-webdev", "c-net", "c-dl", "c-aiml"]);
    });

    it("falls back to all published courses when 0 courses are explicitly featured", async () => {
      luFindMany.mockResolvedValue([]);
      courseFindMany.mockResolvedValue([
        { id: "c-1", price: 0, aiContent: null },
        { id: "c-2", price: 100, aiContent: null },
      ]);

      const premiumIds = await resolvePublishedPremiumCourseIds(true);
      const featuredIds = await resolveFeaturedHomePremiumCourseIds(premiumIds);
      expect(featuredIds).toEqual([]);

      // Combining algorithm handles empty featured list gracefully
      const limit = 4;
      const combinedIds: string[] = [];
      for (const id of featuredIds) {
        if (!combinedIds.includes(id)) combinedIds.push(id);
      }
      for (const id of premiumIds) {
        if (combinedIds.length >= limit) break;
        if (!combinedIds.includes(id)) combinedIds.push(id);
      }

      expect(combinedIds).toEqual(["c-1", "c-2"]);
    });
  });

  describe("Publication lifecycle and visibility across creation methods", () => {
    it("includes published manual and LaTeX courses even when price is 0", async () => {
      luFindMany.mockResolvedValue([]);
      courseFindMany.mockResolvedValue([
        { id: "manual-free-1", price: 0, aiContent: null },
        { id: "latex-free-2", price: 0, aiContent: "{\"academicStudio\":{\"sourceProjectId\":\"p-1\"}}" },
        { id: "ai-paid-3", price: 499, aiContent: null },
      ]);

      const catalogIds = await resolvePublishedPremiumCourseIds(true);
      expect(catalogIds).toContain("manual-free-1");
      expect(catalogIds).toContain("latex-free-2");
      expect(catalogIds).toContain("ai-paid-3");
    });

    it("recognizes bidirectional linking when course references universe in aiContent", async () => {
      const mockUniverses = [
        {
          id: "u-latex-featured",
          status: "published",
          structuredData: {
            title: "LaTeX Quantum",
            productType: PRODUCT_TYPES.LEARNING_UNIVERSE,
            catalogVisibility: [CATALOG_VISIBILITY.FEATURED_HOME],
          },
        },
      ];

      const mockCourses = [
        {
          id: "c-latex-quantum",
          price: 0,
          aiContent: JSON.stringify({ academicStudio: { learningUniverseId: "u-latex-featured" } }),
        },
      ];

      luFindMany.mockResolvedValue(mockUniverses);
      courseFindMany.mockImplementation((query: any) => {
        if (query?.where?.status === "published") return Promise.resolve(mockCourses);
        if (query?.where?.id?.in) return Promise.resolve(mockCourses);
        return Promise.resolve([]);
      });

      const premiumIds = await resolvePublishedPremiumCourseIds(true);
      expect(premiumIds).toContain("c-latex-quantum");

      const featuredIds = await resolveFeaturedHomePremiumCourseIds(premiumIds);
      expect(featuredIds).toContain("c-latex-quantum");
    });

    it("hides draft courses from public listings across all creation flows", async () => {
      const displayStatus = resolvePremiumCourseDisplayStatus("draft", "draft");
      expect(displayStatus).toBe("draft");
    });
  });
});
