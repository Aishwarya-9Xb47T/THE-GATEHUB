import { describe, it, expect, beforeEach } from "vitest";
import { bootstrapAssessmentPlatform } from "../bootstrap";
import { getRenderer } from "../registry/rendererRegistry";
import type { SanitizedQuestionSnapshot } from "../types";

const sampleQuestion: SanitizedQuestionSnapshot = {
  id: "q-1",
  questionVersionId: "qv-1",
  typeSlug: "multiple_choice",
  stem: "2 + 2 = ?",
  order: 0,
  marks: 1,
  hints: [],
  metadata: {},
  choices: [
    { id: "a", text: "3", order: 0 },
    { id: "b", text: "4", order: 1 },
  ],
  media: [],
};

describe("renderer plugin contract", () => {
  beforeEach(() => {
    bootstrapAssessmentPlatform();
  });

  it("validates and collects MCQ response", () => {
    const plugin = getRenderer("multiple_choice")!;
    const errors = plugin.validateInput("b", sampleQuestion);
    expect(errors).toHaveLength(0);

    const response = plugin.collectResponse("b", sampleQuestion, 1500);
    expect(response.rendererId).toBe("mcq-renderer");
    expect(response.answer).toBe("b");
    expect(response.responseTimeMs).toBe(1500);
  });

  it("rejects empty MCQ response", () => {
    const plugin = getRenderer("multiple_choice")!;
    const errors = plugin.validateInput("", sampleQuestion);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("exposes accessibility contract", () => {
    const plugin = getRenderer("essay")!;
    expect(plugin.accessibility.keyboardNavigable).toBe(true);
    expect(plugin.accessibility.screenReaderLabels).toBe(true);
  });
});
