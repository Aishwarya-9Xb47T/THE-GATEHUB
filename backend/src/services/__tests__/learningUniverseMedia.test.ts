import { describe, expect, it } from "vitest";
import {
  collectMediaReferences,
  isPublishableMediaAssetRef,
  sanitizeParsedMediaReferences,
  validateMediaAssets,
} from "../learningUniverseMedia.js";
import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";

function makeParsed(overrides?: {
  videoFile?: string;
  videoUrl?: string;
  videoType?: string;
  imageFile?: string;
}): ParsedLearningUniverse {
  return {
    universe: { title: "Deep Learning", description: "" },
    tracks: [
      {
        title: "Track",
        description: "",
        learningOutcomes: "",
        careerOutcomes: "",
        difficulty: "",
        modules: [
          {
            title: "Module",
            description: "",
            prerequisites: "",
            learningOutcomes: "",
            estimatedHours: 1,
            lessons: [
              {
                title: "Neural Network Calculus",
                contentBlocks: [
                  {
                    type: "video",
                    content: {
                      type: overrides?.videoType ?? "upload",
                      file: overrides?.videoFile,
                      url: overrides?.videoUrl ?? overrides?.videoFile,
                      title: "Lesson video",
                    },
                  },
                  ...(overrides?.imageFile
                    ? [
                        {
                          type: "image" as const,
                          content: { file: overrides.imageFile, title: "Diagram" },
                        },
                      ]
                    : []),
                ],
                videos: [
                  {
                    type: overrides?.videoType ?? "upload",
                    file: overrides?.videoFile,
                    url: overrides?.videoUrl ?? overrides?.videoFile ?? "",
                    title: "Lesson video",
                  },
                ],
                practice: null,
                quiz: null,
                project: null,
                resources: [],
              },
            ],
          },
        ],
      },
    ],
    warnings: [],
  } as unknown as ParsedLearningUniverse;
}

describe("isPublishableMediaAssetRef", () => {
  it("rejects the production failing path videos.tex under uploads/latex", () => {
    expect(
      isPublishableMediaAssetRef(
        "uploads/latex/cmt631ojq000112hsnoi5ydia/lesson-01/videos.tex"
      )
    ).toBe(false);
    expect(isPublishableMediaAssetRef("lesson-01/videos.tex")).toBe(false);
    expect(isPublishableMediaAssetRef("/track-01/module-01/lesson-01/overview.tex")).toBe(false);
  });

  it("accepts real media binaries", () => {
    expect(isPublishableMediaAssetRef("lecture-01.mp4")).toBe(true);
    expect(isPublishableMediaAssetRef("uploads/videos/abc.mp4")).toBe(true);
    expect(isPublishableMediaAssetRef("diagram.png")).toBe(true);
    expect(isPublishableMediaAssetRef("uploads/latex/pdfs/compiled-xyz.pdf")).toBe(true);
  });

  it("rejects remote and empty", () => {
    expect(isPublishableMediaAssetRef("https://youtube.com/watch?v=x")).toBe(false);
    expect(isPublishableMediaAssetRef("")).toBe(false);
    expect(isPublishableMediaAssetRef("blob:http://localhost/x")).toBe(false);
  });
});

describe("validateMediaAssets — publish boundary", () => {
  it("does not fail publish when lesson references videos.tex (production regression)", () => {
    const parsed = makeParsed({
      videoFile: "uploads/latex/cmt631ojq000112hsnoi5ydia/lesson-01/videos.tex",
      videoType: "upload",
    });
    const scrubbed = sanitizeParsedMediaReferences(parsed);
    expect(scrubbed).toBeGreaterThan(0);
    const issues = validateMediaAssets(parsed, []);
    expect(issues).toEqual([]);
    expect(collectMediaReferences(parsed)).toEqual([]);
  });

  it("still fails when a real local MP4 is missing", () => {
    const parsed = makeParsed({
      videoFile: "my-lecture.mp4",
      videoType: "upload",
    });
    const issues = validateMediaAssets(parsed, ["other.png"]);
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe("STORAGE_OBJECT_NOT_FOUND");
    expect(issues[0].message).toContain("my-lecture.mp4");
  });

  it("passes when real MP4 is listed in available assets", () => {
    const parsed = makeParsed({
      videoFile: "my-lecture.mp4",
      videoType: "upload",
    });
    const issues = validateMediaAssets(parsed, ["my-lecture.mp4"]);
    expect(issues).toEqual([]);
  });

  it("does not treat YouTube URLs as missing local assets", () => {
    const parsed = makeParsed({
      videoType: "youtube",
      videoUrl: "https://www.youtube.com/watch?v=aircAruvnKk",
      videoFile: undefined,
    });
    // clear file that makeParsed may have set from url
    parsed.tracks[0].modules[0].lessons[0].videos[0].file = undefined;
    (parsed.tracks[0].modules[0].lessons[0].contentBlocks[0].content as { file?: string }).file =
      undefined;
    const issues = validateMediaAssets(parsed, []);
    expect(issues).toEqual([]);
  });
});
