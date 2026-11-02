import { describe, it, expect } from "vitest";
import { isLandingPath } from "./navigation";

describe("isLandingPath route restriction", () => {
  it("returns true only for the public landing root with or without trailing slashes", () => {
    expect(isLandingPath("/")).toBe(true);
    expect(isLandingPath("//")).toBe(true);
  });

  it("returns false for non-landing public and course routes", () => {
    expect(isLandingPath("/courses")).toBe(false);
    expect(isLandingPath("/courses/")).toBe(false);
    expect(isLandingPath("/course/advanced-typescript")).toBe(false);
    expect(isLandingPath("/category/web-dev")).toBe(false);
    expect(isLandingPath("/checkout")).toBe(false);
  });

  it("returns false for help center, student manual, and resources", () => {
    expect(isLandingPath("/resources")).toBe(false);
    expect(isLandingPath("/help")).toBe(false);
    expect(isLandingPath("/help/faq")).toBe(false);
    expect(isLandingPath("/help/student")).toBe(false);
  });

  it("returns false for authentication routes", () => {
    expect(isLandingPath("/login")).toBe(false);
    expect(isLandingPath("/register")).toBe(false);
    expect(isLandingPath("/forgot-password")).toBe(false);
  });

  it("returns false for dashboard, learning universe, and admin/instructor studio routes", () => {
    expect(isLandingPath("/student")).toBe(false);
    expect(isLandingPath("/student/my-courses")).toBe(false);
    expect(isLandingPath("/instructor")).toBe(false);
    expect(isLandingPath("/instructor/courses/new/manual")).toBe(false);
    expect(isLandingPath("/instructor/ai-architect")).toBe(false);
    expect(isLandingPath("/instructor/latex-editor")).toBe(false);
    expect(isLandingPath("/admin")).toBe(false);
    expect(isLandingPath("/admin/users")).toBe(false);
    expect(isLandingPath("/learning-universe/univ-1/course")).toBe(false);
    expect(isLandingPath("/learning-universe/univ-1/learn")).toBe(false);
  });
});

