import { describe, expect, it } from "vitest";
import {
  ensureLessonContent,
  normalizeLessonContent,
  validateNormalizedLessonContent,
} from "../lessonContentNormalizer.js";
import { auditLessonFacts } from "../retrieval/hallucinationGuard.js";
import { reviewLessonContent } from "../pipeline/qualityReviewer.js";
import { normalizeAndValidateApprovedBlueprint } from "../blueprintNormalizer.js";
import { createDefaultInterviewLike } from "./blueprintNormalizer.test.fixtures.js";
import type { ArchitectLessonBlueprint } from "../types.js";
import { applyCodeToLesson } from "../agents/codeGeneratorAgent.js";

const skeleton: ArchitectLessonBlueprint = {
  id: "lesson-01",
  title: "Intro to Neural Nets",
  durationMinutes: 45,
  introduction: "",
  objectives: ["Explain neurons"],
  theory: "",
  examples: "",
  summary: "",
  revision: "",
  contentStatus: "planned",
};

describe("normalizeLessonContent — canonical contract", () => {
  it("never returns undefined and always has theory as string", () => {
    const lesson = ensureLessonContent(undefined, skeleton, { stage: "lesson-writer" });
    expect(lesson).toBeTruthy();
    expect(typeof lesson.theory).toBe("string");
    expect(lesson.theory.length).toBeGreaterThan(40);
    expect(Array.isArray(lesson.objectives)).toBe(true);
  });

  it("regression: undefined lesson must not crash on .theory (production error)", () => {
    const lesson = ensureLessonContent(undefined, skeleton, { stage: "lesson-writer" });
    // Exact production crash pattern must be safe after boundary:
    expect(() => {
      const _ = lesson.theory;
      void auditLessonFacts(undefined as never);
      void auditLessonFacts(lesson);
      void reviewLessonContent(undefined as never, createDefaultInterviewLike({ title: "Deep Learning" }));
      void reviewLessonContent(lesson, createDefaultInterviewLike({ title: "Deep Learning" }));
    }).not.toThrow();
  });

  it("accepts alternate AI field names for theory / goals / takeaways", () => {
    const lesson = normalizeLessonContent(
      {
        theoreticalContent: "Theory about backpropagation and gradient descent in depth.",
        learning_goals: ["Goal A", "Goal B"],
        key_takeaways: ["Take 1", "Take 2"],
        common_mistakes: ["Mistake 1"],
        best_practices: ["Practice 1"],
      },
      skeleton
    );
    expect(lesson.theory).toContain("backpropagation");
    expect(lesson.objectives).toEqual(["Goal A", "Goal B"]);
    expect(lesson.keyTakeaways).toEqual(["Take 1", "Take 2"]);
  });

  it("flattens nested theory objects from AI JSON", () => {
    const lesson = normalizeLessonContent(
      {
        theory: {
          introduction: "Intro text",
          concepts: ["Concept A", "Concept B"],
          explanations: ["Why it matters"],
        },
      },
      skeleton
    );
    expect(lesson.theory).toContain("Intro text");
    expect(lesson.theory).toContain("Concept A");
    validateNormalizedLessonContent(lesson);
  });

  it("applyCodeToLesson tolerates undefined code output", () => {
    const base = ensureLessonContent({ theory: "Enough theory content for the lesson body here." }, skeleton);
    expect(() => applyCodeToLesson(base, undefined)).not.toThrow();
    expect(applyCodeToLesson(base, undefined).theory).toBe(base.theory);
  });
});

describe("Deep Learning 1-module / 2-lesson generation boundary", () => {
  it("blueprint normalize + per-lesson ensure eliminates learningGoals and theory crashes", () => {
    const interview = createDefaultInterviewLike({
      title: "Deep Learning",
      subject: "AI",
      learningGoals: ["Build neural nets"],
    });

    const rawBlueprint = {
      courseTitle: "Deep Learning",
      phase: "planned",
      modules: [
        {
          title: "Foundations",
          lessons: [
            { title: "Intro to Neural Nets" },
            { title: "Backpropagation" },
          ],
        },
      ],
    };

    const blueprint = normalizeAndValidateApprovedBlueprint(rawBlueprint, interview);
    expect(blueprint.modules[0].lessons).toHaveLength(2);

    // Simulate AgentRunner failure: writer output undefined for both lessons
    const lessons = blueprint.modules[0].lessons.map((skel, i) =>
      ensureLessonContent(undefined, skel, {
        mod: blueprint.modules[0],
        interview,
        stage: `lesson-writer-${i}`,
      })
    );

    for (const lesson of lessons) {
      expect(typeof lesson.theory).toBe("string");
      expect(lesson.theory.length).toBeGreaterThan(0);
      expect(() => auditLessonFacts(lesson)).not.toThrow();
      const report = reviewLessonContent(lesson, interview);
      expect(report.checks.length).toBeGreaterThan(0);
    }

    // Previously: Cannot read properties of undefined (reading 'learningGoals')
    expect(Array.isArray(interview.courseInfo.learningGoals)).toBe(true);
  });
});
