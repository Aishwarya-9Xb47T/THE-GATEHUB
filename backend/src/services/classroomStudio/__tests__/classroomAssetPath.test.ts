import { describe, expect, it } from "@jest/globals";
import {
  CLASSROOM_SOURCE_REST,
  PNG_MIME,
  PPTX_MIME,
  SVG_MIME,
  aggregatePresentationRenderStatus,
  computeClassroomRenderProgress,
  isStaleSlideRenderWrite,
  slideVisualIsReady,
  canonicalSlidePngRelative,
  canonicalSlideSvgRelative,
  canonicalVisualRelative,
  getClassroomSourceKey,
  canonicalSourceRelative,
  canonicalExportPdfRelative,
  parseClassroomAssetFilename,
  sanitizeClassroomAssetRest,
  classroomStorageRelatives,
  buildGoogleSlidesEmbedUrl,
  mergeExtractedSlideVisual,
  buildOriginalSlideVisual,
} from "../classroomAssetPath.js";
import { classroomAssetLookupRelatives } from "../classroomAssetUrls.js";

describe("classroomAssetPath", () => {
  it("rejects path traversal", () => {
    expect(sanitizeClassroomAssetRest("../secrets.pptx")).toBeNull();
    expect(sanitizeClassroomAssetRest("renders/../../x.svg")).toBeNull();
  });

  it("uses canonical classroom keys for PPTX and SVG", () => {
    expect(getClassroomSourceKey("pres-1")).toBe("uploads/classroom/pres-1/source/original.pptx");
    expect(canonicalSourceRelative("pres-1")).toBe("classroom/pres-1/source/original.pptx");
    expect(canonicalExportPdfRelative("pres-1")).toBe("classroom/pres-1/source/export.pdf");
    expect(canonicalSlideSvgRelative("pres-1", 2)).toBe("classroom/pres-1/renders/slide-002.svg");
    expect(canonicalSlidePngRelative("pres-1", 2)).toBe("classroom/pres-1/renders/slide-002.png");
    expect(canonicalVisualRelative("pres-1", 2, "svg")).toBe("classroom/pres-1/visuals/2.svg");
    expect(classroomStorageRelatives("pres-1", CLASSROOM_SOURCE_REST)).toEqual([
      "classroom/pres-1/source/original.pptx",
      "classroom-studio/pres-1/source/original.pptx",
    ]);
  });

  it("parses authenticated asset filenames onto the canonical rest path", () => {
    expect(parseClassroomAssetFilename("source", "original.pptx")).toEqual({
      rest: "source/original.pptx",
      mime: PPTX_MIME,
    });
    expect(parseClassroomAssetFilename("renders", "slide-2.svg")).toEqual({
      rest: "renders/slide-002.svg",
      mime: SVG_MIME,
    });
    expect(parseClassroomAssetFilename("renders", "slide-2.png")).toEqual({
      rest: "renders/slide-002.png",
      mime: PNG_MIME,
    });
    expect(parseClassroomAssetFilename("visuals", "1.svg")).toEqual({
      rest: "visuals/1.svg",
      mime: SVG_MIME,
    });
    expect(parseClassroomAssetFilename("visuals", "slide-2.png")).toEqual({
      rest: "visuals/2.png",
      mime: PNG_MIME,
    });
    expect(parseClassroomAssetFilename("source", "notes.pdf")).toBeNull();
  });

  it("computes render progress from persisted slide visuals", () => {
    const progress = computeClassroomRenderProgress([
      { order: 1, content: { visual: { type: "image", availability: "available" } } },
      { order: 2, content: { visual: { type: "pptx", availability: "missing" } } },
      { order: 3, content: { visual: { type: "pptx", availability: "missing" } } },
    ]);
    expect(slideVisualIsReady({ visual: { type: "image", availability: "available" } })).toBe(true);
    expect(slideVisualIsReady({ visual: { type: "svg" } })).toBe(false);
    expect(slideVisualIsReady({ visual: { type: "pptx", availability: "missing" } })).toBe(false);
    expect(progress).toEqual({ rendered: 1, total: 3, currentSlide: 2 });
  });

  it("aggregates presentation status from slide + job state instead of a stale render_failed flag", () => {
    const slides = [
      { content: { visual: { renderStatus: "ready", availability: "available" } } },
      { content: { visual: { renderStatus: "rendering", availability: "missing" } } },
    ];
    expect(aggregatePresentationRenderStatus({ slides, exclusiveRunning: true, jobStatus: "RENDERING" })).toBe("rendering_partial");
    expect(aggregatePresentationRenderStatus({
      slides: [
        { content: { visual: { renderStatus: "ready", availability: "available" } } },
        { content: { visual: { renderStatus: "failed", availability: "failed" } } },
      ],
      exclusiveRunning: false,
      jobStatus: "FAILED",
    })).toBe("render_failed");
    expect(aggregatePresentationRenderStatus({
      slides: Array.from({ length: 14 }, () => ({ content: { visual: { renderStatus: "ready", availability: "available" } } })),
      exclusiveRunning: false,
      jobStatus: "FAILED",
    })).toBe("ready");
    expect(isStaleSlideRenderWrite(
      { jobId: "job-b", attempt: 2, renderGeneration: 2, renderStatus: "ready" },
      { jobId: "job-a", attempt: 1, renderGeneration: 1, renderStatus: "failed" },
    )).toBe(true);
  });

  it("treats original PPTX/Google visuals as ready even while thumbnail jobs run", () => {
    const slides = Array.from({ length: 14 }, (_, index) => ({
      content: {
        visual: {
          type: "original_pptx",
          visualSource: "original_pptx",
          availability: "available",
          renderStatus: "ready",
          slideIndex: index,
        },
      },
    }));
    expect(slideVisualIsReady(slides[0]?.content)).toBe(true);
    expect(aggregatePresentationRenderStatus({
      slides,
      exclusiveRunning: true,
      jobStatus: "RENDERING",
    })).toBe("ready");
  });

  it("builds official Google embed URLs without duplicating query markers", () => {
    expect(buildGoogleSlidesEmbedUrl("abc123", 1)).toBe(
      "https://docs.google.com/presentation/d/abc123/embed?start=false&loop=false&delayms=3000000&slide=1",
    );
    expect(buildGoogleSlidesEmbedUrl("abc123", 2)).toContain("slide=2");
    expect(buildGoogleSlidesEmbedUrl("abc123", 10)).toContain("slide=10");
    expect(buildGoogleSlidesEmbedUrl("abc123", 10).includes("??")).toBe(false);
    expect(buildGoogleSlidesEmbedUrl("abc123", 10).split("?").length).toBe(2);
  });

  it("does not let background extraction overwrite a google_embed visual", () => {
    const existing = {
      type: "google_slides",
      visualSource: "google_embed" as const,
      embedUrl: "https://docs.google.com/presentation/d/abc123/embed?slide=1",
      googleSlidesId: "abc123",
      googleSlidesUrl: "https://docs.google.com/presentation/d/abc123/edit",
      renderStatus: "ready",
      availability: "available",
    };
    const extracted = {
      type: "image",
      visualSource: "original_pptx",
      src: "/uploads/classroom/p/renders/slide-001.png",
      embedUrl: "https://docs.google.com/presentation/d/abc123/embed?slide=1",
      googleSlidesId: "abc123",
    };
    const merged = mergeExtractedSlideVisual(existing, extracted);
    expect(merged.type).toBe("google_slides");
    expect(merged.visualSource).toBe("google_embed");
    expect(merged.embedUrl).toContain("/presentation/d/abc123/embed");
    expect(merged.renderStatus).toBe("ready");
  });

  it("keeps google_embed when extraction rebuilds the visual from PPTX metadata", () => {
    const next = buildOriginalSlideVisual("pres-1", 0, {
      sourceType: "google_slides",
      visualSource: "google_embed",
      googleSlidesId: "abc123",
      googleSlidesUrl: "https://docs.google.com/presentation/d/abc123/edit",
      extractionStatus: "complete",
    });
    const merged = mergeExtractedSlideVisual(
      { visualSource: "google_embed", embedUrl: String(next.embedUrl), googleSlidesId: "abc123" },
      { ...next, type: "image", visualSource: "original_pptx" },
    );
    expect(merged.visualSource).toBe("google_embed");
    expect(merged.type).toBe("google_slides");
    expect(merged.extractionStatus).toBe("complete");
  });
});
