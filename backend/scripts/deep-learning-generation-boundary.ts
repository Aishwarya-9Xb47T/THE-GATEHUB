/**
 * Deep Learning (1 module / 2 lessons) — real pipeline boundary simulation.
 * Runs without live AI keys: exercises normalize → ensure lesson → quality review → LaTeX project build.
 *
 * Run: npx tsx scripts/deep-learning-generation-boundary.ts
 */
import { normalizeAndValidateApprovedBlueprint } from "../src/services/aiCourseArchitect/blueprintNormalizer.js";
import { ensureLessonContent } from "../src/services/aiCourseArchitect/lessonContentNormalizer.js";
import { ensureLessonBlueprintPlan } from "../src/services/aiCourseArchitect/lessonPlanningEngine.js";
import { auditLessonFacts } from "../src/services/aiCourseArchitect/retrieval/hallucinationGuard.js";
import { reviewLessonContent } from "../src/services/aiCourseArchitect/pipeline/qualityReviewer.js";
import { buildProjectFromBlueprint } from "../src/services/aiCourseArchitect/aiArchitectLaTeXEmitter.js";
import { normalizeInterview, type AICourseArchitectInterview, type ArchitectBlueprint } from "../src/services/aiCourseArchitect/types.js";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("[AI_ARCHITECT] Deep Learning boundary simulation starting");

  const interview = normalizeInterview({
    productType: "premium-course",
    courseInfo: {
      title: "Deep Learning",
      subject: "AI",
      targetAudience: "Professionals",
      prerequisites: ["Python"],
      industry: "Technology",
      learningGoals: ["Build neural networks"],
      expectedOutcomes: ["Train a small DNN"],
      estimatedDuration: "10 hours",
      difficulty: "intermediate",
      certificationEligible: false,
      language: "en",
      academicLevel: "intermediate",
      courseType: "professional",
    },
    courseScale: { id: "mini" },
    difficultyDistribution: { mode: "ai-decides" },
    learningStyle: ["balanced"],
    teachingStyle: ["professional"],
    lessonStructure: ["theory", "code-example", "mini-quiz", "summary"],
    practicalComponents: ["Coding Labs", "Quizzes"],
    assessmentStrategy: { style: "Quiz after every module", methods: ["Quizzes"] },
    curriculumStrategy: { progression: ["beginner-intermediate-advanced"], aiDecidesCurriculum: true },
    learningComponents: ["Video Lessons", "Quizzes", "Coding Labs", "PDF Notes"],
    videoStrategy: {
      method: "youtube",
      includeVideos: true,
      mappings: [
        {
          id: "yt-1",
          type: "youtube",
          title: "Neural Nets Intro",
          url: "https://www.youtube.com/watch?v=aircAruvnKk",
          order: 0,
        },
      ],
    },
    researchDepth: "professional",
  } as AICourseArchitectInterview);

  console.log("[BLUEPRINT_NORMALIZE] normalizing approved Deep Learning blueprint");
  const blueprint = normalizeAndValidateApprovedBlueprint(
    {
      courseTitle: "Deep Learning",
      phase: "planned",
      modules: [
        {
          title: "Foundations",
          lessons: [{ title: "Intro to Neural Nets" }, { title: "Backpropagation" }],
        },
      ],
    },
    interview
  ) as ArchitectBlueprint;

  assert(blueprint.modules.length === 1, "1 module");
  assert(blueprint.modules[0].lessons.length === 2, "2 lessons");
  console.log("[BLUEPRINT_VALIDATE] ok");

  const generatedLessons = blueprint.modules[0].lessons.map((skel, i) => {
    console.log(`[LESSON_GENERATE] lessonIndex=${i} simulating undefined writer output`);
    // Production crash: writerResult.output === undefined → lesson.theory
    const plan = ensureLessonBlueprintPlan(undefined, skel, interview);
    assert(Array.isArray(plan.learningGoals), "plan.learningGoals must be array");

    const lesson = ensureLessonContent(undefined, skel, {
      mod: blueprint.modules[0],
      interview,
      stage: "lesson-writer",
    });
    assert(typeof lesson.theory === "string", "theory must be string");
    assert(lesson.theory.length > 0, "theory non-empty");

    auditLessonFacts(lesson);
    const report = reviewLessonContent(lesson, interview);
    assert(report.checks.length > 0, "quality checks ran");
    console.log(`[LESSON_VALIDATE] lesson=${lesson.title} score=${report.score} theoryLen=${lesson.theory.length}`);
    return { ...lesson, contentStatus: "generated" as const };
  });

  blueprint.modules[0].lessons = generatedLessons;
  blueprint.phase = "generated";

  console.log("[ACADEMIC_STUDIO] building LaTeX project from blueprint");
  const built = buildProjectFromBlueprint(blueprint, interview);
  assert(built.files.length > 0, "LaTeX files emitted");
  const emptyFiles = built.files.filter((f) => !f.path || f.content == null);
  if (emptyFiles.length) {
    console.warn(
      `[LATEX] files with null content: ${emptyFiles.map((f) => f.path || "(no path)").join(", ")}`
    );
  }
  // Empty string content can exist for optional stubs; null/undefined path or content is a contract break.
  assert(emptyFiles.length === 0, "no null LaTeX files");
  const lessonTex = built.files.filter((f) => /lesson/i.test(f.path) && /\.tex$/i.test(f.path));
  assert(lessonTex.length >= 2, `expected >=2 lesson tex files, got ${lessonTex.length}`);
  for (const f of lessonTex) {
    assert((f.content || "").length > 0, `lesson tex ${f.path} must have content`);
  }
  console.log(`[LATEX] fileCount=${built.files.length} lessonTex=${lessonTex.length}`);

  console.log("PASS: Deep Learning 1×2 boundary simulation — learningGoals + theory crashes eliminated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
