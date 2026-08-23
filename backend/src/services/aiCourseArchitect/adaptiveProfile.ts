/**
 * V6 — Adaptive generation profile from learner interview inputs.
 * Same topic → different depth, size, and assessment intensity per audience.
 */
import type { AICourseArchitectInterview, CourseScaleId } from "./types.js";
import { resolveCourseLength, formatCourseLengthForPrompt } from "./engines/courseLength.js";

export type LearnerProfileMode =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "university"
  | "professional"
  | "executive"
  | "research"
  | "certification"
  | "interview-prep";

export interface AdaptiveGenerationProfile {
  mode: LearnerProfileMode;
  theoryWordTarget: number;
  minQuizQuestions: number;
  includeResearch: boolean;
  includeInterviewPrep: boolean;
  projectComplexity: "light" | "moderate" | "capstone";
  practicalEmphasis: number;
  readingDepth: "concise" | "standard" | "comprehensive";
  recommendedModuleCount: number;
  recommendedLessonsPerModule: number;
  assessmentIntensity: "low" | "medium" | "high";
}

const SCALE_DEFAULTS: Record<
  CourseScaleId,
  { modules: number; lessonsPerModule: number; readingDepth: AdaptiveGenerationProfile["readingDepth"] }
> = {
  mini: { modules: 3, lessonsPerModule: 4, readingDepth: "concise" },
  standard: { modules: 5, lessonsPerModule: 6, readingDepth: "standard" },
  bootcamp: { modules: 6, lessonsPerModule: 8, readingDepth: "standard" },
  university: { modules: 8, lessonsPerModule: 7, readingDepth: "comprehensive" },
  master: { modules: 10, lessonsPerModule: 8, readingDepth: "comprehensive" },
  custom: { modules: 6, lessonsPerModule: 6, readingDepth: "standard" },
};

function inferProfileMode(interview: AICourseArchitectInterview): LearnerProfileMode {
  const audience = interview.courseInfo.targetAudience.toLowerCase();
  const difficulty = interview.courseInfo.difficulty;
  const goals = (Array.isArray(interview.courseInfo?.learningGoals)
    ? interview.courseInfo.learningGoals.join(" ")
    : String(interview.courseInfo?.learningGoals ?? "")
  ).toLowerCase();

  if (/interview|hiring|placement/i.test(audience + goals)) return "interview-prep";
  if (/certif|exam prep|aws|azure|google cloud cert/i.test(audience + goals)) return "certification";
  if (/research|phd|graduate|thesis/i.test(audience + goals)) return "research";
  if (/executive|cto|director|manager/i.test(audience)) return "executive";
  if (/university|undergrad|semester|academic/i.test(audience)) return "university";
  if (/professional|industry|engineer|developer/i.test(audience)) return "professional";
  if (difficulty === "beginner") return "beginner";
  if (difficulty === "advanced") return "advanced";
  return "intermediate";
}

export function buildAdaptiveProfile(interview: AICourseArchitectInterview): AdaptiveGenerationProfile {
  const mode = inferProfileMode(interview);
  const scale = interview.courseScale?.id ?? "standard";
  const scaleCfg = SCALE_DEFAULTS[scale];
  const lengthCfg = resolveCourseLength(scale, interview.courseScale?.customLessonsPerModule);
  const customModules = interview.courseScale?.customModuleCount;
  const customLpm = interview.courseScale?.customLessonsPerModule;

  const theoryMultiplier = lengthCfg.theoryMultiplier;

  const base: AdaptiveGenerationProfile = {
    mode,
    theoryWordTarget: Math.round(320 * theoryMultiplier),
    minQuizQuestions: 8,
    includeResearch: false,
    includeInterviewPrep: false,
    projectComplexity: "moderate",
    practicalEmphasis: 0.5,
    readingDepth: scaleCfg.readingDepth,
    recommendedModuleCount: customModules ?? scaleCfg.modules,
    recommendedLessonsPerModule: customLpm ?? scaleCfg.lessonsPerModule,
    assessmentIntensity: "medium",
  };

  switch (mode) {
    case "beginner":
      return {
        ...base,
        theoryWordTarget: 400,
        minQuizQuestions: 6,
        practicalEmphasis: 0.35,
        projectComplexity: "light",
        assessmentIntensity: "low",
      };
    case "advanced":
    case "research":
      return {
        ...base,
        theoryWordTarget: 280,
        minQuizQuestions: 10,
        includeResearch: true,
        practicalEmphasis: 0.65,
        projectComplexity: "capstone",
        assessmentIntensity: "high",
        readingDepth: "comprehensive",
      };
    case "certification":
      return {
        ...base,
        theoryWordTarget: 300,
        minQuizQuestions: 12,
        practicalEmphasis: 0.55,
        assessmentIntensity: "high",
      };
    case "interview-prep":
      return {
        ...base,
        theoryWordTarget: 260,
        minQuizQuestions: 10,
        includeInterviewPrep: true,
        practicalEmphasis: 0.7,
        projectComplexity: "moderate",
        assessmentIntensity: "high",
      };
    case "executive":
      return {
        ...base,
        theoryWordTarget: 220,
        minQuizQuestions: 5,
        practicalEmphasis: 0.4,
        projectComplexity: "light",
        readingDepth: "concise",
        assessmentIntensity: "low",
      };
    case "university":
      return {
        ...base,
        theoryWordTarget: 380,
        minQuizQuestions: 10,
        includeResearch: true,
        practicalEmphasis: 0.5,
        readingDepth: "comprehensive",
        assessmentIntensity: "high",
      };
    case "professional":
      return {
        ...base,
        theoryWordTarget: 300,
        practicalEmphasis: 0.75,
        projectComplexity: "capstone",
        assessmentIntensity: "medium",
      };
    default:
      return base;
  }
}

export function formatAdaptiveProfileForPrompt(profile: AdaptiveGenerationProfile, interview?: AICourseArchitectInterview): string {
  const lengthLine = interview
    ? formatCourseLengthForPrompt(resolveCourseLength(interview.courseScale?.id, interview.courseScale?.customLessonsPerModule))
    : "";
  return `
ADAPTIVE GENERATION PROFILE (${profile.mode}):
${lengthLine}
- Theory depth target: ~${profile.theoryWordTarget} words
- Reading style: ${profile.readingDepth}
- Quiz minimum: ${profile.minQuizQuestions} questions
- Practical emphasis: ${Math.round(profile.practicalEmphasis * 100)}%
- Project complexity: ${profile.projectComplexity}
- Assessment intensity: ${profile.assessmentIntensity}
- Research papers: ${profile.includeResearch ? "yes" : "no"}
- Interview prep: ${profile.includeInterviewPrep ? "yes" : "no"}
`.trim();
}
