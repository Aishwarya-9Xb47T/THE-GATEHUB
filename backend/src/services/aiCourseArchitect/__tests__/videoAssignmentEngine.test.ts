import { describe, expect, it } from "@jest/globals";
import {
  architectUploadStorageRefs,
  normalizeVideoMapping,
  relativeUploadPathFromRef,
} from "../videoAssignmentEngine.js";

describe("relativeUploadPathFromRef", () => {
  it("keeps the videos/ prefix used by persistMulterFile", () => {
    expect(relativeUploadPathFromRef("/uploads/videos/abc.mp4")).toBe("videos/abc.mp4");
    expect(relativeUploadPathFromRef("videos/abc.mp4")).toBe("videos/abc.mp4");
    expect(
      relativeUploadPathFromRef("https://gatehub-backend-mprr.onrender.com/uploads/videos/abc.mp4")
    ).toBe("videos/abc.mp4");
  });

  it("strips newlines injected into absolute upload URLs", () => {
    expect(
      relativeUploadPathFromRef("https://gatehub-backend-mprr.onrender.com\n/uploads/videos/abc.mp4")
    ).toBe("videos/abc.mp4");
  });
});

describe("normalizeVideoMapping uploads", () => {
  it("does not strip the B2 prefix down to a bare filename", () => {
    const mapped = normalizeVideoMapping(
      {
        type: "upload",
        file: "videos/ef319b35-ab48-4ea5-9240-0b32026f9e60.mp4",
        url: "https://example.com/uploads/videos/ef319b35-ab48-4ea5-9240-0b32026f9e60.mp4",
        title: "Lesson video",
      },
      0
    );
    expect(mapped?.file).toBe("videos/ef319b35-ab48-4ea5-9240-0b32026f9e60.mp4");
    expect(mapped?.url).toBe("/uploads/videos/ef319b35-ab48-4ea5-9240-0b32026f9e60.mp4");
  });
});

describe("architectUploadStorageRefs", () => {
  it("tries videos/<file> before a bare /uploads/<file> key", () => {
    const refs = architectUploadStorageRefs({
      file: "clip.mp4",
      url: "/uploads/clip.mp4",
    });
    expect(refs[0]).toBe("/uploads/videos/clip.mp4");
    expect(refs).toContain("/uploads/clip.mp4");
  });

  it("prefers the stored videos/ object key from a full URL", () => {
    const refs = architectUploadStorageRefs({
      url: "https://example.com/uploads/videos/clip.mp4",
      file: "clip.mp4",
    });
    expect(refs[0]).toBe("/uploads/videos/clip.mp4");
  });
});
