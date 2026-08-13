import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Github,
  Hammer,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, getLearningUniverseById } from "@/lib/api";
import { validateColabUrl } from "@/lib/colabUrlValidator";
import { getLearningUniverseCoursePath } from "@/lib/navigation";
import type { LearnerExperienceStep } from "../types";
import { WorkspaceShell } from "./WorkspaceShell";

interface ProjectWorkspacePanelProps {
  step: LearnerExperienceStep;
  universeId: string;
  lessonId: string;
  onExit: () => void;
  onProgress?: (stepId: string, event: string) => void;
}

export function ProjectWorkspacePanel({ step, universeId, lessonId, onExit, onProgress }: ProjectWorkspacePanelProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [colabUrl, setColabUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [submission, setSubmission] = useState<{
    status: string;
    feedback?: string | null;
    githubUrl?: string | null;
    colabUrl?: string | null;
    notes?: string | null;
  } | null>(null);

  const instructions = String(step.payload.instructions ?? step.payload.description ?? "");
  const description = String(step.payload.description ?? "");
  const starterGithub = String(step.payload.githubUrl ?? "");
  const starterColab = String(step.payload.colabUrl ?? "");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await getLearningUniverseById(universeId);
      const subRes = await api<{
        success: boolean;
        submission: {
          status: string;
          feedback?: string | null;
          githubUrl?: string | null;
          colabUrl?: string | null;
          notes?: string | null;
        } | null;
      }>(
        `/learning-universes/${universeId}/lessons/${lessonId}/project/submission`
      );
      if (subRes.data?.submission) {
        setSubmission(subRes.data.submission);
        setGithubUrl(String(subRes.data.submission.githubUrl ?? starterGithub));
        setColabUrl(String(subRes.data.submission.colabUrl ?? starterColab));
        setNotes(String(subRes.data.submission.notes ?? ""));
      } else {
        setGithubUrl(starterGithub);
        setColabUrl(starterColab);
      }
      setLoading(false);
    })();
  }, [universeId, lessonId, starterGithub, starterColab]);

  const colabValidation = useMemo(() => (colabUrl ? validateColabUrl(colabUrl) : null), [colabUrl]);

  const submit = async () => {
    setSubmitting(true);
    const form = new FormData();
    if (githubUrl) form.append("githubUrl", githubUrl);
    if (colabUrl) form.append("colabUrl", colabUrl);
    if (notes) form.append("notes", notes);
    const res = await api(`/learning-universes/${universeId}/lessons/${lessonId}/project/submit`, {
      method: "POST",
      body: form,
    });
    setSubmitting(false);
    if (!res.error) {
      onProgress?.(step.id, "submit");
      setSubmission({ status: "submitted" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const checklistItems = [
    { id: "read", label: "Read project instructions" },
    { id: "repo", label: "Clone or create repository" },
    { id: "implement", label: "Complete implementation" },
    { id: "submit", label: "Submit for review" },
  ];

  return (
    <WorkspaceShell
      title={step.title}
      kindLabel="Project Workspace"
      subtitle={description.slice(0, 160)}
      onExit={onExit}
      explorer={
        <div className="p-3 space-y-2 text-xs">
          <p className="text-[#8b949e] uppercase tracking-wider font-semibold px-1">Checklist</p>
          {checklistItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setChecklist((c) => ({ ...c, [item.id]: !c[item.id] }))}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#21262d] text-left"
            >
              {checklist[item.id] ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-[#8b949e]" />
              )}
              {item.label}
            </button>
          ))}
        </div>
      }
      editor={
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <Card className="bg-[#161b22] border-[#30363d] p-5">
            <div className="flex items-center gap-2 mb-3">
              <Hammer className="w-5 h-5 text-amber-400" />
              <h3 className="font-semibold">Instructions</h3>
            </div>
            <p className="text-sm text-[#c9d1d9] whitespace-pre-wrap leading-relaxed">{instructions || description}</p>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            {starterGithub && (
              <Card className="bg-[#161b22] border-[#30363d] p-4">
                <Label className="text-xs text-[#8b949e]">Starter repository</Label>
                <Button asChild variant="outline" size="sm" className="mt-2 w-full">
                  <a href={starterGithub} target="_blank" rel="noopener noreferrer">
                    <Github className="w-4 h-4 mr-2" />
                    Open on GitHub
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </a>
                </Button>
              </Card>
            )}
            {starterColab && colabValidation?.valid && (
              <Card className="bg-[#161b22] border-[#30363d] p-4">
                <Label className="text-xs text-[#8b949e]">Reference notebook</Label>
                <p className="text-xs text-[#8b949e] mt-2">
                  Open the instructor notebook in a new tab for reference. Your submission stays inside THE GATEHUB.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-2 w-full">
                  <a href={colabValidation.normalizedUrl} target="_blank" rel="noopener noreferrer">
                    Reference Colab
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </a>
                </Button>
              </Card>
            )}
          </div>

          <Card className="bg-[#161b22] border-[#30363d] p-5 space-y-4 text-[#e6edf3]">
            <h3 className="font-semibold flex items-center gap-2 text-[#e6edf3]">
              <Upload className="w-4 h-4" />
              Submission
            </h3>
            <div>
              <Label className="text-[#e6edf3]">GitHub repository URL</Label>
              <Input
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className="mt-1 bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder:text-[#8b949e] caret-[#e6edf3]"
                placeholder="https://github.com/you/project"
              />
            </div>
            <div>
              <Label className="text-[#e6edf3]">Colab / notebook URL</Label>
              <Input
                value={colabUrl}
                onChange={(e) => setColabUrl(e.target.value)}
                className="mt-1 bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder:text-[#8b949e] caret-[#e6edf3]"
                placeholder="https://colab.research.google.com/drive/..."
              />
            </div>
            <div>
              <Label className="text-[#e6edf3]">Notes for instructor</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="mt-1 bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder:text-[#8b949e] caret-[#e6edf3]"
                placeholder="Add notes for your instructor…"
              />
            </div>
            <Button type="button" disabled={submitting} onClick={() => void submit()}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Submit project
            </Button>
            {submission && (
              <p className="text-xs text-emerald-400">Status: {submission.status}</p>
            )}
          </Card>
        </div>
      }
      sidePanel={
        <div className="p-4 space-y-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-[#8b949e] font-semibold">Integrations</p>
          <p className="text-[#8b949e] text-xs leading-relaxed">
            Connect GitHub, GitLab, or Google Drive from your profile integrations (coming soon). Submit URLs above for instructor review inside THE GATEHUB.
          </p>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to={getLearningUniverseCoursePath(universeId)}>Course home</Link>
          </Button>
        </div>
      }
      statusLeft={<span>Project workspace</span>}
      statusRight={<span>GateHub submission</span>}
    />
  );
}
