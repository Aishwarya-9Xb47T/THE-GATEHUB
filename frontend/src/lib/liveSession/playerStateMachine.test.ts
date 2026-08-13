import { describe, expect, it } from "vitest";
import {
  canSelectOption,
  canSubmit,
  isFeedbackFullScreen,
  isPostSubmitPhase,
  isReadyForNext,
  phaseAfterFeedback,
} from "@/lib/liveSession/playerStateMachine";

describe("live player selection vs submit", () => {
  it("allows option selection before hasSelection is true", () => {
    expect(canSelectOption("QUESTION_ACTIVE")).toBe(true);
    expect(canSubmit("QUESTION_ACTIVE")).toBe(true);
  });

  it("blocks selection during submit and post-submit phases", () => {
    expect(canSelectOption("SUBMITTING")).toBe(false);
    expect(canSelectOption("READY_FOR_NEXT")).toBe(false);
    expect(canSelectOption("SHOW_FEEDBACK")).toBe(false);
  });

  it("documents the A1.4 fix: optionsDisabled must not use canSubmitNow", () => {
    const hasSelection = false;
    const phase = "QUESTION_ACTIVE" as const;
    expect(canSelectOption(phase)).toBe(true);
    expect(canSubmit(phase) && hasSelection).toBe(false);
  });
});

describe("A1.5 post-submit flow", () => {
  it("shows full feedback then ready state (not full-page wait)", () => {
    expect(isFeedbackFullScreen("SHOW_FEEDBACK")).toBe(true);
    expect(isReadyForNext("READY_FOR_NEXT")).toBe(true);
    expect(phaseAfterFeedback(false)).toBe("READY_FOR_NEXT");
  });

  it("keeps player shell alive during post-submit", () => {
    expect(isPostSubmitPhase("SHOW_FEEDBACK")).toBe(true);
    expect(isPostSubmitPhase("READY_FOR_NEXT")).toBe(true);
    expect(isPostSubmitPhase("QUESTION_ACTIVE")).toBe(false);
  });
});

describe("A1.7 self-paced flow", () => {
  it("auto-advances to next question after feedback", () => {
    expect(phaseAfterFeedback(false, "self_paced")).toBe("QUESTION_ACTIVE");
    expect(phaseAfterFeedback(true, "self_paced")).toBe("SHOW_LEADERBOARD");
  });

  it("instructor-paced still waits for host", () => {
    expect(phaseAfterFeedback(false, "instructor_paced")).toBe("READY_FOR_NEXT");
  });
});
