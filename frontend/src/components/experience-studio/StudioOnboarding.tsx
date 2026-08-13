import {
  BookOpen,
  ChevronRight,
  Layers,
  Map,
  Plus,
  Sparkles,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LuAuthoringState } from "@/lib/luAuthoring/types";

export type OnboardingStep = "welcome" | "track" | "module" | "lesson" | "blocks";

interface StudioOnboardingProps {
  step: OnboardingStep;
  courseTitle: string;
  onCreateTrack: () => void;
  onCreateModule: () => void;
  onCreateLesson: () => void;
  onAddOverview: () => void;
  loading?: boolean;
}

const STEPS: { id: OnboardingStep; label: string; num: number }[] = [
  { id: "track", label: "Create a track", num: 1 },
  { id: "module", label: "Add a module", num: 2 },
  { id: "lesson", label: "Create a lesson", num: 3 },
  { id: "blocks", label: "Add learning content", num: 4 },
];

function stepIndex(s: OnboardingStep) {
  if (s === "welcome") return -1;
  return STEPS.findIndex((x) => x.id === s);
}

export function StudioOnboarding({
  step,
  courseTitle,
  onCreateTrack,
  onCreateModule,
  onCreateLesson,
  onAddOverview,
  loading,
}: StudioOnboardingProps) {
  const current = stepIndex(step);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-4">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
            {step === "welcome" ? "Welcome to your Learning Universe" : "Let's build your course"}
          </h1>
          <p className="text-muted-foreground text-base max-w-md mx-auto">
            {step === "welcome"
              ? `"${courseTitle}" is ready. We'll guide you through creating a complete learning experience — no technical setup required.`
              : "Follow the steps below. Each one unlocks the next part of your course."}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                i < current
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : i === current
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 border-border text-muted-foreground"
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-black/10 flex items-center justify-center text-[10px] font-bold">
                {i < current ? "✓" : s.num}
              </span>
              {s.label}
            </div>
          ))}
        </div>

        <Card className="border-2 border-primary/20 shadow-lg">
          <CardContent className="p-8">
            {step === "welcome" || step === "track" ? (
              <ActionPanel
                icon={<Map className="w-8 h-8 text-primary" />}
                title="Step 1 · Create your first track"
                description="Tracks organize major learning paths in your course — like 'Foundations' or 'Advanced Topics'."
                buttonLabel="Create Track"
                onClick={onCreateTrack}
                loading={loading}
              />
            ) : step === "module" ? (
              <ActionPanel
                icon={<Layers className="w-8 h-8 text-primary" />}
                title="Step 2 · Add a module"
                description="Modules group related lessons together. Students progress through modules in order."
                buttonLabel="Create Module"
                onClick={onCreateModule}
                loading={loading}
              />
            ) : step === "lesson" ? (
              <ActionPanel
                icon={<BookOpen className="w-8 h-8 text-primary" />}
                title="Step 3 · Create your first lesson"
                description="A lesson is a complete learning experience — overview, theory, practice, quizzes, and projects."
                buttonLabel="Create Lesson"
                onClick={onCreateLesson}
                loading={loading}
              />
            ) : (
              <ActionPanel
                icon={<GraduationCap className="w-8 h-8 text-primary" />}
                title="Step 4 · Add your first content"
                description="Start with an Overview block so students know what they'll learn. You can add theory, practice, and quizzes next."
                buttonLabel="Add Overview"
                onClick={onAddOverview}
                loading={loading}
              />
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Tip: Use the <strong>+</strong> button in the course outline on the left for quick actions anytime.
        </p>
      </div>
    </div>
  );
}

function ActionPanel({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <div className="text-center space-y-5">
      <div className="flex justify-center">{icon}</div>
      <div>
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">{description}</p>
      </div>
      <Button type="button" size="lg" className="gap-2 px-8" onClick={onClick} disabled={loading}>
        <Plus className="w-4 h-4" />
        {buttonLabel}
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function resolveOnboardingStep(state: LuAuthoringState | null): OnboardingStep {
  if (!state?.explorer?.[0]) return "welcome";
  const universe = state.explorer[0];
  const tracks = universe.children ?? [];
  if (tracks.length === 0) return "track";

  const modules = tracks.flatMap((t) => t.children ?? []).filter((c) => c.kind === "module");
  if (modules.length === 0) return "module";

  const lessons = modules.flatMap((m) => (m.children ?? []).filter((c) => c.kind === "lesson"));
  if (lessons.length === 0) return "lesson";

  const hasBlocks = lessons.some((l) => (l.children?.length ?? 0) > 0);
  if (!hasBlocks) return "blocks";

  return "blocks"; // still show blocks hint if user hasn't selected lesson - handled by center panel
}

export function countCourseStructure(state: LuAuthoringState | null) {
  const universe = state?.explorer?.[0];
  const tracks = universe?.children ?? [];
  const modules = tracks.flatMap((t) => (t.children ?? []).filter((c) => c.kind === "module"));
  const lessons = modules.flatMap((m) => (m.children ?? []).filter((c) => c.kind === "lesson"));
  return { tracks: tracks.length, modules: modules.length, lessons: lessons.length };
}
