/**
 * V2 — Academic Course Blueprint: design document finalized BEFORE lesson generation.
 */
import { getOpenAi } from "./openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  AcademicCourseBlueprint,
  CurriculumResearchReport,
} from "./types.js";
import { hasLearningComponent } from "./types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "./instructorPersona.js";
import { getArchitectModel } from "./architectModels.js";


export function buildAcademicCourseBlueprint(
  interview: AICourseArchitectInterview,
  research: CurriculumResearchReport,
  skeleton: ArchitectBlueprint
): AcademicCourseBlueprint {
  const plan = skeleton.curriculumPlan;
  const lessonCount = skeleton.modules.reduce((n, m) => n + m.lessons.length, 0);
  const c = interview.courseInfo;

  const bloomsTaxonomyMapping = buildBloomsMapping(interview, skeleton);
  const skillsCovered = inferSkills(research, c.subject);
  const careerOutcomes = inferCareerOutcomes(interview, c.subject);

  return {
    courseVision: research.courseRationale.split("\n")[0] || `A rigorous ${c.subject} curriculum for ${c.targetAudience}.`,
    targetAudience: c.targetAudience,
    prerequisites: skeleton.prerequisites,
    learningOutcomes: skeleton.learningOutcomes,
    careerOutcomes,
    skillsCovered,
    difficulty: skeleton.difficulty,
    estimatedHours: skeleton.estimatedHours,
    recommendedLearningPath: research.recommendedProgression,
    moduleStructure: skeleton.modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessonCount: m.lessons.length,
      focus: m.description.slice(0, 120),
    })),
    lessonCount,
    projectCount: plan?.projectsTotal ?? skeleton.modules.filter((m) => m.project).length,
    quizCount: countQuizzes(skeleton, interview),
    codingLabs: hasLearningComponent(interview, "Coding") ? (plan?.labsTotal ?? lessonCount) : 0,
    researchPapers: hasLearningComponent(interview, "Research") ? Math.max(1, Math.floor(lessonCount / 10)) : 0,
    assignments: hasLearningComponent(interview, "Assignment") ? Math.max(1, Math.floor(lessonCount / 5)) : 0,
    capstone: skeleton.capstone?.title,
    certificationRequirements:
      skeleton.certificateRequirements ??
      (interview.courseInfo.certificationEligible || hasLearningComponent(interview, "Certificate")
        ? "Complete all modules, pass assessments with 70%+, submit capstone if required"
        : undefined),
    bloomsTaxonomyMapping,
    learningObjectives: bloomsTaxonomyMapping.flatMap((b) => b.objectives),
    assessmentInventory: buildAssessmentInventory(interview, skeleton),
    finalizedAt: new Date().toISOString(),
  };
}

/** Optional GPT enrichment of academic blueprint narrative fields. */
export async function enrichAcademicBlueprint(
  blueprint: AcademicCourseBlueprint,
  interview: AICourseArchitectInterview,
  research: CurriculumResearchReport
): Promise<AcademicCourseBlueprint> {
  if (!getOpenAi()) return blueprint;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("blueprint"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Refine this Academic Course Blueprint JSON for "${interview.courseInfo.title}".
Keep all counts and structure. Improve courseVision (2 sentences), careerOutcomes (4-6), skillsCovered (8-12), and bloomsTaxonomyMapping objectives.
${buildInterviewContext(interview)}
Research: ${research.courseRationale.slice(0, 500)}
Current: ${JSON.stringify(blueprint)}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.45,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return blueprint;
    const parsed = JSON.parse(raw) as Partial<AcademicCourseBlueprint>;
    return {
      ...blueprint,
      ...parsed,
      // Instructor/system structure wins over any AI rewrite of counts
      lessonCount: blueprint.lessonCount,
      moduleStructure: blueprint.moduleStructure,
      projectCount: blueprint.projectCount,
      quizCount: blueprint.quizCount,
      codingLabs: blueprint.codingLabs,
      researchPapers: blueprint.researchPapers,
      assignments: blueprint.assignments,
      estimatedHours: blueprint.estimatedHours,
      finalizedAt: blueprint.finalizedAt,
    };
  } catch (err) {
    console.error("[Academic Blueprint] enrichment failed:", err);
    return blueprint;
  }
}

function buildBloomsMapping(
  interview: AICourseArchitectInterview,
  skeleton: ArchitectBlueprint
): AcademicCourseBlueprint["bloomsTaxonomyMapping"] {
  const subject = interview.courseInfo.subject;
  const modules = skeleton.modules.slice(0, 6);
  return [
    {
      level: "Remember",
      objectives: [`Define core ${subject} terminology and recall foundational facts`],
      modules: modules.slice(0, 1).map((m) => m.title),
    },
    {
      level: "Understand",
      objectives: [`Explain how ${subject} concepts relate and interpret industry workflows`],
      modules: modules.slice(1, 2).map((m) => m.title),
    },
    {
      level: "Apply",
      objectives: [`Execute ${subject} techniques in guided labs and worked examples`],
      modules: modules.slice(2, 4).map((m) => m.title),
    },
    {
      level: "Analyze",
      objectives: [`Compare approaches, diagnose failures, and evaluate trade-offs in ${subject}`],
      modules: modules.slice(4, 5).map((m) => m.title),
    },
    {
      level: "Evaluate",
      objectives: [`Critique solutions against professional standards and assessment rubrics`],
      modules: modules.slice(-2).map((m) => m.title),
    },
    {
      level: "Create",
      objectives: [`Design and deliver capstone-level ${subject} artifacts demonstrating mastery`],
      modules: skeleton.capstone ? ["Capstone"] : modules.slice(-1).map((m) => m.title),
    },
  ];
}

function inferSkills(research: CurriculumResearchReport, subject: string): string[] {
  const fromConcepts = research.conceptMap?.slice(0, 8) ?? [];
  if (fromConcepts.length >= 5) return fromConcepts;
  return [
    `${subject} fundamentals`,
    "Problem decomposition",
    "Hands-on implementation",
    "Debugging and verification",
    "Industry best practices",
    "Technical communication",
    "Assessment readiness",
  ];
}

function inferCareerOutcomes(interview: AICourseArchitectInterview, subject: string): string[] {
  const industry = interview.courseInfo.industry;
  const outcomes = interview.courseInfo.expectedOutcomes;
  if (outcomes.length >= 3) {
    return outcomes.map((o) => `Career-ready: ${o}`);
  }
  return [
    `Apply ${subject} skills in ${industry} roles`,
    "Build portfolio projects demonstrating competency",
    "Pass technical interviews and certification assessments",
    "Collaborate on production-grade deliverables",
  ];
}

function countQuizzes(skeleton: ArchitectBlueprint, interview: AICourseArchitectInterview): number {
  const perLesson = interview.assessmentStrategy.style.includes("every lesson") ? 1 : 0;
  const perModule = skeleton.modules.filter((m) => m.moduleQuiz).length;
  const lessonQuizzes = perLesson
    ? skeleton.modules.reduce((n, m) => n + m.lessons.length, 0)
    : 0;
  return lessonQuizzes + perModule;
}

function buildAssessmentInventory(
  interview: AICourseArchitectInterview,
  skeleton: ArchitectBlueprint
): AcademicCourseBlueprint["assessmentInventory"] {
  const items: AcademicCourseBlueprint["assessmentInventory"] = [];
  if (hasLearningComponent(interview, "Quiz")) {
    items.push({ type: "Quizzes", count: countQuizzes(skeleton, interview), placement: interview.assessmentStrategy.style });
  }
  if (hasLearningComponent(interview, "Assignment")) items.push({ type: "Assignments", count: Math.max(1, Math.floor(skeleton.modules.length / 2)), placement: "Mid-module" });
  if (hasLearningComponent(interview, "Project")) items.push({ type: "Projects", count: skeleton.modules.filter((m) => m.project).length, placement: "Every 2 modules" });
  if (hasLearningComponent(interview, "Capstone")) items.push({ type: "Capstone", count: skeleton.capstone ? 1 : 0, placement: "Final module" });
  if (hasLearningComponent(interview, "Final Exam")) items.push({ type: "Final Exam", count: skeleton.finalExam ? 1 : 0, placement: "Course end" });
  if (hasLearningComponent(interview, "Mid Exam")) items.push({ type: "Mid Exam", count: 1, placement: "Mid-course" });
  return items;
}
