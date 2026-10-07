import { describe, expect, it } from "vitest";
import {
  landingCoursesQueryOptions,
  landingUniversesQueryOptions,
  mergeLandingExploreItems,
} from "./landingQueries";

describe("landing query cache policy", () => {
  it("does not force refetch on every mount", () => {
    expect(landingCoursesQueryOptions.refetchOnMount).toBe(false);
    expect(landingUniversesQueryOptions.refetchOnMount).toBe(false);
    expect(landingCoursesQueryOptions.staleTime).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });
});

describe("mergeLandingExploreItems", () => {
  it("keeps universes and featured courses in one list", () => {
    const items = mergeLandingExploreItems(
      [{ id: "lu-1", title: "Python Path" }],
      [{ id: "c-1", title: "React Course", price: 0 }],
    );
    expect(items.map((item) => item.id)).toEqual(["lu-1", "c-1"]);
    expect(items[0].kind).toBe("universe");
    expect(items[1].kind).toBe("course");
  });

  it("drops a featured course with the same id as a universe", () => {
    const items = mergeLandingExploreItems(
      [{ id: "shared", title: "Shared Title" }],
      [{ id: "shared", title: "Shared Title", price: 99 }],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "universe", id: "shared" });
  });

  it("drops a featured course linked from a universe", () => {
    const items = mergeLandingExploreItems(
      [{ id: "lu-1", title: "Full Path", structuredData: { linkedCourseId: "c-9" } }],
      [{ id: "c-9", title: "Full Path Course", price: 0 }],
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("lu-1");
  });

  it("drops a featured course with the same normalized title", () => {
    const items = mergeLandingExploreItems(
      [{ id: "lu-1", title: "  Data Science  " }],
      [{ id: "c-2", title: "data science", price: 0 }],
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("lu-1");
  });

  it("accepts nullable catalog fields from student browse payloads", () => {
    const items = mergeLandingExploreItems(
      [{ id: "lu-1", title: "Path", structuredData: { linkedCourseId: null } }],
      [{ id: "c-1", title: "Course", subtitle: null as string | null }],
    );
    expect(items.map((item) => item.id)).toEqual(["lu-1", "c-1"]);
  });

  describe("regression tests: prevents '(e || []) is not iterable' crash", () => {
    it("handles valid array responses without error", () => {
      const universes = [{ id: "lu-1", title: "Universe 1" }];
      const courses = [{ id: "c-1", title: "Course 1" }];
      const items = mergeLandingExploreItems(universes, courses);
      expect(items).toHaveLength(2);
    });

    it("handles empty array responses", () => {
      const items = mergeLandingExploreItems([], []);
      expect(items).toEqual([]);
    });

    it("handles null responses without throwing '(e || []) is not iterable'", () => {
      expect(() => {
        const items = mergeLandingExploreItems(null as any, null as any);
        expect(items).toEqual([]);
      }).not.toThrow();
    });

    it("handles undefined responses without throwing", () => {
      expect(() => {
        const items = mergeLandingExploreItems(undefined, undefined);
        expect(items).toEqual([]);
      }).not.toThrow();
    });

    it("handles wrapped backend responses ({ success: true, data: [...] } and { courses: [...] })", () => {
      const wrappedUniverses = {
        success: true,
        data: [{ id: "lu-wrapped-1", title: "Wrapped Universe" }],
      };
      const wrappedCourses = {
        success: true,
        courses: [{ id: "c-wrapped-1", title: "Wrapped Course" }],
      };

      expect(() => {
        const items = mergeLandingExploreItems(
          wrappedUniverses as any,
          wrappedCourses as any,
        );
        expect(items).toHaveLength(2);
        expect(items[0].id).toBe("lu-wrapped-1");
        expect(items[1].id).toBe("c-wrapped-1");
      }).not.toThrow();
    });

    it("handles API error responses / error objects without crashing", () => {
      const errorUniverseResponse = {
        error: "Internal Server Error",
        statusCode: 500,
      };
      const errorCoursesResponse = {
        error: "Failed to fetch",
        statusCode: 500,
      };

      expect(() => {
        const items = mergeLandingExploreItems(
          errorUniverseResponse as any,
          errorCoursesResponse as any,
        );
        expect(items).toEqual([]);
      }).not.toThrow();
    });
  });
});
