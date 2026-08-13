import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToastStore } from "@/store/toastStore";
import { CheckCircle, XCircle, RotateCcw, MessageSquare, Loader2, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface Submission {
  id: string;
  status: string;
  grade?: number | null;
  feedback?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  githubUrl?: string | null;
  colabUrl?: string | null;
  notes?: string | null;
  user: { firstName: string; lastName: string; email: string };
  reviewedBy?: { firstName: string; lastName: string } | null;
  project: {
    id: string;
    title: string;
    lesson: {
      id: string;
      title: string;
      module: { track: { learningUniverse: { id: string; title: string } } };
    };
  };
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  under_review: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  approved: "bg-green-500/10 text-green-600 border-green-500/30",
  rejected: "bg-red-500/10 text-red-600 border-red-500/30",
};

export function InstructorProjectReviewPage() {
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();
  const [universeId, setUniverseId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");

  const { data: filters } = useQuery({
    queryKey: ["project-review-filters"],
    queryFn: async () => {
      const res = await api<{ data: { universes: { id: string; title: string }[]; projects: { id: string; title: string; learningUniverseId: string }[]; statuses: string[] } }>(
        "/project-reviews/instructor/filters"
      );
      if (res.error) throw new Error(res.error);
      return res.data!.data;
    },
  });

  const params = new URLSearchParams();
  if (universeId) params.set("learningUniverseId", universeId);
  if (projectId) params.set("projectId", projectId);
  if (status) params.set("status", status);

  const { data: submissions, isLoading } = useQuery({
    queryKey: ["project-reviews", universeId, projectId, status],
    queryFn: async () => {
      const res = await api<{ data: Submission[] }>(
        `/project-reviews/instructor/submissions?${params}`
      );
      if (res.error) throw new Error(res.error);
      return res.data!.data;
    },
  });

  const selected = submissions?.find((s) => s.id === selectedId) ?? submissions?.[0] ?? null;

  const reviewMutation = useMutation({
    mutationFn: async (action: string) => {
      if (!selected) throw new Error("No submission selected");
      const res = await api(`/project-reviews/instructor/submissions/${selected.id}`, {
        method: "PATCH",
        body: {
          action,
          grade: grade ? Number(grade) : undefined,
          feedback: feedback || undefined,
        },
      });
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["instructor", "analytics"] });
      toast({ title: "Review saved", variant: "success" });
    },
    onError: (err: Error) => {
      toast({ title: "Review failed", description: err.message, variant: "destructive" });
    },
  });

  const loadSelected = (s: Submission) => {
    setSelectedId(s.id);
    setGrade(s.grade != null ? String(s.grade) : "");
    setFeedback(s.feedback || "");
  };

  const filteredProjects = filters?.projects.filter(
    (p) => !universeId || p.learningUniverseId === universeId
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Project Reviews</h1>
        <p className="mt-1 text-muted-foreground">Review student Learning Universe project submissions</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Learning Universe</Label>
            <select
              className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={universeId}
              onChange={(e) => { setUniverseId(e.target.value); setProjectId(""); }}
            >
              <option value="">All universes</option>
              {filters?.universes.map((u) => (
                <option key={u.id} value={u.id}>{u.title}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Project</Label>
            <select
              className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {filteredProjects?.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <select
              className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {filters?.statuses.map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Submissions ({submissions?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : !submissions?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No submissions match filters</p>
            ) : (
              submissions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => loadSelected(s)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors",
                    (selected?.id === s.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{s.user.firstName} {s.user.lastName}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize", STATUS_STYLES[s.status] || "")}>
                      {s.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{s.project.title}</p>
                  <p className="text-xs text-muted-foreground">{s.project.lesson.module.track.learningUniverse.title}</p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Review</CardTitle></CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-muted-foreground text-sm">Select a submission to review</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-2 text-sm">
                  <div><span className="text-muted-foreground">Student:</span> {selected.user.firstName} {selected.user.lastName} ({selected.user.email})</div>
                  <div><span className="text-muted-foreground">Project:</span> {selected.project.title}</div>
                  <div><span className="text-muted-foreground">Universe:</span> {selected.project.lesson.module.track.learningUniverse.title}</div>
                  <div><span className="text-muted-foreground">Submitted:</span> {new Date(selected.submittedAt).toLocaleString()}</div>
                  {selected.githubUrl && <div><span className="text-muted-foreground">GitHub:</span> <a href={selected.githubUrl} className="text-primary hover:underline" target="_blank" rel="noreferrer">{selected.githubUrl}</a></div>}
                  {selected.colabUrl && <div><span className="text-muted-foreground">Colab:</span> <a href={selected.colabUrl} className="text-primary hover:underline" target="_blank" rel="noreferrer">{selected.colabUrl}</a></div>}
                  {selected.notes && <div><span className="text-muted-foreground">Notes:</span> {selected.notes}</div>}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="grade">Grade (0–100)</Label>
                    <Input id="grade" type="number" min={0} max={100} value={grade} onChange={(e) => setGrade(e.target.value)} />
                  </div>
                  <div>
                    <Label>Current status</Label>
                    <div className={cn("mt-2 inline-flex px-3 py-1 rounded-full text-sm border capitalize", STATUS_STYLES[selected.status])}>
                      {selected.status.replace("_", " ")}
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="feedback">Feedback</Label>
                  <Textarea id="feedback" rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Write feedback for the student..." />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate("under_review")}>
                    Mark Under Review
                  </Button>
                  <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate("approve")}>
                    <CheckCircle className="w-4 h-4" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" className="gap-1" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate("reject")}>
                    <XCircle className="w-4 h-4" /> Reject
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate("request_revision")}>
                    <RotateCcw className="w-4 h-4" /> Request Revision
                  </Button>
                  <Button size="sm" variant="secondary" className="gap-1" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate("add_feedback")}>
                    <MessageSquare className="w-4 h-4" /> Save Feedback
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
