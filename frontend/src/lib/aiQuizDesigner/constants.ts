export const SUBJECTS = [
  "Computer Science",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "History",
  "Custom",
] as const;

export const EDUCATION_LEVELS = [
  "School",
  "PUC",
  "Diploma",
  "Engineering",
  "University",
  "Corporate Training",
  "Placement Preparation",
  "Certification",
  "Interview",
  "Custom",
] as const;

export const PURPOSES = [
  "Practice",
  "Live Quiz",
  "Homework",
  "Assignment",
  "Mock Test",
  "Exam",
  "Revision",
  "Coding Contest",
  "Poll",
  "Icebreaker",
] as const;

export const CONTENT_SOURCES = [
  { id: "topic", label: "Create from topic" },
  { id: "pdf", label: "Upload PDF" },
  { id: "docx", label: "Upload DOCX" },
  { id: "pptx", label: "Upload PPT" },
  { id: "image", label: "Upload Image" },
  { id: "notes", label: "Upload Notes" },
  { id: "syllabus", label: "Upload Syllabus" },
  { id: "text", label: "Paste Text" },
  { id: "website", label: "Paste Website URL" },
  { id: "youtube", label: "Paste YouTube Link" },
  { id: "google_docs", label: "Import from Google Drive" },
  { id: "markdown", label: "Import from Notion" },
] as const;

export const QUESTION_TYPES = [
  { id: "multiple_choice", label: "MCQ" },
  { id: "multiple_select", label: "Multiple Select" },
  { id: "true_false", label: "True / False" },
  { id: "fill_blank", label: "Fill Blank" },
  { id: "short_answer", label: "Short Answer" },
  { id: "essay", label: "Essay" },
  { id: "matching", label: "Matching" },
  { id: "ordering", label: "Ordering" },
  { id: "hotspot", label: "Hotspot" },
  { id: "numerical", label: "Numerical" },
  { id: "poll", label: "Poll" },
  { id: "matrix", label: "Matrix" },
  { id: "coding", label: "Coding" },
] as const;

export const BLOOM_LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;

export const QUIZ_BEHAVIORS = [
  "Self-paced Live",
  "Instructor-paced Live",
  "Homework",
  "Practice",
  "Assignment",
  "Mock Test",
] as const;

export const GENERATION_STAGES = [
  "Understanding subject…",
  "Finding learning objectives…",
  "Building blueprint…",
  "Generating questions…",
  "Checking duplicates…",
  "Generating explanations…",
  "Generating images…",
  "Optimizing difficulty…",
  "Final review…",
] as const;

export const WIZARD_STEP_LABELS = [
  "What to create",
  "Content source",
  "AI understanding",
  "Question mix",
  "Difficulty",
  "Bloom's taxonomy",
  "AI content",
  "Media",
  "Behavior",
  "Rules",
  "Review plan",
  "Generate",
  "Overview",
  "Edit questions",
  "Save",
  "Open builder",
] as const;
