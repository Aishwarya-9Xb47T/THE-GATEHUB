import { describe, expect, it } from "@jest/globals";
import { mimeFromUploadPath, parseByteRange, isVideoUploadPath } from "../uploadMedia.js";
import { extractYouTubeId } from "../videoSourceUtils.js";

describe("video range helpers", () => {
  it("parses inclusive byte ranges", () => {
    expect(parseByteRange("bytes=0-1023", 5000)).toEqual({ start: 0, end: 1023 });
    expect(parseByteRange("bytes=100-", 5000)).toEqual({ start: 100, end: 4999 });
    expect(parseByteRange(undefined, 5000)).toBeNull();
    expect(parseByteRange("bytes=9000-9010", 5000)).toBeNull();
  });

  it("maps stored video extensions to MIME types", () => {
    expect(mimeFromUploadPath("/uploads/videos/a.mp4")).toBe("video/mp4");
    expect(mimeFromUploadPath("clip.webm")).toBe("video/webm");
    expect(mimeFromUploadPath("clip.mov")).toBe("video/quicktime");
    expect(mimeFromUploadPath("clip.mkv")).toBe("video/x-matroska");
    expect(isVideoUploadPath("lesson.mp4")).toBe(true);
    expect(isVideoUploadPath("figure.png")).toBe(false);
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
