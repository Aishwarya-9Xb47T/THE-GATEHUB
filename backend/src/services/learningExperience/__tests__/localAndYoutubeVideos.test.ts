import { describe, expect, it } from "@jest/globals";
import { buildLearnerExperiencePackage } from "../learningExperienceEngine.js";

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const LOCAL = "/uploads/videos/lesson-local.mp4";

function videoStepsOf(lessonId: string, contentBlocks: unknown[], videos: unknown[] = []) {
  const pkg = buildLearnerExperiencePackage({
    universeId: "u1",
    universe: { title: "Course", description: "" },
    tracks: [
      {
        id: "t1",
        title: "Track",
        modules: [
          {
            id: "m1",
            title: "Module",
            lessons: [
              {
                id: lessonId,
                title: "Lesson",
                contentBlocks: contentBlocks as never,
                videos: videos as never,
              },
            ],
          },
        ],
      },
    ],
  });
  return pkg.lessons[lessonId].steps.filter((s) => s.kind === "video");
}

describe("local + YouTube video publish/experience regression", () => {
  it("local only → exactly one local video step", () => {
    const steps = videoStepsOf("L1", [
      { type: "video", content: { type: "upload", url: LOCAL, file: LOCAL, title: "Local" } },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0].payload.type).toBe("upload");
    expect(String(steps[0].payload.url || steps[0].payload.file)).toContain("lesson-local");
  });

  it("YouTube only → exactly one YouTube video step", () => {
    const steps = videoStepsOf("L2", [
      { type: "video", content: { type: "youtube", url: YT, title: "YouTube" } },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0].payload.type).toBe("youtube");
    expect(steps[0].payload.youtubeId).toBe("dQw4w9WgXcQ");
  });

  it("local + YouTube → exactly two steps, one of each", () => {
    const steps = videoStepsOf("L3", [
      { type: "video", content: { type: "upload", url: LOCAL, file: LOCAL, title: "Local A" } },
      { type: "video", content: { type: "youtube", url: YT, title: "YouTube B" } },
    ]);
    expect(steps).toHaveLength(2);
    expect(steps.map((s) => s.payload.type).sort()).toEqual(["upload", "youtube"]);
  });

  it("publishing must not duplicate either video (duplicate blocks + document nodes)", () => {
    const steps = videoStepsOf(
      "L4",
      [
        { type: "video", content: { type: "upload", url: LOCAL, file: LOCAL, title: "Local A" } },
        { type: "video", content: { type: "youtube", url: YT, title: "YouTube B" } },
        { type: "video", videoUrl: YT, videoType: "youtube" },
        {
          type: "document",
          content: {
            title: "Overview",
            nodes: [
              { type: "markdown", content: "Text" },
              { type: "video", sourceType: "youtube", url: YT, title: "YouTube B" },
              { type: "video", sourceType: "upload", file: LOCAL, url: LOCAL, title: "Local A" },
            ],
          },
        },
      ],
      [
        { id: "v-local", type: "upload", url: LOCAL, title: "Local A" },
        { id: "v-yt", type: "youtube", url: YT, title: "YouTube B" },
      ]
    );

    expect(steps).toHaveLength(2);
    expect(steps.map((s) => s.payload.type).sort()).toEqual(["upload", "youtube"]);
  });

  it("refresh/re-fetch must not duplicate either video", () => {
    const blocks = [
      { type: "video", content: { type: "upload", url: LOCAL, file: LOCAL, title: "Local A" } },
      { type: "video", content: { type: "youtube", url: YT, title: "YouTube B" } },
    ];
    const videos = [
      { id: "v-local", type: "upload", url: LOCAL, title: "Local A" },
      { id: "v-yt", type: "youtube", url: YT, title: "YouTube B" },
    ];
    const first = videoStepsOf("L5", blocks, videos);
    const second = videoStepsOf("L5", blocks, videos);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first.map((s) => s.payload.type).sort()).toEqual(["upload", "youtube"]);
    expect(second.map((s) => s.payload.type).sort()).toEqual(["upload", "youtube"]);
  });

  it("hollow video blocks still recover local from lesson.videos (legacy published data)", () => {
    const steps = videoStepsOf(
      "L6",
      [
        { type: "video", content: {} },
        { type: "video", content: { type: "youtube", url: YT, title: "YouTube B" } },
      ],
      [
        { id: "v-local", type: "upload", url: LOCAL, title: "Local A" },
        { id: "v-yt", type: "youtube", url: YT, title: "YouTube B" },
      ]
    );
    expect(steps).toHaveLength(2);
    expect(steps.map((s) => s.payload.type).sort()).toEqual(["upload", "youtube"]);
  });
});
