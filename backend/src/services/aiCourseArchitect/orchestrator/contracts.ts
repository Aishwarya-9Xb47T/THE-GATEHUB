/**
 * V4 — Strongly typed data contracts between orchestrated agents.
 * No free-form text passes between stages; only validated JSON structures.
 */
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectCodingLab,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
  ArchitectQualityReport,
  ArchitectQuizQuestion,
  AcademicCourseBlueprint,
  CurriculumResearchReport,
  LessonPedagogyPlan,
} from "../types.js";
import type { LuProjectJson } from "../../luProject/luProjectSchema.js";
import type { LuProjectFileEntry } from "../../luProject/luProjectFileEmitter.js";
import type { LessonRetrievalBundle } from "../retrieval/types.js";
import type { AdaptiveGenerationProfile } from "../adaptiveProfile.js";

export const ORCHESTRATOR_VERSION = "v6" as const;

/** All orchestrated agent stage identifiers (17 content agents + planning + delivery). */
export type AgentStageId =
  | "course-planner"
  | "curriculum-architect"
  | "module-designer"
  | "instructional-designer"
  | "lesson-planner"
  | "lesson-writer"
  | "objectives"
  | "theory"
  | "summary"
  | "code-generator"
  | "code-validation"
  | "coding-lab"
  | "assessment"
  | "assignment"
  | "project"
  | "research-paper"
  | "video-recommendation"
  | "reference"
  | "diagram"
  | "visual-content"
  | "glossary"
  | "revision-notes"
  | "interview-prep"
  | "media-integration"
  | "latex-formatter"
  | "student-experience"
  | "student-simulation"
  | "quality-assurance"
  | "publisher";

export interface AgentResult<T> {
  stage: AgentStageId;
  success: boolean;
  output: T;
  confidence: number;
  validation: ArchitectQualityReport;
  attempts: number;
  errors: string[];
}

/** Agent 1 output — Course Blueprint (no lesson bodies). */
export interface CoursePlannerOutput {
  executiveSummary: string;
  learningOutcomes: string[];
  careerOutcomes: string[];
  skillMap: string[];
  prerequisites: string[];
  industryApplications: string[];
  estimatedHours: number;
  recommendedLearningPath: string[];
  assessmentStrategy: string;
  projectStrategy: string;
  labStrategy: string;
  certificationGoals: string[];
  recommendedModuleCount: number;
  recommendedLessonCount: number;
}

/** Agent 2 output — structural curriculum graph. */
export interface CurriculumArchitectOutput {
  research: CurriculumResearchReport;
  blueprint: ArchitectBlueprint;
  academicBlueprint: AcademicCourseBlueprint;
  prerequisiteGraph: string;
  difficultyProgression: string;
  trackCount: number;
}

/** Agent 3 output — per-module design spec. */
export interface ModuleDesignSpec {
  moduleId: string;
  summary: string;
  learningGoals: string[];
  skills: string[];
  estimatedHours: number;
  prerequisites: string[];
  expectedOutcomes: string[];
  includesProject: boolean;
  includesLabs: boolean;
  includesAssessment: boolean;
  reviewSession: string;
  revisionNotes: string;
}

export interface ModuleDesignerOutput {
  modules: ModuleDesignSpec[];
}

/**
 * Shared Lesson Blueprint — the bus all per-lesson agents read/write through.
 * Each agent owns specific fields; no agent rewrites another agent's output.
 */
export interface LessonBlueprintPlan extends LessonPedagogyPlan {
  lessonObjective: string;
  industryContext: string;
  estimatedReadingMinutes: number;
  estimatedPracticeMinutes: number;
  estimatedVideoMinutes: number;
  requiredDiagrams: boolean;
  requiredCode: boolean;
  requiredTables: boolean;
  requiredVideo: boolean;
  requiredQuiz: boolean;
  requiredLab: boolean;
  requiredReferences: boolean;
  requiredAssignment: boolean;
  requiredInterviewPrep: boolean;
  /** Instructional Designer — pedagogy flow (Agent 2). */
  conceptOrder: string[];
  microLearningFlow: string[];
  practiceIntervals: string[];
  revisionSpacing: string;
  difficultyCurve: string;
  knowledgeCheckpoints: string[];
  bloomsLevels: string[];
  /** Instructional Designer V6 — learning psychology fields. */
  motivation?: string;
  reflectionPrompts?: string[];
  learningStrategy?: string;
  cognitiveLoadNotes?: string;
  suggestedPractice?: string[];
  /** V6 — RAG retrieval bundle attached before knowledge-producing agents run. */
  retrievalContext?: LessonRetrievalBundle;
  /** V6 — Adaptive profile derived from learner interview. */
  adaptiveProfile?: AdaptiveGenerationProfile;
}

/** V6 — Student simulation output (delivery gate). */
export interface StudentSimulationOutput {
  passed: boolean;
  score: number;
  lessonCount: number;
  navigableLessons: number;
  avgStepsPerLesson: number;
  completionLikelihood: number;
  frictionPoints: string[];
  learnerWouldComplete: boolean;
}

/** Agent 8 output — project specification. */
export interface ProjectSpec {
  title: string;
  problemStatement: string;
  businessContext: string;
  objectives: string[];
  requirements: string[];
  architecture: string;
  folderStructure: string[];
  milestones: string[];
  evaluationRubric: string[];
  deliverables: string[];
  portfolioGuidance: string;
  resumeImpact: string;
  industryApplications: string[];
  deploymentSuggestions: string[];
  instructions: string;
  difficulty: string;
}

/** Agent 9 output — media placement report. */
export interface MediaIntegrationOutput {
  videosAssigned: number;
  lessonsWithVideo: number;
  unassignedVideos: number;
  placements: Array<{ lessonKey: string; videoTitle: string; type: "youtube" | "upload" }>;
}

/** Agent 10 output — LaTeX build readiness. */
export interface LatexFormatterOutput {
  fileCount: number;
  lessonCount: number;
  quizCount: number;
  labCount: number;
  compileReady: boolean;
  warnings: string[];
}

/** Agent 11 output — student experience manifest. */
export interface StudentExperienceManifest {
  lessonCount: number;
  stepsPerLessonAvg: number;
  interactiveBlocks: string[];
  heroBanners: boolean;
  quizCards: boolean;
  codingLabs: boolean;
  checkpointCards: boolean;
}

/** Agent 12 output — QA gate. */
export interface QualityAssuranceOutput {
  passed: boolean;
  score: number;
  blockedReasons: string[];
  selfEvaluation: SelfEvaluationResult;
  failedStages: AgentStageId[];
}

/** Agent 13 output — publish package metadata. */
export interface PublisherOutput {
  ready: boolean;
  lessonCount: number;
  moduleCount: number;
  searchIndexReady: boolean;
  progressTrackingReady: boolean;
  certificateMetadataReady: boolean;
  analyticsMetadataReady: boolean;
}

export interface SelfEvaluationResult {
  courseraReady: boolean;
  mitReady: boolean;
  stanfordReady: boolean;
  deeplearningAiReady: boolean;
  professorApproved: boolean;
  studentWouldPay: boolean;
  overallScore: number;
  improvements: string[];
}

export interface OrchestratorManifest {
  version: typeof ORCHESTRATOR_VERSION;
  startedAt: string;
  completedAt?: string;
  planningStages: Array<{ stage: AgentStageId; confidence: number; passed: boolean }>;
  contentStages: Array<{ stage: AgentStageId; confidence: number; passed: boolean; lessonId?: string }>;
  deliveryStages: Array<{ stage: AgentStageId; confidence: number; passed: boolean }>;
  selfEvaluationScore: number;
  readyToPublish: boolean;
}

export interface LessonPipelineContext {
  interview: AICourseArchitectInterview;
  blueprint: ArchitectBlueprint;
  mod: ArchitectModuleBlueprint;
  modIndex: number;
  lessonIndex: number;
  skeleton: ArchitectLessonBlueprint;
  moduleDesign?: ModuleDesignSpec;
  coursePlan?: CoursePlannerOutput;
  /** V6 — Base plan from Lesson Planner before Instructional Designer enrichment. */
  baseLessonPlan?: LessonBlueprintPlan;
  /** V6 — RAG bundle for this lesson. */
  retrievalBundle?: LessonRetrievalBundle;
  /** V6 Part 3 — formatted course memory for agent prompts. */
  memoryContext?: string;
  adaptiveProfile?: AdaptiveGenerationProfile;
}

export interface LessonPipelineResult {
  lesson: ArchitectLessonBlueprint;
  plan: LessonBlueprintPlan;
  quiz?: ArchitectQuizQuestion[];
  lab?: ArchitectCodingLab;
  project?: ProjectSpec;
  stages: Array<{ stage: AgentStageId; confidence: number; passed: boolean }>;
  qualityReport: ArchitectQualityReport;
}

export interface PlanningPipelineInput {
  interview: AICourseArchitectInterview;
}

export interface PlanningPipelineOutput {
  coursePlan: CoursePlannerOutput;
  curriculum: CurriculumArchitectOutput;
  moduleDesign: ModuleDesignerOutput;
  blueprint: ArchitectBlueprint;
  curriculumValidation: ArchitectQualityReport;
  manifest: OrchestratorManifest;
}

export interface ContentPipelineInput {
  interview: AICourseArchitectInterview;
  blueprint: ArchitectBlueprint;
  coursePlan?: CoursePlannerOutput;
  moduleDesign?: ModuleDesignerOutput;
  onProgress?: (msg: string, pct: number) => void;
}

export interface ContentPipelineOutput {
  blueprint: ArchitectBlueprint;
  qualityReport: ArchitectQualityReport;
  manifest: OrchestratorManifest;
}

export interface DeliveryContext {
  interview: AICourseArchitectInterview;
  blueprint: ArchitectBlueprint;
}

export interface DeliveryPipelineOutput {
  blueprint: ArchitectBlueprint;
  media: MediaIntegrationOutput;
  latex: LatexFormatterOutput;
  studentExperience: StudentExperienceManifest;
  qualityAssurance: QualityAssuranceOutput;
  studentSimulation?: StudentSimulationOutput;
  publisher: PublisherOutput;
  stages: Array<{ stage: AgentStageId; confidence: number; passed: boolean }>;
  /** LaTeX project built during delivery — reuse in controller to avoid double build. */
  projectBuild?: {
    project: LuProjectJson;
    files: LuProjectFileEntry[];
  };
}
