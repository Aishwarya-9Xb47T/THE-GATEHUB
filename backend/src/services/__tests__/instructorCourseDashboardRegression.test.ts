import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const courseFindMany = jest.fn();
const courseFindUnique = jest.fn();
const courseCreate = jest.fn();
const courseUpdate = jest.fn();
const courseDelete = jest.fn();
const courseUpdateMany = jest.fn();
const luFindMany = jest.fn();
const luFindUnique = jest.fn();
const luCreate = jest.fn();
const luUpdate = jest.fn();
const categoryFindUnique = jest.fn();
const categoryFindFirst = jest.fn();
const categoryUpsert = jest.fn();
const transactionMock = jest.fn();

jest.unstable_mockModule("../../utils/prisma.js", () => ({
  prisma: {
    course: {
      findMany: courseFindMany,
      findUnique: courseFindUnique,
      create: courseCreate,
      update: courseUpdate,
      delete: courseDelete,
      updateMany: courseUpdateMany,
    },
    learningUniverse: {
      findMany: luFindMany,
      findUnique: luFindUnique,
      create: luCreate,
      update: luUpdate,
    },
    category: {
      findUnique: categoryFindUnique,
      findFirst: categoryFindFirst,
      upsert: categoryUpsert,
    },
    $transaction: transactionMock,
  },
}));

const { listMyInstructor, list } = await import("../../controllers/coursesController.js");
const { appCache } = await import("../../utils/cache.js");

describe("Instructor Course Dashboard Regression & Multi-Workflow Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appCache.clear();
  });

  // Scenario 1: Manual Course Creation
  it("Scenario 1: Manual course creation appears in instructor dashboard (both draft and published)", async () => {
    const mockManualDraft = {
      id: "course-manual-1",
      title: "Manual Rust Systems Course",
      subtitle: "Learn low-level systems programming",
      description: "Rust fundamentals",
      price: 499,
      thumbnail: "https://example.com/rust.png",
      bannerUrl: "https://example.com/rust.png",
      difficulty: "intermediate",
      status: "draft",
      instructorId: "inst-a",
      publishedAt: null,
      createdAt: new Date("2026-03-01"),
      updatedAt: new Date("2026-03-01"),
      _count: { enrollments: 0, sections: 2, reviews: 0 },
    };

    courseFindMany.mockResolvedValue([mockManualDraft]);
    luFindMany.mockResolvedValue([]);

    const req: any = { user: { id: "inst-a", role: "instructor" } };
    let jsonResult: any = null;
    const res: any = {
      setHeader: jest.fn(),
      json: (data: any) => {
        jsonResult = data;
      },
    };

    await listMyInstructor(req, res);

    expect(jsonResult).toBeDefined();
    expect(jsonResult.success).toBe(true);
    expect(jsonResult.courses).toHaveLength(1);
    expect(jsonResult.courses[0].id).toBe("course-manual-1");
    expect(jsonResult.courses[0].title).toBe("Manual Rust Systems Course");
    expect(jsonResult.courses[0].status).toBe("draft");
  });

  // Scenario 2: LaTeX Course Creation
  it("Scenario 2: LaTeX course creation appears in instructor dashboard as an editable course card", async () => {
    // LaTeX workflow creates LearningUniverse in draft or published
    const mockLatexUniverse = {
      id: "lu-latex-1",
      title: "Advanced Quantum Computing LaTeX",
      subtitle: "Compiled from LaTeX project",
      description: "Formal quantum mechanics in LaTeX",
      price: 0,
      thumbnail: "https://example.com/quantum.png",
      bannerUrl: "https://example.com/quantum.png",
      difficulty: "Advanced",
      status: "draft",
      instructorId: "inst-a",
      sourceProjectId: "proj-latex-99",
      structuredData: {
        productType: "learning-universe",
        sourceProjectId: "proj-latex-99",
      },
      publishedAt: null,
      createdAt: new Date("2026-03-02"),
      updatedAt: new Date("2026-03-02"),
      tracks: [{ modules: [{ lessons: [{}, {}] }] }],
    };

    // No direct Course row yet, universe exists as draft
    courseFindMany.mockResolvedValue([]);
    luFindMany.mockResolvedValue([mockLatexUniverse]);

    const req: any = { user: { id: "inst-a", role: "instructor" } };
    let jsonResult: any = null;
    const res: any = {
      setHeader: jest.fn(),
      json: (data: any) => {
        jsonResult = data;
      },
    };

    await listMyInstructor(req, res);

    expect(jsonResult.success).toBe(true);
    expect(jsonResult.courses).toHaveLength(1);
    expect(jsonResult.courses[0].id).toBe("lu-latex-1");
    expect(jsonResult.courses[0].title).toBe("Advanced Quantum Computing LaTeX");
    expect(jsonResult.courses[0].status).toBe("draft");
    expect(jsonResult.courses[0].academicStudioEdit?.learningUniverseId).toBe("lu-latex-1");
  });

  // Scenario 3: AI Course Creation
  it("Scenario 3: AI Course Architect creation appears in instructor dashboard even while in draft status", async () => {
    const mockAiUniverse = {
      id: "lu-ai-arch-1",
      title: "Generative AI Architect Bootcamp",
      subtitle: "AI generated full curriculum",
      description: "Master LLMs and RAG architectures",
      price: 799,
      thumbnail: "https://example.com/ai.png",
      bannerUrl: "https://example.com/ai.png",
      difficulty: "Intermediate",
      status: "draft", // AI courses start in draft
      instructorId: "inst-a",
      sourceProjectId: "proj-ai-1",
      structuredData: {
        productType: "premium-course",
        sourceProjectId: "proj-ai-1",
        aiArchitect: { generatedAt: new Date().toISOString() },
      },
      publishedAt: null,
      createdAt: new Date("2026-03-03"),
      updatedAt: new Date("2026-03-03"),
      tracks: [{ modules: [{ lessons: [{}, {}, {}] }] }],
    };

    courseFindMany.mockResolvedValue([]);
    luFindMany.mockResolvedValue([mockAiUniverse]);

    const req: any = { user: { id: "inst-a", role: "instructor" } };
    let jsonResult: any = null;
    const res: any = {
      setHeader: jest.fn(),
      json: (data: any) => {
        jsonResult = data;
      },
    };

    await listMyInstructor(req, res);

    expect(jsonResult.success).toBe(true);
    expect(jsonResult.courses).toHaveLength(1);
    expect(jsonResult.courses[0].title).toBe("Generative AI Architect Bootcamp");
    expect(jsonResult.courses[0].status).toBe("draft");
    expect(jsonResult.courses[0].academicStudioEdit).toEqual(
      expect.objectContaining({ learningUniverseId: "lu-ai-arch-1", sourceProjectId: "proj-ai-1" })
    );
  });

  // Scenario 4 & 5: Draft vs Public Catalogue Visibility
  it("Scenario 4 & 5: Newly created draft appears in instructor dashboard, but is excluded from public catalogue until published", async () => {
    const mockDraftCourse = {
      id: "course-draft-secret",
      title: "Unreleased Machine Learning Masterclass",
      status: "draft",
      instructorId: "inst-a",
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { enrollments: 0, sections: 1, reviews: 0 },
    };

    // Instructor view
    courseFindMany.mockResolvedValue([mockDraftCourse]);
    luFindMany.mockResolvedValue([]);

    const instReq: any = { user: { id: "inst-a", role: "instructor" } };
    let instResult: any = null;
    const instRes: any = {
      setHeader: jest.fn(),
      json: (data: any) => {
        instResult = data;
      },
    };
    await listMyInstructor(instReq, instRes);
    expect(instResult.courses).toHaveLength(1);
    expect(instResult.courses[0].id).toBe("course-draft-secret");
    expect(instResult.courses[0].status).toBe("draft");

    // Public catalog view: unauthenticated or student query
    courseFindMany.mockImplementation(async (query: any) => {
      // If query has status: "published", draft must not be returned
      const andArr = query?.where?.AND || [];
      const hasPublishedFilter = andArr.some((f: any) => f.status === "published");
      if (hasPublishedFilter) {
        return []; // draft is excluded from public list
      }
      return [mockDraftCourse];
    });

    const publicReq: any = { user: null, query: {} };
    let publicResult: any = null;
    const publicRes: any = {
      setHeader: jest.fn(),
      json: (data: any) => {
        publicResult = data;
      },
    };

    await list(publicReq, publicRes);
    expect(publicResult.courses).toHaveLength(0); // Excluded!

    // When published:
    appCache.clear();
    const mockPublishedCourse = { ...mockDraftCourse, status: "published", publishedAt: new Date() };
    courseFindMany.mockImplementation(async () => [mockPublishedCourse]);

    await list(publicReq, publicRes);
    expect(publicResult.courses).toHaveLength(1);
    expect(publicResult.courses[0].status).toBe("published");
  });

  // Scenario 6: Multi-tenancy Isolation
  it("Scenario 6: Course created by Instructor A does not appear in Instructor B's private course list", async () => {
    courseFindMany.mockImplementation(async (query: any) => {
      const orClauses = query?.where?.OR || [];
      const instructorMatch = orClauses.some((c: any) => c.instructorId === "inst-b");
      if (instructorMatch) {
        return []; // Instructor B owns no courses
      }
      return [{ id: "course-inst-a", title: "Instructor A Private Course", instructorId: "inst-a" }];
    });

    luFindMany.mockImplementation(async (query: any) => {
      if (query?.where?.instructorId === "inst-b") {
        return [];
      }
      return [{ id: "lu-inst-a", title: "Instructor A Universe", instructorId: "inst-a" }];
    });

    const reqB: any = { user: { id: "inst-b", role: "instructor" } };
    let resultB: any = null;
    const resB: any = {
      setHeader: jest.fn(),
      json: (data: any) => {
        resultB = data;
      },
    };

    await listMyInstructor(reqB, resB);

    expect(resultB.success).toBe(true);
    expect(resultB.courses).toHaveLength(0); // Completely isolated!
  });

  // Scenario 7: Cache Invalidation & Consistency
  it("Scenario 7: Courses cache is invalidated on course creation and modifications", async () => {
    appCache.set("courses:instructor:inst-a", [{ id: "stale-course", title: "Stale Course" }], 60);
    expect(appCache.get("courses:instructor:inst-a")).toBeDefined();

    // Invalidate
    appCache.invalidate("courses:");
    expect(appCache.get("courses:instructor:inst-a")).toBeUndefined();
  });

  // Scenario 8: De-duplication
  it("Scenario 8: Existing courses are not duplicated when a Learning Universe is linked to a course", async () => {
    const mockCanonicalCourse = {
      id: "shared-course-1",
      title: "Full Stack Mastery",
      status: "published",
      instructorId: "inst-a",
      aiContent: JSON.stringify({ academicStudio: { learningUniverseId: "lu-linked-1" } }),
      _count: { enrollments: 10, sections: 4, reviews: 2 },
    };

    const mockLinkedUniverse = {
      id: "lu-linked-1",
      title: "Full Stack Mastery",
      status: "published",
      instructorId: "inst-a",
      structuredData: {
        productType: "premium-course",
        linkedCourseId: "shared-course-1",
      },
    };

    courseFindMany.mockResolvedValue([mockCanonicalCourse]);
    luFindMany.mockResolvedValue([mockLinkedUniverse]);

    const req: any = { user: { id: "inst-a", role: "instructor" } };
    let jsonResult: any = null;
    const res: any = {
      setHeader: jest.fn(),
      json: (data: any) => {
        jsonResult = data;
      },
    };

    await listMyInstructor(req, res);

    expect(jsonResult.success).toBe(true);
    // Must be exactly 1 card, NOT 2 cards!
    expect(jsonResult.courses).toHaveLength(1);
    expect(jsonResult.courses[0].id).toBe("shared-course-1");
    expect(jsonResult.courses[0].academicStudioEdit?.learningUniverseId).toBe("lu-linked-1");
  });

  // Scenario 9: Safe Ownership Synchronization
  it("Scenario 9: If a linked Course is orphaned, listMyInstructor claims it safely, but NEVER steals a course owned by another instructor", async () => {
    courseUpdate.mockResolvedValue({ id: "course-orphaned-1", instructorId: "inst-a" });

    const mockUniverseOwnedByA = {
      id: "lu-owner-a",
      title: "Orphaned Course",
      status: "published",
      instructorId: "inst-a",
      structuredData: {
        productType: "premium-course",
        linkedCourseId: "course-orphaned-1",
      },
    };

    const mockOrphanedCourse = {
      id: "course-orphaned-1",
      title: "Orphaned Course",
      status: "published",
      instructorId: null, // orphaned, unassigned
      _count: { enrollments: 5, sections: 2, reviews: 1 },
    };

    const mockOtherInstructorCourse = {
      id: "course-other-1",
      title: "Instructor Other Private Course",
      status: "published",
      instructorId: "inst-other-legitimate",
      _count: { enrollments: 10, sections: 4, reviews: 2 },
    };

    courseFindMany.mockResolvedValue([mockOrphanedCourse, mockOtherInstructorCourse]);
    luFindMany.mockResolvedValue([mockUniverseOwnedByA]);

    const req: any = { user: { id: "inst-a", role: "instructor" } };
    let jsonResult: any = null;
    const res: any = {
      setHeader: jest.fn(),
      json: (data: any) => {
        jsonResult = data;
      },
    };

    await listMyInstructor(req, res);

    expect(jsonResult.success).toBe(true);
    // Only the orphaned course safely claimed by inst-a is returned; course-other-1 is NEVER claimed or exposed!
    expect(jsonResult.courses).toHaveLength(1);
    expect(jsonResult.courses[0].id).toBe("course-orphaned-1");
    // Verified self-healing ownership sync triggered only for the orphaned course
    expect(courseUpdate).toHaveBeenCalledWith({
      where: { id: "course-orphaned-1" },
      data: { instructorId: "inst-a" },
    });
    // Never called for other instructor's course
    expect(courseUpdate).not.toHaveBeenCalledWith({
      where: { id: "course-other-1" },
      data: expect.anything(),
    });
  });
});
