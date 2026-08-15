import { describe, expect, it } from "vitest";
import { matchUniverseAsset, resolveLearningUniverseAsset } from "./resolveLearningUniverseAsset";

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
