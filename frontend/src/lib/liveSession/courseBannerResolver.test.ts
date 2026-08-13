import { describe, expect, it, beforeEach } from "vitest";
import { resolveCourseBannerUrl } from "@/lib/courseBanner";

describe("course banner resolver", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("appends auth token for gated uploads", () => {
    localStorage.setItem("lms_token", "test-token");
    const url = resolveCourseBannerUrl("/uploads/course-banners/a.jpg");
    expect(url).toContain("/uploads/course-banners/a.jpg");
    expect(url).toContain("token=test-token");
  });

  it("does not rewrite external URLs", () => {
    expect(resolveCourseBannerUrl("https://example.com/banner.jpg")).toBe("https://example.com/banner.jpg");
  });

  it("normalizes legacy filename-only values", () => {
    localStorage.setItem("lms_token", "abc");
    const url = resolveCourseBannerUrl("banner.png");
    expect(url).toContain("/uploads/banner.png");
    expect(url).toContain("token=abc");
  });
});
