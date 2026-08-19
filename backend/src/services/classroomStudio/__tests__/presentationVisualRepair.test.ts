import { describe, expect, it } from "@jest/globals";
import {
  canonicalPublicPath,
  canonicalSlideSvgRelative,
  canonicalSourceRelative,
} from "../classroomAssetPath.js";

describe("existing presentation repair contract", () => {
  it("rewrites broken slide visuals onto canonical B2 keys without requiring a new upload path", () => {
    const presentationId = "cmsy6g8sr00b7owbuj0gvy1rb";
    expect(canonicalSourceRelative(presentationId)).toBe(
      "classroom/cmsy6g8sr00b7owbuj0gvy1rb/source/original.pptx",
    );
    expect(canonicalSlideSvgRelative(presentationId, 2)).toBe(
      "classroom/cmsy6g8sr00b7owbuj0gvy1rb/renders/slide-002.svg",
    );
    expect(canonicalPublicPath(canonicalSlideSvgRelative(presentationId, 2))).toBe(
      "/uploads/classroom/cmsy6g8sr00b7owbuj0gvy1rb/renders/slide-002.svg",
    );
  });

  it("resolves DB sourceUrl onto the same presentation prefix", async () => {
    const { collectSourceRelatives, relativeFromSourceUrl } = await import("../classroomSourceResolver.js");
    const id = "cmsyrby060001ttlabj9g4fmw";
    expect(relativeFromSourceUrl(`/uploads/classroom/${id}/source/original.pptx`, id)).toBe(
      `classroom/${id}/source/original.pptx`,
    );
    expect(collectSourceRelatives(id, null)).toContain(`classroom/${id}/source/original.pptx`);
    expect(collectSourceRelatives(id, null)).toContain(`classroom-studio/${id}/source/original.pptx`);
  });
});

describe("rendered SVG validation", () => {
  it("accepts SVG markup and rejects JSON, HTML, ZIP bytes, and SVGs without dimensions", async () => {
    const {
      isValidRenderedSvg,
      applyDeadlockSafeInflatePatch,
      pptxSvgPackageVersion,
      pptxSvgDistDir,
    } = await import("../presentationRenderService.js");
    expect(isValidRenderedSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>')).toBe(true);
    expect(isValidRenderedSvg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>')).toBe(true);
    expect(isValidRenderedSvg('{"error":"nope"}')).toBe(false);
    expect(isValidRenderedSvg('<!DOCTYPE html><html><body>fail</body></html>')).toBe(false);
    expect(isValidRenderedSvg('')).toBe(false);
    expect(isValidRenderedSvg('PK\u0003\u0004not-an-svg')).toBe(false);
    expect(pptxSvgPackageVersion()).toBe("0.4.5");
    const dist = pptxSvgDistDir();
    expect(dist).toBeTruthy();
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const zipSource = readFileSync(join(dist!, "zip.js"), "utf8");
    expect(applyDeadlockSafeInflatePatch(zipSource).applied).toBe(true);
  });
});
