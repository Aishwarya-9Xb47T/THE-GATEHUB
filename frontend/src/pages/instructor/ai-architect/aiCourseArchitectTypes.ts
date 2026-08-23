import type { ProductType } from "@/lib/productTypes";
import type { BannerType } from "@/lib/courseBranding/types";

export type CourseScaleId = "mini" | "standard" | "bootcamp" | "university" | "master" | "custom";
export type DifficultyTier = "beginner" | "intermediate" | "advanced";
export type DifficultyDistributionMode = "percentages" | "unit-counts" | "ai-decides";

export type LearningStyleId =
  | "theory-heavy" | "practice-heavy" | "balanced" | "project-based" | "research-based"
  | "industry-certification" | "interview-prep" | "academic" | "university" | "bootcamp"
  | "corporate-training" | "mixed";

export type TeachingStyleId =
  | "beginner-friendly" | "university-style" | "professional" | "industry-mentor"
  | "research-paper" | "interview-style" | "visual-learning" | "hands-on"
  | "problem-solving" | "mixed";

export type LessonStructureId =
  | "learning-objectives" | "why-it-matters" | "industry-motivation" | "storytelling"
  | "real-world-analogy" | "theory" | "concept-explanation" | "visual-diagram" | "flowchart"
  | "step-by-step-breakdown" | "mathematical-derivation" | "code-example" | "interactive-examples"
  | "execution-steps" | "common-mistakes" | "debugging-tips" | "optimization" | "best-practices"
  | "industry-notes" | "hands-on-lab" | "mini-exercise" | "summary" | "key-takeaways"
  | "flashcards" | "interview-questions" | "mini-quiz" | "case-study" | "comparison-table"
  | "formula-sheet" | "references" | "further-reading" | "revision-notes" | "prerequisite-next-lesson"
  | "ai-summary" | "glossary" | "learning-outcome";

export type ResearchDepth =
  | "basic" | "professional" | "university" | "industry" | "research" | "phd" | "expert";

export type VideoStrategy = "local-uploads" | "youtube-urls" | "both" | "add-later";

export type VideoPlacementStrategy =
  | "one-per-lesson"
  | "one-per-module"
  | "intro-only"
  | "demo-only"
  | "practical-only"
  | "ai-auto";

export type CourseType =
  | "bootcamp" | "professional" | "university" | "certification" | "research" | "workshop";

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
  youtubeDuration?: string;
  uploadedVideoDuration?: string;
  mimeType?: string;
  size?: number;
}

export interface BannerConfig {
  bannerUrl: string;
  thumbnailUrl: string;
  bannerType: BannerType;
  bannerId?: string;
  colorTheme?: string;
  sourceId?: string;
  sourceUrl?: string;
  provider?: string;
}

export interface CourseScaleConfig {
  id: CourseScaleId;
  customLessonCount?: number;
  customModuleCount?: number;
  customLessonsPerModule?: number;
}

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
  bloomsTaxonomyMapping: Array<{ level: string; objectives: string[]; modules: string[] }>;
  learningObjectives: string[];
  assessmentInventory: Array<{ type: string; count: number; placement: string }>;
  finalizedAt: string;
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
  lessonsPerModule: number;
  lessonDistribution?: number[];
  structureNote?: string;
  estimatedHours: number;
  labsTotal: number;
  projectsTotal: number;
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
  productType: ProductType;
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
  studentBackground?: string[];
  learningGoalType?: string;
  preferredLanguages?: string[];
  contentDepthPreference?: "overview" | "comprehensive" | "deep-dive" | "exhaustive";
  banner?: BannerConfig;
  researchDepth: ResearchDepth;
}

export interface ArchitectLessonBlueprint {
  id: string;
  title: string;
  durationMinutes: number;
  difficultyTier?: DifficultyTier;
  contentStatus?: "planned" | "generated" | "validated" | "rejected";
  introduction: string;
  objectives: string[];
  theory: string;
  examples: string;
  summary: string;
  revision: string;
  quizQuestions?: Array<{ text: string; options: string[]; correctAnswer: string; explanation: string }>;
}

export interface ArchitectModuleBlueprint {
  id: string;
  title: string;
  description: string;
  learningOutcomes: string[];
  estimatedHours: number;
  difficultyTier?: DifficultyTier;
  lessons: ArchitectLessonBlueprint[];
  project?: { title: string; description: string; instructions: string; difficulty: string };
}

export interface ArchitectBlueprint {
  phase?: "planned" | "approved" | "generated";
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
  academicBlueprint?: AcademicCourseBlueprint;
  tracks?: Array<{ id: string; title: string; moduleCount: number; lessonCount: number }>;
  capstone?: { title: string; description: string; instructions: string };
  finalExam?: { title: string; questions: unknown[] };
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
  checks: Array<{ id: string; label: string; status: "pass" | "warn" | "fail"; detail: string }>;
  suggestions: string[];
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

/** 9-phase instructional design workflow */
export const WIZARD_STEPS = [
  "Understand — Course Identity",
  "Interview — Audience & Background",
  "Interview — Learning Goals",
  "Interview — Course Scale",
  "Interview — Difficulty & Style",
  "Interview — Lesson Structure & Depth",
  "Interview — Practical & Assessment",
  "Configure — Language & Industry",
  "Configure — Video & Banner",
  "Research & Plan Curriculum",
  "Validate & Approve Blueprint",
  "Generate Complete Course",
];

export const COURSE_SCALE_OPTIONS = [
  { id: "mini" as const, label: "Mini Course", range: "10–15 lessons" },
  { id: "standard" as const, label: "Standard Professional", range: "25–40 lessons" },
  { id: "bootcamp" as const, label: "Comprehensive Bootcamp", range: "50–80 lessons" },
  { id: "university" as const, label: "University Semester", range: "80–120 lessons" },
  { id: "master" as const, label: "Master Program", range: "150+ lessons" },
  { id: "custom" as const, label: "Custom Scale", range: "Your lesson count" },
];

export const LEARNING_STYLE_OPTIONS = [
  { id: "theory-heavy" as const, label: "Theory Heavy" },
  { id: "practice-heavy" as const, label: "Practice Heavy" },
  { id: "balanced" as const, label: "Balanced" },
  { id: "project-based" as const, label: "Project Based" },
  { id: "research-based" as const, label: "Research Based" },
  { id: "industry-certification" as const, label: "Industry Certification" },
  { id: "interview-prep" as const, label: "Interview Preparation" },
  { id: "academic" as const, label: "Academic" },
  { id: "university" as const, label: "University" },
  { id: "bootcamp" as const, label: "Bootcamp" },
  { id: "corporate-training" as const, label: "Corporate Training" },
  { id: "mixed" as const, label: "Mixed" },
];

export const TEACHING_STYLE_OPTIONS = [
  { id: "beginner-friendly" as const, label: "Very Beginner Friendly" },
  { id: "university-style" as const, label: "University Style" },
  { id: "professional" as const, label: "Professional" },
  { id: "industry-mentor" as const, label: "Industry Mentor" },
  { id: "research-paper" as const, label: "Research Paper Style" },
  { id: "interview-style" as const, label: "Interview Style" },
  { id: "visual-learning" as const, label: "Visual Learning" },
  { id: "hands-on" as const, label: "Hands-on Learning" },
  { id: "problem-solving" as const, label: "Problem Solving" },
  { id: "mixed" as const, label: "Mixed" },
];

export const LESSON_STRUCTURE_OPTIONS: Array<{ id: LessonStructureId; label: string }> = [
  { id: "learning-objectives", label: "Learning Objectives" },
  { id: "why-it-matters", label: "Why This Matters" },
  { id: "industry-motivation", label: "Industry Motivation" },
  { id: "storytelling", label: "Storytelling Hook" },
  { id: "real-world-analogy", label: "Real-world Analogy" },
  { id: "theory", label: "Theory" },
  { id: "concept-explanation", label: "Concept Explanation" },
  { id: "visual-diagram", label: "Visual Diagram" },
  { id: "flowchart", label: "Flowchart" },
  { id: "step-by-step-breakdown", label: "Step-by-step Breakdown" },
  { id: "mathematical-derivation", label: "Mathematical Derivation" },
  { id: "code-example", label: "Code Example" },
  { id: "interactive-examples", label: "Interactive Examples" },
  { id: "execution-steps", label: "Execution Steps" },
  { id: "common-mistakes", label: "Common Mistakes" },
  { id: "debugging-tips", label: "Debugging Tips" },
  { id: "optimization", label: "Optimization Notes" },
  { id: "best-practices", label: "Best Practices" },
  { id: "industry-notes", label: "Industry Notes" },
  { id: "hands-on-lab", label: "Hands-on Lab" },
  { id: "mini-exercise", label: "Mini Exercise" },
  { id: "summary", label: "Summary" },
  { id: "key-takeaways", label: "Key Takeaways" },
  { id: "flashcards", label: "Flash Cards" },
  { id: "interview-questions", label: "Interview Questions" },
  { id: "mini-quiz", label: "Mini Quiz" },
  { id: "case-study", label: "Case Study" },
  { id: "comparison-table", label: "Comparison Table" },
  { id: "formula-sheet", label: "Formula Sheet" },
  { id: "references", label: "References" },
  { id: "further-reading", label: "Further Reading" },
  { id: "revision-notes", label: "Revision Notes" },
  { id: "prerequisite-next-lesson", label: "Bridge to Next Lesson" },
  { id: "glossary", label: "Glossary" },
  { id: "learning-outcome", label: "Learning Outcome" },
];

export const PRACTICAL_COMPONENT_OPTIONS = [
  "Coding Labs", "Google Colab", "Jupyter Notebook", "Assignments", "Projects",
  "Mini Projects", "Major Projects", "Research Paper", "Literature Review",
  "Case Studies", "Interactive Exercises", "Hackathon Challenges", "Industry Tasks",
  "Peer Review", "Datasets", "Downloads", "External References", "Capstone Project",
  "Checkpoint Exams", "Mini Challenges", "Debugging Exercises", "Reflection Activities",
  "Portfolio Project", "Formula Sheets", "Cheat Sheets", "Real-world Examples",
];

export const ASSESSMENT_STYLE_OPTIONS = [
  "Quiz after every lesson",
  "Quiz after every module",
  "Assignments only",
  "Coding Challenges",
  "Projects",
  "Capstone",
  "Final Examination",
  "Research Submission",
  "Presentation",
  "Peer Review",
  "Certificate Assessment",
  "Mixed assessment strategy",
];

export const ASSESSMENT_METHOD_OPTIONS = [
  "Quizzes", "Assignments", "Coding Challenges", "Projects", "Capstone",
  "Final Exam", "Research Submission", "Presentation", "Peer Review", "Certificate Assessment",
];

export const STUDENT_BACKGROUND_OPTIONS = [
  "No programming experience",
  "Knows Python basics",
  "Knows Java / C++",
  "Knows ML & Data Science basics",
  "Strong Calculus & Linear Algebra",
  "No Advanced Mathematics background",
  "Experienced Software Developer",
  "College / Graduate Student",
];

export const LEARNING_GOAL_OPTIONS = [
  { id: "get-job", label: "Get a Job / Career Switch", desc: "Industry-aligned skills & portfolio" },
  { id: "exam", label: "Pass University Exam / Academic", desc: "Theory-heavy with academic rigor" },
  { id: "interview", label: "Crack Technical Interviews", desc: "Problem solving, DSA & system design" },
  { id: "research", label: "Conduct Academic Research", desc: "Literature review, papers & methodology" },
  { id: "projects", label: "Build Real-World Projects", desc: "Hands-on implementation & deployment" },
  { id: "industry-ready", label: "Become Industry Ready", desc: "Best practices, architecture & tools" },
  { id: "mastery", label: "Master the Subject", desc: "Deep conceptual and mathematical foundation" },
];

export const PREFERRED_LANGUAGE_OPTIONS = [
  "Python", "Java", "C++", "SQL", "JavaScript", "TypeScript", "R", "MATLAB", "None (Language Agnostic)"
];

export const CONTENT_DEPTH_OPTIONS = [
  { id: "overview" as const, label: "Overview / Concise", detail: "Short, crisp introductions and summaries" },
  { id: "comprehensive" as const, label: "Standard / Comprehensive", detail: "Balanced explanations with examples" },
  { id: "deep-dive" as const, label: "Deep Dive / University Level", detail: "In-depth derivations, 800+ words per lesson" },
  { id: "exhaustive" as const, label: "Exhaustive / Master Class", detail: "Textbook-chapter style, case studies, 1500+ words" },
];

export const COURSE_TYPE_OPTIONS = [
  { id: "bootcamp", label: "Bootcamp" },
  { id: "professional", label: "Professional" },
  { id: "university", label: "University" },
  { id: "certification", label: "Certification" },
  { id: "research", label: "Research" },
  { id: "workshop", label: "Workshop" },
];

export const PROGRESSION_OPTIONS = [
  { id: "fundamentals-core-hands-on-projects-industry-advanced-capstone", label: "Fundamentals → Core → Hands-on → Projects → Industry → Advanced → Capstone" },
  { id: "easy-moderate-advanced", label: "Easy → Moderate → Advanced" },
  { id: "theory-practice-projects", label: "Theory → Practice → Projects" },
  { id: "research-implementation-publication", label: "Research → Implementation → Publication" },
  { id: "beginner-intermediate-advanced", label: "Beginner → Intermediate → Advanced" },
  { id: "project-based", label: "Project Based" },
  { id: "certification-focused", label: "Certification Focused" },
];

export const LEARNING_COMPONENT_OPTIONS = [
  "Video Lessons", "PDF Notes", "Coding Labs", "Google Colab", "Jupyter Notebook",
  "Assignments", "Projects", "Research Papers", "Interactive Exercises", "Quizzes",
  "Mid Exam", "Final Exam", "Flashcards", "Cheat Sheets", "FAQs", "Interview Questions",
  "Industry Tips", "Case Studies", "Real-world Examples", "Datasets", "Downloads",
  "Glossary", "References", "Certificate", "Discussion Topics", "Capstone Project",
];

export const VIDEO_STRATEGY_OPTIONS = [
  { id: "local-uploads", label: "Upload Local Videos" },
  { id: "youtube-urls", label: "Use YouTube URLs" },
  { id: "both", label: "Both Local and YouTube" },
  { id: "add-later", label: "Add Later" },
] as const;

export const VIDEO_PLACEMENT_OPTIONS = [
  { id: "ai-auto", label: "AI decides automatically", desc: "Distribute videos across lessons intelligently" },
  { id: "one-per-lesson", label: "One video per lesson", desc: "Assign each video to the next lesson in order" },
  { id: "one-per-module", label: "One video per module", desc: "Place one video at the start of each module" },
  { id: "intro-only", label: "Intro videos only", desc: "First lesson of each module" },
  { id: "demo-only", label: "Demo videos only", desc: "Lessons with demo/walkthrough titles" },
  { id: "practical-only", label: "Practical videos only", desc: "Lab and hands-on lessons" },
] as const;

export const UPLOAD_VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,video/x-m4v,.mp4,.webm,.mov,.avi,.mkv,.m4v";

export const RESEARCH_DEPTH_OPTIONS = [
  { id: "basic", label: "Basic", desc: "Foundational overview" },
  { id: "professional", label: "Professional", desc: "Industry-standard depth" },
  { id: "university", label: "University", desc: "Academic rigor (MIT, Stanford)" },
  { id: "industry", label: "Industry", desc: "Production workflows" },
  { id: "research", label: "Research", desc: "Peer-reviewed sources" },
  { id: "phd", label: "PhD", desc: "Advanced research level" },
  { id: "expert", label: "Expert", desc: "Cutting-edge mastery" },
];

export const GENERATION_STAGES = [
  "Understanding your approved curriculum…",
  "Designing pedagogy for each lesson…",
  "Writing lesson content with the AI providers…",
  "Validating structure and learning progression…",
  "Building the LaTeX / Academic Studio project…",
  "Creating quizzes and assessments…",
  "Creating labs and practical components…",
  "Syncing videos and media assets…",
  "Running quality checks…",
  "Saving your draft course…",
  "Opening Academic Authoring Studio…",
];

export const DEFAULT_LESSON_STRUCTURE: LessonStructureId[] = [
  "learning-objectives", "real-world-analogy", "theory", "concept-explanation",
  "code-example", "common-mistakes", "best-practices", "industry-notes",
  "summary", "key-takeaways", "mini-quiz", "references", "revision-notes", "glossary", "learning-outcome",
];

export function createDefaultInterview(productType: ProductType): AICourseArchitectInterview {
  return {
    productType,
    courseInfo: {
      title: "",
      subtitle: "",
      subject: "",
      targetAudience: "",
      prerequisites: [],
      industry: "",
      learningGoals: [],
      expectedOutcomes: [],
      estimatedDuration: "40 hours",
      estimatedHours: 40,
      difficulty: "intermediate",
      certificationEligible: false,
      language: "en",
      academicLevel: "intermediate",
      courseType: "professional",
    },
    courseScale: { id: "standard" },
    difficultyDistribution: { mode: "percentages", beginnerPercent: 20, intermediatePercent: 50, advancedPercent: 30 },
    learningStyle: ["balanced"],
    teachingStyle: ["professional"],
    lessonStructure: [...DEFAULT_LESSON_STRUCTURE],
    practicalComponents: ["Coding Labs", "Projects", "Quizzes"],
    assessmentStrategy: { style: "Quiz after every module", methods: ["Quizzes", "Projects", "Capstone"] },
    curriculumStrategy: { progression: ["beginner-intermediate-advanced"], aiDecidesCurriculum: true },
    learningComponents: ["Video Lessons", "PDF Notes", "Coding Labs", "Quizzes", "Projects", "References"],
    videoStrategy: { includeVideos: false, method: "add-later", placement: "ai-auto", mappings: [] },
    studentBackground: ["Knows Python basics"],
    learningGoalType: "get-job",
    preferredLanguages: ["Python"],
    contentDepthPreference: "deep-dive",
    researchDepth: "professional",
  };
}

export function buildDifficultyPreview(interview: AICourseArchitectInterview, totalLessons = 30): DifficultyTier[] {
  const dist = interview.difficultyDistribution;
  if (dist.mode === "ai-decides") {
    return Array.from({ length: totalLessons }, (_, i) => {
      const p = i / Math.max(totalLessons - 1, 1);
      if (p < 0.2) return "beginner";
      if (p < 0.7) return "intermediate";
      return "advanced";
    });
  }
  if (dist.mode === "unit-counts") {
    const b = dist.easyUnits ?? 10;
    const m = dist.mediumUnits ?? 15;
    const a = dist.advancedUnits ?? 5;
    return [
      ...Array(b).fill("beginner" as DifficultyTier),
      ...Array(m).fill("intermediate" as DifficultyTier),
      ...Array(a).fill("advanced" as DifficultyTier),
    ];
  }
  const b = dist.beginnerPercent ?? 20;
  const m = dist.intermediatePercent ?? 50;
  const bCount = Math.round((totalLessons * b) / 100);
  const mCount = Math.round((totalLessons * m) / 100);
  const aCount = totalLessons - bCount - mCount;
  return [
    ...Array(bCount).fill("beginner" as DifficultyTier),
    ...Array(mCount).fill("intermediate" as DifficultyTier),
    ...Array(Math.max(0, aCount)).fill("advanced" as DifficultyTier),
  ];
}

export { isValidYouTubeUrl, normalizeYouTubeWatchUrl } from "@/lib/videoSourceUtils";
