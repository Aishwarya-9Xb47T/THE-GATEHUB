import type { AiSourceType } from "./types";

export const AI_SOURCES: Array<{
  id: AiSourceType;
  label: string;
  description: string;
  icon: string;
  enabled: boolean;
}> = [
  { id: "topic", label: "Topic", description: "Describe a subject — AI builds the full quiz", icon: "sparkles", enabled: true },
  { id: "text", label: "Plain Text", description: "Paste syllabus, notes, or question lists", icon: "text", enabled: true },
  { id: "pdf", label: "PDF", description: "Upload lecture notes, papers, or exams", icon: "pdf", enabled: true },
  { id: "docx", label: "Word DOCX", description: "Import from Word documents", icon: "docx", enabled: true },
  { id: "pptx", label: "PowerPoint", description: "Generate from slide decks", icon: "pptx", enabled: true },
  { id: "website", label: "Website", description: "Extract from any public webpage", icon: "globe", enabled: true },
  { id: "youtube", label: "YouTube", description: "Create questions from video transcripts", icon: "youtube", enabled: true },
  { id: "markdown", label: "Markdown", description: "Upload .md course materials", icon: "md", enabled: true },
  { id: "google_docs", label: "Google Docs", description: "Link to a Google Doc", icon: "gdocs", enabled: true },
  { id: "syllabus", label: "Syllabus", description: "Paste or upload a course syllabus", icon: "syllabus", enabled: true },
  { id: "notes", label: "Lecture Notes", description: "Paste lecture content", icon: "notes", enabled: true },
  { id: "image", label: "Images (OCR)", description: "Scan whiteboards or textbook pages", icon: "image", enabled: true },
  { id: "question_bank", label: "Question Bank", description: "Expand from your existing bank", icon: "bank", enabled: false },
  { id: "previous_quiz", label: "Previous Quiz", description: "Generate variations from an existing quiz", icon: "quiz", enabled: false },
  { id: "course", label: "Course Material", description: "Pull from a GATEHUB course", icon: "course", enabled: false },
  { id: "research_paper", label: "Research Paper", description: "Upload academic papers", icon: "paper", enabled: false },
];

export const QUICK_ACTIONS = AI_SOURCES.filter((s) => s.enabled).slice(0, 12);

export const SMART_PROMPTS = [
  "Generate Operating Systems Semester Quiz",
  "Generate Java Placement Assessment",
  "Generate Python Interview Test",
  "Generate DBMS Midterm",
  "Generate Computer Networks Final Exam",
  "Generate C Programming Practical Quiz",
  "Generate AI Multiple Choice Test",
  "Generate SQL Coding Assessment",
  "Generate Cloud Computing Certification Quiz",
  "Generate Cyber Security Practice Test",
];

export const QUESTION_TYPE_OPTIONS = [
  { id: "mixed", label: "Mixed" },
  { id: "multiple_choice", label: "MCQ" },
  { id: "multiple_select", label: "Multiple Select" },
  { id: "true_false", label: "True / False" },
  { id: "fill_blank", label: "Fill Blank" },
  { id: "essay", label: "Essay" },
  { id: "coding", label: "Coding" },
  { id: "case_study", label: "Case Study" },
  { id: "scenario", label: "Scenario" },
  { id: "numerical", label: "Numerical" },
  { id: "matching", label: "Matching" },
  { id: "ordering", label: "Ordering" },
];

export const DIFFICULTY_OPTIONS = ["very_easy", "easy", "medium", "hard", "expert", "adaptive"];
export const BLOOM_OPTIONS = ["remember", "understand", "apply", "analyze", "evaluate", "create", "balanced"];
export const TONE_OPTIONS = ["academic", "placement", "interview", "corporate", "certification", "school", "university"];
export const EXAM_TYPES = ["quiz", "midterm", "final", "practice", "certification", "placement", "homework"];
export const AUDIENCE_OPTIONS = ["school", "college", "university", "corporate", "certification"];
export const COUNT_PRESETS = [5, 10, 15, 20, 30, 50];

export const GENERATION_STAGES = [
  "Reading uploaded material…",
  "Understanding concepts…",
  "Identifying learning outcomes…",
  "Extracting important topics…",
  "Balancing difficulty…",
  "Writing questions…",
  "Generating distractors…",
  "Validating answers…",
  "Generating explanations…",
  "Quality assurance…",
  "Final optimization…",
];

export const DEFAULT_CONFIG = {
  quizName: "",
  questionCount: 10,
  questionTypes: ["mixed"],
  difficulty: "medium",
  bloomLevel: "balanced",
  tone: "academic",
  examType: "quiz",
  targetAudience: "university",
  language: "en",
  generateExplanations: true,
  generateHints: true,
  generateTags: true,
  shuffleQuestions: false,
  shuffleOptions: true,
  negativeMarking: false,
  difficultyMix: { easy: 20, medium: 30, hard: 30, expert: 20 },
};
