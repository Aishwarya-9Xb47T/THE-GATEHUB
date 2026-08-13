export interface AuthoringPackage {
  courseDetails: {
    title: string;
    subtitle: string;
    description: string;
    courseSummary: string;
    targetAudience: string[];
    prerequisites: string[];
    learningOutcomes: string[];
    estimatedDuration: string;
    suggestedPrice: number;
    difficulty: "beginner" | "intermediate" | "advanced";
    category: string;
    subcategory: string;
    language: string;
    seoDescription: string;
    seoKeywords: string[];
    thumbnailPrompt: string;
  };
  curriculum: Array<{
    title: string;
    description: string;
    lessons: Array<{ title: string; learningObjective: string; summary: string }>;
    moduleQuiz?: { title: string; questions: unknown[] };
  }>;
  assessments: Record<string, unknown>;
  projects: Record<string, unknown>;
  resources: Record<string, unknown>;
}
