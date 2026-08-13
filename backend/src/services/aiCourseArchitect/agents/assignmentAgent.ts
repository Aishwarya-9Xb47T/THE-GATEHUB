/**
 * Agent 7 — Assignment Generator
 * Practical assignments with rubric, checklist, and starter files.
 */
import { getOpenAi } from "../openaiClient.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";


export type AssignmentOutput = NonNullable<ArchitectLessonBlueprint["assignment"]>;

async function generateAssignment(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<AssignmentOutput> {
  if (!getOpenAi()) return buildHeuristicAssignment(lesson, ctx);

  const prompt = `Create a practical assignment for lesson "${lesson.title}" in ${ctx.interview.courseInfo.subject}.

${buildInterviewContext(ctx.interview)}
Objective: ${plan.lessonObjective}

Return JSON assignment with:
{
  "title": "...",
  "problemStatement": "...",
  "instructions": "...",
  "objectives": ["..."],
  "starterFiles": [{"name": "main.py", "content": "..."}],
  "requirements": ["..."],
  "submissionChecklist": ["..."],
  "rubric": [{"criterion": "...", "points": 25, "description": "..."}],
  "evaluationCriteria": ["..."],
  "hints": ["..."],
  "points": 100
}`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("assignment"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
      max_tokens: 3500,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicAssignment(lesson, ctx);
    const parsed = JSON.parse(raw) as AssignmentOutput;
    return { ...parsed, points: parsed.points || 100 };
  } catch {
    return buildHeuristicAssignment(lesson, ctx);
  }
}

function buildHeuristicAssignment(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext
): AssignmentOutput {
  const topic = lesson.title;
  return {
    title: `Assignment: ${topic}`,
    problemStatement: `Apply concepts from "${topic}" to solve a realistic ${ctx.interview.courseInfo.industry} problem.`,
    instructions: `Complete the requirements below using best practices from the lesson. Document your approach and test your solution.`,
    objectives: lesson.objectives?.slice(0, 3) ?? [`Demonstrate mastery of ${topic}`],
    requirements: [
      "Implement a working solution",
      "Include inline comments explaining key decisions",
      "Provide sample input/output",
    ],
    submissionChecklist: ["Source code", "README with run instructions", "Test results"],
    rubric: [
      { criterion: "Correctness", points: 40, description: "Solution meets all requirements" },
      { criterion: "Code quality", points: 30, description: "Readable, maintainable code" },
      { criterion: "Documentation", points: 20, description: "Clear README and comments" },
      { criterion: "Testing", points: 10, description: "Evidence of verification" },
    ],
    evaluationCriteria: ["Functional correctness", "Edge case handling", "Professional presentation"],
    hints: ["Start with the smallest working version", "Review lesson examples before coding"],
    points: 100,
  };
}

function validateAssignment(a: AssignmentOutput): ArchitectQualityReport {
  const checks = [
    {
      id: "problem",
      label: "Problem statement",
      status: isSubstantiveText(a.problemStatement ?? a.instructions, 40) ? ("pass" as const) : ("fail" as const),
      detail: "",
    },
    {
      id: "rubric",
      label: "Rubric",
      status: (a.rubric?.length ?? 0) >= 3 ? ("pass" as const) : ("warn" as const),
      detail: `${a.rubric?.length ?? 0} criteria`,
    },
    {
      id: "checklist",
      label: "Submission checklist",
      status: (a.submissionChecklist?.length ?? 0) >= 2 ? ("pass" as const) : ("warn" as const),
      detail: "",
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 35),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Complete assignment specification"] : [],
  };
}

export async function runAssignmentAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "assignment",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateAssignment(l, c, p),
    validate: validateAssignment,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}
