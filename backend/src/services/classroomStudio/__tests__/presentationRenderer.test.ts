import { describe, expect, it } from "@jest/globals";
import { classifyClassroomRenderError, CLASSROOM_RENDERER_VERSION } from "../presentationRenderer.js";
import { validateAndExtractGoogleSlidesId } from "../googleSlidesPublicService.js";
import { buildSlideVisual } from "../classroomAssetPath.js";

describe("canonical presentation renderer contract", () => {
  it("classifies conversion and access failures instead of a generic render error", () => {
    expect(classifyClassroomRenderError(new Error("LIBREOFFICE_CONVERSION_FAILED exit=1"))).toBe("PPTX_CONVERSION_FAILED");
    expect(classifyClassroomRenderError(new Error("PDF_PAGE_COUNT_MISMATCH expected=11 actualPages=10"))).toBe("PDF_PAGE_COUNT_MISMATCH");
    expect(classifyClassroomRenderError(new Error("SOURCE_PERMISSION_DENIED private"))).toBe("SOURCE_PERMISSION_DENIED");
    expect(classifyClassroomRenderError(new Error("B2 upload verification failed"))).toBe("IMAGE_STORAGE_FAILED");
    expect(CLASSROOM_RENDERER_VERSION).toBe("source-pdf-png-v1");
  });

  it("always points slide visuals at the rendered PNG, never the source PPTX", () => {
    const pending = buildSlideVisual("pres-1", 0, false);
    expect(pending.type).toBe("image");
    expect(pending.renderedImageUrl).toBe("/api/classroom-studio/presentations/pres-1/assets/renders/slide-001.png");
    expect(pending.src).toBe(pending.renderedImageUrl);
    expect(pending.renderStatus).toBe("pending");
    expect(String(pending.src)).not.toMatch(/original\.pptx$/);

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
});
