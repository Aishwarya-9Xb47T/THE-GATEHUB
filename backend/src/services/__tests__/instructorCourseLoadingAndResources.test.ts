import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const courseFindMany = jest.fn();
const luFindMany = jest.fn();
const resourceCourseFindMany = jest.fn();

jest.unstable_mockModule("../../utils/prisma.js", () => ({
  prisma: {
    course: {
      findMany: courseFindMany,
    },
    learningUniverse: {
      findMany: luFindMany,
    },
    resourceCourse: {
      findMany: resourceCourseFindMany,
    },
  },
}));

const { listMyInstructor } = await import("../../controllers/coursesController.js");
const { getInstructorResourceCourses } = await import("../../controllers/resourceController.js");
const { appCache } = await import("../../utils/cache.js");

describe("Instructor Course Loading & Resources Navigation Performance Regression Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appCache.clear();
  });

  describe("listMyInstructor performance and payload optimization", () => {
    it("strips heavy aiContent from returned courses to keep payloads lightweight", async () => {
      const mockCourses = [
        {
          id: "course-1",
          title: "Full Stack Mastery",
          subtitle: "Build modern apps",
          description: "Comprehensive guide",
          price: 999,
          thumbnail: "https://example.com/thumb.jpg",
          bannerUrl: "https://example.com/banner.jpg",
          bannerType: "image",
          difficulty: "intermediate",
          language: "en",
          status: "published",
          averageRating: 4.8,
          reviewCount: 120,
          publishedAt: new Date("2026-01-01"),
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-02-01"),
          instructorId: "inst-1",
          category: "Development",
          subcategory: "Web Development",
          categoryId: "cat-1",
          subcategoryId: "subcat-1",
          aiContent: JSON.stringify({
            academicStudio: { learningUniverseId: "lu-1", sourceProjectId: "proj-1" },
            massivePayload: "x".repeat(50000), // 50KB of heavy data
          }),
          categoryRel: { id: "cat-1", name: "Development", slug: "development" },
          _count: { enrollments: 45, sections: 8, reviews: 12 },
        },
      ];

      const mockUniverses = [
        {
          id: "lu-1",
          sourceProjectId: "proj-1",
          structuredData: {
            productType: "premium_course",
            linkedCourseId: "course-1",
          },
          status: "published",
          bannerUrl: "https://example.com/banner.jpg",
          thumbnail: "https://example.com/thumb.jpg",
          title: "Full Stack Mastery",
          subtitle: "Build modern apps",
          description: "Comprehensive guide",
          price: 999,
          difficulty: "intermediate",
          publishedAt: new Date("2026-01-01"),
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-02-01"),
          categoryId: "cat-1",
        },
      ];

      courseFindMany.mockResolvedValue(mockCourses);
      luFindMany.mockResolvedValue(mockUniverses);

      const req: any = {
        user: { id: "inst-1", role: "instructor" },
      };
      let responsePayload: any = null;
      const headers: Record<string, string> = {};
      const res: any = {
        setHeader: (key: string, val: string) => {
          headers[key] = val;
        },
        json: (val: any) => {
          responsePayload = val;
        },
      };

      await listMyInstructor(req, res);

      expect(responsePayload).toBeDefined();
      expect(responsePayload.success).toBe(true);
      expect(responsePayload.courses).toHaveLength(1);

      const returnedCourse = responsePayload.courses[0];
      // Verify heavy aiContent is stripped from response to prevent megabytes of payload bloat
      expect(returnedCourse.aiContent).toBeUndefined();
      // Verify academic studio link is preserved
      expect(returnedCourse.academicStudioEdit).toEqual({
        learningUniverseId: "lu-1",
        sourceProjectId: "proj-1",
      });
      expect(returnedCourse.status).toBe("published");
      // Verify Cache-Control header ensures real-time fresh rendering without browser caching
      expect(headers["Cache-Control"]).toBe("no-store, no-cache, must-revalidate, proxy-revalidate");

      // Verify appCache has cached the result
      const cached = appCache.get(`courses:instructor:inst-1`);
      expect(cached).toEqual(responsePayload);
    });

    it("serves subsequent requests directly from cache with sub-millisecond response", async () => {
      const cachedData = {
        success: true,
        courses: [{ id: "c-cached", title: "Cached Course" }],
      };
      appCache.set("courses:instructor:inst-1", cachedData, 60);

      const req: any = {
        user: { id: "inst-1", role: "instructor" },
      };
      let responsePayload: any = null;
      const headers: Record<string, string> = {};
      const res: any = {
        setHeader: (key: string, val: string) => {
          headers[key] = val;
        },
        json: (val: any) => {
          responsePayload = val;
        },
      };

      const start = performance.now();
      await listMyInstructor(req, res);
      const durationMs = performance.now() - start;

      expect(responsePayload).toEqual(cachedData);
      expect(courseFindMany).not.toHaveBeenCalled();
      expect(luFindMany).not.toHaveBeenCalled();
      expect(durationMs).toBeLessThan(10); // Cache hit executes in < 10ms
    });

    it("invalidates cache when courses are modified", async () => {
      appCache.set("courses:instructor:inst-1", { courses: [] }, 60);
      expect(appCache.get("courses:instructor:inst-1")).toBeDefined();

      appCache.invalidate("courses:");
      expect(appCache.get("courses:instructor:inst-1")).toBeUndefined();
    });
  });

  describe("getInstructorResourceCourses caching and optimization", () => {
    it("caches instructor resource courses and returns fast response", async () => {
      resourceCourseFindMany.mockResolvedValue([]);
      luFindMany.mockResolvedValue([]);

      const req: any = {
        user: { id: "inst-1", role: "instructor" },
      };
      let responsePayload: any = null;
      const res: any = {
        setHeader: jest.fn(),
        json: (val: any) => {
          responsePayload = val;
        },
      };

      await getInstructorResourceCourses(req, res);
      expect(responsePayload).toBeDefined();

      // Subsequent call should hit cache
      const cached = appCache.get("resources:instructor:inst-1");
      expect(cached).toEqual(responsePayload);

      // Invalidation works
      appCache.invalidate("resources:");
      expect(appCache.get("resources:instructor:inst-1")).toBeUndefined();
    });
  });
});
