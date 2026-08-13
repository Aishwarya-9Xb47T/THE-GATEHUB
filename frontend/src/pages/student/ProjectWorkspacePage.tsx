import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FileText,
  Github,
  Globe,
  Hammer,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLearningUniverseById, api } from "@/lib/api";
import { buildLearnPath } from "@/lib/navigation";
import { getNotebookPreviewUrl } from "@/lib/notebookPreview";
import { validateColabUrl } from "@/lib/colabUrlValidator";
import { useToastStore } from "@/store/toastStore";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

interface Project {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  instructions: string;
  colabUrl?: string;
  githubUrl?: string;
  datasetUrls?: string[] | null;
}

interface Resource {
  id: string;
  type: string;
  title: string;
  url?: string;
  fileUrl?: string;
}

interface Lesson {
  id: string;
  title: string;
  project: Project | null;
  resources: Resource[];
  contentBlocks?: { type: string; content: Record<string, unknown> }[];
}

interface Submission {
  id: string;
  githubUrl?: string;
  colabUrl?: string;
  zipFileUrl?: string;
  reportPdfUrl?: string;
  notes?: string;
  status: string;
  grade?: number | null;
  feedback?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: { firstName: string; lastName: string } | null;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending review", className: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  submitted: { label: "Pending review", className: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  under_review: { label: "Under review", className: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
  approved: { label: "Approved", className: "bg-green-500/10 text-green-700 border-green-500/30" },
  rejected: { label: "Rejected", className: "bg-red-500/10 text-red-700 border-red-500/30" },
};

const DEFAULT_CHECKLIST = [
  { id: "read", label: "Read project instructions" },
  { id: "notebook", label: "Open and run the notebook" },
  { id: "implement", label: "Complete the implementation" },
  { id: "submit", label: "Submit your work" },
];

function resolveAssetUrl(url: string, universe: { id: string; assets?: { filename: string; storedFilename: string }[] }) {
  if (!url || url.startsWith("http")) return url;
  const asset = universe.assets?.find((a) => a.filename === url);
  if (asset) return `${API_BASE}/uploads/learning-universes/${universe.id}/${asset.storedFilename}`;
  return `${API_BASE}/api/learning-universes/${universe.id}/assets/${encodeURIComponent(url)}`;
}

export function ProjectWorkspacePage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);

  const lessonBackPath =
    id && lessonId
      ? buildLearnPath({ pathname: location.pathname, universeId: id, lessonId })
      : "#";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [universe, setUniverse] = useState<{ id: string; title: string; assets?: { filename: string; storedFilename: string }[] } | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [githubUrl, setGithubUrl] = useState("");
  const [colabUrl, setColabUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [reportPdf, setReportPdf] = useState<File | null>(null);

  const project = lesson?.project;
  const projectColab = project?.colabUrl ? validateColabUrl(project.colabUrl) : null;
  const colabLaunchUrl = projectColab?.valid ? projectColab.normalizedUrl! : null;
  const previewUrl = useMemo(
    () => (colabLaunchUrl ? getNotebookPreviewUrl(colabLaunchUrl, project?.githubUrl) : getNotebookPreviewUrl(null, project?.githubUrl)),
    [colabLaunchUrl, project?.githubUrl]
  );
  const [colabFieldError, setColabFieldError] = useState<string | null>(null);

  const datasetResources = useMemo(() => {
    const fromLesson = (lesson?.resources || []).filter(
      (r) => r.type === "dataset" || r.type === "download" || r.title.toLowerCase().includes("dataset")
    );
    return fromLesson;
  }, [lesson?.resources]);

  useEffect(() => {
    if (!id || !lessonId) return;
    (async () => {
      try {
        const res = await getLearningUniverseById<{ data: { id: string; title: string; tracks: { modules: { lessons: Lesson[] }[] }[]; assets?: { filename: string; storedFilename: string }[] } }>(id);
        if (res.error) throw new Error(res.error);
        const lu = res.data?.data;
        if (!lu) throw new Error("Universe not found");

        let found: Lesson | null = null;
        for (const track of lu.tracks || []) {
          for (const mod of track.modules || []) {
            const match = (mod.lessons || []).find((l) => l.id === lessonId);
            if (match) {
              found = match;
              break;
            }
          }
          if (found) break;
        }
        if (!found?.project) throw new Error("Project not found for this lesson");

        setUniverse({ id: lu.id, title: lu.title, assets: lu.assets });
        setLesson(found);
        setColabUrl(found.project.colabUrl || "");
        setGithubUrl(found.project.githubUrl || "");

        const subRes = await api<{ data: Submission | null }>(
          `/learning-universes/${id}/lessons/${lessonId}/project/submission`
        );
        if (subRes.data?.data) {
          const s = subRes.data.data;
          setSubmission(s);
          setGithubUrl(s.githubUrl || found.project.githubUrl || "");
          setColabUrl(s.colabUrl || found.project.colabUrl || "");
          setNotes(s.notes || "");
          setChecklist((prev) => ({ ...prev, submit: true }));
        }

        const saved = localStorage.getItem(`lu-project-checklist:${lessonId}`);
        if (saved) setChecklist(JSON.parse(saved));
      } catch (err: any) {
        toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
        navigate(`/student/learning-universe/${id}/learn`);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, lessonId, navigate, toast]);

  useEffect(() => {
    if (lessonId) {
      localStorage.setItem(`lu-project-checklist:${lessonId}`, JSON.stringify(checklist));
    }
  }, [checklist, lessonId]);

  const toggleCheck = (itemId: string) => {
    setChecklist((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleLaunchNotebook = () => {
    if (!colabLaunchUrl) return;
    toggleCheck("notebook");
    window.open(colabLaunchUrl, "_blank", "noopener,noreferrer");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !lessonId) return;

    if (colabUrl.trim()) {
      const check = validateColabUrl(colabUrl.trim());
      if (!check.valid) {
        setColabFieldError(check.error || "Invalid Google Colab notebook URL");
        toast({ title: "Invalid Colab URL", description: check.error, variant: "destructive" });
        return;
      }
      setColabFieldError(null);
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      if (githubUrl) form.append("githubUrl", githubUrl);
      if (colabUrl) {
        const check = validateColabUrl(colabUrl.trim());
        form.append("colabUrl", check.valid ? check.normalizedUrl! : colabUrl);
      }
      if (notes) form.append("notes", notes);
      if (zipFile) form.append("zipFile", zipFile);
      if (reportPdf) form.append("reportPdf", reportPdf);

      const token = localStorage.getItem("lms_token");
      const res = await fetch(`${API_BASE}/api/learning-universes/${id}/lessons/${lessonId}/project/submit`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submission failed");

      setSubmission(json.data);
      setChecklist((prev) => ({ ...prev, submit: true }));
      toast({ title: "Project submitted", description: "Your work has been saved successfully." });
    } catch (err: any) {
      toast({ title: "Submission failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!project || !universe || !lesson) return null;

  const completedCount = DEFAULT_CHECKLIST.filter((c) => checklist[c.id]).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" asChild>
              <Link to={lessonBackPath}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to lesson
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{universe.title}</p>
              <h1 className="font-semibold truncate flex items-center gap-2">
                <Hammer className="w-4 h-4 text-primary shrink-0" />
                {project.title}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {colabLaunchUrl && (
              <Button onClick={handleLaunchNotebook} className="gap-2 bg-orange-600 hover:bg-orange-700">
                <Globe className="w-4 h-4" />
                Open in Colab
                <ExternalLink className="w-3 h-3 opacity-70" />
              </Button>
            )}
            {project.colabUrl && !projectColab?.valid && (
              <span className="text-xs text-red-600">Invalid Google Colab notebook URL</span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-4 grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-[calc(100vh-4rem)]">
        {/* Left: Instructions & Resources */}
        <aside className="xl:col-span-3 space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Instructions
            </h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.instructions}</p>
            {project.description && (
              <p className="text-sm mt-3 text-muted-foreground border-t pt-3">{project.description}</p>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Dataset Files &amp; Resources
            </h2>
            <ul className="space-y-2 text-sm">
              {datasetResources.length === 0 && (lesson.resources || []).length === 0 && (
                <li className="text-muted-foreground">No resources attached to this lesson.</li>
              )}
              {(datasetResources.length ? datasetResources : lesson.resources || []).map((r) => (
                <li key={r.id}>
                  <a
                    href={r.url || (r.fileUrl && universe ? resolveAssetUrl(r.fileUrl, universe) : "#")}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    {r.title}
                  </a>
                </li>
              ))}
            </ul>
            {project.githubUrl && (
              <a
                href={project.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Github className="w-4 h-4" />
                GitHub Repository
              </a>
            )}
          </Card>
        </aside>

        {/* Center: Notebook preview */}
        <main className="xl:col-span-6 flex flex-col gap-4 min-h-[500px]">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between bg-muted/30">
              <span className="text-sm font-medium">Notebook Preview</span>
              <span className="text-xs text-muted-foreground">
                Read-only preview · execution happens in Colab
              </span>
            </div>
            <div className="flex-1 min-h-[420px] bg-muted/10">
              {previewUrl ? (
                <iframe
                  title="Notebook preview"
                  src={previewUrl}
                  className="w-full h-full min-h-[420px] border-0"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[420px] p-8 text-center gap-4">
                  <Globe className="w-12 h-12 text-muted-foreground/50" />
                  <div>
                    <p className="font-medium">Notebook Preview Not Available</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md">
                      Google Colab notebooks cannot be embedded here. Use Open in Colab to run the notebook,
                      then return to submit your work.
                    </p>
                  </div>
                  {colabLaunchUrl && (
                    <Button onClick={handleLaunchNotebook} className="gap-2 bg-orange-600 hover:bg-orange-700">
                      <Globe className="w-4 h-4" />
                      Open in Colab
                    </Button>
                  )}
                  {project.colabUrl && !projectColab?.valid && (
                    <p className="text-sm text-red-600">Invalid Google Colab notebook URL</p>
                  )}
                </div>
              )}
            </div>
          </Card>
        </main>

        {/* Right: Checklist & Submission */}
        <aside className="xl:col-span-3 space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Progress</h2>
              <span className="text-xs text-muted-foreground">
                {completedCount}/{DEFAULT_CHECKLIST.length}
              </span>
            </div>
            <ul className="space-y-2">
              {DEFAULT_CHECKLIST.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggleCheck(item.id)}
                    className="flex items-center gap-2 text-sm w-full text-left hover:text-primary transition-colors"
                  >
                    {checklist[item.id] ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Submit Project
            </h2>
            {submission && (
              <div className="mb-4 space-y-3 rounded-lg border border-border p-3 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submission Status</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${STATUS_LABELS[submission.status]?.className || ""}`}>
                    {STATUS_LABELS[submission.status]?.label || submission.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(submission.submittedAt).toLocaleString()}
                </p>
                {submission.reviewedAt && (
                  <p className="text-xs text-muted-foreground">
                    Reviewed {new Date(submission.reviewedAt).toLocaleString()}
                    {submission.reviewedBy && ` by ${submission.reviewedBy.firstName} ${submission.reviewedBy.lastName}`}
                  </p>
                )}
                {submission.grade != null && (
                  <p className="text-sm font-semibold text-foreground">Grade: {submission.grade}/100</p>
                )}
                {submission.feedback && (
                  <div className="text-sm">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Instructor Feedback</p>
                    <p className="whitespace-pre-wrap text-foreground">{submission.feedback}</p>
                  </div>
                )}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="colabUrl" className="text-xs">
                  Colab URL
                </Label>
                <Input
                  id="colabUrl"
                  value={colabUrl}
                  onChange={(e) => {
                    setColabUrl(e.target.value);
                    if (colabFieldError) setColabFieldError(null);
                  }}
                  placeholder="https://colab.research.google.com/drive/..."
                  className="text-sm"
                />
                {colabFieldError && (
                  <p className="text-xs text-red-600 mt-1">{colabFieldError}</p>
                )}
              </div>
              <div>
                <Label htmlFor="githubUrl" className="text-xs">
                  GitHub URL
                </Label>
                <Input
                  id="githubUrl"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  className="text-sm"
                />
              </div>
              <div>
                <Label htmlFor="zipFile" className="text-xs">
                  ZIP archive
                </Label>
                <Input
                  id="zipFile"
                  type="file"
                  accept=".zip,application/zip"
                  className="text-sm"
                  onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                />
              </div>
              <div>
                <Label htmlFor="reportPdf" className="text-xs">
                  PDF report
                </Label>
                <Input
                  id="reportPdf"
                  type="file"
                  accept=".pdf,application/pdf"
                  className="text-sm"
                  onChange={(e) => setReportPdf(e.target.files?.[0] || null)}
                />
              </div>
              <div>
                <Label htmlFor="notes" className="text-xs">
                  Notes (optional)
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {submission ? "Update Submission" : "Submit Project"}
              </Button>
            </form>
          </Card>
        </aside>
      </div>
    </div>
  );
}
