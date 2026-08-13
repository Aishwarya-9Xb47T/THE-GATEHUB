import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  DoorOpen,
  LayoutTemplate,
  FileBarChart,
  Settings,
  Copy,
  Pencil,
  Trash2,
  Rocket,
  Play,
  Search,
  BookOpen,
  Grid3x3,
  List,
  Sparkles,
  Library,
  ClipboardList,
} from "lucide-react";
import {
  listQuizRooms,
  listQuizRoomReports,
  deleteQuizRoom,
  duplicateQuizRoom,
  launchQuizRoom,
  getQuizRoomPreferences,
  saveQuizRoomPreferences,
} from "@/lib/liveSession/api";
import {
  listMyQuizzes,
  duplicateQuiz as duplicateQuizEntity,
  archiveQuiz,
  deleteQuiz,
  saveQuizEditor,
} from "@/lib/quizBuilder/api";
import { PremiumQuizCard } from "@/components/quiz-builder/PremiumQuizCard";
import {
  DEFAULT_SETTINGS,
  SESSION_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  type LiveSessionSettings,
  type LiveSessionStatus,
  type QuizRoomSummary,
} from "@/lib/liveSession/types";
import { QuizRoomStatusBadge } from "@/components/quiz-room/QuizRoomStatusBadge";
import { QuizRoomSettingsForm } from "@/components/quiz-room/QuizRoomSettingsForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToastStore } from "@/store/toastStore";
import { cn } from "@/lib/utils";
import { questionEditorPath } from "@/lib/assessment/migrationLog";
import { QuestionBankPanel } from "@/components/assessment-hub/QuestionBankPanel";
import { AiStudioPanel } from "@/components/assessment-hub/AiStudioPanel";
import { subscribeQuizAttemptEvents } from "@/lib/realtime/quizAttemptEvents";

type Tab = "quizzes" | "bank" | "live" | "homework" | "reports" | "templates" | "ai" | "settings";

const TABS: Array<{ id: Tab; label: string; icon: typeof DoorOpen }> = [
  { id: "quizzes", label: "My Quizzes", icon: DoorOpen },
  { id: "bank", label: "Question Bank", icon: Library },
  { id: "live", label: "Live Sessions", icon: Play },
  { id: "homework", label: "Homework", icon: ClipboardList },
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "templates", label: "Template Library", icon: LayoutTemplate },
  { id: "ai", label: "AI Studio", icon: Sparkles },
  { id: "settings", label: "Settings", icon: Settings },
];

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "lobby", label: "Waiting" },
  { value: "active", label: "Live" },
  { value: "finished", label: "Finished" },
];

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RoomActions({ room, onChanged }: { room: QuizRoomSummary; onChanged: () => void }) {
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.add);

  const handleDuplicate = async () => {
    const res = await duplicateQuizRoom(room.id);
    if (res.error) return toast({ title: "Duplicate failed", description: res.error, variant: "destructive" });
    toast({ title: "Room duplicated as draft", variant: "success" });
    onChanged();
    navigate(`/instructor/quiz-room/${res.data!.data.id}/edit`);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${room.title}"?`)) return;
    const res = await deleteQuizRoom(room.id);
    if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    toast({ title: "Room deleted", variant: "success" });
    onChanged();
  };

  const handleLaunch = async () => {
    const res = await launchQuizRoom(room.id);
    if (res.error) return toast({ title: "Launch failed", description: res.error, variant: "destructive" });
    toast({ title: "Room launched!", variant: "success" });
    navigate(`/instructor/quiz-room/${room.id}/host`);
  };

  return (
    <div className="flex items-center gap-1">
      {(room.status === "draft" || room.status === "scheduled") && (
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Launch" onClick={handleLaunch}>
          <Rocket className="h-4 w-4" />
        </Button>
      )}
      <Button size="icon" variant="ghost" className="h-8 w-8" title="Duplicate" onClick={handleDuplicate}>
        <Copy className="h-4 w-4" />
      </Button>
      {room.status !== "active" && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Delete" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function MyQuizzesTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "updated";
  const view = (searchParams.get("view") as "grid" | "list") || "grid";
  const queryClient = useQueryClient();
  const toast = useToastStore((s) => s.add);

  const { data: quizzes, isLoading } = useQuery({
    queryKey: ["my-quizzes", search, sort],
    queryFn: async () => {
      const res = await listMyQuizzes({ q: search, sort });
      return res.data?.data || [];
    },
  });

  const sorted = useMemo(() => {
    const list = [...(quizzes || [])];
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.favorited !== b.favorited) return a.favorited ? -1 : 1;
      return 0;
    });
    return list;
  }, [quizzes]);

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["my-quizzes"] });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={sort === "updated" ? "default" : "outline"}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("sort", "updated");
              setSearchParams(next);
            }}
          >
            Recently updated
          </Button>
          <Button
            size="sm"
            variant={sort === "title" ? "default" : "outline"}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("sort", "title");
              setSearchParams(next);
            }}
          >
            Title
          </Button>
          <Button
            size="sm"
            variant={view === "grid" ? "default" : "outline"}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("view", "grid");
              setSearchParams(next);
            }}
          >
            <Grid3x3 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={view === "list" ? "default" : "outline"}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("view", "list");
              setSearchParams(next);
            }}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search quizzes…"
            value={search}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams);
              if (e.target.value) next.set("q", e.target.value);
              else next.delete("q");
              setSearchParams(next);
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading quizzes…</p>
      ) : sorted.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <DoorOpen className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No quizzes yet</p>
              <p className="text-sm text-muted-foreground">Create or import your first quiz to get started.</p>
            </div>
            <Button onClick={() => navigate("/instructor/quiz-room/create")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Quiz
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className={cn("grid gap-4", view === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
          {sorted.map((quiz) => (
            <PremiumQuizCard
              key={quiz.id}
              quiz={quiz}
              view={view}
              onDuplicate={async () => {
                const res = await duplicateQuizEntity(quiz.id);
                if (res.error) return toast({ title: "Duplicate failed", description: res.error, variant: "destructive" });
                toast({ title: "Quiz duplicated", variant: "success" });
                refetch();
                if (res.data?.data?.id) navigate(`/instructor/quiz-room/quizzes/${res.data.data.id}/edit`);
              }}
              onArchive={async () => {
                await archiveQuiz(quiz.id, true);
                toast({ title: "Quiz archived", variant: "success" });
                refetch();
              }}
              onDelete={async () => {
                if (!confirm(`Delete "${quiz.title}"?`)) return;
                const res = await deleteQuiz(quiz.id);
                if (res.error) return toast({ title: "Delete failed", description: res.error, variant: "destructive" });
                toast({ title: "Quiz deleted", variant: "success" });
                refetch();
              }}
              onToggleFavorite={async () => {
                await saveQuizEditor(quiz.id, { favorited: !quiz.favorited });
                refetch();
              }}
              onTogglePin={async () => {
                await saveQuizEditor(quiz.id, { pinned: !quiz.pinned });
                refetch();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveSessionsTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "all";
  const search = searchParams.get("q") || "";
  const queryClient = useQueryClient();

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["quiz-rooms", statusFilter],
    queryFn: async () => {
      const res = await listQuizRooms(statusFilter === "all" ? undefined : { status: statusFilter });
      return res.data?.data || [];
    },
  });

  const filtered = useMemo(() => {
    if (!rooms) return [];
    if (!search.trim()) return rooms;
    const q = search.toLowerCase();
    return rooms.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.quiz.title.toLowerCase().includes(q) ||
        r.roomCode?.toLowerCase().includes(q)
    );
  }, [rooms, search]);

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["quiz-rooms"] });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? "default" : "outline"}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                if (f.value === "all") next.delete("status");
                else next.set("status", f.value);
                setSearchParams(next);
              }}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search rooms…"
            value={search}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams);
              if (e.target.value) next.set("q", e.target.value);
              else next.delete("q");
              setSearchParams(next);
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading live sessions…</p>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Play className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No live sessions yet</p>
              <p className="text-sm text-muted-foreground">Host a quiz live from My Quizzes or create a new room.</p>
            </div>
            <Button onClick={() => navigate("/instructor/quiz-room/create")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Quiz
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((room) => (
            <Card key={room.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{room.title}</h3>
                    <QuizRoomStatusBadge status={room.status as LiveSessionStatus} />
                    <Badge variant="outline" className="text-xs">
                      {SESSION_TYPE_LABELS[room.sessionType]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {room.quiz.title}
                    {room.course ? ` · ${room.course.title}` : ""}
                    {" · "}
                    {room._count.participants} players
                    {room.roomCode ? ` · ${room.roomCode}` : ""}
                    {room.pin ? ` · PIN ${room.pin}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {SOURCE_TYPE_LABELS[room.sourceType]} · Created {formatDate(room.createdAt)}
                    {room.scheduledAt ? ` · Scheduled ${formatDate(room.scheduledAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(room.status === "lobby" || room.status === "active") && (
                    <Button size="sm" onClick={() => navigate(`/instructor/quiz-room/${room.id}/host`)}>
                      <Play className="mr-2 h-4 w-4" />
                      Host
                    </Button>
                  )}
                  {(room.status === "draft" || room.status === "scheduled") && (
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/instructor/quiz-room/${room.id}/edit`)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  )}
                  <RoomActions room={room} onChanged={refetch} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplatesTab() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Template Library</h2>
          <p className="text-sm text-muted-foreground">
            Official templates, your saved quizzes, and community layouts — browse the full library.
          </p>
        </div>
        <Button onClick={() => navigate("/instructor/quiz-room/templates")}>
          <LayoutTemplate className="mr-2 h-4 w-4" />
          Open Template Library
        </Button>
      </div>
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">100+ professional templates</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Midterm, coding, placement, sciences, corporate training, and more.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/instructor/quiz-room/create?method=templates">Create from Template</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportsTab() {
  const { data: reports, isLoading } = useQuery({
    queryKey: ["quiz-room-reports"],
    queryFn: async () => {
      const res = await listQuizRoomReports();
      return res.data?.data || [];
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Performance summaries from completed quiz room sessions.</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading reports…</p>
      ) : !reports?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No completed sessions yet. Finish a live room to see reports here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.quiz.title} · {r._count.participants} participants · {r._count.answers} answers
                  </p>
                  <p className="text-xs text-muted-foreground">Ended {formatDate(r.endedAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex gap-6 text-center mr-4">
                    <div>
                      <p className="text-lg font-bold">{Math.round(r.analytics?.avgAccuracy ?? 0)}%</p>
                      <p className="text-xs text-muted-foreground">Avg Accuracy</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{r.analytics?.avgResponseTimeMs ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">Avg Time (ms)</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/instructor/quiz-room/${r.id}/report`}>
                        View Report
                      </Link>
                    </Button>
                    <Button variant="secondary" size="sm" asChild>
                      <Link to={`/instructor/quiz-room/${r.id}/replay`}>
                        Timeline Replay
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const toast = useToastStore((s) => s.add);
  const { data: prefs } = useQuery({
    queryKey: ["quiz-room-preferences"],
    queryFn: async () => {
      const res = await getQuizRoomPreferences();
      return res.data?.data || DEFAULT_SETTINGS;
    },
  });

  const [settings, setSettings] = useState<LiveSessionSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (prefs && !loaded) {
      setSettings({ ...DEFAULT_SETTINGS, ...prefs });
      setLoaded(true);
    }
  }, [prefs, loaded]);

  const handleSave = async () => {
    const res = await saveQuizRoomPreferences(settings);
    if (res.error) return toast({ title: "Save failed", description: res.error, variant: "destructive" });
    toast({ title: "Default settings saved", variant: "success" });
  };

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Default settings applied when creating new quiz rooms.
      </p>
      <Card>
        <CardContent className="pt-6">
          <QuizRoomSettingsForm
            title=""
            sessionType="live_classroom"
            settings={settings}
            onTitleChange={() => {}}
            onSessionTypeChange={() => {}}
            onSettingsChange={setSettings}
          />
          <Button className="mt-6" onClick={handleSave}>
            Save Defaults
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}


export function QuizRoomDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const rawTab = searchParams.get("tab");
  const tab: Tab =
    rawTab === "bank" ||
    rawTab === "live" ||
    rawTab === "homework" ||
    rawTab === "reports" ||
    rawTab === "templates" ||
    rawTab === "ai" ||
    rawTab === "settings"
      ? rawTab
      : "quizzes";
  const navigate = useNavigate();

  useEffect(() => {
    const prev = document.title;
    document.title = "Quiz Room — THE GATEHUB";
    return () => {
      document.title = prev;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeQuizAttemptEvents(() => {
      void queryClient.invalidateQueries({ queryKey: ["my-quizzes"] });
      void queryClient.invalidateQueries({ queryKey: ["quiz-rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["quiz-room-reports"] });
    });
    return unsubscribe;
  }, [queryClient]);

  const setTab = (id: Tab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-3">
            <DoorOpen className="h-8 w-8 text-primary" />
            Quiz Room
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Create quizzes, manage your question bank, host live sessions, and assign homework — one instructor workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(questionEditorPath("new"))}>
            <Plus className="mr-2 h-4 w-4" />
            New Question
          </Button>
          <Button size="lg" onClick={() => navigate("/instructor/quiz-room/create")}>
            <Plus className="mr-2 h-5 w-5" />
            Create Quiz
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b pb-px">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
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

      {tab === "quizzes" && <MyQuizzesTab />}
      {tab === "bank" && <QuestionBankPanel />}
      {tab === "live" && <LiveSessionsTab />}
      {tab === "homework" && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium">Homework assignments</p>
              <p className="text-sm text-muted-foreground">
                Assign quizzes as homework from any quiz card — coming in the next update.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {tab === "templates" && <TemplatesTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "ai" && <AiStudioPanel />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}
