import { describe, expect, it } from "@jest/globals";
import { classroomAssetAccessDecision } from "../classroomAssetAccess.js";

describe("classroomAssetAccessDecision", () => {
  it("allows the presentation owner and admins", () => {
    expect(
      classroomAssetAccessDecision({
        userId: "inst-1",
        role: "instructor",
        instructorId: "inst-1",
        isParticipant: false,
      }),
    ).toBe(true);
    expect(
      classroomAssetAccessDecision({
        userId: "admin-1",
        role: "admin",
        instructorId: "inst-1",
        isParticipant: false,
      }),
    ).toBe(true);
  });

  it("allows a session participant student", () => {
    expect(
      classroomAssetAccessDecision({
        userId: "stu-1",
        role: "student",
        instructorId: "inst-1",
        isParticipant: true,
      }),
    ).toBe(true);
  });

  it("rejects an unauthorized user", () => {
    expect(
      classroomAssetAccessDecision({
        userId: "stranger",
        role: "student",
        instructorId: "inst-1",
        isParticipant: false,
      }),
    ).toBe(false);
    expect(
      classroomAssetAccessDecision({
        userId: "",
        role: "admin",
        instructorId: "inst-1",
        isParticipant: true,
      }),
    ).toBe(false);
  });
});
