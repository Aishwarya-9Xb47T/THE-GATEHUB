/**
 * V6 Part 4 — Student persona engine (14+ learner personas).
 */
import type { AICourseArchitectInterview } from "../types.js";
import type { AdaptiveGenerationProfile, LearnerProfileMode } from "../adaptiveProfile.js";

export type StudentPersona =
  | "school-student"
  | "college-student"
  | "engineering-student"
  | "medical-student"
  | "working-professional"
  | "researcher"
  | "faculty"
  | "beginner-programmer"
  | "senior-developer"
  | "manager"
  | "executive"
  | "startup-founder"
  | "certification-candidate"
  | "interview-candidate"
  | "career-switcher";

export interface StudentPersonaProfile {
  persona: StudentPersona;
  tone: "friendly" | "academic" | "professional" | "executive" | "technical";
  depth: "introductory" | "intermediate" | "advanced" | "expert";
  exampleStyle: "everyday" | "academic" | "industry" | "research" | "business";
  projectStyle: "guided" | "semi-guided" | "independent" | "capstone";
  assessmentMix: { quiz: number; practical: number; project: number; reflection: number };
  vocabularyLevel: "simple" | "standard" | "technical" | "expert";
}

const PERSONA_DEFAULTS: Record<StudentPersona, StudentPersonaProfile> = {
  "school-student": { persona: "school-student", tone: "friendly", depth: "introductory", exampleStyle: "everyday", projectStyle: "guided", assessmentMix: { quiz: 0.4, practical: 0.3, project: 0.1, reflection: 0.2 }, vocabularyLevel: "simple" },
  "college-student": { persona: "college-student", tone: "academic", depth: "intermediate", exampleStyle: "academic", projectStyle: "semi-guided", assessmentMix: { quiz: 0.35, practical: 0.35, project: 0.2, reflection: 0.1 }, vocabularyLevel: "standard" },
  "engineering-student": { persona: "engineering-student", tone: "technical", depth: "intermediate", exampleStyle: "industry", projectStyle: "semi-guided", assessmentMix: { quiz: 0.25, practical: 0.45, project: 0.25, reflection: 0.05 }, vocabularyLevel: "technical" },
  "medical-student": { persona: "medical-student", tone: "academic", depth: "advanced", exampleStyle: "academic", projectStyle: "guided", assessmentMix: { quiz: 0.45, practical: 0.25, project: 0.1, reflection: 0.2 }, vocabularyLevel: "technical" },
  "working-professional": { persona: "working-professional", tone: "professional", depth: "intermediate", exampleStyle: "industry", projectStyle: "independent", assessmentMix: { quiz: 0.2, practical: 0.5, project: 0.25, reflection: 0.05 }, vocabularyLevel: "standard" },
  researcher: { persona: "researcher", tone: "academic", depth: "expert", exampleStyle: "research", projectStyle: "capstone", assessmentMix: { quiz: 0.15, practical: 0.25, project: 0.45, reflection: 0.15 }, vocabularyLevel: "expert" },
  faculty: { persona: "faculty", tone: "academic", depth: "advanced", exampleStyle: "academic", projectStyle: "capstone", assessmentMix: { quiz: 0.3, practical: 0.3, project: 0.3, reflection: 0.1 }, vocabularyLevel: "technical" },
  "beginner-programmer": { persona: "beginner-programmer", tone: "friendly", depth: "introductory", exampleStyle: "everyday", projectStyle: "guided", assessmentMix: { quiz: 0.3, practical: 0.45, project: 0.15, reflection: 0.1 }, vocabularyLevel: "simple" },
  "senior-developer": { persona: "senior-developer", tone: "technical", depth: "expert", exampleStyle: "industry", projectStyle: "independent", assessmentMix: { quiz: 0.15, practical: 0.45, project: 0.35, reflection: 0.05 }, vocabularyLevel: "expert" },
  manager: { persona: "manager", tone: "executive", depth: "intermediate", exampleStyle: "business", projectStyle: "semi-guided", assessmentMix: { quiz: 0.2, practical: 0.3, project: 0.3, reflection: 0.2 }, vocabularyLevel: "standard" },
  executive: { persona: "executive", tone: "executive", depth: "intermediate", exampleStyle: "business", projectStyle: "guided", assessmentMix: { quiz: 0.15, practical: 0.2, project: 0.25, reflection: 0.4 }, vocabularyLevel: "standard" },
  "startup-founder": { persona: "startup-founder", tone: "professional", depth: "advanced", exampleStyle: "industry", projectStyle: "independent", assessmentMix: { quiz: 0.1, practical: 0.4, project: 0.45, reflection: 0.05 }, vocabularyLevel: "technical" },
  "certification-candidate": { persona: "certification-candidate", tone: "professional", depth: "intermediate", exampleStyle: "industry", projectStyle: "semi-guided", assessmentMix: { quiz: 0.5, practical: 0.35, project: 0.1, reflection: 0.05 }, vocabularyLevel: "technical" },
  "interview-candidate": { persona: "interview-candidate", tone: "technical", depth: "advanced", exampleStyle: "industry", projectStyle: "independent", assessmentMix: { quiz: 0.35, practical: 0.45, project: 0.15, reflection: 0.05 }, vocabularyLevel: "technical" },
  "career-switcher": { persona: "career-switcher", tone: "friendly", depth: "introductory", exampleStyle: "everyday", projectStyle: "guided", assessmentMix: { quiz: 0.3, practical: 0.4, project: 0.2, reflection: 0.1 }, vocabularyLevel: "simple" },
};

export function inferStudentPersona(interview: AICourseArchitectInterview): StudentPersona {
  const audience = String(interview.courseInfo?.targetAudience ?? "");
  const goals = Array.isArray(interview.courseInfo?.learningGoals)
    ? interview.courseInfo.learningGoals.join(" ")
    : String(interview.courseInfo?.learningGoals ?? "");
  const styles = Array.isArray(interview.learningStyle)
    ? interview.learningStyle.join(" ")
    : String(interview.learningStyle ?? "");
  const text = `${audience} ${goals} ${styles}`.toLowerCase();

  if (/medical|nursing|clinical|healthcare/i.test(text)) return "medical-student";
  if (/interview|faang|hiring|placement/i.test(text)) return "interview-candidate";
  if (/certif|aws|azure|comptia|cisco/i.test(text)) return "certification-candidate";
  if (/career switch|transition|new to/i.test(text)) return "career-switcher";
  if (/startup|founder|entrepreneur/i.test(text)) return "startup-founder";
  if (/senior|staff|principal|architect/i.test(text)) return "senior-developer";
  if (/beginner|new to programming|first time/i.test(text)) return "beginner-programmer";
  if (/manager|team lead|director/i.test(text)) return "manager";
  if (/executive|cto|vp|ceo/i.test(text)) return "executive";
  if (/faculty|professor|teacher|educator/i.test(text)) return "faculty";
  if (/research|phd|graduate|thesis/i.test(text)) return "researcher";
  if (/engineering student|undergrad engineer/i.test(text)) return "engineering-student";
  if (/college|university student|undergrad/i.test(text)) return "college-student";
  if (/high school|secondary|school/i.test(text)) return "school-student";
  if (/professional|working|industry/i.test(text)) return "working-professional";
  return "college-student";
}

export function buildStudentPersonaProfile(interview: AICourseArchitectInterview): StudentPersonaProfile {
  return PERSONA_DEFAULTS[inferStudentPersona(interview)];
}

export function personaToAdaptiveMode(persona: StudentPersona): LearnerProfileMode {
  const map: Partial<Record<StudentPersona, LearnerProfileMode>> = {
    "school-student": "beginner",
    "beginner-programmer": "beginner",
    "career-switcher": "beginner",
    "college-student": "university",
    "engineering-student": "professional",
    researcher: "research",
    faculty: "university",
    executive: "executive",
    "certification-candidate": "certification",
    "interview-candidate": "interview-prep",
    "senior-developer": "advanced",
  };
  return map[persona] ?? "intermediate";
}

export function formatPersonaForPrompt(profile: StudentPersonaProfile): string {
  return `
STUDENT PERSONA: ${profile.persona}
- Tone: ${profile.tone} | Depth: ${profile.depth}
- Examples: ${profile.exampleStyle} style | Projects: ${profile.projectStyle}
- Vocabulary: ${profile.vocabularyLevel}
- Assessment mix: quiz ${Math.round(profile.assessmentMix.quiz * 100)}%, practical ${Math.round(profile.assessmentMix.practical * 100)}%, project ${Math.round(profile.assessmentMix.project * 100)}%
`.trim();
}

export function applyPersonaToAdaptiveProfile(
  adaptive: AdaptiveGenerationProfile,
  persona: StudentPersonaProfile
): AdaptiveGenerationProfile {
  const depthMultiplier = { introductory: 1.2, intermediate: 1, advanced: 0.85, expert: 0.7 }[persona.depth];
  return {
    ...adaptive,
    theoryWordTarget: Math.round(adaptive.theoryWordTarget * depthMultiplier),
    minQuizQuestions: Math.round(adaptive.minQuizQuestions * (0.8 + persona.assessmentMix.quiz)),
    includeInterviewPrep: persona.persona === "interview-candidate",
    includeResearch: persona.persona === "researcher" || persona.persona === "faculty",
    projectComplexity: persona.projectStyle === "capstone" ? "capstone" : persona.projectStyle === "guided" ? "light" : "moderate",
    practicalEmphasis: persona.assessmentMix.practical + persona.assessmentMix.project,
  };
}
