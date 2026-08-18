import { describe, expect, it } from "@jest/globals";
import { mimeFromUploadPath, parseByteRange, inspectByteRange, isVideoUploadPath, isPublicUploadPath, normalizeUploadRelativePath } from "../uploadMedia.js";
import { extractYouTubeId } from "../videoSourceUtils.js";

describe("video range helpers", () => {
  it("parses inclusive byte ranges", () => {
    expect(parseByteRange("bytes=0-1023", 5000)).toEqual({ start: 0, end: 1023 });
    expect(parseByteRange("bytes=100-", 5000)).toEqual({ start: 100, end: 4999 });
    expect(parseByteRange("bytes=0-", 5000)).toEqual({ start: 0, end: 4999 });
    expect(parseByteRange(undefined, 5000)).toBeNull();
    expect(parseByteRange("bytes=9000-9010", 5000)).toBeNull();
  });

  it("marks unsatisfiable ranges for 416", () => {
    expect(inspectByteRange("bytes=0-1023", 5000)).toEqual({ type: "valid", start: 0, end: 1023 });
    expect(inspectByteRange("bytes=0-", 5000)).toEqual({ type: "valid", start: 0, end: 4999 });
    expect(inspectByteRange("bytes=9000-9010", 5000)).toEqual({ type: "unsatisfiable" });
    expect(inspectByteRange("not-a-range", 5000)).toEqual({ type: "unsatisfiable" });
    expect(inspectByteRange(undefined, 5000)).toEqual({ type: "none" });
  });

  it("maps stored video extensions to MIME types", () => {
    expect(mimeFromUploadPath("/uploads/videos/a.mp4")).toBe("video/mp4");
    expect(mimeFromUploadPath("clip.webm")).toBe("video/webm");
    expect(mimeFromUploadPath("clip.mov")).toBe("video/quicktime");
    expect(mimeFromUploadPath("clip.mkv")).toBe("video/x-matroska");
    expect(mimeFromUploadPath("clip.m4v")).toBe("video/mp4");
    expect(mimeFromUploadPath("clip.ogg")).toBe("video/ogg");
    expect(mimeFromUploadPath("clip.ogv")).toBe("video/ogg");
    expect(mimeFromUploadPath("renders/slide-002.svg")).toBe("image/svg+xml");
    expect(mimeFromUploadPath("source/original.pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(isVideoUploadPath("lesson.mp4")).toBe(true);
    expect(isVideoUploadPath("figure.png")).toBe(false);
  });

  it("describes GET/HEAD/Range HTTP contracts for uploaded video", () => {
    const size = 4096;
    const range = inspectByteRange("bytes=0-1023", size);
    expect(range).toEqual({ type: "valid", start: 0, end: 1023 });
    if (range.type !== "valid") throw new Error("expected valid range");
    expect({
      status: 206,
      acceptRanges: "bytes",
      contentType: mimeFromUploadPath("lesson.mp4"),
      contentRange: `bytes ${range.start}-${range.end}/${size}`,
      contentLength: range.end - range.start + 1,
    }).toEqual({
      status: 206,
      acceptRanges: "bytes",
      contentType: "video/mp4",
      contentRange: "bytes 0-1023/4096",
      contentLength: 1024,
    });
    expect(inspectByteRange(undefined, size).type).toBe("none");
    expect(inspectByteRange("bytes=9000-9010", size).type).toBe("unsatisfiable");
  });
});

describe("YouTube URL audit", () => {
  it("normalizes watch, short, and embed URLs and rejects invalid input", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9wgXcQ")).toBe("dQw4w9wgXcQ");
    expect(extractYouTubeId("https://youtu.be/dQw4w9wgXcQ")).toBe("dQw4w9wgXcQ");
    expect(extractYouTubeId("https://www.youtube.com/embed/dQw4w9wgXcQ")).toBe("dQw4w9wgXcQ");
    expect(extractYouTubeId("https://youtu.be/short")).toBeNull();
    expect(extractYouTubeId("not-a-url")).toBeNull();
  });
});

describe("relative upload persistence", () => {
  it("strips localhost and query tokens from stored upload paths", async () => {
    const { toRelativeUploadPath } = await import("../../services/b2StorageService.js");
    expect(toRelativeUploadPath("http://localhost:5000/uploads/projects/p1/a.mp4")).toBe(
      "/uploads/projects/p1/a.mp4"
    );
    expect(toRelativeUploadPath("/uploads/learning-universes/u1/a.mp4?token=secret")).toBe(
      "/uploads/learning-universes/u1/a.mp4"
    );
  });

  it("maps architect lecture videos to uploads/videos/... B2 keys", async () => {
    const { b2KeyFromPublicPath } = await import("../../services/b2StorageService.js");
    expect(b2KeyFromPublicPath("/uploads/videos/abc.mp4")).toBe("uploads/videos/abc.mp4");
    expect(b2KeyFromPublicPath("https://example.com/uploads/videos/abc.mp4")).toBe(
      "uploads/videos/abc.mp4"
    );
    expect(b2KeyFromPublicPath("https://example.com\n/uploads/videos/abc.mp4")).toBe(
      "uploads/videos/abc.mp4"
    );
    expect(b2KeyFromPublicPath("/uploads/abc.mp4")).toBe("uploads/abc.mp4");
  });

  it("detects Backblaze NoSuchKey / Key not found without treating API-key errors as missing objects", async () => {
    const { isMissingObjectError } = await import("../../services/b2StorageService.js");
    expect(isMissingObjectError({ name: "NoSuchKey", message: "Key not found" })).toBe(true);
    expect(isMissingObjectError(new Error("Key not found"))).toBe(true);
    expect(isMissingObjectError(new Error("API key not found. Please pass a valid API key."))).toBe(
      false
    );
    expect(isMissingObjectError(new Error("OPENAI_API_KEY not found"))).toBe(false);
  });
});

describe("published Learning Universe video access", () => {
  const stored = "learning-universes/cmsu3za18000oubjgb9j5hxle/ef319b35-ab48-4ea5-9240-0b32026f9e60.mp4";

  it("treats published LU MP4s as public for every Express path shape", () => {
    expect(isPublicUploadPath(stored)).toBe(true);
    expect(isPublicUploadPath(`/uploads/${stored}`)).toBe(true);
    expect(isPublicUploadPath(`uploads/${stored}`)).toBe(true);
  });

  it("keeps private project and LaTeX files gated", () => {
    expect(isPublicUploadPath("projects/p1/lecture.mp4")).toBe(false);
    expect(isPublicUploadPath("/uploads/projects/p1/lecture.mp4")).toBe(false);
    expect(isPublicUploadPath("latex/pdfs/paper.pdf")).toBe(false);
  });

  it("normalizes /uploads prefixes so B2 keys are not doubled", () => {
    expect(normalizeUploadRelativePath("/uploads/learning-universes/u1/a.mp4")).toBe(
      "learning-universes/u1/a.mp4"
    );
  });
});
