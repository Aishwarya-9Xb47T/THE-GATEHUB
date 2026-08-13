import { generateCourseBlueprint, generateApprovedCourseContent } from "../src/services/aiCourseArchitect/aiCourseArchitectService.js";
import { normalizeInterview, type AICourseArchitectInterview, type ArchitectBlueprint, type ArchitectLessonBlueprint } from "../src/services/aiCourseArchitect/types.js";
import { evaluateProductionPublishGate } from "../src/services/aiCourseArchitect/engines/productionPublishGate.js";
import { reviewFullBlueprint } from "../src/services/aiCourseArchitect/pipeline/qualityReviewer.js";
import { isGenericLessonContent } from "../src/services/lessonContentRepair.js";

type CourseScenario = {
  domain: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  industry: string;
};

type CriterionScores = Record<string, number>;

const BLOOM_START_VERBS = new Set([
  "define", "list", "identify", "recall", "recognize", "name",
  "explain", "summarize", "classify", "interpret", "describe", "discuss",
  "apply", "demonstrate", "use", "implement", "solve", "execute",
  "analyze", "differentiate", "compare", "diagnose", "investigate",
  "evaluate", "justify", "critique", "assess", "prioritize", "defend",
  "design", "construct", "compose", "develop", "formulate", "propose",
]);

const HIGHER_BLOOM = new Set(["Apply", "Analyze", "Evaluate", "Create"]);

const SCENARIOS: CourseScenario[] = [
  { domain: "Artificial Intelligence", difficulty: "advanced", industry: "Technology" },
  { domain: "Data Structures", difficulty: "intermediate", industry: "Software Engineering" },
  { domain: "Operating Systems", difficulty: "advanced", industry: "Systems Engineering" },
  { domain: "Database Management Systems", difficulty: "intermediate", industry: "Enterprise IT" },
  { domain: "Python Programming", difficulty: "beginner", industry: "Technology" },
  { domain: "Computer Networks", difficulty: "intermediate", industry: "Network Operations" },
];

function wc(text: string | undefined): number {
  return (text || "").split(/\s+/).filter(Boolean).length;
}

function cap100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function buildInterview(s: CourseScenario): AICourseArchitectInterview {
  const raw: AICourseArchitectInterview = {
    productType: "learning-universe",
    courseInfo: {
      title: `${s.domain} Mastery`,
      subject: s.domain,
      targetAudience: "University students and early-career professionals",
      prerequisites: ["Basic programming literacy", "Problem-solving fundamentals"],
      industry: s.industry,
      learningGoals: [
        `Build practical ${s.domain} proficiency`,
        "Apply concepts in realistic scenarios",
        "Develop interview and project readiness",
      ],
      expectedOutcomes: [
        `Explain and apply core ${s.domain} concepts`,
        "Analyze trade-offs and edge cases",
        "Produce portfolio-ready deliverables",
      ],
      estimatedDuration: "30 hours",
      difficulty: s.difficulty,
      certificationEligible: false,
      language: "en",
      academicLevel: s.difficulty === "advanced" ? "advanced" : "intermediate",
      courseType: "professional",
    },
    courseScale: { id: "mini" },
    difficultyDistribution: { mode: "ai-decides" },
    learningStyle: ["balanced"],
    teachingStyle: ["professional"],
    lessonStructure: [
      "learning-objectives", "real-world-analogy", "theory", "concept-explanation",
      "visual-diagram", "examples", "case-study", "code-example", "common-mistakes",
      "best-practices", "industry-notes", "summary", "key-takeaways", "mini-quiz",
      "references", "revision-notes", "learning-outcome",
    ],
    practicalComponents: ["Quiz", "Coding Lab", "Project", "Reference", "Discussion"],
    assessmentStrategy: { style: "Quiz after every lesson", methods: ["Quizzes", "Coding Labs", "Projects"] },
    curriculumStrategy: { progression: ["beginner-intermediate-advanced"], aiDecidesCurriculum: true },
    learningComponents: ["Quiz", "Coding Lab", "Project", "References", "Discussion Topics", "Case Studies", "Real-world Examples", "Glossary"],
    videoStrategy: { includeVideos: false, method: "add-later", placement: "ai-auto", mappings: [] },
    researchDepth: "professional",
  };
  return normalizeInterview(raw);
}

function scoreCourse(blueprint: ArchitectBlueprint, interview: AICourseArchitectInterview) {
  const lessons = blueprint.modules.flatMap((m) => m.lessons) as ArchitectLessonBlueprint[];
  const totalLessons = Math.max(lessons.length, 1);

  const objectiveLines = lessons.flatMap((l) => l.objectives || []);
  const bloomAligned = objectiveLines.filter((o) => BLOOM_START_VERBS.has((o || "").trim().toLowerCase().split(/\s+/)[0] || "")).length;
  const c1 = cap100((bloomAligned / Math.max(objectiveLines.length, 1)) * 100);

  const conceptWords = lessons.map((l) => wc(l.conceptExplanation));
  const c2 = cap100((conceptWords.reduce((a, b) => a + b, 0) / totalLessons) * 1.4);

  const scaffoldHits = lessons.map((l) => {
    const t = (l.theory || "").toLowerCase();
    const markers = ["foundation", "structure", "application", "depth"];
    return markers.filter((m) => t.includes(`## ${m}`)).length;
  });
  const c3 = cap100((scaffoldHits.reduce((a, b) => a + b, 0) / totalLessons) * 25);

  const examplesScore = lessons.map((l) => {
    const text = l.examples || "";
    const sections = (text.match(/^##\s+/gm) || []).length;
    return Math.min(100, sections * 25 + wc(text) * 0.4);
  });
  const c4 = cap100(examplesScore.reduce((a, b) => a + b, 0) / totalLessons);

  const industryHits = lessons.filter((l) => {
    const blob = `${l.theory || ""} ${l.examples || ""} ${l.industryNotes || ""}`.toLowerCase();
    return blob.includes(interview.courseInfo.industry.toLowerCase());
  }).length;
  const c5 = cap100((industryHits / totalLessons) * 100);

  const questions = lessons.flatMap((l) => l.quizQuestions || []);
  const higher = questions.filter((q) => HIGHER_BLOOM.has((q.bloomLevel || "").trim())).length;
  const c6 = cap100(
    (questions.length ? (higher / questions.length) * 60 : 0) +
    (questions.length >= totalLessons * 8 ? 40 : (questions.length / Math.max(totalLessons * 8, 1)) * 40)
  );

  const labs = lessons.map((l) => l.codingLab).filter(Boolean) as NonNullable<ArchitectLessonBlueprint["codingLab"]>[];
  const labScore = labs.map((lab) => {
    const steps = (lab.starterCode.match(/#\s*Step\s+\d+/gi) || []).length;
    const tests = (lab.publicTestCases?.length || 0) + (lab.hiddenTestCases?.length || 0);
    return Math.min(100, wc(lab.problemStatement) * 0.7 + steps * 15 + tests * 12);
  });
  const c7 = cap100(labScore.length ? labScore.reduce((a, b) => a + b, 0) / labScore.length : 70);

  const summaries = lessons.map((l) => l.summary || "");
  const summaryGood = summaries.filter((s) => wc(s) >= 40 && !isGenericLessonContent(s)).length;
  const c8 = cap100((summaryGood / totalLessons) * 100);

  const revisions = lessons.map((l) => l.revision || "");
  const revisionGood = revisions.filter((r) => wc(r) >= 30 && /review|recall|checklist|practice|explain/i.test(r)).length;
  const c9 = cap100((revisionGood / totalLessons) * 100);

  const refs = lessons.flatMap((l) => l.furtherReading || []);
  const refGood = refs.filter((r) => r.url && !/example\.com|wikipedia\.org\/wiki\/main_page/i.test(r.url)).length;
  const c10 = cap100(Math.min(100, refGood * 15));

  const visuals = lessons.flatMap((l) => l.visualContent || []);
  const visualTypes = new Set(visuals.map((v: any) => v.type)).size;
  const c11 = cap100(Math.min(100, visuals.length * 12 + visualTypes * 20));

  const fullReview = reviewFullBlueprint(blueprint, interview);
  const prodGate = evaluateProductionPublishGate(blueprint, interview);
  const c12 = cap100((fullReview.score * 0.6) + (prodGate.score * 0.4));

  const criteria: CriterionScores = {
    "1_learning_objectives_bloom_alignment": c1,
    "2_concept_explanations": c2,
    "3_progressive_scaffolding": c3,
    "4_real_world_examples": c4,
    "5_industry_relevance": c5,
    "6_quiz_quality": c6,
    "7_coding_lab_quality": c7,
    "8_summary_quality": c8,
    "9_revision_quality": c9,
    "10_references": c10,
    "11_media_recommendations": c11,
    "12_pedagogical_consistency": c12,
  };

  const overall = cap100(Object.values(criteria).reduce((a, b) => a + b, 0) / 12);
  const strengths = Object.entries(criteria).filter(([, v]) => v >= 80).map(([k]) => k);
  const weaknesses = Object.entries(criteria).filter(([, v]) => v < 65).map(([k]) => k);

  return {
    lessons: lessons.length,
    modules: blueprint.modules.length,
    criteria,
    overall,
    strengths,
    weaknesses,
    publishReady: prodGate.ready,
    publishBlockers: prodGate.blockers.slice(0, 8),
  };
}

async function main() {
  const startedAt = Date.now();
  const results: Array<{
    domain: string;
    difficulty: string;
    evaluation: ReturnType<typeof scoreCourse>;
  }> = [];

  for (const scenario of SCENARIOS) {
    console.log(`\n=== Generating: ${scenario.domain} [${scenario.difficulty}] ===`);
    const interview = buildInterview(scenario);
    const planned = await generateCourseBlueprint(interview);
    const populated = await generateApprovedCourseContent(planned, interview);
    const evaluation = scoreCourse(populated.blueprint, interview);
    results.push({ domain: scenario.domain, difficulty: scenario.difficulty, evaluation });
    console.log(`Overall quality: ${evaluation.overall}/100`);
  }

  const criterionKeys = Object.keys(results[0]?.evaluation.criteria || {});
  const averages: Record<string, number> = {};
  for (const key of criterionKeys) {
    averages[key] = cap100(results.reduce((n, r) => n + r.evaluation.criteria[key], 0) / results.length);
  }

  const globalStrengths = Object.entries(averages).filter(([, v]) => v >= 80).map(([k]) => k);
  const globalWeaknesses = Object.entries(averages).filter(([, v]) => v < 65).map(([k]) => k);

  const report = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    sampleCount: results.length,
    results,
    averageByCriterion: averages,
    strengths: globalStrengths,
    weaknesses: globalWeaknesses,
    opportunities: globalWeaknesses.map((k) => ({
      criterion: k,
      recommendation: `Improve prompts/validation for ${k.replace(/^\d+_/, "").replaceAll("_", " ")}`,
    })),
  };

  console.log("\n=== COMPARATIVE QUALITY REPORT ===");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("Evaluation failed:", err);
  process.exit(1);
});

