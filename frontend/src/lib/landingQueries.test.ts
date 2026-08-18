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
});
