import type {
  LearningObjectivesBlock,
  VisualDiagramBlock,
  FlowchartBlock,
  CodeExampleBlock,
  CodingLabBlock,
  CodingWorkspaceBlock,
  SummaryBlock,
  KeyTakeawaysBlock,
  RevisionNotesBlock,
  FurtherReadingBlock,
  ResearchPaperBlock,
  QuizBlock,
  CommonMistakesBlock,
  BestPracticesBlock,
  IndustryNotesBlock,
  CheatSheetBlock,
  RealWorldAnalogyBlock,
  ConceptExplanationBlock,
  ExecutionStepsBlock,
  InterviewQuestionsBlock,
  FlashcardsBlock,
  GlossaryBlock,
  ProjectBlock,
} from "./schemas/lessonBlockSchemas.js";

/** THE GATEHUB AI Curriculum Architect — enterprise instructional design types */

export type CourseScaleId = "mini" | "standard" | "bootcamp" | "university" | "master" | "custom";

export type DifficultyTier = "beginner" | "intermediate" | "advanced";

export type DifficultyDistributionMode = "percentages" | "unit-counts" | "ai-decides";

export type LearningStyleId =
  | "theory-heavy"
  | "practice-heavy"
  | "balanced"
  | "project-based"
  | "research-based"
  | "industry-certification"
  | "interview-prep"
  | "academic"
  | "university"
  | "bootcamp"
  | "corporate-training"
  | "mixed";

export type TeachingStyleId =
  | "beginner-friendly"
  | "university-style"
  | "professional"
  | "industry-mentor"
  | "research-paper"
  | "interview-style"
  | "visual-learning"
  | "hands-on"
  | "problem-solving"
  | "mixed";

export type LessonStructureId =
  | "learning-objectives"
  | "why-it-matters"
  | "industry-motivation"
  | "storytelling"
  | "real-world-analogy"
  | "theory"
  | "concept-explanation"
  | "visual-diagram"
  | "flowchart"
  | "step-by-step-breakdown"
  | "mathematical-derivation"
  | "code-example"
  | "interactive-examples"
  | "execution-steps"
  | "common-mistakes"
  | "debugging-tips"
  | "optimization"
  | "best-practices"
  | "industry-notes"
  | "hands-on-lab"
  | "mini-exercise"
  | "summary"
  | "key-takeaways"
  | "flashcards"
  | "interview-questions"
  | "mini-quiz"
  | "case-study"
  | "comparison-table"
  | "formula-sheet"
  | "references"
  | "further-reading"
  | "revision-notes"
  | "prerequisite-next-lesson"
  | "ai-summary"
  | "glossary"
  | "learning-outcome";

export type ResearchDepth =
  | "basic"
  | "professional"
  | "university"
  | "industry"
  | "research"
  | "phd"
  | "expert";

export type VideoStrategy = "local-uploads" | "youtube-urls" | "both" | "add-later";

export type VideoPlacementStrategy =
  | "one-per-lesson"
  | "one-per-module"
  | "intro-only"
  | "demo-only"
  | "practical-only"
  | "ai-auto";

export type CourseType =
  | "bootcamp"
  | "professional"
  | "university"
  | "certification"
  | "research"
  | "workshop";

export type AcademicLevel = "beginner" | "intermediate" | "advanced" | "graduate" | "expert";

export interface VideoMapping {
  lessonKey?: string;
  moduleId?: string;
  lessonId?: string;
  type: "youtube" | "upload";
  url?: string;
  file?: string;
  title: string;
  order?: number;
  youtubeId?: string;
  youtubeVideoId?: string;
  youtubeVideoUrl?: string;
  youtubeThumbnail?: string;
  youtubeTitle?: string;
  youtubeDuration?: string;
  uploadedVideoPath?: string;
  uploadedVideoName?: string;
  uploadedVideoThumbnail?: string;
  uploadedVideoDuration?: string;
  mimeType?: string;
  size?: number;
}

export interface BannerConfig {
  bannerUrl: string;
  thumbnailUrl: string;
  bannerType: string;
  bannerId?: string;
  colorTheme?: string;
  sourceId?: string;
  sourceUrl?: string;
  provider?: string;
}

export interface CourseScaleConfig {
  id: CourseScaleId;
  customLessonCount?: number;
  /** Instructor-preferred module count (custom scale) */
  customModuleCount?: number;
  /** Instructor-preferred lessons per module (custom scale) */
  customLessonsPerModule?: number;
}

/** V2 — Academic Course Blueprint finalized before lesson generation */
export interface AcademicCourseBlueprint {
  courseVision: string;
  targetAudience: string;
  prerequisites: string[];
  learningOutcomes: string[];
  careerOutcomes: string[];
  skillsCovered: string[];
  difficulty: string;
  estimatedHours: number;
  recommendedLearningPath: string[];
  moduleStructure: Array<{ id: string; title: string; lessonCount: number; focus: string }>;
  lessonCount: number;
  projectCount: number;
  quizCount: number;
  codingLabs: number;
  researchPapers: number;
  assignments: number;
  capstone?: string;
  certificationRequirements?: string;
  bloomsTaxonomyMapping: Array<{
    level: string;
    objectives: string[];
    modules: string[];
  }>;
  learningObjectives: string[];
  assessmentInventory: Array<{ type: string; count: number; placement: string }>;
  finalizedAt: string;
}

/** V2 — Internal pedagogy plan per lesson (think before writing) */
export interface LessonPedagogyPlan {
  priorKnowledge: string[];
  learningGoals: string[];
  misconceptions: string[];
  strugglePoints: string[];
  simplificationStrategy: string;
  useVisuals: boolean;
  useCode: boolean;
  useMath: boolean;
  useAnalogies: boolean;
  useDiagrams: boolean;
  includeLab: boolean;
  includeQuiz: boolean;
  connectionToPrevious: string;
  connectionToNext: string;
  industryHook: string;
  sectionsToEmphasize: string[];
}

export interface DifficultyDistribution {
  mode: DifficultyDistributionMode;
  beginnerPercent?: number;
  intermediatePercent?: number;
  advancedPercent?: number;
  easyUnits?: number;
  mediumUnits?: number;
  advancedUnits?: number;
}

export interface AssessmentStrategy {
  style: string;
  methods: string[];
}

export interface CurriculumScalePlan {
  scaleId: CourseScaleId;
  scaleLabel: string;
  targetLessons: number;
  trackCount: number;
  moduleCount: number;
  /** Average / nominal lessons per module (actual counts may vary for remainder). */
  lessonsPerModule: number;
  /** Exact lesson counts per module index (deterministic, sums to targetLessons). */
  lessonDistribution: number[];
  /** Human-readable note when values were reconciled. */
  structureNote?: string;
  estimatedHours: number;
  labsTotal: number;
  projectsTotal: number;
  quizzesPerLesson: number;
  moduleQuizzes: number;
  capstone: boolean;
  finalExam: boolean;
}

export interface CurriculumResearchReport {
  courseRationale: string;
  industryStandards: string[];
  universityReferences: string[];
  officialDocumentation: string[];
  recommendedProgression: string[];
  skillDependencyGraph: string;
  prerequisiteGraph: string;
  prerequisites: string[];
  learningOutcomes: string[];
  conceptMap: string[];
  assessmentRecommendations: string[];
  researchSources: string[];
  researchedAt: string;
}

export interface AICourseArchitectInterview {
  productType: "premium-course" | "learning-universe" | "free-course";
  courseInfo: {
    title: string;
    subtitle?: string;
    subject: string;
    domain?: string;
    categoryId?: string;
    categoryName?: string;
    subcategory?: string;
    targetAudience: string;
    prerequisites: string[];
    industry: string;
    learningGoals: string[];
    expectedOutcomes: string[];
    estimatedDuration: string;
    estimatedHours?: number;
    difficulty: "beginner" | "intermediate" | "advanced";
    certificationEligible: boolean;
    language: string;
    academicLevel: AcademicLevel;
    courseType: CourseType;
    /** Premium course list price in INR (0 = free enrollment). */
    price?: number;
  };
  courseScale: CourseScaleConfig;
  difficultyDistribution: DifficultyDistribution;
  learningStyle: LearningStyleId[];
  teachingStyle: TeachingStyleId[];
  lessonStructure: LessonStructureId[];
  practicalComponents: string[];
  assessmentStrategy: AssessmentStrategy;
  curriculumStrategy: {
    progression: string[];
    aiDecidesCurriculum: boolean;
  };
  learningComponents: string[];
  videoStrategy: {
    includeVideos?: boolean;
    method: VideoStrategy;
    placement?: VideoPlacementStrategy;
    durationPreference?: string;
    mappings: VideoMapping[];
  };
  banner?: BannerConfig;
  researchDepth: ResearchDepth;
  /** @deprecated legacy — merged into learningComponents */
  practicalLearning?: { enabled: string[] };
  /** @deprecated legacy */
  assessments?: { types: string[] };
  /** @deprecated legacy */
  resources?: { types: string[] };
  /** @deprecated legacy */
  curriculumStrategyLegacy?: { contentStyles: string[] };
}

export type QuizQuestionType = "mcq" | "true-false" | "fill-blank" | "match-following" | "scenario";

export interface ArchitectQuizQuestionBase {
  type: QuizQuestionType;
  text: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  bloomLevel: string;
  timeEstimateSeconds: number;
  hints: string[];
  learningObjective: string;
  marks: number;
}

export interface MCQQuestion extends ArchitectQuizQuestionBase {
  type: "mcq";
  options: string[];
  correctAnswer: string;
  wrongOptionExplanations?: Record<string, string>;
}

export interface TrueFalseQuestion extends ArchitectQuizQuestionBase {
  type: "true-false";
  correctAnswer: boolean;
}

export interface FillBlankQuestion extends ArchitectQuizQuestionBase {
  type: "fill-blank";
  correctAnswer: string[];
  blanksCount: number;
}

export interface MatchFollowingQuestion extends ArchitectQuizQuestionBase {
  type: "match-following";
  leftColumn: string[];
  rightColumn: string[];
  correctMatches: Record<string, string>;
}

export interface ScenarioQuestion extends ArchitectQuizQuestionBase {
  type: "scenario";
  scenario: string;
  correctAnswer: string;
  followUpQuestions?: string[];
}

export type ArchitectQuizQuestion = MCQQuestion | TrueFalseQuestion | FillBlankQuestion | MatchFollowingQuestion | ScenarioQuestion;

export interface ArchitectCodingLab {
  title: string;
  language: string;
  starterCode: string;
  expectedOutput: string;
  problemStatement?: string;
  inputDescription?: string;
  outputDescription?: string;
  solutionCode?: string;
  alternativeSolution?: string;
  explanation?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  edgeCases?: string[];
  debuggingTips?: string[];
  publicTestCases?: Array<{ input: string; output: string }>;
  hiddenTestCases?: Array<{ input: string; output: string }>;
  hints?: string[];
  extensionExercise?: string;
  miniChallenge?: string;
  advancedVersion?: string;
  colabUrl?: string;
}

export interface CodeValidationMeta {
  passed: boolean;
  executionSuccess: boolean;
  syntaxValid: boolean;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  language?: string;
  validatedAt: string;
}

export interface ArchitectLessonBlueprint {
  id: string;
  title: string;
  durationMinutes: number;
  difficultyTier?: DifficultyTier;
  contentStatus?: "planned" | "generated" | "validated" | "rejected";
  
  // === LEGACY STRING-BASED FIELDS (will be deprecated after migration) ===
  introduction: string;
  objectives: string[];
  realWorldAnalogy?: string;
  theory: string;
  conceptExplanation?: string;
  visualDiagram?: string;
  flowchart?: string;
  mathematicalDerivation?: string;
  codeExample?: string;
  codeValidation?: CodeValidationMeta;
  executionSteps?: string;
  commonMistakes?: string[];
  bestPractices?: string[];
  industryNotes?: string;
  examples: string;
  caseStudy?: string;
  practice?: string;
  summary: string;
  keyTakeaways?: string[];
  revision: string;
  furtherReading?: Array<{ title: string; url: string }>;
  learningOutcome?: string;
  prerequisites?: string[];
  faq?: Array<{ question: string; answer: string }>;
  flashcards?: Array<{ front: string; back: string }>;
  glossary?: Array<{
    term: string;
    definition: string;
    category?: string;
    relatedTerms?: string[];
    misconceptions?: string[];
    difficulty?: "beginner" | "intermediate" | "advanced";
  }>;
  diagrams?: Array<{ type: string; mermaid: string; caption: string }>;
  visualContent?: Array<{
    type: "illustration" | "infographic" | "comparison-table" | "concept-map";
    title: string;
    description: string;
    placement: string;
    suggestedContent?: string;
  }>;
  industryTips?: string[];
  interviewQuestions?: Array<{
    question: string;
    answer: string;
    difficulty?: "entry" | "junior" | "mid" | "senior" | "lead";
    category?: "theoretical" | "practical" | "behavioral" | "system-design" | "hr" | "coding";
    hints?: string[];
    keyPoints?: string[];
  }>;
  quizQuestions?: ArchitectQuizQuestion[];
  codingLab?: ArchitectCodingLab;
  notebook?: {
    title: string;
    kernel: string;
    cells: Array<{ type: string; source: string }>;
  };
  assignment?: {
    title: string;
    instructions: string;
    problemStatement?: string;
    objectives?: string[];
    starterFiles?: Array<{ name: string; content: string }>;
    requirements?: string[];
    submissionChecklist?: string[];
    rubric?: Array<{ criterion: string; points: number; description: string }>;
    evaluationCriteria?: string[];
    hints?: string[];
    points: number;
    dueDate?: string;
  };
  miniProject?: {
    title: string;
    description: string;
    instructions: string;
  };
  researchPaper?: {
    title: string;
    abstract: string;
    sections: Array<{ title: string; content: string }>;
  };
  researchPapers?: Array<{
    title: string;
    authors: string;
    year: number;
    conference?: string;
    journal?: string;
    doi?: string;
    url?: string;
    abstract: string;
    summary: string;
    importance: string;
    difficulty: "beginner" | "intermediate" | "advanced" | "graduate";
  }>;
  revisionNotes?: {
    quickSummary: string;
    keyConcepts: string[];
    importantFormulas: string[];
    commonMistakes: string[];
    examTips: string[];
    practiceQuestions: string[];
    furtherPractice: string[];
    mindMap?: string;
  };
  lessonReferences?: Array<{
    type: "book" | "documentation" | "website" | "research-paper" | "further-reading";
    title: string;
    authors?: string;
    publisher?: string;
    year?: number;
    url?: string;
    isbn?: string;
    description: string;
    relevance: string;
  }>;
  
  // === NEW STRUCTURED BLOCK FIELDS (component-based generation) ===
  introductionBlock?: {
    type: "introduction";
    title: string;
    paragraphs: string[];
  };
  objectivesBlock?: LearningObjectivesBlock;
  realWorldAnalogyBlock?: RealWorldAnalogyBlock;
  theoryBlock?: {
    type: "theory";
    title: string;
    sections: Array<{
      heading?: string;
      content: string;
      type: "paragraph" | "bullet-list" | "numbered-list";
    }>;
  };
  conceptExplanationBlock?: ConceptExplanationBlock;
  visualDiagramBlock?: VisualDiagramBlock;
  flowchartBlock?: FlowchartBlock;
  mathematicalDerivationBlock?: {
    type: "mathematical-derivation";
    title: string;
    steps: Array<{
      step: number;
      formula: string;
      explanation: string;
    }>;
  };
  codeExampleBlock?: CodeExampleBlock;
  executionStepsBlock?: ExecutionStepsBlock;
  commonMistakesBlock?: CommonMistakesBlock;
  bestPracticesBlock?: BestPracticesBlock;
  industryNotesBlock?: IndustryNotesBlock;
  examplesBlock?: {
    type: "examples";
    title: string;
    examples: Array<{
      scenario: string;
      code?: string;
      explanation: string;
      output?: string;
    }>;
  };
  caseStudyBlock?: {
    type: "case-study";
    title: string;
    context: string;
    challenge: string;
    approach: string;
    outcome: string;
    lessons: string[];
  };
  practiceBlock?: {
    type: "practice";
    title: string;
    exercises: Array<{
      question: string;
      hint?: string;
      solution?: string;
    }>;
  };
  summaryBlock?: SummaryBlock;
  keyTakeawaysBlock?: KeyTakeawaysBlock;
  revisionNotesBlock?: RevisionNotesBlock;
  furtherReadingBlock?: FurtherReadingBlock;
  learningOutcomeBlock?: {
    type: "learning-outcome";
    title: string;
    outcomes: string[];
  };
  prerequisitesBlock?: {
    type: "prerequisites";
    title: string;
    prerequisites: Array<{
      topic: string;
      description: string;
      resources?: string[];
    }>;
  };
  faqBlock?: {
    type: "faq";
    title: string;
    questions: Array<{
      question: string;
      answer: string;
      category?: string;
    }>;
  };
  flashcardsBlock?: FlashcardsBlock;
  glossaryBlock?: GlossaryBlock;
  interviewQuestionsBlock?: InterviewQuestionsBlock;
  quizBlock?: QuizBlock;
  codingLabBlock?: CodingLabBlock;
  codingWorkspaceBlock?: CodingWorkspaceBlock; // First-class interactive component
  assignmentBlock?: ProjectBlock;
  miniProjectBlock?: ProjectBlock;
  researchPaperBlock?: ResearchPaperBlock;
  cheatSheetBlock?: CheatSheetBlock;
  resources?: Array<{ title: string; url: string; type: string }>;
  videos?: VideoMapping[];
  references?: Array<{ citation: string }>;
  discussionPrompt?: string;
  cheatSheet?: string;
  /** V6 Part 3 — per-lesson analytics metadata */
  learningAnalytics?: {
    estimatedCompletionMinutes: number;
    difficultyScore: number;
    knowledgeCoverage: number;
    skillCoverage: number;
    assessmentCoverage: number;
    practiceCoverage: number;
    confidenceScore: number;
    careerMapping?: string[];
    certificationMapping?: string[];
  };
  /** V6 Part 3 — multi-dimensional quality scores */
  qualityDimensions?: {
    accuracy: number;
    educationalValue: number;
    readability: number;
    professionalism: number;
    completeness: number;
    codeQuality: number;
    researchQuality: number;
    quizQuality: number;
    projectQuality: number;
    visualQuality: number;
    accessibility: number;
    consistency: number;
    videoQuality: number;
    referenceQuality: number;
    overall: number;
  };
}

export interface ArchitectModuleBlueprint {
  id: string;
  title: string;
  description: string;
  learningOutcomes: string[];
  estimatedHours: number;
  difficultyTier?: DifficultyTier;
  lessons: ArchitectLessonBlueprint[];
  dependencies?: string[];
  moduleQuiz?: {
    title: string;
    questions: Array<{
      text: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
    }>;
  };
  midExam?: {
    title: string;
    questions: Array<{
      text: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
    }>;
  };
  project?: {
    title: string;
    description: string;
    instructions: string;
    difficulty: string;
  };
}

export interface ArchitectTrackBlueprint {
  id: string;
  title: string;
  moduleCount: number;
  lessonCount: number;
}

import type { CoursePlannerOutput, ModuleDesignerOutput, OrchestratorManifest, StudentExperienceManifest } from "./orchestrator/contracts.js";

export interface ArchitectBlueprint {
  phase?: "planned" | "approved" | "generated";
  /** V4 — Multi-agent orchestrator manifest */
  orchestratorManifest?: OrchestratorManifest;
  coursePlannerOutput?: CoursePlannerOutput;
  moduleDesignerOutput?: ModuleDesignerOutput;
  studentExperienceManifest?: StudentExperienceManifest;
  courseTitle: string;
  subtitle: string;
  description: string;
  category: string;
  difficulty: string;
  estimatedDuration: string;
  estimatedHours: number;
  prerequisites: string[];
  learningOutcomes: string[];
  difficultyProgression: string;
  assessmentPlan: string;
  knowledgeGraph?: string;
  prerequisiteGraph?: string;
  curriculumPlan?: CurriculumScalePlan;
  researchReport?: CurriculumResearchReport;
  /** V2 — Academic blueprint finalized before content generation */
  academicBlueprint?: AcademicCourseBlueprint;
  tracks?: ArchitectTrackBlueprint[];
  certificateRequirements?: string;
  capstone?: {
    title: string;
    description: string;
    instructions: string;
  };
  finalExam?: {
    title: string;
    questions: Array<{
      text: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
    }>;
  };
  modules: ArchitectModuleBlueprint[];
  marketing: {
    seoTitle: string;
    seoDescription: string;
    tags: string[];
    highlights: string[];
    bannerPrompt: string;
    colorTheme: string;
  };
}

export interface ArchitectQualityReport {
  score: number;
  passed: boolean;
  checks: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }>;
  suggestions: string[];
}

export interface ArchitectGenerateResult {
  universeId: string;
  projectId: string;
  productType: string;
  listingEntityId: string;
  listingTable: "learning_universe" | "resource_course" | "course";
  lessonCount: number;
  moduleCount: number;
  qualityReport: ArchitectQualityReport;
  validationReport: ArchitectValidationReport;
  thumbnailUrl?: string;
  compiledPdfUrl?: string;
}

export interface ArchitectValidationReport {
  passed: boolean;
  structureErrors: number;
  missingFiles: string[];
  compileSuccess: boolean;
  compileError?: string;
  lessonCount: number;
  componentCount: number;
  checks: ArchitectQualityReport["checks"];
}

export const LEARNING_COMPONENT_IDS = [
  "Video Lessons",
  "PDF Notes",
  "Coding Labs",
  "Google Colab",
  "Jupyter Notebook",
  "Assignments",
  "Projects",
  "Research Papers",
  "Interactive Exercises",
  "Quizzes",
  "Mid Exam",
  "Final Exam",
  "Flashcards",
  "Cheat Sheets",
  "FAQs",
  "Interview Questions",
  "Industry Tips",
  "Case Studies",
  "Real-world Examples",
  "Datasets",
  "Downloads",
  "Glossary",
  "References",
  "Certificate",
  "Discussion Topics",
  "Capstone Project",
] as const;

export function hasLearningComponent(interview: AICourseArchitectInterview, name: string): boolean {
  const lc = [...(interview.learningComponents ?? []), ...(interview.practicalComponents ?? [])];
  const legacy = [
    ...(interview.practicalLearning?.enabled ?? []),
    ...(interview.assessments?.types ?? []),
    ...(interview.resources?.types ?? []),
  ];
  const all = [...lc, ...legacy];
  return all.some((c) => c.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.toLowerCase()));
}

export function hasLessonStructure(interview: AICourseArchitectInterview, id: LessonStructureId): boolean {
  return (interview.lessonStructure ?? []).includes(id);
}

export const DEFAULT_LESSON_STRUCTURE: LessonStructureId[] = [
  "learning-objectives",
  "real-world-analogy",
  "theory",
  "concept-explanation",
  "code-example",
  "common-mistakes",
  "best-practices",
  "industry-notes",
  "summary",
  "key-takeaways",
  "mini-quiz",
  "references",
  "revision-notes",
  "glossary",
  "learning-outcome",
];

export function normalizeInterview(raw: AICourseArchitectInterview): AICourseArchitectInterview {
  return {
    ...raw,
    courseScale: raw.courseScale ?? { id: "standard" },
    difficultyDistribution: raw.difficultyDistribution ?? { mode: "ai-decides" },
    learningStyle: raw.learningStyle?.length ? raw.learningStyle : ["balanced"],
    teachingStyle: raw.teachingStyle?.length ? raw.teachingStyle : ["professional"],
    lessonStructure: raw.lessonStructure?.length ? raw.lessonStructure : DEFAULT_LESSON_STRUCTURE,
    practicalComponents: raw.practicalComponents?.length
      ? raw.practicalComponents
      : raw.learningComponents?.filter((c) => /lab|project|colab|notebook|assignment|research|dataset/i.test(c)) ?? [],
    assessmentStrategy: raw.assessmentStrategy ?? {
      style: "Quiz after every module",
      methods: raw.assessments?.types ?? ["Quizzes", "Projects"],
    },
  };
}
