import { describe, expect, it } from "@jest/globals";
import { isStoredBannerPath } from "../bannerUrl.js";

describe("isStoredBannerPath", () => {
  it("accepts persisted /uploads/banners paths", () => {
    expect(isStoredBannerPath("/uploads/banners/abc.jpg")).toBe(true);
    expect(isStoredBannerPath("/uploads/banners/thumbs/thumb-abc.jpg")).toBe(true);
  });

  it("accepts absolute backend URLs that still point at /uploads/banners", () => {
    expect(isStoredBannerPath("https://gatehub-backend-mprr.onrender.com/uploads/banners/abc.jpg")).toBe(
      true
    );
  });

  it("rejects Pexels/search CDN URLs and ephemeral blob URLs", () => {
    expect(isStoredBannerPath("https://images.pexels.com/photos/1/ai.jpeg")).toBe(false);
    expect(isStoredBannerPath("blob:https://gatehub-frontend.onrender.com/123")).toBe(false);
    expect(isStoredBannerPath("")).toBe(false);
    expect(isStoredBannerPath(undefined)).toBe(false);
  });
});
