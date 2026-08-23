import { architectCompletionJSON } from "./architectLLM.js";
import { hasArchitectAiProvider } from "./openaiClient.js";
import type { AICourseArchitectInterview, CurriculumResearchReport } from "./types.js";
import { computeScalePlan } from "./curriculumPlanner.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext, KNOWLEDGE_SOURCES } from "./instructorPersona.js";

export async function conductCurriculumResearch(
  interview: AICourseArchitectInterview
): Promise<CurriculumResearchReport> {
  const c = interview.courseInfo;
  const plan = computeScalePlan(interview);

  const prompt = `You are designing an Academic Course Blueprint BEFORE writing any lessons.

${buildInterviewContext(interview)}

Course scale: ${plan.scaleLabel} — ${plan.targetLessons} lessons, ${plan.moduleCount} modules.

HARD STRUCTURAL CONSTRAINTS (instructor is source of truth — do NOT recommend a different size):
TARGET MODULE COUNT: ${plan.moduleCount}
TARGET TOTAL LESSON COUNT: ${plan.targetLessons}
LESSONS PER MODULE (distribution): ${plan.lessonDistribution.join(", ")}
COURSE SCALE: ${plan.scaleLabel}

Research may inform CONTENT, topics, and progression narrative.
Research must NOT override module count or lesson count.

Synthesize curriculum research drawing on knowledge traditions from:
${KNOWLEDGE_SOURCES.join(", ")}.

Do NOT copy content. Produce original professional educational synthesis.
Design progression: foundations → applications → advanced → industry mastery within the fixed structure.

Return JSON:
{
  "courseRationale": "2-3 paragraphs: course vision, why this structure fits the subject and audience",
  "industryStandards": ["certifications, frameworks, professional standards"],
  "universityReferences": ["MIT/Stanford/Harvard/CMU/Berkeley style course references — descriptive, not copied"],
  "officialDocumentation": ["official docs and textbooks to align with"],
  "recommendedProgression": ["${plan.moduleCount} module-level progression steps in learning order"],
  "skillDependencyGraph": "text: how concepts depend on each other",
  "prerequisiteGraph": "text: prerequisite chain from entry to mastery",
  "prerequisites": ["learner prerequisites"],
  "learningOutcomes": ["8-12 measurable outcomes using Bloom's taxonomy verbs"],
  "conceptMap": ["${plan.targetLessons} key concepts in strict learning order — one per planned lesson"],
  "assessmentRecommendations": ["how to assess at each stage"],
  "researchSources": ["types of sources synthesized"]
}`;

  try {
    const aiResearch = await architectCompletionJSON<CurriculumResearchReport>({
      phase: "research",
      system: PROFESSOR_SYSTEM_PROMPT,
      user: prompt,
      temperature: 0.5,
    });
    if (aiResearch) return normalizeResearch(aiResearch, interview);
    console.warn("[CURRICULUM_RESEARCH] LLM returned empty response — using heuristic fallback");
  } catch (err) {
    // FIXED: Do NOT re-throw. When the AI fails (429, 503, timeout, quota), fall through
    // to the heuristic research builder below. Re-throwing previously made buildIntelligentResearch
    // unreachable when a provider key existed but was over-quota or unavailable.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[CURRICULUM_RESEARCH] LLM completion failed (${msg}) — using heuristic fallback`);
  }

  // Heuristic fallback: always reachable when LLM is absent OR fails
  return buildIntelligentResearch(interview, plan);
}

function normalizeResearch(r: CurriculumResearchReport, interview: AICourseArchitectInterview): CurriculumResearchReport {
  const c = interview.courseInfo;
  return {
    courseRationale: r.courseRationale || `A structured ${c.subject} curriculum aligned with industry and academic standards.`,
    industryStandards: r.industryStandards?.length ? r.industryStandards : [`${c.industry} best practices`],
    universityReferences: r.universityReferences?.length ? r.universityReferences : ["MIT OpenCourseWare", "Stanford Online"],
    officialDocumentation: r.officialDocumentation?.length ? r.officialDocumentation : ["Official documentation"],
    recommendedProgression: r.recommendedProgression?.length ? r.recommendedProgression : ["Foundations", "Core", "Applied", "Advanced"],
    skillDependencyGraph: r.skillDependencyGraph || `Concepts in ${c.subject} build sequentially from fundamentals to advanced applications.`,
    prerequisiteGraph: r.prerequisiteGraph || c.prerequisites.join(" → ") || "Basic literacy → Core concepts → Advanced topics",
    prerequisites: r.prerequisites?.length ? r.prerequisites : c.prerequisites,
    learningOutcomes: r.learningOutcomes?.length ? r.learningOutcomes : c.expectedOutcomes,
    conceptMap: r.conceptMap?.length ? r.conceptMap : [],
    assessmentRecommendations: r.assessmentRecommendations?.length ? r.assessmentRecommendations : [],
    researchSources: r.researchSources?.length ? r.researchSources : ["University syllabuses", "Industry certifications", "Official docs"],
    researchedAt: new Date().toISOString(),
  };
}

function buildIntelligentResearch(
  interview: AICourseArchitectInterview,
  plan: ReturnType<typeof computeScalePlan>
): CurriculumResearchReport {
  const c = interview.courseInfo;
  const subject = c.subject;

  return {
    courseRationale: `This ${plan.scaleLabel} curriculum for **${subject}** follows research-informed progression used at leading universities and ${c.industry} training programs. With ${plan.targetLessons} lessons across ${plan.moduleCount} modules, learners build from foundational concepts through hands-on practice to industry-ready competency.\n\nThe structure balances ${interview.learningStyle.join(" and ")} approaches, aligned with ${c.academicLevel} level expectations and ${interview.teachingStyle.join(", ")} teaching preferences.`,
    industryStandards: [
      `${c.industry} professional standards`,
      "Industry certification body recommendations",
      "Official vendor/documentation learning paths",
    ],
    universityReferences: [
      "MIT OpenCourseWare — related subject courses",
      "Stanford Online — professional certificates",
      "Harvard Extension — continuing education syllabuses",
    ],
    officialDocumentation: [
      `${subject} official documentation`,
      "Peer-reviewed textbooks and survey papers",
      "Standards organization guidelines (IEEE, ACM, ISO where applicable)",
    ],
    recommendedProgression: Array.from({ length: plan.moduleCount }, (_, i) => {
      const phases = ["Fundamentals", "Core Concepts", "Hands-on Practice", "Applied Projects", "Industry Applications", "Advanced Topics", "Integration", "Capstone Readiness"];
      return `${subject}: ${phases[i % phases.length]}`;
    }),
    skillDependencyGraph: `Foundational literacy → Core ${subject} concepts → Applied techniques → Advanced patterns → Production deployment → Professional mastery`,
    prerequisiteGraph: c.prerequisites.length
      ? c.prerequisites.join(" → ") + ` → ${subject} mastery`
      : `Basic skills → ${subject} fundamentals → Intermediate applications → Advanced specialization`,
    prerequisites: c.prerequisites.length ? c.prerequisites : ["Basic computer literacy", "Willingness to practice regularly"],
    learningOutcomes: c.expectedOutcomes.length
      ? c.expectedOutcomes
      : [
          `Explain core ${subject} concepts with professional clarity`,
          "Apply techniques in real-world scenarios",
          "Build portfolio-ready projects",
          "Pass industry-standard assessments",
          "Prepare for certification or technical interviews",
        ],
    conceptMap: [
      "Domain fundamentals",
      "Core theory and notation",
      "Essential tools and workflows",
      "Intermediate techniques",
      "Advanced applications",
      "Industry integration",
      "Professional best practices",
    ],
    assessmentRecommendations: interview.assessmentStrategy.methods,
    researchSources: [
      "MIT OpenCourseWare syllabuses",
      "Stanford and Carnegie Mellon course structures",
      "Official technology documentation",
      "Peer-reviewed publications (arXiv, ACM, IEEE)",
      "Industry certification exam blueprints",
    ],
    researchedAt: new Date().toISOString(),
  };
}
