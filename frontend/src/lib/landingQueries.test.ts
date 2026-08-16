import { describe, expect, it } from "vitest";
import { landingCoursesQueryOptions, landingUniversesQueryOptions } from "./landingQueries";

describe("landing query cache policy", () => {
  it("does not force refetch on every mount", () => {
    expect(landingCoursesQueryOptions.refetchOnMount).toBe(false);
    expect(landingUniversesQueryOptions.refetchOnMount).toBe(false);
    expect(landingCoursesQueryOptions.staleTime).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });
});
