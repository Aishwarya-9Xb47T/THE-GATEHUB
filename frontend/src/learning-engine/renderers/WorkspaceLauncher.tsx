import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Code2,
  FileSearch,
  Hammer,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildLearnPath } from "@/lib/navigation";
import type { ExperienceRendererProps } from "./ExperienceRenderer";

const WORKSPACE_META = {
  project: { icon: Hammer, label: "Project Workspace", color: "from-amber-500 to-orange-600" },
  "coding-lab": { icon: Code2, label: "Coding Lab", color: "from-violet-500 to-purple-600" },
  notebook: { icon: BookOpen, label: "Notebook Workspace", color: "from-blue-500 to-cyan-600" },
  research: { icon: FileSearch, label: "Research Workspace", color: "from-emerald-500 to-teal-600" },
};

export function WorkspaceLauncher({ step, universeId, lessonId }: ExperienceRendererProps) {
  const { pathname } = useLocation();
  const ws = step.workspace;
  const kind = step.kind;
  const meta = WORKSPACE_META[kind as keyof typeof WORKSPACE_META] ?? WORKSPACE_META.project;
  const Icon = meta.icon;
  const description = String(step.payload.description ?? step.payload.instructions ?? "");
  const instructions = String(step.payload.instructions ?? "");

  const path =
    ws?.path ??
    buildLearnPath({
      pathname,
      universeId,
      lessonId,
      workspace: kind === "project" ? "project" : kind === "coding-lab" ? "coding-lab" : kind === "notebook" ? "notebook" : kind === "research" ? "research" : undefined,
      stepId: kind === "project" ? undefined : step.id,
    });

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <div className={`surface-gradient bg-gradient-to-r ${meta.color} p-6 md:p-8`}>
        <div className="flex items-center gap-3 mb-2">
          <Icon className="w-8 h-8" />
          <div>
            <p className="text-xs uppercase tracking-widest opacity-80">{meta.label}</p>
            <h2 className="text-2xl font-bold">{step.title}</h2>
          </div>
        </div>
        {description && <p className="opacity-90 mt-2 max-w-2xl">{description.slice(0, 280)}</p>}
      </div>
      <div className="p-6 space-y-4">
        {instructions && (
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <BookOpen className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="line-clamp-4">{instructions}</p>
          </div>
        )}
        <Button asChild size="lg" className="gap-2">
          <Link to={path}>
            Open {meta.label}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
