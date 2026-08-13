/**
 * V6 Part 4 — Example, analogy, storytelling, industry, career content engines.
 */
import type { ArchitectLessonBlueprint, AICourseArchitectInterview } from "../types.js";
import type { LessonBlueprintPlan } from "../orchestrator/contracts.js";
import type { StudentPersonaProfile } from "./studentPersonaEngine.js";

export interface ExampleRequirements {
  simple: string;
  realWorld: string;
  industry: string;
  counterExample?: string;
  interactive?: string;
  visual?: string;
  code?: string;
}

export function buildExampleRequirements(
  plan: LessonBlueprintPlan,
  interview: AICourseArchitectInterview
): ExampleRequirements {
  const topic = plan.lessonObjective;
  const industry = interview.courseInfo.industry;
  return {
    simple: `Basic illustration of ${topic}`,
    realWorld: `How ${topic} appears in everyday ${industry} workflows`,
    industry: `Production use case at scale in ${industry}`,
    counterExample: `Common misuse or anti-pattern for ${topic}`,
    interactive: plan.requiredLab ? "Hands-on coding exercise" : "Guided practice problem",
    visual: plan.requiredDiagrams ? "Diagram-based walkthrough" : undefined,
    code: plan.requiredCode ? "Runnable code with comments" : undefined,
  };
}

export function suggestAnalogies(concept: string, persona: StudentPersonaProfile): string[] {
  const pools: Record<StudentPersonaProfile["exampleStyle"], string[]> = {
    everyday: ["everyday household task", "sports team coordination", "recipe following"],
    academic: ["scientific experiment", "library classification", "mathematical proof"],
    industry: ["company hierarchy", "traffic system", "supply chain pipeline"],
    research: ["peer review process", "hypothesis testing", "literature survey"],
    business: ["startup growth stages", "project management workflow", "customer support queue"],
  };
  return (pools[persona.exampleStyle] ?? pools.industry).map((a) => `${concept} is like ${a}`);
}

export function buildStoryHooks(plan: LessonBlueprintPlan, interview: AICourseArchitectInterview): string[] {
  return [
    `Problem story: A ${interview.courseInfo.industry} team faces a challenge solvable by ${plan.lessonObjective}`,
    `Historical evolution: How ${interview.courseInfo.subject} practitioners developed this approach`,
    `Industry scenario: Real production incident illustrating why this matters`,
    `Success story: Measurable outcome after applying these concepts`,
  ];
}

export function enrichIndustryContext(
  lesson: ArchitectLessonBlueprint,
  interview: AICourseArchitectInterview
): string {
  const existing = lesson.industryNotes ?? "";
  const additions = [
    `Industry usage in ${interview.courseInfo.industry}`,
    `Real products and architectures applying ${lesson.title}`,
    `Production challenges: scaling, reliability, maintainability`,
    `Open-source implementations to study`,
  ];
  return existing ? `${existing}\n${additions.join("\n")}` : additions.join("\n");
}

export interface CareerMapping {
  jobRoles: string[];
  skills: string[];
  applications: string[];
  certifications: string[];
  interviewRelevance: string;
}

export function mapCareerOpportunities(
  lesson: ArchitectLessonBlueprint,
  interview: AICourseArchitectInterview
): CareerMapping {
  const subject = interview.courseInfo.subject;
  const industry = interview.courseInfo.industry;
  return {
    jobRoles: [`${subject} Engineer`, `${industry} Specialist`, `${subject} Consultant`],
    skills: lesson.objectives ?? [],
    applications: [`${industry} product development`, `${subject} architecture`, "Technical leadership"],
    certifications: inferCertifications(subject),
    interviewRelevance: `Common ${subject} interview topics covered in this lesson`,
  };
}

function inferCertifications(subject: string): string[] {
  const s = subject.toLowerCase();
  if (/cloud|aws|azure|gcp/i.test(s)) return ["AWS", "Azure", "Google Cloud"];
  if (/kubernetes|k8s|docker|devops/i.test(s)) return ["CKA", "CKAD", "Docker"];
  if (/security/i.test(s)) return ["CompTIA Security+", "CISSP"];
  if (/network/i.test(s)) return ["CCNA", "CompTIA Network+"];
  if (/data|ml|ai|tensorflow|pytorch/i.test(s)) return ["TensorFlow Developer", "AWS ML Specialty"];
  return ["Industry-relevant vendor certifications"];
}

export function formatExampleRequirementsForPrompt(req: ExampleRequirements): string {
  return `
EXAMPLE REQUIREMENTS (include ALL applicable — each must be a distinct scenario, not a rephrase):
- Simple: ${req.simple} — concrete objects, roles, and before/after state
- Real-world: ${req.realWorld} — name workflow stage, artifact, and decision point
- Industry: ${req.industry} — production constraints (scale, reliability, compliance) at learner tier
${req.counterExample ? `- Counter-example: ${req.counterExample} — show failure mode and recovery` : ""}
${req.interactive ? `- Interactive: ${req.interactive}` : ""}
${req.code ? `- Code: ${req.code}` : ""}
`.trim();
}
