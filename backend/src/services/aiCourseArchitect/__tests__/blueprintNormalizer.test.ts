import { describe, expect, it } from "vitest";
import {
  BlueprintValidationError,
  normalizeAndValidateApprovedBlueprint,
  normalizeApprovedBlueprint,
  normalizeLearningGoals,
  validateApprovedBlueprint,
} from "../blueprintNormalizer.js";
import { ensureLessonBlueprintPlan } from "../lessonPlanningEngine.js";
import type { AICourseArchitectInterview, ArchitectLessonBlueprint } from "../types.js";
import { createDefaultInterviewLike } from "./blueprintNormalizer.test.fixtures.js";

describe("normalizeLearningGoals", () => {
  it("accepts arrays, strings, and alternate keys", () => {
    expect(normalizeLearningGoals(["A", "B"])).toEqual(["A", "B"]);
    expect(normalizeLearningGoals("Goal one; Goal two")).toEqual(["Goal one", "Goal two"]);
    expect(normalizeLearningGoals(undefined, null, ["from alt"])).toEqual(["from alt"]);
    expect(normalizeLearningGoals({ text: "x" } as unknown)).toEqual([]);
  });
});

describe("normalizeApprovedBlueprint", () => {
  it("normalizes Deep Learning 1-module 2-lesson blueprint missing learningGoals", () => {
    const interview = createDefaultInterviewLike({
      title: "Deep Learning",
      subject: "AI",
      learningGoals: ["Build neural nets"],
    });

    const raw = {
      courseTitle: "Deep Learning",
      modules: [
        {
          title: "Foundations",
          // lessons missing objectives / learningGoals (production crash shape)
          lessons: [{ title: "Intro to Neural Nets" }, { title: "Backpropagation" }],
        },
      ],
    };

    const normalized = normalizeAndValidateApprovedBlueprint(raw, interview);
    expect(normalized.modules).toHaveLength(1);
    expect(normalized.modules[0].lessons).toHaveLength(2);
    expect(normalized.modules[0].learningOutcomes.length).toBeGreaterThan(0);
    expect(normalized.modules[0].lessons[0].objectives.length).toBeGreaterThan(0);
    expect(normalized.modules[0].lessons[1].objectives.length).toBeGreaterThan(0);
    // Must not throw when reading goals after normalization
    expect(() =>
      normalized.modules.forEach((m) =>
        m.lessons.forEach((l) => {
          void (l.objectives as string[]).join(",");
        })
      )
    ).not.toThrow();
  });

  it("accepts learning_goals / goals aliases", () => {
    const normalized = normalizeApprovedBlueprint({
      courseTitle: "Test",
      modules: [
        {
          title: "M1",
          learning_goals: ["g1", "g2"],
          lessons: [{ title: "L1", goals: "Understand X\nApply Y" }],
        },
      ],
    } as never);
    expect(normalized.modules[0].learningOutcomes).toEqual(["g1", "g2"]);
    expect(normalized.modules[0].lessons[0].objectives).toEqual(["Understand X", "Apply Y"]);
  });

  it("throws BlueprintValidationError with exact field path", () => {
    expect(() =>
      validateApprovedBlueprint({
        courseTitle: "X",
        modules: [{ title: "M1", learningOutcomes: [], lessons: [{ title: "", objectives: [] }] }],
      } as never)
    ).toThrow(BlueprintValidationError);
    try {
      validateApprovedBlueprint({
        courseTitle: "X",
        modules: [{ title: "M1", learningOutcomes: [], lessons: [{ title: "", objectives: [] }] }],
      } as never);
    } catch (err) {
      expect(err).toBeInstanceOf(BlueprintValidationError);
      const e = err as BlueprintValidationError;
      expect(e.code).toBe("BLUEPRINT_SCHEMA_INVALID");
      expect(e.issues.some((i) => i.field === "modules[0].lessons[0].title")).toBe(true);
    }
  });

  it("rejects empty modules array", () => {
    expect(() =>
      validateApprovedBlueprint({
        courseTitle: "Deep Learning",
        modules: [],
      } as never)
    ).toThrow(/Blueprint validation failed/);
  });
});

describe("ensureLessonBlueprintPlan", () => {
  it("never crashes on undefined plan when reading learningGoals", () => {
    const interview = createDefaultInterviewLike({ title: "Deep Learning", subject: "AI" });
    const skeleton = {
      id: "lesson-01",
      title: "Intro to Neural Nets",
      durationMinutes: 45,
      introduction: "",
      objectives: ["Explain neurons"],
      theory: "",
      examples: "",
      summary: "",
      revision: "",
    } as ArchitectLessonBlueprint;

    const plan = ensureLessonBlueprintPlan(undefined, skeleton, interview);
    expect(Array.isArray(plan.learningGoals)).toBe(true);
    expect(plan.learningGoals.length).toBeGreaterThan(0);
    expect(plan.lessonObjective.length).toBeGreaterThan(0);
    // Exact production crash pattern must be safe:
    expect(() => {
      const goalsStr = Array.isArray(plan.learningGoals) ? plan.learningGoals.join("; ") : "";
      void goalsStr;
    }).not.toThrow();
  });
});
