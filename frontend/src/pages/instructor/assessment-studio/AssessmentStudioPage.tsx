import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Library,
  FolderKanban,
  Sparkles,
  LayoutTemplate,
  ClipboardCheck,
  Download,
  Settings,
  Plus,
  Search,
  Upload,
  BarChart3,
} from "lucide-react";
import {
  getStudioDashboard,
  listBankQuestions,
  listCollections,
  generateAIQuestions,
  createCollection,
} from "@/lib/assessmentStudio/api";
import type { ImportSourceType, StudioTab } from "@/lib/assessmentStudio/types";
import { QuestionCard } from "@/components/assessment-studio/QuestionCard";
import { ContentSourceGrid } from "@/components/assessment-studio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToastStore } from "@/store/toastStore";
import { questionEditorPath } from "@/lib/assessment/migrationLog";
import { cn } from "@/lib/utils";

const TABS: Array<{ id: StudioTab; label: string; icon: typeof Library }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "bank", label: "Question Bank", icon: Library },
  { id: "collections", label: "Collections", icon: FolderKanban },
  { id: "ai", label: "AI Generator", icon: Sparkles },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "review", label: "Question Review", icon: ClipboardCheck },
  { id: "import", label: "Build from Content", icon: Download },
  { id: "settings", label: "Settings", icon: Settings },
];

export function AssessmentStudioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as StudioTab) || "dashboard";
  const importSource = searchParams.get("source") as ImportSourceType | null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const setTab = (id: StudioTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next);
  };

  const { data: dashboard } = useQuery({
    queryKey: ["studio-dashboard"],
    queryFn: async () => {
      const res = await getStudioDashboard();
      return res.data?.data;
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <div className="border-b bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <div>
            <h1 className="page-title flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-primary" />
              Assessment Studio
            </h1>
            <p className="mt-1 text-muted-foreground">
              Central knowledge repository for Quiz Room, courses, exams, and AI-generated assessments.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/instructor/quiz-room">Quiz Room</Link>
            </Button>
            <Button onClick={() => navigate(questionEditorPath("new"))}>
              <Plus className="mr-2 h-4 w-4" />
              New Question
            </Button>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-0 sm:px-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {tab === "dashboard" && <DashboardView data={dashboard} onOpenImport={() => setTab("import")} />}
        {tab === "bank" && <QuestionBankView />}
        {tab === "collections" && <CollectionsView />}
        {tab === "ai" && <AIGeneratorView />}
        {tab === "templates" && <TemplatesView />}
        {tab === "review" && <ReviewView />}
        {tab === "import" && (
          <ImportView
            initialSource={importSource}
            onSourceChange={(source) => {
              const next = new URLSearchParams(searchParams);
              next.set("tab", "import");
              if (source) next.set("source", source);
              else next.delete("source");
              setSearchParams(next);
            }}
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: ["studio-dashboard"] });
              queryClient.invalidateQueries({ queryKey: ["bank-questions"] });
            }}
          />
        )}
        {tab === "settings" && <SettingsView />}
      </div>
    </div>
  );
}

function DashboardView({
  data,
  onOpenImport,
}: {
  data?: import("@/lib/assessmentStudio/types").StudioDashboard;
  onOpenImport: () => void;
}) {
  const totals = data?.totals;
  const statCards = [
    { label: "Total Questions", value: totals?.questions ?? 0 },
    { label: "Collections", value: totals?.collections ?? 0 },
    { label: "AI Generated", value: totals?.aiGenerated ?? 0 },
    { label: "Human Created", value: totals?.humanCreated ?? 0 },
    { label: "Coding Questions", value: totals?.codingQuestions ?? 0 },
    { label: "Pending Review", value: totals?.pendingReview ?? 0 },
    { label: "Approved", value: totals?.approved ?? 0 },
    { label: "Archived", value: totals?.archived ?? 0 },
  ];

  return (
    <div className="space-y-8">
      {totals?.questions === 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div>
              <p className="font-semibold">Import questions from external sources</p>
              <p className="text-sm text-muted-foreground">
                PDF, Google Forms, YouTube, Word, PowerPoint, images, and more.
              </p>
            </div>
            <Button onClick={onOpenImport}>
              <Upload className="mr-2 h-4 w-4" />
              Open Import Studio
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border-border/60 bg-card/80 backdrop-blur-sm">
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Difficulty" items={data?.charts.difficulty || []} />
        <ChartCard title="Question Types" items={data?.charts.types || []} />
        <ChartCard title="Bloom Distribution" items={data?.charts.bloom || []} />
      </div>

      {data?.recentlyAdded && data.recentlyAdded.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Recently Added</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.recentlyAdded.map((q) => (
              <QuestionCard key={q.id} question={q as import("@/lib/assessmentStudio/types").BankQuestion} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet</p>
        ) : (
          items.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="capitalize">{item.label}</span>
                <span>{item.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function QuestionBankView() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["bank-questions", search, status],
    queryFn: async () => {
      const res = await listBankQuestions({ q: search, status, page: 1, limit: 48 });
      return res.data?.data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder='Search: "Graph BFS", "beginner recursion", "arrays"...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_review">Pending Review</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading questions…</p>
      ) : !data?.items.length ? (
        <Card className="border-dashed py-16 text-center">
          <p className="text-muted-foreground">No questions yet. Create one or import from an external source.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              onClick={() => navigate(questionEditorPath(q.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionsView() {
  const toast = useToastStore((s) => s.add);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const { data: collections } = useQuery({
    queryKey: ["bank-collections"],
    queryFn: async () => {
      const res = await listCollections();
      return res.data?.data || [];
    },
  });

  const handleCreate = async () => {
    if (!name.trim()) return;
    const res = await createCollection({ name: name.trim() });
    if (res.error) return toast({ title: "Failed", description: res.error, variant: "destructive" });
    toast({ title: "Collection created", variant: "success" });
    setName("");
    queryClient.invalidateQueries({ queryKey: ["bank-collections"] });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap gap-3 pt-6">
          <Input placeholder="New collection name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" />
          <Button onClick={handleCreate}>Create Collection</Button>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(collections || []).map((c) => (
          <Card key={c.id}>
            <CardContent className="pt-6">
              <h3 className="font-semibold">{c.name}</h3>
              <p className="text-sm text-muted-foreground">{c._count?.items ?? 0} questions</p>
              <Badge variant="outline" className="mt-2 capitalize">{c.kind}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AIGeneratorView() {
  const toast = useToastStore((s) => s.add);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [bloomLevel, setBloomLevel] = useState("L2");
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    const res = await generateAIQuestions({ topic, difficulty, bloomLevel, count });
    setLoading(false);
    if (res.error) return toast({ title: "Generation failed", description: res.error, variant: "destructive" });
    toast({
      title: `Generated ${res.data?.data.length} draft questions`,
      description: "They require review before publishing.",
      variant: "success",
    });
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Question Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Topic</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Binary Search Trees" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Difficulty</Label>
            <select className="h-10 w-full rounded-md border px-3 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Bloom</Label>
            <select className="h-10 w-full rounded-md border px-3 text-sm" value={bloomLevel} onChange={(e) => setBloomLevel(e.target.value)}>
              {["L1", "L2", "L3", "L4", "L5", "L6"].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Count</Label>
            <Input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          AI questions are saved as drafts and pass validation checks before they can be published.
        </p>
        <Button onClick={handleGenerate} disabled={loading}>
          {loading ? "Generating…" : "Generate Questions"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TemplatesView() {
  const templates = [
    "Mid Exam", "Final Exam", "Weekly Quiz", "Pop Quiz", "Coding Contest", "Interview Round", "Certification Exam",
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <Card key={t} className="border-dashed">
          <CardContent className="pt-6">
            <LayoutTemplate className="mb-2 h-6 w-6 text-primary" />
            <h3 className="font-semibold">{t}</h3>
            <p className="text-xs text-muted-foreground">Template — create from collection</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReviewView() {
  const { data } = useQuery({
    queryKey: ["bank-review"],
    queryFn: async () => {
      const res = await listBankQuestions({ status: "pending_review", limit: 48 });
      return res.data?.data?.items || [];
    },
  });
  const navigate = useNavigate();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {!data?.length ? (
        <p className="text-muted-foreground">No questions pending review.</p>
      ) : (
        data.map((q) => (
          <QuestionCard key={q.id} question={q} onClick={() => navigate(questionEditorPath(q.id))} />
        ))
      )}
    </div>
  );
}

function ImportView({
  initialSource,
  onSourceChange,
  onComplete,
}: {
  initialSource: ImportSourceType | null;
  onSourceChange: (source: ImportSourceType | null) => void;
  onComplete: () => void;
}) {
  const [contentMethod, setContentMethod] = useState<"upload" | "google" | "wayground" | null>(null);

  if (contentMethod) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h3 className="text-base font-semibold">Content analysis not available yet</h3>
        <p className="text-sm text-muted-foreground">
          Automated extraction from uploaded materials, Google Workspace, and Wayground is intentionally disabled until the wizard ships.
          Use Quiz Builder or Question Bank to create questions now.
        </p>
        <button
          type="button"
          onClick={() => setContentMethod(null)}
          className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Build from Content</h2>
        <p className="text-sm text-muted-foreground">
          Provide any learning material — GateHub analyses it and extracts assessment questions directly into your Question Bank.
        </p>
      </div>
      <ContentSourceGrid onSelect={setContentMethod} />
    </div>
  );
}

function SettingsView() {
  return (
    <Card className="max-w-xl">
      <CardContent className="pt-6 space-y-2 text-sm">
        <p className="font-medium text-foreground">Assessment Studio settings</p>
        <p className="text-muted-foreground">
          Default review workflow, AI validation strictness, and export preferences are not configurable yet.
          Existing Quiz Builder and Question Bank settings continue to apply.
        </p>
      </CardContent>
    </Card>
  );
}
