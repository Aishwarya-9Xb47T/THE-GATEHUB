/**
 * Validates instructor scale → computeScalePlan → planCurriculumStructure.
 * Run: npx tsx scripts/validate-architect-scale.ts
 */
import {
  computeScalePlan,
  distributeLessonsAcrossModules,
  planCurriculumStructure,
  enforceBlueprintStructure,
} from "../src/services/aiCourseArchitect/curriculumPlanner.js";
import { validateCurriculumBlueprint } from "../src/services/aiCourseArchitect/curriculumValidator.js";
import type { AICourseArchitectInterview } from "../src/services/aiCourseArchitect/types.js";

function baseInterview(scale: AICourseArchitectInterview["courseScale"]): AICourseArchitectInterview {
  return {
    productType: "premium-course",
    courseInfo: {
      title: "Deep Learning",
      subject: "Deep Learning",
      targetAudience: "Professionals",
      prerequisites: [],
      industry: "Technology",
      learningGoals: ["Master neural networks"],
      expectedOutcomes: ["Build models", "Train networks", "Deploy systems"],
      estimatedDuration: "40 hours",
      difficulty: "intermediate",
      certificationEligible: false,
      language: "English",
      courseType: "professional",
      academicLevel: "intermediate",
      price: 99,
    },
    audience: { priorKnowledge: [], motivation: [], constraints: [] },
    learningGoalsDetail: { primaryGoals: [], careerOutcomes: [] },
    courseScale: scale,
    difficultyDistribution: { mode: "percent", beginnerPercent: 25, intermediatePercent: 50, advancedPercent: 25 },
    lessonStructure: ["introduction", "objectives", "theory", "examples", "summary"],
    practicalComponents: ["Coding Labs", "Project"],
    assessmentStrategy: { methods: ["Quiz after every module"], style: "Quiz after every module" },
    curriculumStrategy: { progression: ["beginner-intermediate-advanced"], researchDepth: "standard" },
    researchDepth: "standard",
    teachingStyle: ["worked examples"],
    learningStyle: ["hands-on"],
    learningComponents: ["Quiz", "Project", "Coding Labs"],
    videoStrategy: { includeVideos: false, mappings: [] },
  } as AICourseArchitectInterview;
}

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n=== AI Architect Scale Enforcement ===\n");

// distributeLessonsAcrossModules
{
  console.log("distributeLessonsAcrossModules");
  assert("17/5 → [4,4,3,3,3]", JSON.stringify(distributeLessonsAcrossModules(17, 5)) === JSON.stringify([4, 4, 3, 3, 3]));
  assert("20/5 → [4,4,4,4,4]", JSON.stringify(distributeLessonsAcrossModules(20, 5)) === JSON.stringify([4, 4, 4, 4, 4]));
  assert("30/4 → [8,8,7,7]", JSON.stringify(distributeLessonsAcrossModules(30, 4)) === JSON.stringify([8, 8, 7, 7]));
  assert("10/2 → [5,5]", JSON.stringify(distributeLessonsAcrossModules(10, 2)) === JSON.stringify([5, 5]));
}

// TEST A — Mini
{
  console.log("\nTEST A — Mini Course");
  const plan = computeScalePlan(baseInterview({ id: "mini" }));
  assert("lessons in 10–15", plan.targetLessons >= 10 && plan.targetLessons <= 15, String(plan.targetLessons));
  assert("modules >= 1", plan.moduleCount >= 1);
  assert("distribution sums", plan.lessonDistribution.reduce((a, b) => a + b, 0) === plan.targetLessons);
}

// TEST B — Standard
{
  console.log("\nTEST B — Standard Professional");
  const plan = computeScalePlan(baseInterview({ id: "standard" }));
  assert("lessons in 25–40", plan.targetLessons >= 25 && plan.targetLessons <= 40, String(plan.targetLessons));
  assert("distribution length = modules", plan.lessonDistribution.length === plan.moduleCount);
}

// TEST C — Custom 10 / 2 / 5
{
  console.log("\nTEST C — Custom 10 lessons / 2 modules / 5 per module");
  const interview = baseInterview({
    id: "custom",
    customLessonCount: 10,
    customModuleCount: 2,
    customLessonsPerModule: 5,
  });
  const plan = computeScalePlan(interview);
  assert("targetLessons=10", plan.targetLessons === 10);
  assert("moduleCount=2", plan.moduleCount === 2);
  const bp = planCurriculumStructure(interview, {
    courseRationale: "test",
    industryStandards: [],
    universityReferences: [],
    officialDocumentation: [],
    recommendedProgression: [],
    skillDependencyGraph: "",
    prerequisiteGraph: "",
    prerequisites: [],
    learningOutcomes: [],
    conceptMap: [],
    assessmentRecommendations: [],
    researchSources: [],
    researchedAt: new Date().toISOString(),
  });
  assert("blueprint modules=2", bp.modules.length === 2);
  assert("blueprint lessons=10", bp.modules.reduce((n, m) => n + m.lessons.length, 0) === 10);
  const v = validateCurriculumBlueprint(bp, interview);
  assert("validation passed", v.passed, v.checks.filter((c) => c.status === "fail").map((c) => c.detail).join("; "));
}

// TEST D — Custom 20 / 5 / 4
{
  console.log("\nTEST D — Custom 20 lessons / 5 modules / 4 per module");
  const interview = baseInterview({
    id: "custom",
    customLessonCount: 20,
    customModuleCount: 5,
    customLessonsPerModule: 4,
  });
  const plan = computeScalePlan(interview);
  assert("targetLessons=20", plan.targetLessons === 20);
  assert("moduleCount=5", plan.moduleCount === 5);
  assert("distribution all 4s", JSON.stringify(plan.lessonDistribution) === JSON.stringify([4, 4, 4, 4, 4]));
  const bp = planCurriculumStructure(interview, {
    courseRationale: "test",
    industryStandards: [],
    universityReferences: [],
    officialDocumentation: [],
    recommendedProgression: [],
    skillDependencyGraph: "",
    prerequisiteGraph: "",
    prerequisites: [],
    learningOutcomes: ["a", "b", "c"],
    conceptMap: [],
    assessmentRecommendations: [],
    researchSources: [],
    researchedAt: new Date().toISOString(),
  });
  assert("blueprint 5×4", bp.modules.length === 5 && bp.modules.every((m) => m.lessons.length === 4));
}

// TEST E — Custom 17 / 5 (non-divisible)
{
  console.log("\nTEST E — Custom 17 lessons / 5 modules");
  const interview = baseInterview({
    id: "custom",
    customLessonCount: 17,
    customModuleCount: 5,
  });
  const plan = computeScalePlan(interview);
  assert("targetLessons=17", plan.targetLessons === 17);
  assert("moduleCount=5", plan.moduleCount === 5);
  assert("balanced [4,4,3,3,3]", JSON.stringify(plan.lessonDistribution) === JSON.stringify([4, 4, 3, 3, 3]));
  const bp = planCurriculumStructure(interview, {
    courseRationale: "test",
    industryStandards: [],
    universityReferences: [],
    officialDocumentation: [],
    recommendedProgression: [],
    skillDependencyGraph: "",
    prerequisiteGraph: "",
    prerequisites: [],
    learningOutcomes: ["a", "b", "c"],
    conceptMap: [],
    assessmentRecommendations: [],
    researchSources: [],
    researchedAt: new Date().toISOString(),
  });
  assert(
    "blueprint lesson counts",
    JSON.stringify(bp.modules.map((m) => m.lessons.length)) === JSON.stringify([4, 4, 3, 3, 3])
  );
}

// TEST — custom 1/1/1 (the screenshot failure mode)
{
  console.log("\nTEST — Custom 1 lesson / 1 module / 1 per module (no Math.max override)");
  const interview = baseInterview({
    id: "custom",
    customLessonCount: 1,
    customModuleCount: 1,
    customLessonsPerModule: 1,
  });
  const plan = computeScalePlan(interview);
  assert("targetLessons=1", plan.targetLessons === 1, String(plan.targetLessons));
  assert("moduleCount=1", plan.moduleCount === 1, String(plan.moduleCount));
  const bp = planCurriculumStructure(interview, {
    courseRationale: "test",
    industryStandards: [],
    universityReferences: [],
    officialDocumentation: [],
    recommendedProgression: [],
    skillDependencyGraph: "",
    prerequisiteGraph: "",
    prerequisites: [],
    learningOutcomes: ["a", "b", "c"],
    conceptMap: [],
    assessmentRecommendations: [],
    researchSources: [],
    researchedAt: new Date().toISOString(),
  });
  assert("not forced to 2×2", bp.modules.length === 1 && bp.modules[0].lessons.length === 1);
  const v = validateCurriculumBlueprint(bp, interview);
  assert("1-module validation passes", v.passed, v.checks.filter((c) => c.status === "fail").map((c) => c.id).join(","));
}

// TEST — conflict reconciliation
{
  console.log("\nTEST — Conflicting 5×4 vs 17 total (lesson total wins)");
  const interview = baseInterview({
    id: "custom",
    customLessonCount: 17,
    customModuleCount: 5,
    customLessonsPerModule: 4,
  });
  const plan = computeScalePlan(interview);
  assert("uses 17 lessons", plan.targetLessons === 17);
  assert("keeps 5 modules", plan.moduleCount === 5);
  assert("has structureNote", Boolean(plan.structureNote));
}

// TEST — enforce restores structure after AI vandalism
{
  console.log("\nTEST — enforceBlueprintStructure restores counts");
  const interview = baseInterview({
    id: "custom",
    customLessonCount: 12,
    customModuleCount: 3,
    customLessonsPerModule: 4,
  });
  const bp = planCurriculumStructure(interview, {
    courseRationale: "test",
    industryStandards: [],
    universityReferences: [],
    officialDocumentation: [],
    recommendedProgression: [],
    skillDependencyGraph: "",
    prerequisiteGraph: "",
    prerequisites: [],
    learningOutcomes: ["a", "b", "c"],
    conceptMap: [],
    assessmentRecommendations: [],
    researchSources: [],
    researchedAt: new Date().toISOString(),
  });
  bp.modules[0].title = "Enriched Title";
  bp.modules.pop(); // vandalize
  const fixed = enforceBlueprintStructure(bp, interview);
  assert("restored 3 modules", fixed.modules.length === 3);
  assert("restored 12 lessons", fixed.modules.reduce((n, m) => n + m.lessons.length, 0) === 12);
  assert("kept enriched title on module-01", fixed.modules[0].title === "Enriched Title");
}

// TEST F — 50 lessons plan
{
  console.log("\nTEST F — 50 lessons structural plan");
  const interview = baseInterview({
    id: "custom",
    customLessonCount: 50,
    customModuleCount: 10,
    customLessonsPerModule: 5,
  });
  const plan = computeScalePlan(interview);
  assert("50 lessons", plan.targetLessons === 50);
  assert("10 modules", plan.moduleCount === 10);
  const bp = planCurriculumStructure(interview, {
    courseRationale: "test",
    industryStandards: [],
    universityReferences: [],
    officialDocumentation: [],
    recommendedProgression: [],
    skillDependencyGraph: "",
    prerequisiteGraph: "",
    prerequisites: [],
    learningOutcomes: ["a", "b", "c"],
    conceptMap: [],
    assessmentRecommendations: [],
    researchSources: [],
    researchedAt: new Date().toISOString(),
  });
  assert("blueprint 50", bp.modules.reduce((n, m) => n + m.lessons.length, 0) === 50);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
