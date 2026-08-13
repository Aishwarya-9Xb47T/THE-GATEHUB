/**
 * V6 Part 2 — Multi-Agent Course Generation Registry (extends V5/V6 Part 1).
 */
import type { AgentStageId } from "./orchestrator/contracts.js";
import { ORCHESTRATOR_VERSION } from "./orchestrator/contracts.js";

export interface AgentDefinition {
  id: number;
  name: string;
  stage: AgentStageId;
  responsibility: string;
  pipeline: "planning" | "lesson" | "delivery";
  ragEnabled?: boolean;
  createsContent?: boolean;
  modelTier?: "reasoning" | "long-form" | "visual" | "compact";
}

export const AGENT_REGISTRY: AgentDefinition[] = [
  { id: 1, name: "Curriculum Architect", stage: "curriculum-architect", responsibility: "Course-first structural blueprint — modules, skill tree, dependency graph, career/cert mapping", pipeline: "planning", ragEnabled: true, modelTier: "reasoning" },
  { id: 2, name: "Instructional Designer", stage: "instructional-designer", responsibility: "Pedagogy, Bloom levels, checkpoints, cognitive load, micro-learning", pipeline: "lesson", ragEnabled: true, modelTier: "reasoning" },
  { id: 3, name: "Lesson Writer", stage: "lesson-writer", responsibility: "Professional educational prose — never generic AI paragraphs", pipeline: "lesson", ragEnabled: true, createsContent: true, modelTier: "long-form" },
  { id: 4, name: "Code Generator", stage: "code-generator", responsibility: "Production-quality runnable code in course language", pipeline: "lesson", ragEnabled: true, createsContent: true, modelTier: "reasoning" },
  { id: 5, name: "Code Validation", stage: "code-validation", responsibility: "Execute, verify, regenerate code only on failure", pipeline: "lesson", createsContent: false, modelTier: "compact" },
  { id: 6, name: "Interactive Coding Lab", stage: "coding-lab", responsibility: "Try-it-yourself labs with tests, hints, rubric", pipeline: "lesson", ragEnabled: true, createsContent: true, modelTier: "reasoning" },
  { id: 7, name: "Quiz Generator", stage: "assessment", responsibility: "Diverse assessments with explanations and Bloom mapping", pipeline: "lesson", ragEnabled: true, createsContent: true, modelTier: "reasoning" },
  { id: 8, name: "Assignment Generator", stage: "assignment", responsibility: "Realistic assignments with rubric and business context", pipeline: "lesson", ragEnabled: true, createsContent: true, modelTier: "reasoning" },
  { id: 9, name: "Project Generator", stage: "project", responsibility: "Portfolio-quality capstone projects", pipeline: "lesson", ragEnabled: true, createsContent: true, modelTier: "reasoning" },
  { id: 10, name: "Research Agent", stage: "research-paper", responsibility: "Verified papers via Semantic Scholar, Crossref, OpenAlex", pipeline: "lesson", ragEnabled: true, createsContent: true, modelTier: "reasoning" },
  { id: 11, name: "Video Recommendation Agent", stage: "video-recommendation", responsibility: "Scored educational videos from trusted channels", pipeline: "lesson", createsContent: true, modelTier: "compact" },
  { id: 12, name: "Reference Agent", stage: "reference", responsibility: "Official docs, books, specs, repos — categorized by level", pipeline: "lesson", ragEnabled: true, createsContent: true, modelTier: "compact" },
  { id: 13, name: "Diagram Agent", stage: "diagram", responsibility: "Mermaid/PlantUML/Graphviz diagrams without syntax errors", pipeline: "lesson", createsContent: true, modelTier: "visual" },
  { id: 14, name: "Visual Content Agent", stage: "visual-content", responsibility: "Visual asset prompts with accessibility descriptions", pipeline: "lesson", createsContent: true, modelTier: "visual" },
  { id: 15, name: "Glossary Agent", stage: "glossary", responsibility: "Comprehensive glossary with misconceptions", pipeline: "lesson", ragEnabled: true, createsContent: true, modelTier: "compact" },
  { id: 16, name: "Revision + Interview Agent", stage: "revision-notes", responsibility: "Revision notes, cheat sheets, flashcards, interview prep", pipeline: "lesson", createsContent: true, modelTier: "compact" },
  { id: 17, name: "Quality Assurance Agent", stage: "quality-assurance", responsibility: "Verify only — never generates content", pipeline: "delivery", createsContent: false, modelTier: "reasoning" },
];

export const SUPPORTING_AGENTS: AgentDefinition[] = [
  { id: 0, name: "Course Planner", stage: "course-planner", responsibility: "Executive course blueprint + dynamic sizing", pipeline: "planning", ragEnabled: true, modelTier: "reasoning" },
  { id: 0, name: "Module Designer", stage: "module-designer", responsibility: "Per-module design specs", pipeline: "planning", modelTier: "reasoning" },
  { id: 0, name: "Lesson Planner", stage: "lesson-planner", responsibility: "Per-lesson pedagogy before instructional design", pipeline: "lesson", ragEnabled: true },
  { id: 0, name: "Interview Prep", stage: "interview-prep", responsibility: "Technical/behavioral/FAANG interview questions", pipeline: "lesson", createsContent: true },
  { id: 0, name: "Media Integration", stage: "media-integration", responsibility: "Video placement across lessons", pipeline: "delivery" },
  { id: 0, name: "Student Simulation", stage: "student-simulation", responsibility: "Learner walkthrough simulation before publish", pipeline: "delivery", createsContent: false },
  { id: 0, name: "Publisher", stage: "publisher", responsibility: "Publish package metadata", pipeline: "delivery" },
];

export function getAgentByStage(stage: AgentStageId): AgentDefinition | undefined {
  return [...AGENT_REGISTRY, ...SUPPORTING_AGENTS].find((a) => a.stage === stage);
}

export const ORCHESTRATOR_AGENT_COUNT = 17;
export { ORCHESTRATOR_VERSION };
