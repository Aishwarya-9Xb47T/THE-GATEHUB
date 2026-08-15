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

  it("rewrites localhost upload hosts", () => {
    const resolved = resolveLearningUniverseAsset(
      "http://localhost:5000/uploads/projects/proj1/diagram.png",
      "uni-1",
      assets
    );
    expect(resolved.status).toBe("found");
    expect(resolved.resolvedUrl).toContain("/uploads/learning-universes/uni-1/img-9.png");
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
