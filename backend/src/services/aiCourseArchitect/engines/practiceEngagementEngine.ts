/**
 * V6 Part 4 — Practice materials, engagement, gamification, certification.
 */
import type { ArchitectLessonBlueprint, AICourseArchitectInterview } from "../types.js";

export interface PracticeMaterials {
  flashcards: Array<{ front: string; back: string }>;
  cheatSheet: string;
  mindMap: string;
  quickReference: string[];
}

export function generatePracticeMaterials(lesson: ArchitectLessonBlueprint): PracticeMaterials {
  const terms = lesson.glossary?.slice(0, 6) ?? lesson.keyTakeaways?.slice(0, 4).map((t) => ({ term: t, def: t })) ?? [];
  return {
    flashcards: terms.map((t) => ({
      front: "term" in t ? t.term : (t as { term: string }).term,
      back: "definition" in t ? (t as { definition: string }).definition : String(t),
    })),
    cheatSheet: lesson.cheatSheet ?? lesson.keyTakeaways?.join("\n• ") ?? lesson.summary?.slice(0, 300) ?? "",
    mindMap: lesson.revisionNotes?.mindMap ?? `Central: ${lesson.title} → ${(lesson.objectives ?? []).join(" | ")}`,
    quickReference: [
      ...(lesson.revisionNotes?.keyConcepts ?? lesson.keyTakeaways ?? []).slice(0, 5),
      ...(lesson.revisionNotes?.importantFormulas ?? []).slice(0, 3),
    ],
  };
}

export interface EngagementMeta {
  reflectionQuestions: string[];
  thinkBeforeRead: string[];
  interactivePauses: string[];
  miniChallenges: string[];
  curiosityQuestions: string[];
  knowledgeChecks: string[];
}

export function buildEngagementMeta(lesson: ArchitectLessonBlueprint): EngagementMeta {
  const objectives = lesson.objectives ?? [];
  return {
    reflectionQuestions: [
      lesson.discussionPrompt ?? `How does ${lesson.title} connect to your goals?`,
      "What would you do differently after learning this?",
    ],
    thinkBeforeRead: [`Before reading: What do you already know about ${lesson.title}?`],
    interactivePauses: ["Pause after theory — summarize in your own words", "Pause after example — try a variant"],
    miniChallenges: objectives.slice(0, 2).map((o) => `Mini challenge: Apply "${o}" in 5 minutes`),
    curiosityQuestions: [`Why does ${lesson.title} matter in production systems?`],
    knowledgeChecks: objectives.slice(0, 3).map((o) => `Can you explain: ${o}?`),
  };
}

export interface GamificationMeta {
  xpReward: number;
  badges: string[];
  milestone?: string;
  challengeLevel: number;
}

export function buildGamificationMeta(lesson: ArchitectLessonBlueprint, lessonIndex: number): GamificationMeta {
  const base = 50 + lessonIndex * 10;
  return {
    xpReward: base + (lesson.quizQuestions?.length ?? 0) * 5 + (lesson.codingLab ? 25 : 0),
    badges: [
      lesson.quizQuestions?.length ? "Quiz Master" : "",
      lesson.codingLab ? "Code Warrior" : "",
      lesson.assignment ? "Project Builder" : "",
    ].filter(Boolean),
    milestone: lessonIndex > 0 && lessonIndex % 5 === 0 ? `Module milestone: ${lesson.title}` : undefined,
    challengeLevel: Math.min(5, 1 + Math.floor(lessonIndex / 3)),
  };
}

export interface CertificationAlignment {
  certifications: string[];
  examTopics: string[];
  revisionSection: string;
}

export function mapCertificationAlignment(
  lesson: ArchitectLessonBlueprint,
  interview: AICourseArchitectInterview
): CertificationAlignment {
  const subject = interview.courseInfo.subject;
  const certs = inferCerts(subject);
  return {
    certifications: certs,
    examTopics: lesson.objectives ?? [],
    revisionSection: `Certification review: ${lesson.title} — ${(lesson.keyTakeaways ?? []).slice(0, 3).join("; ")}`,
  };
}

function inferCerts(subject: string): string[] {
  const s = subject.toLowerCase();
  if (/aws|cloud/i.test(s)) return ["AWS Solutions Architect", "AWS Developer"];
  if (/azure/i.test(s)) return ["Azure Administrator", "Azure Developer"];
  if (/google|gcp/i.test(s)) return ["Google Cloud Associate", "Professional Cloud Architect"];
  if (/kubernetes/i.test(s)) return ["CKA", "CKAD"];
  if (/docker/i.test(s)) return ["Docker Certified Associate"];
  if (/tensorflow|ml|ai/i.test(s)) return ["TensorFlow Developer Certificate"];
  if (/security/i.test(s)) return ["CompTIA Security+", "CISSP"];
  if (/network|cisco/i.test(s)) return ["CCNA", "CompTIA Network+"];
  if (/oracle/i.test(s)) return ["Oracle Certified Professional"];
  if (/salesforce/i.test(s)) return ["Salesforce Administrator"];
  return ["Relevant industry certifications"];
}

export type AssignmentType =
  | "mcq"
  | "essay"
  | "programming"
  | "case-study"
  | "debugging"
  | "research"
  | "presentation"
  | "design"
  | "architecture"
  | "reflection";

export function suggestAssignmentTypes(interview: AICourseArchitectInterview): AssignmentType[] {
  const types: AssignmentType[] = ["mcq", "reflection"];
  if (interview.learningComponents.includes("Coding")) types.push("programming", "debugging");
  if (/research|graduate/i.test(interview.courseInfo.targetAudience)) types.push("research", "essay");
  if (/design|architecture|system/i.test(interview.courseInfo.subject)) types.push("design", "architecture");
  if (/business|management/i.test(interview.courseInfo.industry)) types.push("case-study", "presentation");
  return [...new Set(types)];
}

export type ProjectEscalationLevel = 1 | 2 | 3 | 4 | 5;

export function getProjectEscalationLevel(
  lessonIndex: number,
  totalLessons: number,
  persona: string
): { level: ProjectEscalationLevel; label: string } {
  const ratio = totalLessons > 0 ? lessonIndex / totalLessons : 0;
  if (persona === "researcher" || persona === "faculty") {
    return ratio < 0.4 ? { level: 2, label: "Semi-guided" } : { level: 5, label: "Research" };
  }
  if (ratio < 0.2) return { level: 1, label: "Guided" };
  if (ratio < 0.45) return { level: 2, label: "Semi-guided" };
  if (ratio < 0.7) return { level: 3, label: "Independent" };
  if (ratio < 0.9) return { level: 4, label: "Industry" };
  return { level: 5, label: "Research" };
}
