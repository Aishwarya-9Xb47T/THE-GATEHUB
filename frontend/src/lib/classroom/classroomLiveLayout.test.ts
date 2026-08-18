import { describe, expect, it } from "vitest";
import {
  classroomGridTemplate,
  classroomPanelVisible,
  classroomStageFrameClass,
} from "./classroomLiveLayout";

describe("classroomLiveLayout", () => {
  it("gives the presentation the only grid column in focus mode", () => {
    expect(classroomGridTemplate(true, true, true)).toBe("minmax(0, 1fr)");
    expect(classroomPanelVisible(true, true)).toBe(false);
    expect(classroomPanelVisible(true, false)).toBe(false);
  });

  it("keeps independent left/right columns outside focus", () => {
    expect(classroomGridTemplate(false, true, true)).toBe("18rem minmax(0, 1fr) 20rem");
    expect(classroomGridTemplate(false, false, true)).toBe("minmax(0, 1fr) 20rem");
    expect(classroomGridTemplate(false, true, false)).toBe("18rem minmax(0, 1fr)");
    expect(classroomGridTemplate(false, false, false)).toBe("minmax(0, 1fr)");
    expect(classroomPanelVisible(false, true)).toBe(true);
  });

  it("expands the slide frame in focus mode", () => {
    expect(classroomStageFrameClass(true)).toContain("w-[95%]");
    expect(classroomStageFrameClass(true)).toContain("h-[92%]");
    expect(classroomStageFrameClass(false)).toContain("max-w-6xl");
  });
});
