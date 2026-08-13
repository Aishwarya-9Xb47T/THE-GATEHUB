/**
 * V4 Agent 1 — Course Planner AI
 */
import { getOpenAi } from "../openaiClient.js";
import type { AICourseArchitectInterview } from "../types.js";
import type { CoursePlannerOutput } from "../orchestrator/contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { hasLearningComponent, normalizeInterview } from "../types.js";
import { computeScalePlan } from "../curriculumPlanner.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext, ANTI_HALLUCINATION_RULES } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { runAgent } from "../orchestrator/agentRunner.js";


export function buildHeuristicCoursePlan(interview: AICourseArchitectInterview): CoursePlannerOutput {
  const c = interview.courseInfo;
  const plan = computeScalePlan(interview);
  return {
    executiveSummary: `A ${plan.scaleLabel} curriculum in ${c.subject} for ${c.targetAudience}, aligned with ${c.industry} practice and ${interview.teachingStyle.join(", ")} instruction.`,
    learningOutcomes: c.expectedOutcomes.length ? c.expectedOutcomes : c.learningGoals,
    careerOutcomes: [
      `Apply ${c.subject} in ${c.industry} roles`,
      "Build portfolio-ready deliverables",
      "Pass professional assessments and interviews",
    ],
    skillMap: c.learningGoals.length ? c.learningGoals : [`${c.subject} fundamentals`, "Hands-on implementation", "Professional communication"],
    prerequisites: c.prerequisites.length ? c.prerequisites : ["Basic computer literacy"],
    industryApplications: [c.industry, `${c.subject} production workflows`, "Certification and interview readiness"],
    estimatedHours: plan.estimatedHours,
    recommendedLearningPath: interview.curriculumStrategy.progression.length
      ? interview.curriculumStrategy.progression
      : ["Foundations", "Core concepts", "Hands-on practice", "Industry applications", "Capstone"],
    assessmentStrategy: interview.assessmentStrategy.methods.join(", "),
    projectStrategy: hasLearningComponent(interview, "Project") ? "Module projects + capstone" : "Guided practice exercises",
    labStrategy: hasLearningComponent(interview, "Coding") ? "Coding lab per applicable lesson" : "Conceptual exercises",
    certificationGoals: c.certificationEligible
      ? ["Complete all modules", "Pass assessments 70%+", "Submit capstone if required"]
      : [],
    recommendedModuleCount: plan.moduleCount,
    recommendedLessonCount: plan.targetLessons,
  };
}

function validateCoursePlan(output: CoursePlannerOutput): ArchitectQualityReport {
  const checks = [
    {
      id: "executive-summary",
      label: "Executive summary",
      status: output.executiveSummary.length >= 40 ? ("pass" as const) : ("fail" as const),
      detail: output.executiveSummary.slice(0, 60),
    },
    {
      id: "outcomes",
      label: "Learning outcomes",
      status: output.learningOutcomes.length >= 3 ? ("pass" as const) : ("fail" as const),
      detail: `${output.learningOutcomes.length} outcomes`,
    },
    {
      id: "scale",
      label: "Recommended scale",
      status: output.recommendedLessonCount >= 5 ? ("pass" as const) : ("fail" as const),
      detail: `${output.recommendedModuleCount} modules · ${output.recommendedLessonCount} lessons`,
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 25),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Expand course plan fields"] : [],
  };
}

async function executeCoursePlanner(
  interview: AICourseArchitectInterview,
  _attempt: number
): Promise<CoursePlannerOutput> {
  const normalized = normalizeInterview(interview);
  if (!getOpenAi()) return buildHeuristicCoursePlan(normalized);

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("blueprint"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Agent 1 — Course Planner. NO lesson content. Return CoursePlannerOutput JSON.
${buildInterviewContext(normalized)}
${ANTI_HALLUCINATION_RULES}
Schema: executiveSummary, learningOutcomes[], careerOutcomes[], skillMap[], prerequisites[], industryApplications[], estimatedHours, recommendedLearningPath[], assessmentStrategy, projectStrategy, labStrategy, certificationGoals[], recommendedModuleCount, recommendedLessonCount`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.45,
    });
    const raw = res.choices[0]?.message?.content;
    if (raw) {
      const parsed = JSON.parse(raw) as CoursePlannerOutput;
      const fallback = buildHeuristicCoursePlan(normalized);
      return { ...fallback, ...parsed };
    }
  } catch (err) {
    console.error("[Agent 1 Course Planner]", err);
  }
  return buildHeuristicCoursePlan(normalized);
}

export async function runCoursePlannerAgent(interview: AICourseArchitectInterview) {
  return runAgent({
    stage: "course-planner",
    input: interview,
    execute: executeCoursePlanner,
    validate: validateCoursePlan,
    maxAttempts: 2,
    minConfidence: 80,
  });
}
