/**
 * Learning Universe structured schema (mirrors backend learningUniverseSchema.ts).
 * Single contract for Visual + Academic authoring output.
 */

export interface LuContentBlock {
  type: string;
  content: Record<string, unknown> | string;
}

export interface LuVideo {
  type: string;
  url: string;
  file?: string;
  title?: string;
}

export interface LuPractice {
  title: string;
  language: string;
  initialCode: string;
  expectedOutput?: string;
  solution?: string;
  hints?: string[];
}

export interface LuQuizOption {
  text: string;
  isCorrect: boolean;
}

export interface LuQuizQuestion {
  text: string;
  type?: string;
  explanation?: string;
  difficulty?: string;
  points?: number;
  options: LuQuizOption[];
}

export interface LuQuiz {
  title?: string;
  questions: LuQuizQuestion[];
}

export interface LuProject {
  title: string;
  description: string;
  difficulty?: string;
  instructions: string;
  expectedOutput?: string;
  colabUrl?: string;
  githubUrl?: string;
  submissionType?: string;
}

export interface LuResource {
  type: string;
  title: string;
  url?: string;
  fileUrl?: string;
}

export interface LuLesson {
  title: string;
  description?: string;
  estimatedMinutes?: number;
  learningOutcomes?: string;
  overviewMarkdown?: string;
  contentBlocks: LuContentBlock[];
  videos: LuVideo[];
  practice?: LuPractice;
  quiz?: LuQuiz;
  project?: LuProject;
  resources: LuResource[];
}

export interface LuModule {
  title: string;
  description: string;
  prerequisites?: string;
  learningOutcomes?: string;
  estimatedHours?: number;
  lessons: LuLesson[];
}

export interface LuTrack {
  title: string;
  description: string;
  learningOutcomes?: string;
  careerOutcomes?: string;
  difficulty?: string;
  modules: LuModule[];
}

export interface LuUniverseMeta {
  title: string;
  description: string;
  thumbnail?: string;
  difficulty?: string;
  estimatedHours?: number;
  skills?: string[];
}

export interface LearningUniverseStructured {
  universe: LuUniverseMeta;
  tracks: LuTrack[];
  warnings?: string[];
  sourceProjectId?: string;
  authoringMode?: "latex" | "visual";
  completionRules?: string[];
}

export const CONTENT_BLOCK_TYPES = [
  "document",
  "overview", "theory", "note", "tip", "warning", "summary", "keypoints",
  "image", "codeexample", "video", "practice", "quiz", "project", "assignment",
  "resource", "download", "checkpoint", "discussion", "certificatecriteria", "finalexam",
] as const;

export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

export const BLOCK_LABELS: Record<ContentBlockType, string> = {
  document: "Lesson Content",
  overview: "Overview",
  theory: "Theory / Main Topic",
  note: "Note",
  tip: "Tip",
  warning: "Warning",
  summary: "Summary",
  keypoints: "Key Points",
  image: "Image",
  codeexample: "Code Example",
  video: "Video",
  practice: "Try It Yourself",
  quiz: "Quiz",
  project: "Project",
  assignment: "Assignment",
  resource: "Resource",
  download: "Download",
  checkpoint: "Checkpoint",
  discussion: "Discussion",
  certificatecriteria: "Certificate Criteria",
  finalexam: "Final Exam",
};

export function createEmptyLesson(title = "New Lesson"): LuLesson {
  return { title, overviewMarkdown: "", contentBlocks: [], videos: [], resources: [] };
}

export function createEmptyBlock(type: ContentBlockType): LuContentBlock {
  switch (type) {
    case "document": return { type, content: { title: "Lesson", nodes: [] } };
    case "overview": return { type, content: "" };
    case "theory": return { type, content: { title: "Theory", body: "" } };
    case "note": return { type, content: { text: "" } };
    case "tip": return { type, content: { text: "" } };
    case "warning": return { type, content: { text: "" } };
    case "summary": return { type, content: { text: "" } };
    case "keypoints": return { type, content: { text: "" } };
    case "image": return { type, content: { file: "", caption: "", alt: "" } };
    case "video": return { type, content: { type: "youtube", url: "", title: "" } };
    case "codeexample": return { type, content: { language: "python", code: "", output: "" } };
    case "practice": return { type, content: { title: "Try It Yourself", language: "python", initialCode: "", expectedOutput: "", solution: "" } };
    case "quiz": return { type, content: { title: "Quiz", questions: [{ text: "", type: "single", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }], explanation: "" }] } };
    case "project": return { type, content: { title: "Project", description: "", instructions: "", colabUrl: "", githubUrl: "" } };
    case "assignment": return { type, content: { title: "Assignment", instructions: "", points: "100" } };
    case "resource": return { type, content: { type: "website", title: "Resource", url: "" } };
    case "download": return { type, content: { title: "Download", url: "" } };
    case "checkpoint": return { type, content: { title: "Checkpoint complete" } };
    case "discussion": return { type, content: { prompt: "" } };
    case "certificatecriteria": return { type, content: "Complete all lessons to earn your certificate." };
    case "finalexam": return { type, content: { title: "Final Exam", duration: "60 minutes", description: "" } };
    default: return { type, content: {} };
  }
}
