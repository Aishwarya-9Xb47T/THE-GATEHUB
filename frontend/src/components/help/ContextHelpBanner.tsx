import { Link } from "react-router-dom";
import { HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ContextHelpConfig {
  title: string;
  guidePath: string;
  guideLabel?: string;
}

const CONTEXT_HELP: Record<string, ContextHelpConfig> = {
  "/instructor/courses/new": { title: "Creating a course?", guidePath: "/help/instructor#course-creation", guideLabel: "View Course Creation Guide" },
  "/instructor/courses/new/manual": { title: "Manual course creation", guidePath: "/help/instructor#course-creation", guideLabel: "View Course Creation Guide" },
  "/instructor/courses/new/ai": { title: "AI course authoring", guidePath: "/help/instructor#course-creation", guideLabel: "View Course Creation Guide" },
  "/instructor/ai-architect": { title: "AI Course Architect", guidePath: "/help/instructor#course-creation", guideLabel: "View Course Creation Guide" },
  "/manage-courses/new": { title: "Create Free Learning Course?", guidePath: "/help/instructor#course-creation", guideLabel: "View Course Creation Guide" },
  "/instructor/courses/new/branding": { title: "Academic Authoring Studio", guidePath: "/help/instructor#academic-authoring-studio", guideLabel: "DSL Reference" },
  "/instructor/courses/new/academic": { title: "Academic Authoring Studio", guidePath: "/help/instructor#academic-authoring-studio", guideLabel: "DSL Reference" },
  "/instructor/learning-universe/new": { title: "New Learning Universe?", guidePath: "/help/instructor#academic-authoring-studio", guideLabel: "Learning Universe Guide" },
  "/instructor/learning-universe/new/visual": { title: "Visual Authoring Studio", guidePath: "/help/instructor#visual-authoring-studio", guideLabel: "Visual Studio Guide" },
  "/instructor/learning-universe/new/academic": { title: "Academic Authoring Studio", guidePath: "/help/instructor#academic-authoring-studio", guideLabel: "DSL Reference" },
  "/instructor/project-reviews": { title: "Project Reviews", guidePath: "/help/instructor#project-reviews", guideLabel: "Project Review Documentation" },
};

export function ContextHelpBanner({ pathname }: { pathname: string }) {
  const match = Object.entries(CONTEXT_HELP).find(([path]) => pathname.startsWith(path));
  if (!match) return null;

  const [, config] = match;
  const dismissKey = `help-dismiss-${match[0]}`;
  if (sessionStorage.getItem(dismissKey)) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-primary/5 border-b border-primary/20 text-sm">
      <div className="flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-primary shrink-0" />
        <span>Need help? <strong>{config.title}</strong></span>
        <Link to={config.guidePath} className="text-primary hover:underline font-medium">
          {config.guideLabel || "View Guide"}
        </Link>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => sessionStorage.setItem(dismissKey, "1")}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
