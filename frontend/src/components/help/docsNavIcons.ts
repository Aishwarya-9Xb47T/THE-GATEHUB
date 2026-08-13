import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Bot,
  Code2,
  FlaskConical,
  Globe,
  GraduationCap,
  HelpCircle,
  Home,
  Layers,
  Plug,
  Rocket,
  Search,
  Settings,
  Shield,
  Sparkles,
  Upload,
  Wrench,
} from "lucide-react";

export const DOC_SLUG_ICONS: Record<string, LucideIcon> = {
  "getting-started": Rocket,
  student: GraduationCap,
  instructor: BookOpen,
  admin: Shield,
  faq: HelpCircle,
  troubleshooting: Wrench,
  "release-notes": Layers,
  integrations: Plug,
  "learning-universe": Globe,
  "coding-lab": Code2,
  research: FlaskConical,
  publishing: Upload,
  "ai-assistant": Bot,
  search: Search,
};

export const DOC_GROUP_ICONS: Record<string, LucideIcon> = {
  start: Home,
  manuals: BookOpen,
  guides: Sparkles,
  support: HelpCircle,
  tools: Search,
};

export function getDocIcon(slug: string): LucideIcon {
  return DOC_SLUG_ICONS[slug] ?? BookOpen;
}
