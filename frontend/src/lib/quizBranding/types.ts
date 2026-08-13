import type { BannerType } from "@/lib/courseBranding/types";
import type { QuizCreationMethod } from "@/components/quiz-room/wizard/CreateMethodStep";

export const QUIZ_THEME_OPTIONS = [
  { id: "light", label: "Light", preview: "bg-white text-slate-900" },
  { id: "dark", label: "Dark", preview: "bg-slate-900 text-white" },
  { id: "premium-gold", label: "Premium Gold", preview: "bg-gradient-to-br from-amber-900 to-slate-900 text-amber-100" },
  { id: "blue", label: "Blue", preview: "bg-gradient-to-br from-blue-900 to-slate-900 text-blue-100" },
  { id: "purple", label: "Purple", preview: "bg-gradient-to-br from-purple-900 to-slate-900 text-purple-100" },
  { id: "green", label: "Green", preview: "bg-gradient-to-br from-emerald-900 to-slate-900 text-emerald-100" },
  { id: "corporate", label: "Corporate", preview: "bg-gradient-to-br from-slate-800 to-slate-950 text-slate-100" },
  { id: "minimal", label: "Minimal", preview: "bg-neutral-100 text-neutral-900" },
  { id: "glass", label: "Glass", preview: "bg-white/10 backdrop-blur text-white" },
] as const;

export const QUIZ_ACCENT_OPTIONS = [
  { id: "golden", label: "Golden", color: "#f59e0b" },
  { id: "blue", label: "Blue", color: "#3b82f6" },
  { id: "green", label: "Green", color: "#22c55e" },
  { id: "purple", label: "Purple", color: "#a855f7" },
  { id: "red", label: "Red", color: "#ef4444" },
  { id: "orange", label: "Orange", color: "#f97316" },
  { id: "custom", label: "Custom", color: "#6366f1" },
] as const;

export const QUIZ_ICON_OPTIONS = [
  { id: "book", label: "Book", emoji: "📚" },
  { id: "graduation", label: "Graduation", emoji: "🎓" },
  { id: "code", label: "Code", emoji: "💻" },
  { id: "atom", label: "Atom", emoji: "⚛️" },
  { id: "brain", label: "Brain", emoji: "🧠" },
  { id: "calculator", label: "Calculator", emoji: "🔢" },
  { id: "laptop", label: "Laptop", emoji: "🖥️" },
  { id: "ai", label: "AI", emoji: "✨" },
  { id: "medical", label: "Medical", emoji: "🏥" },
  { id: "business", label: "Business", emoji: "💼" },
  { id: "custom", label: "Custom", emoji: "🎯" },
] as const;

export type QuizThemeId = (typeof QUIZ_THEME_OPTIONS)[number]["id"];
export type QuizAccentId = (typeof QUIZ_ACCENT_OPTIONS)[number]["id"];
export type QuizIconId = (typeof QUIZ_ICON_OPTIONS)[number]["id"];
export type TemplateMergeMode = "merge" | "replace";

export interface QuizBrandingData {
  bannerUrl: string;
  thumbnailUrl: string;
  bannerType: BannerType;
  bannerId?: string;
  selectedTemplateId?: string;
  selectedSourceId?: string;
  theme: QuizThemeId;
  accentColor: QuizAccentId;
  customAccent?: string;
  icon: QuizIconId;
  customIcon?: string;
}

export interface QuizDetailsData {
  title: string;
  description: string;
  subtitle: string;
  subject: string;
  category: string;
  tags: string[];
  visibility: string;
  language: string;
  estimatedMinutes: number;
  difficulty: string;
  passingScore: number;
}

export interface QuizIdentity extends QuizBrandingData, QuizDetailsData {}

export interface QuizWorkflowState {
  method: QuizCreationMethod;
  branding: QuizBrandingData;
  details: QuizDetailsData;
  draftQuizId?: string;
}

export const DEFAULT_QUIZ_BRANDING: QuizBrandingData = {
  bannerUrl: "",
  thumbnailUrl: "",
  bannerType: "template",
  theme: "dark",
  accentColor: "golden",
  icon: "book",
};

export const DEFAULT_QUIZ_DETAILS: QuizDetailsData = {
  title: "",
  description: "",
  subtitle: "",
  subject: "",
  category: "",
  tags: [],
  visibility: "private",
  language: "en",
  estimatedMinutes: 30,
  difficulty: "medium",
  passingScore: 60,
};

export function defaultQuizIdentity(): QuizIdentity {
  return { ...DEFAULT_QUIZ_BRANDING, ...DEFAULT_QUIZ_DETAILS };
}

const SESSION_KEY = "gatehub-quiz-workflow";

export function saveWorkflowSession(state: QuizWorkflowState) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
}

export function loadWorkflowSession(): QuizWorkflowState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearWorkflowSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function resolveAccentHex(b: Pick<QuizBrandingData, "accentColor" | "customAccent">): string {
  if (b.accentColor === "custom" && b.customAccent) return b.customAccent;
  return QUIZ_ACCENT_OPTIONS.find((o) => o.id === b.accentColor)?.color ?? "#f59e0b";
}

export function resolveIconEmoji(b: Pick<QuizBrandingData, "icon" | "customIcon">): string {
  if (b.icon === "custom" && b.customIcon) return b.customIcon;
  return QUIZ_ICON_OPTIONS.find((o) => o.id === b.icon)?.emoji ?? "📚";
}

export function themeToGradient(theme: QuizThemeId): string {
  const map: Record<QuizThemeId, string> = {
    light: "from-slate-200 via-slate-100 to-white",
    dark: "from-slate-900 via-slate-800 to-slate-950",
    "premium-gold": "from-amber-700 via-amber-600 to-yellow-500",
    blue: "from-blue-700 via-blue-600 to-cyan-500",
    purple: "from-purple-700 via-violet-600 to-fuchsia-500",
    green: "from-emerald-700 via-green-600 to-lime-500",
    corporate: "from-slate-700 via-slate-600 to-slate-800",
    minimal: "from-neutral-200 via-neutral-100 to-white",
    glass: "from-white/20 via-white/10 to-transparent",
  };
  return map[theme] ?? map.dark;
}

export function identityToMetadata(identity: QuizIdentity): Record<string, unknown> {
  return {
    identity: {
      theme: identity.theme,
      accentColor: identity.accentColor,
      customAccent: identity.customAccent,
      icon: identity.icon,
      customIcon: identity.customIcon,
      bannerType: identity.bannerType,
      bannerId: identity.bannerId,
      subtitle: identity.subtitle,
      category: identity.category,
      tags: identity.tags,
      language: identity.language,
      estimatedMinutes: identity.estimatedMinutes,
      difficulty: identity.difficulty,
    },
    coverImageUrl: identity.bannerUrl,
    coverGradient: themeToGradient(identity.theme),
    bannerUrl: identity.bannerUrl,
    thumbnailUrl: identity.thumbnailUrl,
    settings: {
      passingScore: identity.passingScore,
      shuffleQuestions: false,
      shuffleOptions: true,
      randomSubset: 0,
      timePerQuestion: 30,
      showExplanations: true,
      maxAttempts: 0,
      negativeMarking: false,
    },
    sections: [],
    version: 1,
  };
}

/** Hydrate branding + details from persisted quiz metadata. */
export function metadataToIdentity(
  metadata: Record<string, unknown> | null | undefined,
  quiz?: {
    title?: string | null;
    description?: string | null;
    subject?: string | null;
    visibility?: string | null;
    id?: string;
  }
): QuizIdentity {
  const meta = metadata || {};
  const nested = (meta.identity || {}) as Record<string, unknown>;
  const settings = (meta.settings || {}) as Record<string, unknown>;

  return {
    ...DEFAULT_QUIZ_BRANDING,
    bannerUrl: String(meta.bannerUrl || meta.coverImageUrl || ""),
    thumbnailUrl: String(meta.thumbnailUrl || ""),
    bannerType: (nested.bannerType as QuizBrandingData["bannerType"]) || DEFAULT_QUIZ_BRANDING.bannerType,
    bannerId: nested.bannerId as string | undefined,
    theme: (nested.theme as QuizThemeId) || DEFAULT_QUIZ_BRANDING.theme,
    accentColor: (nested.accentColor as QuizAccentId) || DEFAULT_QUIZ_BRANDING.accentColor,
    customAccent: nested.customAccent as string | undefined,
    icon: (nested.icon as QuizIconId) || DEFAULT_QUIZ_BRANDING.icon,
    customIcon: nested.customIcon as string | undefined,
    title: quiz?.title?.trim() || "",
    description: quiz?.description?.trim() || "",
    subtitle: String(nested.subtitle || ""),
    subject: quiz?.subject?.trim() || "",
    category: String(nested.category || ""),
    tags: Array.isArray(nested.tags) ? (nested.tags as string[]) : [],
    visibility: quiz?.visibility || "private",
    language: String(nested.language || "en"),
    estimatedMinutes: Number(nested.estimatedMinutes) || DEFAULT_QUIZ_DETAILS.estimatedMinutes,
    difficulty: String(nested.difficulty || DEFAULT_QUIZ_DETAILS.difficulty),
    passingScore: Number(settings.passingScore) || DEFAULT_QUIZ_DETAILS.passingScore,
  };
}

export function extractQuizBrandingFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  quizId?: string
): Pick<QuizBrandingData, "bannerUrl" | "thumbnailUrl" | "theme"> & {
  coverImageUrl: string | null;
  coverGradient: string;
} {
  const identity = metadataToIdentity(metadata);
  return {
    bannerUrl: identity.bannerUrl,
    thumbnailUrl: identity.thumbnailUrl,
    coverImageUrl: identity.bannerUrl || null,
    coverGradient: String((metadata || {}).coverGradient || themeToGradient(identity.theme)),
    theme: identity.theme,
  };
}

export const WORKFLOW_LABELS: Record<QuizCreationMethod, string> = {
  manual: "Create Manually",
  build_from_content: "Build from Content",
  ai: "AI Quiz Designer",
  duplicate: "Duplicate Quiz",
  templates: "Template Library",
  question_bank: "Question Bank",
  wayground: "Wayground",
};

