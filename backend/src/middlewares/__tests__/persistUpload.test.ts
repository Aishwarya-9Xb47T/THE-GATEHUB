import { describe, expect, it } from "@jest/globals";
import { resolveUploadCacheControl } from "../persistUpload.js";

describe("upload cache control policies", () => {
  it("applies 1-year immutable caching for uuid-named banner assets", () => {
    const bannerPath = "banners/1b406ad0-f47b-41bf-95ec-959a1354b3e9.jpg";
    const cacheControl = resolveUploadCacheControl(bannerPath);
    expect(cacheControl).toBe("public, max-age=31536000, immutable");
  });

  it("applies 1-year immutable caching for thumb-uuid banner assets", () => {
    const thumbPath = "banners/thumbs/thumb-1b406ad0-f47b-41bf-95ec-959a1354b3e9.jpg";
    const cacheControl = resolveUploadCacheControl(thumbPath);
    expect(cacheControl).toBe("public, max-age=31536000, immutable");
  });

  it("applies public 7-day browser / 30-day CDN cache for public non-uuid assets", () => {
    const publicImg = "images/cat-banner.png";
    const cacheControl = resolveUploadCacheControl(publicImg);
    expect(cacheControl).toContain("public, max-age=604800");
    expect(cacheControl).toContain("s-maxage=2592000");
    expect(cacheControl).toContain("stale-while-revalidate=86400");
  });

  it("applies private no-cache policy for sensitive private paths", () => {
    const privDoc = "projects/proj-123/source.tex";
    const cacheControl = resolveUploadCacheControl(privDoc);
    expect(cacheControl).toBe("private, no-cache, no-store, must-revalidate");
  });
});
