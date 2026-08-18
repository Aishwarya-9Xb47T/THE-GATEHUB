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
