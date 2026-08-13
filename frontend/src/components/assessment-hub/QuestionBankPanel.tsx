import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Library,
  User,
  Users,
  Building2,
  FolderKanban,
  Sparkles,
  FileEdit,
  ClipboardCheck,
  CheckCircle2,
  Archive,
  Download,
  Filter,
  X,
} from "lucide-react";
import { listBankQuestions } from "@/lib/assessmentStudio/api";
import { QUESTION_TYPE_LABELS } from "@/lib/assessmentStudio/types";
import { QuestionCard } from "@/components/assessment-studio/QuestionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { questionEditorPath } from "@/lib/assessment/migrationLog";
import { CollectionsPanel } from "./CollectionsPanel";
import { ContentBuilderPanel } from "./ContentBuilderPanel";

export type BankSectionId =
  | "all"
  | "mine"
  | "shared"
  | "department"
  | "collections"
  | "ai_generated"
  | "draft"
  | "review"
  | "published"
  | "archived"
  | "imports";

interface BankSection {
  id: BankSectionId;
  label: string;
  icon: typeof Library;
  comingSoon?: boolean;
  alternateView?: boolean;
}

const BANK_SECTIONS: BankSection[] = [
  { id: "all", label: "All Questions", icon: Library },
  { id: "mine", label: "My Questions", icon: User },
  { id: "shared", label: "Shared", icon: Users, comingSoon: true },
  { id: "department", label: "Department", icon: Building2, comingSoon: true },
  { id: "collections", label: "Collections", icon: FolderKanban, alternateView: true },
  { id: "ai_generated", label: "AI Generated", icon: Sparkles },
  { id: "draft", label: "Draft", icon: FileEdit },
  { id: "review", label: "Review", icon: ClipboardCheck },
  { id: "published", label: "Published", icon: CheckCircle2 },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "imports", label: "Imports", icon: Download, alternateView: true },
];

function sectionQueryParams(section: BankSectionId): Record<string, string> {
  switch (section) {
    case "ai_generated":
      return { source: "ai" };
    case "draft":
      return { status: "draft" };
    case "review":
      return { status: "pending_review" };
    case "published":
      return { status: "published" };
    case "archived":
      return { status: "archived" };
    case "imports":
      return { source: "imported" };
    default:
      return {};
  }
}

export function QuestionBankPanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = (searchParams.get("section") as BankSectionId) || "all";
  const [showFilters, setShowFilters] = useState(false);

  const search = searchParams.get("q") || "";
  const type = searchParams.get("type") || "";
  const difficulty = searchParams.get("difficulty") || "";
  const bloomLevel = searchParams.get("bloom") || "";
  const topic = searchParams.get("topic") || "";
  const tag = searchParams.get("tag") || "";
  const language = searchParams.get("language") || "";
  const status = searchParams.get("status") || "";

  const activeSection = BANK_SECTIONS.find((s) => s.id === section) ?? BANK_SECTIONS[0]!;

  const setSection = (id: BankSectionId) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "bank");
    if (id === "all") next.delete("section");
    else next.set("section", id);
    setSearchParams(next);
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "bank");
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    ["q", "type", "difficulty", "bloom", "topic", "tag", "language", "status"].forEach((k) =>
      next.delete(k)
    );
    next.set("tab", "bank");
    if (section !== "all") next.set("section", section);
    setSearchParams(next);
  };

  const activeFilterCount = [type, difficulty, bloomLevel, topic, tag, language, status].filter(Boolean).length;

  const apiParams = useMemo(() => {
    const base = sectionQueryParams(section);
    return {
      ...base,
      q: search || undefined,
      type: type || base.type || undefined,
      difficulty: difficulty || undefined,
      bloomLevel: bloomLevel || undefined,
      topic: topic || undefined,
      tag: tag || undefined,
      language: language || undefined,
      status: status || base.status || undefined,
      page: 1,
      limit: 48,
    };
  }, [section, search, type, difficulty, bloomLevel, topic, tag, language, status]);

  const { data, isLoading } = useQuery({
    queryKey: ["bank-questions", apiParams],
    enabled: !activeSection.comingSoon && !activeSection.alternateView,
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      Object.entries(apiParams).forEach(([k, v]) => {
        if (v !== undefined && v !== "") params[k] = v;
      });
      const res = await listBankQuestions(params);
      return res.data?.data;
    },
  });

  if (activeSection.alternateView && section === "collections") {
    return (
      <div className="flex flex-col gap-6 lg:flex-row">
        <BankSectionNav section={section} onSectionChange={setSection} />
        <div className="min-w-0 flex-1">
          <CollectionsPanel />
        </div>
      </div>
    );
  }

  if (activeSection.alternateView && section === "imports") {
    return (
      <div className="flex flex-col gap-6 lg:flex-row">
        <BankSectionNav section={section} onSectionChange={setSection} />
        <div className="min-w-0 flex-1">
          <ContentBuilderPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <BankSectionNav section={section} onSectionChange={setSection} />

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder='Search questions, topics, tags…'
              value={search}
              onChange={(e) => setFilter("q", e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
            <Button size="sm" onClick={() => navigate(questionEditorPath("new"))}>
              <Plus className="mr-2 h-4 w-4" />
              New Question
            </Button>
          </div>
        </div>

        {showFilters && (
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect
                label="Question Type"
                value={type}
                onChange={(v) => setFilter("type", v)}
                options={Object.entries(QUESTION_TYPE_LABELS).map(([k, label]) => ({ value: k, label }))}
              />
              <FilterSelect
                label="Difficulty"
                value={difficulty}
                onChange={(v) => setFilter("difficulty", v)}
                options={[
                  { value: "easy", label: "Easy" },
                  { value: "medium", label: "Medium" },
                  { value: "hard", label: "Hard" },
                ]}
              />
              <FilterSelect
                label="Bloom Level"
                value={bloomLevel}
                onChange={(v) => setFilter("bloom", v)}
                options={["L1", "L2", "L3", "L4", "L5", "L6"].map((l) => ({ value: l, label: l }))}
              />
              <FilterSelect
                label="Status"
                value={status}
                onChange={(v) => setFilter("status", v)}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "pending_review", label: "Pending Review" },
                  { value: "published", label: "Published" },
                  { value: "archived", label: "Archived" },
                ]}
              />
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Topic / Subject</label>
                <Input
                  value={topic}
                  onChange={(e) => setFilter("topic", e.target.value)}
                  placeholder="e.g. Data Structures"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tags</label>
                <Input value={tag} onChange={(e) => setFilter("tag", e.target.value)} placeholder="arrays, BFS" />
              </div>
              <FilterSelect
                label="Language"
                value={language}
                onChange={(v) => setFilter("language", v)}
                options={[
                  { value: "en", label: "English" },
                  { value: "hi", label: "Hindi" },
                  { value: "es", label: "Spanish" },
                  { value: "fr", label: "French" },
                ]}
              />
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5 opacity-60">
                  <label className="text-xs font-medium text-muted-foreground">Creator / Organization</label>
                  <Input disabled placeholder="Coming soon — Phase B" />
                </div>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {activeSection.comingSoon ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <activeSection.icon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
              <p className="font-medium">{activeSection.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Shared and department question libraries arrive in Phase B with organization permissions.
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading questions…</p>
        ) : !data?.items.length ? (
          <Card className="border-dashed py-16 text-center">
            <p className="text-muted-foreground">
              No questions in <span className="font-medium">{activeSection.label}</span>.
              Create one or import from an external source.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={() => setSection("imports")}>
                <Download className="mr-2 h-4 w-4" />
                Import
              </Button>
              <Button onClick={() => navigate(questionEditorPath("new"))}>
                <Plus className="mr-2 h-4 w-4" />
                New Question
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {data.total} question{data.total === 1 ? "" : "s"} · {activeSection.label}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  onClick={() => navigate(questionEditorPath(q.id))}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BankSectionNav({
  section,
  onSectionChange,
}: {
  section: BankSectionId;
  onSectionChange: (id: BankSectionId) => void;
}) {
  return (
    <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-52 lg:flex-col lg:overflow-visible">
      {BANK_SECTIONS.map(({ id, label, icon: Icon, comingSoon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSectionChange(id)}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
            section === id
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
          {comingSoon && (
            <Badge variant="outline" className="ml-auto hidden text-[10px] lg:inline-flex">
              Soon
            </Badge>
          )}
        </button>
      ))}
    </nav>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
