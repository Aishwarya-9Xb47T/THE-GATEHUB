import { describe, expect, it } from "vitest";
import { matchUniverseAsset, resolveLearningUniverseAsset } from "./resolveLearningUniverseAsset";
import { redactMediaUrl, rewritePersistedMediaHost } from "./courseMediaUrls";
import { resolveVideoSource } from "./videoSourceUtils";

const assets = [
  { filename: "lecture.mp4", storedFilename: "abc-123.mp4" },
  { filename: "diagram.png", storedFilename: "img-9.png" },
];

describe("matchUniverseAsset", () => {
  it("matches original filename, basename, and stored filename", () => {
    expect(matchUniverseAsset("lecture.mp4", assets)?.storedFilename).toBe("abc-123.mp4");
    expect(matchUniverseAsset("/uploads/projects/p1/lecture.mp4", assets)?.storedFilename).toBe(
      "abc-123.mp4"
    );
    expect(matchUniverseAsset("abc-123.mp4", assets)?.storedFilename).toBe("abc-123.mp4");
  });
});

describe("resolveLearningUniverseAsset", () => {
  it("prefers published learning-universe copies over gated project paths", () => {
    const resolved = resolveLearningUniverseAsset(
      "/uploads/projects/proj1/lecture.mp4",
      "uni-1",
      assets
    );
    expect(resolved.status).toBe("found");
    expect(resolved.resolvedUrl).toContain("/uploads/learning-universes/uni-1/abc-123.mp4");
    expect(resolved.resolvedUrl).not.toContain("/uploads/projects/");
  });

  it("resolves canonical videos/ storage pointers without inventing learning-universes path", () => {
    const pointerAssets = [{ filename: "lecture.mp4", storedFilename: "videos/abc-uuid.mp4" }];
    const resolved = resolveLearningUniverseAsset("lecture.mp4", "uni-1", pointerAssets);
    expect(resolved.status).toBe("found");
    expect(resolved.resolvedUrl).toContain("/uploads/videos/abc-uuid.mp4");
    expect(resolved.resolvedUrl).not.toContain("/learning-universes/");
  });

  it("rewrites localhost upload hosts", () => {
    const resolved = resolveLearningUniverseAsset(
      "http://localhost:5000/uploads/projects/proj1/diagram.png",
      "uni-1",
      assets
    );
    expect(resolved.status).toBe("found");
    expect(resolved.resolvedUrl).toContain("/uploads/learning-universes/uni-1/img-9.png");
    expect(resolved.resolvedUrl).not.toContain("localhost:5000");
    expect(resolved.resolvedUrl).not.toContain("/uploads/projects/");
  });

  it("maps the production Vrishabhavathi MP4 onto the published LearningUniverseAsset URL", () => {
    const productionAssets = [
      { filename: "45246303-a85f-461b-b05d-18a424d0f7c3.mp4", storedFilename: "ef319b35-ab48-4ea5-9240-0b32026f9e60.mp4" },
    ];
    const resolved = resolveLearningUniverseAsset(
      "https://gatehub-backend-mprr.onrender.com\n/uploads/projects/p1/45246303-a85f-461b-b05d-18a424d0f7c3.mp4",
      "cmsu3za18000oubjgb9j5hxle",
      productionAssets
    );
    expect(resolved.status).toBe("found");
    expect(resolved.resolvedUrl).toContain(
      "/uploads/learning-universes/cmsu3za18000oubjgb9j5hxle/ef319b35-ab48-4ea5-9240-0b32026f9e60.mp4"
    );
    expect(resolved.resolvedUrl).not.toContain("/uploads/projects/");
    expect(resolved.resolvedUrl).not.toMatch(/[\r\n]/);
  });

  it("returns missing for unknown refs", () => {
    const resolved = resolveLearningUniverseAsset("missing.bin", "uni-1", assets);
    expect(resolved.status).toBe("missing");
    expect(resolved.resolvedUrl).toContain("/api/learning-universes/uni-1/assets/missing.bin");
  });
});

describe("redactMediaUrl", () => {
  it("strips token query params from logs", () => {
    expect(redactMediaUrl("https://api.example.com/uploads/latex/pdfs/a.pdf?token=secret")).toBe(
      "https://api.example.com/uploads/latex/pdfs/a.pdf"
    );
  });
});

describe("rewritePersistedMediaHost", () => {
  it("rewrites stale production upload hosts to a relative /uploads path when no API origin is configured", () => {
    const rewritten = rewritePersistedMediaHost(
      "https://gatehub-backend-mprr.onrender.com/uploads/latex/pdfs/paper.pdf"
    );
    expect(rewritten).toContain("/uploads/latex/pdfs/paper.pdf");
    expect(rewritten).not.toContain("gatehub-backend-mprr.onrender.com");
  });

  it("strips newlines accidentally persisted in API_URL-based media URLs", () => {
    const rewritten = rewritePersistedMediaHost(
      "https://gatehub-backend-mprr.onrender.com\n/uploads/learning-universes/u1/a.mp4"
    );
    expect(rewritten).not.toMatch(/[\r\n]/);
    expect(rewritten).toContain("/uploads/learning-universes/u1/a.mp4");
  });
});

describe("resolveVideoSource published uploads", () => {
  it("resolves localhost and project upload URLs through the asset callback", () => {
    const resolveUpload = (ref: string) =>
      resolveLearningUniverseAsset(ref, "uni-1", assets).resolvedUrl;
    const fromLocal = resolveVideoSource(
      { url: "http://localhost:5000/uploads/projects/p1/lecture.mp4", type: "upload" },
      resolveUpload
    );
    expect(fromLocal?.url).toContain("/uploads/learning-universes/uni-1/abc-123.mp4");
    expect(fromLocal?.url).not.toContain("/uploads/projects/");
  });
});

describe("inferUploadVideoMime", () => {
  it("matches backend MIME for uploaded formats", async () => {
    const { inferUploadVideoMime } = await import("./videoUtils");
    expect(inferUploadVideoMime("/uploads/a.mp4")).toBe("video/mp4");
    expect(inferUploadVideoMime("/uploads/a.m4v")).toBe("video/mp4");
    expect(inferUploadVideoMime("/uploads/a.webm")).toBe("video/webm");
    expect(inferUploadVideoMime("/uploads/a.ogg")).toBe("video/ogg");
  });
});
