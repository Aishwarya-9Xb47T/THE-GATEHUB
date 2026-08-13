export interface QuizTemplateSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverGradient: string | null;
  coverImageUrl: string | null;
  category: string;
  subject: string | null;
  gradeLevel: string | null;
  difficulty: string;
  tags: string[];
  questionCount: number;
  durationMinutes: number | null;
  questionTypes: string[];
  visibility: string;
  source: string;
  status: string;
  isFeatured: boolean;
  isOfficial: boolean;
  version: number;
  authorName: string | null;
  learningObjectives: string[];
  supportsHomework: boolean;
  supportsLive: boolean;
  supportsAi: boolean;
  supportsMedia: boolean;
  language: string;
  ratingAvg: number;
  ratingCount: number;
  useCount: number;
  bookmarkCount: number;
  favorited: boolean;
  updatedAt: string;
  publishedAt: string | null;
}

export interface QuizTemplateDetail extends QuizTemplateSummary {
  quizSnapshot?: unknown;
  sessionSettings?: unknown;
  versions?: Array<{ version: number; changelog: string | null; createdAt: string }>;
}

export interface TemplateListResponse {
  items: QuizTemplateSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  categories: Array<{ name: string; count: number }>;
  featured: QuizTemplateSummary[];
  recentlyUsed: QuizTemplateSummary[];
}

export type TemplateSection =
  | "all"
  | "featured"
  | "popular"
  | "recommended"
  | "trending"
  | "new"
  | "my"
  | "official"
  | "recent";

export interface TemplateFilters {
  difficulty?: string;
  sort?: "newest" | "popular" | "rating" | "trending";
  language?: string;
  supportsHomework?: boolean;
  supportsLive?: boolean;
  supportsAi?: boolean;
  supportsMedia?: boolean;
}

export const TEMPLATE_CATEGORY_CHIPS = [
  "Midterm",
  "Final Exam",
  "Weekly Quiz",
  "Coding",
  "Programming",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "AI",
  "Data Structures",
  "Aptitude",
  "Placement",
  "Interview",
  "General Knowledge",
  "Languages",
  "Computer Science",
  "University",
  "School",
  "Corporate",
  "Training",
  "Certification",
] as const;

export const TEMPLATE_SECTIONS: Array<{ id: TemplateSection; label: string }> = [
  { id: "all", label: "All Templates" },
  { id: "featured", label: "Featured" },
  { id: "popular", label: "Popular" },
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "recent", label: "Recently Used" },
  { id: "my", label: "My Templates" },
  { id: "official", label: "Official" },
];
