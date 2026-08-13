/**
 * Rich question metadata schema (Module 04).
 * Structured fields live on AssessQuestion columns; extended payload in metadata JSON.
 */

export const QUESTION_STATUSES = ["draft", "review", "published", "archived"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const QUESTION_VISIBILITIES = [
  "private",
  "department",
  "organization",
  "shared",
  "public",
] as const;
export type QuestionVisibility = (typeof QUESTION_VISIBILITIES)[number];

export const QUESTION_PERMISSION_MODES = [
  "owner_only",
  "department_read",
  "org_read",
  "public_read",
  "fork_allowed",
  "approval_required",
] as const;
export type QuestionPermissionMode = (typeof QUESTION_PERMISSION_MODES)[number];

export const QUESTION_RELATION_TYPES = [
  "parent",
  "follow_up",
  "case_study_passage",
  "case_study_item",
  "coding_subtask",
  "linked",
  "passage",
] as const;
export type QuestionRelationType = (typeof QUESTION_RELATION_TYPES)[number];

export const COLLECTION_KINDS = [
  "folder",
  "favorites",
  "placement_set",
  "department_bank",
  "organization_bank",
  "public_bank",
  "shared_bank",
] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

/** Extended metadata stored in AssessQuestion.metadata JSON */
export interface QuestionExtendedMetadata {
  academic?: {
    aptitudeCategory?: string;
    interviewRound?: string;
    dsaTopic?: string;
  };
  ai?: {
    prompt?: string;
    difficultyPrediction?: string;
    bloomPrediction?: string;
    explanationGenerated?: boolean;
  };
  scoring?: {
    partialCredit?: boolean;
    rubricId?: string;
  };
  import?: {
    source?: string;
    sourceId?: string;
    importedAt?: string;
  };
}

export interface QuestionChoiceInput {
  id?: string;
  text: string;
  isCorrect?: boolean;
  order?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateQuestionInput {
  typeSlug: string;
  stem: string;
  explanation?: string | null;
  hints?: string[];
  difficulty?: string;
  bloomLevel?: string;
  estimatedSecs?: number;
  marks?: number;
  negativeMarks?: number;
  subject?: string;
  courseId?: string;
  unit?: string;
  chapter?: string;
  topic?: string;
  subtopic?: string;
  learningOutcome?: string;
  tags?: string[];
  concepts?: string[];
  keywords?: string[];
  aliases?: string[];
  placementTags?: string[];
  companyTags?: string[];
  skillTags?: string[];
  visibility?: QuestionVisibility;
  permissionMode?: QuestionPermissionMode;
  language?: string;
  organizationId?: string;
  departmentId?: string;
  metadata?: QuestionExtendedMetadata;
  choices?: QuestionChoiceInput[];
  aiGenerated?: boolean;
  aiConfidence?: number;
  aiHistoryId?: string;
}

export interface UpdateQuestionInput extends Partial<CreateQuestionInput> {
  status?: QuestionStatus;
}

export interface QuestionSearchFilters {
  q?: string;
  typeSlug?: string;
  subject?: string;
  topic?: string;
  difficulty?: string;
  bloomLevel?: string;
  tags?: string[];
  companyTags?: string[];
  skillTags?: string[];
  visibility?: string;
  status?: string;
  authorId?: string;
  aiGenerated?: boolean;
  hasMedia?: boolean;
  language?: string;
  collectionId?: string;
  minHealthScore?: number;
}

export function buildSearchText(input: {
  stem: string;
  subject?: string | null;
  topic?: string | null;
  tags?: unknown;
  keywords?: unknown;
  aliases?: unknown;
}): string {
  const parts = [
    input.stem,
    input.subject,
    input.topic,
    ...(Array.isArray(input.tags) ? (input.tags as string[]) : []),
    ...(Array.isArray(input.keywords) ? (input.keywords as string[]) : []),
    ...(Array.isArray(input.aliases) ? (input.aliases as string[]) : []),
  ].filter(Boolean);
  return parts.join(" ").slice(0, 8000);
}
