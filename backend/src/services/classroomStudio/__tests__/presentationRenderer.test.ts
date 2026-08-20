import { describe, expect, it } from "@jest/globals";
import { classifyClassroomRenderError, CLASSROOM_RENDERER_VERSION } from "../presentationRenderer.js";
import { validateAndExtractGoogleSlidesId } from "../googleSlidesPublicService.js";
import { buildOriginalSlideVisual, buildSlideVisual } from "../classroomAssetPath.js";

describe("canonical presentation renderer contract", () => {
  it("classifies conversion and access failures instead of a generic render error", () => {
    expect(classifyClassroomRenderError(new Error("LIBREOFFICE_CONVERSION_FAILED exit=1"))).toBe("PPTX_CONVERSION_FAILED");
    expect(classifyClassroomRenderError(new Error("PDF_PAGE_COUNT_MISMATCH expected=11 actualPages=10"))).toBe("PDF_PAGE_COUNT_MISMATCH");
    expect(classifyClassroomRenderError(new Error("SOURCE_PERMISSION_DENIED private"))).toBe("SOURCE_PERMISSION_DENIED");
    expect(classifyClassroomRenderError(new Error("B2 upload verification failed"))).toBe("IMAGE_STORAGE_FAILED");
    expect(CLASSROOM_RENDERER_VERSION).toBe("source-pdf-png-v1");
  });

  it("keeps original PPTX as the visual source and PNG URLs for thumbnails only", () => {
    const pending = buildSlideVisual("pres-1", 0, false);
    expect(pending.type).toBe("image");
    expect(pending.renderedImageUrl).toBe("/api/classroom-studio/presentations/pres-1/assets/renders/slide-001.png");
    expect(pending.src).toBe(pending.renderedImageUrl);
    expect(pending.renderStatus).toBe("pending");
    expect(String(pending.src)).not.toMatch(/original\.pptx$/);

    const original = buildOriginalSlideVisual("pres-1", 0, { sourceType: "powerpoint" });
    expect(original.visualSource).toBe("original_pptx");
    expect(original.renderStatus).toBe("ready");
    expect(original.originalFileUrl).toBe("/api/classroom-studio/presentations/pres-1/assets/source/original.pptx");

    const google = buildOriginalSlideVisual("pres-1", 1, {
      sourceType: "google_slides",
      visualSource: "google_embed",
      googleSlidesId: "abc123",
    });
    expect(google.visualSource).toBe("google_embed");
    expect(String(google.embedUrl)).toContain("/presentation/d/abc123/embed");
    expect(String(google.embedUrl)).toContain("slide=2");

    const ready = buildSlideVisual("pres-1", 0, true);
    expect(ready.renderStatus).toBe("ready");
    expect(ready.availability).toBe("available");
  });

  it("extracts Google Slides presentation IDs and rejects non-slides URLs", () => {
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/presentation/d/1JcUxO92Ksa9vFSvY9_JrBXySEf2j1ARYs5-dwnMg6FQ/edit").presentationId)
      .toBe("1JcUxO92Ksa9vFSvY9_JrBXySEf2j1ARYs5-dwnMg6FQ");
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/document/d/abc/edit").valid).toBe(false);
    expect(validateAndExtractGoogleSlidesId("https://docs.google.com/presentation/d/abc/edit").valid).toBe(true);
  });

  it("maps original PPTX slides 1..N in archive order without placeholders", async () => {
    const JSZip = (await import("jszip")).default;
    const { inspectPptxArchive } = await import("../pptxArchiveInspect.js");
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types></Types>");
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    for (let i = 1; i <= 14; i += 1) {
      zip.file(`ppt/slides/slide${i}.xml`, `<p:sld>${i}</p:sld>`);
    }
    const pptx = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
    const inspection = await inspectPptxArchive(pptx);
    expect(inspection.zipValid).toBe(true);
    expect(inspection.slideCount).toBe(14);
    const visuals = Array.from({ length: inspection.slideCount }, (_, index) =>
      buildOriginalSlideVisual("pres-gru", index, { sourceType: "powerpoint" }),
    );
    expect(visuals.map((visual) => visual.slideIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(visuals.every((visual) => visual.visualSource === "original_pptx")).toBe(true);
    expect(visuals.every((visual) => visual.renderStatus === "ready")).toBe(true);
  });
});
