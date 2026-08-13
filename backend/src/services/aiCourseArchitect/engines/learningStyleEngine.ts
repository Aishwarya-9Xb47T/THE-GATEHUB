/**
 * V6 Part 4 — Learning style adaptation (VARK balance).
 */
import type { AICourseArchitectInterview } from "../types.js";
import type { LessonBlueprintPlan } from "../orchestrator/contracts.js";

export type LearningModality = "visual" | "auditory" | "reading" | "kinesthetic";

export interface LearningStyleProfile {
  visual: number;
  auditory: number;
  reading: number;
  kinesthetic: number;
  dominant: LearningModality;
  explanationStyles: string[];
}

export function buildLearningStyleProfile(interview: AICourseArchitectInterview): LearningStyleProfile {
  const styles = interview.learningStyle.join(" ").toLowerCase();
  const teaching = interview.teachingStyle.join(" ").toLowerCase();
  const text = `${styles} ${teaching}`;

  let visual = 0.25;
  let auditory = 0.2;
  let reading = 0.3;
  let kinesthetic = 0.25;

  if (/visual|diagram|video|illustrat/i.test(text)) visual += 0.2;
  if (/audio|lecture|podcast|listen/i.test(text)) auditory += 0.2;
  if (/read|text|theory|notes/i.test(text)) reading += 0.2;
  if (/hands-on|practice|project|lab|kinesthetic/i.test(text)) kinesthetic += 0.2;

  const total = visual + auditory + reading + kinesthetic;
  visual /= total;
  auditory /= total;
  reading /= total;
  kinesthetic /= total;

  const scores: [LearningModality, number][] = [
    ["visual", visual],
    ["auditory", auditory],
    ["reading", reading],
    ["kinesthetic", kinesthetic],
  ];
  const dominant = scores.sort((a, b) => b[1] - a[1])[0][0];

  const explanationStyles = [
    visual >= 0.25 ? "Visual diagrams and concept maps" : null,
    auditory >= 0.2 ? "Narrative walkthrough with verbal analogies" : null,
    reading >= 0.25 ? "Structured prose with definitions and summaries" : null,
    kinesthetic >= 0.25 ? "Hands-on exercises and interactive labs" : null,
  ].filter(Boolean) as string[];

  return { visual, auditory, reading, kinesthetic, dominant, explanationStyles };
}

export function applyLearningStyleToPlan(
  plan: LessonBlueprintPlan,
  profile: LearningStyleProfile
): LessonBlueprintPlan {
  return {
    ...plan,
    useVisuals: plan.useVisuals || profile.visual >= 0.25,
    useDiagrams: plan.useDiagrams || profile.visual >= 0.2,
    includeLab: plan.includeLab || profile.kinesthetic >= 0.25,
    useAnalogies: plan.useAnalogies || profile.auditory >= 0.2,
    learningStrategy: `${plan.learningStrategy ?? ""} Balance modalities: visual ${Math.round(profile.visual * 100)}%, reading ${Math.round(profile.reading * 100)}%, kinesthetic ${Math.round(profile.kinesthetic * 100)}%.`,
  };
}

export function formatLearningStyleForPrompt(profile: LearningStyleProfile): string {
  return `
LEARNING STYLE ADAPTATION:
- Visual ${Math.round(profile.visual * 100)}% | Auditory ${Math.round(profile.auditory * 100)}% | Reading ${Math.round(profile.reading * 100)}% | Kinesthetic ${Math.round(profile.kinesthetic * 100)}%
- Dominant: ${profile.dominant}
- Provide multiple explanation styles: ${profile.explanationStyles.join("; ")}
`.trim();
}
