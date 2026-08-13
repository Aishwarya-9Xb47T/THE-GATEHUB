import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Globe, Github, Hammer, ExternalLink, AlertTriangle } from "lucide-react";
import { validateColabUrl } from "@/lib/colabUrlValidator";
import { buildLearnPath } from "@/lib/navigation";

export interface ProjectBlockContent {
  id?: string;
  title?: string;
  description?: string;
  difficulty?: string;
  instructions?: string;
  expectedOutput?: string;
  colabUrl?: string;
  githubUrl?: string;
}

interface ProjectBlockCardProps {
  universeId: string;
  lessonId: string;
  project: ProjectBlockContent;
  compact?: boolean;
  submissionStatus?: string | null;
  submissionGrade?: number | null;
}

export function ProjectBlockCard({ universeId, lessonId, project, compact, submissionStatus, submissionGrade }: ProjectBlockCardProps) {
  const { pathname } = useLocation();
  const workspacePath = buildLearnPath({
    pathname,
    universeId,
    lessonId,
    workspace: "project",
  });
  const colabCheck = project.colabUrl ? validateColabUrl(project.colabUrl) : null;
  const colabLaunchUrl = colabCheck?.valid ? colabCheck.normalizedUrl : null;
  const statusInfo =
    submissionStatus === "approved" ? "Approved" :
    submissionStatus === "rejected" ? "Rejected" :
    submissionStatus === "under_review" ? "Under review" :
    submissionStatus === "pending" || submissionStatus === "submitted" ? "Submitted" : null;

  return (
    <Card className="p-6 border-primary/20 bg-gradient-to-br from-background to-primary/5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Hammer className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg">Project: {project.title || "Project"}</h3>
            {project.difficulty && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {project.difficulty}
              </span>
            )}
            {statusInfo && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border">
                {statusInfo}{submissionGrade != null ? ` · ${submissionGrade}/100` : ""}
              </span>
            )}
          </div>
          {!compact && project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
          {!compact && project.instructions && (
            <div className="prose dark:prose-invert max-w-none text-sm">
              <p className="whitespace-pre-wrap">{project.instructions}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <Button asChild size="lg" className="gap-2 shadow-md">
            <Link to={workspacePath}>
              <Hammer className="w-4 h-4" />
              Open Workspace
            </Link>
          </Button>
          {project.colabUrl && (
            <>
              {!colabCheck?.valid && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  Invalid Google Colab notebook URL
                </p>
              )}
              {colabLaunchUrl && (
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <a href={colabLaunchUrl} target="_blank" rel="noopener noreferrer">
                    <Globe className="w-4 h-4" />
                    Open in Colab
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                </Button>
              )}
            </>
          )}
          {project.githubUrl && (
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
                <Github className="w-4 h-4" />
                GitHub Repo
              </a>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
