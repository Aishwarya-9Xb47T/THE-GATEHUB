import {
  CircleDot,
  CheckSquare,
  ToggleLeft,
  TextCursor,
  Hash,
  Link2,
  ListOrdered,
  BarChart3,
  AlignLeft,
  FileText,
  Image,
  Video,
  Mic,
  Target,
  Grid3x3,
  Code2,
  Bug,
  Terminal,
  Database,
  BookOpen,
  Layers,
  Upload,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface QuestionTypeDef {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: string;
}

export const QUESTION_TYPE_CATALOG: QuestionTypeDef[] = [
  { id: "multiple_choice", label: "Single Choice", description: "One correct answer", icon: CircleDot, category: "Assessment" },
  { id: "multiple_select", label: "Multiple Select", description: "Multiple correct answers", icon: CheckSquare, category: "Assessment" },
  { id: "true_false", label: "True / False", description: "Binary choice", icon: ToggleLeft, category: "Assessment" },
  { id: "fill_blank", label: "Fill in the Blank", description: "Short text answer", icon: TextCursor, category: "Assessment" },
  { id: "matching", label: "Match", description: "Pair items", icon: Link2, category: "Assessment" },
  { id: "ordering", label: "Sequence", description: "Order items correctly", icon: ListOrdered, category: "Assessment" },
  { id: "poll", label: "Poll", description: "No wrong answer", icon: BarChart3, category: "Assessment" },
  { id: "numerical", label: "Numerical", description: "Number with tolerance", icon: Hash, category: "Assessment" },
  { id: "coding", label: "Coding", description: "Write and run code", icon: Code2, category: "Programming" },
  { id: "debugging", label: "Debugging", description: "Fix broken code", icon: Bug, category: "Programming" },
  { id: "predict_output", label: "Output Prediction", description: "Predict program output", icon: Terminal, category: "Programming" },
  { id: "sql", label: "SQL", description: "Query challenges", icon: Database, category: "Programming" },
  { id: "image_based", label: "Image", description: "Image-based question", icon: Image, category: "Media" },
  { id: "audio_based", label: "Audio", description: "Listen and answer", icon: Mic, category: "Media" },
  { id: "video_based", label: "Video", description: "Watch and answer", icon: Video, category: "Media" },
  { id: "hotspot", label: "Hotspot", description: "Click regions", icon: Target, category: "Media" },
  { id: "matrix", label: "Matrix", description: "Grid responses", icon: Grid3x3, category: "Media" },
  { id: "essay", label: "Essay", description: "Long-form response", icon: AlignLeft, category: "Advanced" },
  { id: "case_study", label: "Case Study", description: "Scenario with context", icon: BookOpen, category: "Advanced" },
  { id: "scenario", label: "Interactive Scenario", description: "Branching scenario", icon: Layers, category: "Advanced" },
  { id: "short_answer", label: "Short Answer", description: "Brief text response", icon: FileText, category: "Advanced" },
];

export const TYPE_CATEGORIES = ["Assessment", "Programming", "Media", "Advanced"] as const;

const RECENT_KEY = "quiz-studio-recent-types";

export function getRecentTypes(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export function pushRecentType(typeId: string) {
  const recent = getRecentTypes().filter((t) => t !== typeId);
  recent.unshift(typeId);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8)));
}

export function getFavoriteTypes(): string[] {
  try {
    return JSON.parse(localStorage.getItem("quiz-studio-fav-types") || "[]") as string[];
  } catch {
    return [];
  }
}

export function toggleFavoriteType(typeId: string): string[] {
  const favs = getFavoriteTypes();
  const next = favs.includes(typeId) ? favs.filter((t) => t !== typeId) : [...favs, typeId];
  localStorage.setItem("quiz-studio-fav-types", JSON.stringify(next));
  return next;
}
