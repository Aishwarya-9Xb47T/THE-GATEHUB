import { describe, expect, it } from "@jest/globals";
import {
  classroomAssetLookupRelatives,
  rewriteClassroomAssetRef,
  rewriteClassroomAssetTree,
} from "../classroomAssetUrls.js";

describe("classroomAssetUrls", () => {
  it("rewrites unresolved asset:// refs onto the classroom upload prefix", () => {
    expect(rewriteClassroomAssetRef("asset://source/original.pptx", "pres-1")).toBe(
      "/uploads/classroom/pres-1/source/original.pptx",
    );
    expect(rewriteClassroomAssetRef("asset://renders/slide-001.svg", "pres-1")).toBe(
      "/uploads/classroom/pres-1/renders/slide-001.svg",
    );
  });

  it("rejects path traversal in asset:// refs", () => {
    expect(rewriteClassroomAssetRef("asset://../secrets.pptx", "pres-1")).toBe("asset://../secrets.pptx");
  });

  it("strips localhost hosts down to /uploads paths", () => {
    expect(
      rewriteClassroomAssetRef("http://localhost:5000/uploads/classroom/pres-1/source/original.pptx?token=abc"),
    ).toBe("/uploads/classroom/pres-1/source/original.pptx");
  });

  it("looks up both classroom and classroom-studio object keys", () => {
    const keys = classroomAssetLookupRelatives("classroom/pres-1/source/original.pptx");
    expect(keys).toContain("classroom/pres-1/source/original.pptx");
    expect(keys).toContain("classroom-studio/pres-1/source/original.pptx");
    expect(keys).toContain("classroom/pres-1/source.pptx");
  });

  it("rewrites nested slide visual trees", () => {
    const rewritten = rewriteClassroomAssetTree(
      {
        visual: {
          type: "pptx",
          src: "asset://source/original.pptx",
          source: { type: "pptx", src: "asset://source/original.pptx" },
        },
        elements: [{ src: "asset://media/image1.png" }],
      },
      "pres-1",
    ) as { visual: { src: string }; elements: Array<{ src: string }> };
    expect(rewritten.visual.src).toBe("/uploads/classroom/pres-1/source/original.pptx");
    expect(rewritten.elements[0].src).toBe("/uploads/classroom/pres-1/media/image1.png");
  });
});
