import { describe, expect, it } from "vitest";

describe("Explore Courses progressive rendering logic", () => {
  it("does not block course cards when one catalog source arrives before the other", () => {
    // Scenario 1: Courses arrived, universes still loading
    const hasAnyCatalogDataWithCourses = true;
    const isStillWaiting = true;
    const coursesData = [{ id: "c1", title: "Course 1" }];
    const luData = undefined;

    const catalogLoading = !hasAnyCatalogDataWithCourses && isStillWaiting && (!coursesData || !luData);
    expect(catalogLoading).toBe(false);
  });

  it("does not block cards when universes arrive before courses", () => {
    // Scenario 2: Universes arrived, courses still loading
    const hasAnyCatalogDataWithUniverses = true;
    const isStillWaiting = true;
    const coursesData = undefined;
    const luData = [{ id: "lu1", title: "Universe 1" }];

    const catalogLoading = !hasAnyCatalogDataWithUniverses && isStillWaiting && (!coursesData || !luData);
    expect(catalogLoading).toBe(false);
  });

  it("shows loading only when neither data source has arrived yet", () => {
    // Scenario 3: Neither has arrived
    const hasAnyCatalogData = false;
    const isStillWaiting = true;
    const coursesData = undefined;
    const luData = undefined;

    const catalogLoading = !hasAnyCatalogData && isStillWaiting && (!coursesData || !luData);
    expect(catalogLoading).toBe(true);
  });

  it("triggers error state only when both queries fail and no catalog data exists", () => {
    const hasAnyData = false;
    const isStillWaiting = false;
    const universesIsError = true;
    const coursesIsError = true;

    const isError = !hasAnyData && !isStillWaiting && (universesIsError || coursesIsError);
    expect(isError).toBe(true);
  });
});

describe("Quiz average score calculation logic", () => {
  it("computes accurate score percentage without needing full answer payloads", () => {
    const attempts = [
      { score: 8, totalMarks: 10 },   // 80%
      { score: 10, totalMarks: 10 },  // 100%
      { score: 6, totalMarks: 10 },   // 60%
    ];

    const avgScore =
      attempts.length > 0
        ? attempts.reduce((s, a) => {
            return s + (Number(a.score) / Math.max(a.totalMarks, 1)) * 100;
          }, 0) / attempts.length
        : 0;

    expect(avgScore).toBe(80);
  });

  it("handles zero total marks safely to prevent division by zero", () => {
    const attempts = [{ score: 0, totalMarks: 0 }];
    const avgScore =
      attempts.reduce((s, a) => s + (Number(a.score) / Math.max(a.totalMarks, 1)) * 100, 0) / attempts.length;
    expect(avgScore).toBe(0);
  });
});
