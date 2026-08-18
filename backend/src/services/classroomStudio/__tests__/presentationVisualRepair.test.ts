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
});
