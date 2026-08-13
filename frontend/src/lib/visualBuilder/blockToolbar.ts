import type { ContentBlockType, LuContentBlock } from "@/lib/learningUniverseSchema";
import { createEmptyBlock } from "@/lib/learningUniverseSchema";

export interface BlockToolbarItem {
  id: string;
  label: string;
  type: ContentBlockType;
  preset?: Record<string, unknown> | string;
}

export interface BlockToolbarGroup {
  label: string;
  items: BlockToolbarItem[];
}

export const BLOCK_TOOLBAR_GROUPS: BlockToolbarGroup[] = [
  {
    label: "Text & Structure",
    items: [
      { id: "heading", label: "Heading", type: "theory", preset: { title: "Heading", body: "" } },
      { id: "main-topic", label: "Main Topic", type: "theory", preset: { title: "Main Topic", body: "" } },
      { id: "sub-topic", label: "Sub Topic", type: "theory", preset: { title: "Sub Topic", body: "" } },
      { id: "sub-sub-topic", label: "Sub Sub Topic", type: "theory", preset: { title: "Sub Sub Topic", body: "" } },
      { id: "paragraph", label: "Paragraph", type: "overview", preset: "" },
      { id: "markdown", label: "Markdown", type: "overview", preset: "" },
      { id: "note", label: "Note", type: "note" },
      { id: "tip", label: "Tip", type: "tip" },
      { id: "warning", label: "Warning", type: "warning" },
      { id: "keypoints", label: "Key Points", type: "keypoints" },
      { id: "summary", label: "Summary", type: "summary" },
    ],
  },
  {
    label: "Media",
    items: [
      { id: "image", label: "Image", type: "image" },
      { id: "video-upload", label: "Video Upload", type: "video", preset: { type: "upload", url: "", file: "", title: "" } },
      { id: "youtube", label: "YouTube Video", type: "video", preset: { type: "youtube", url: "", title: "" } },
      { id: "pdf", label: "PDF", type: "download", preset: { title: "PDF Document", url: "", file: "" } },
    ],
  },
  {
    label: "Interactive",
    items: [
      { id: "codeexample", label: "Code Example", type: "codeexample" },
      { id: "practice", label: "Try It Yourself", type: "practice" },
      { id: "quiz", label: "Quiz", type: "quiz" },
      { id: "discussion", label: "Discussion", type: "discussion" },
    ],
  },
  {
    label: "Resources & Assessment",
    items: [
      { id: "resource", label: "Resource", type: "resource" },
      { id: "download", label: "Download", type: "download" },
      { id: "checkpoint", label: "Checkpoint", type: "checkpoint" },
      { id: "assignment", label: "Assignment", type: "assignment" },
      { id: "finalexam", label: "Final Exam", type: "finalexam" },
    ],
  },
  {
    label: "Projects",
    items: [
      { id: "project", label: "Project", type: "project" },
      { id: "colab", label: "Colab Project", type: "project", preset: { title: "Colab Project", description: "", instructions: "", colabUrl: "", submissionType: "colab" } },
      { id: "github", label: "GitHub Project", type: "project", preset: { title: "GitHub Project", description: "", instructions: "", githubUrl: "", submissionType: "github" } },
    ],
  },
  {
    label: "Certificate",
    items: [
      { id: "certificatecriteria", label: "Certificate Criteria", type: "certificatecriteria" },
    ],
  },
];

export function createBlockFromToolbarItem(item: BlockToolbarItem): LuContentBlock {
  const block = createEmptyBlock(item.type);
  if (item.preset !== undefined) {
    block.content = typeof item.preset === "string"
      ? item.preset
      : { ...(typeof block.content === "object" && block.content ? block.content as Record<string, unknown> : {}), ...item.preset };
  }
  return block;
}

export const CODE_LANGUAGES = [
  "python", "java", "javascript", "typescript", "c", "cpp", "csharp", "go", "rust", "sql", "html", "css",
] as const;

export const PRACTICE_LANGUAGES = [
  "python", "javascript", "html", "css", "sql", "java", "c", "cpp", "csharp", "go",
] as const;

export const QUIZ_QUESTION_TYPES = [
  { value: "single", label: "Single Choice" },
  { value: "multiple", label: "Multiple Choice" },
  { value: "true_false", label: "True/False" },
  { value: "fill_blank", label: "Fill in the Blank" },
  { value: "code_output", label: "Code Output" },
  { value: "ordering", label: "Ordering" },
] as const;

export const PROJECT_SUBMISSION_TYPES = [
  { value: "github", label: "GitHub Repository" },
  { value: "colab", label: "Google Colab" },
  { value: "zip", label: "ZIP Upload" },
  { value: "pdf", label: "PDF Upload" },
  { value: "text", label: "Text Submission" },
] as const;
