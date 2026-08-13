import { BookOpen, CheckCircle2, Play, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Mock student experience shown before any lesson content exists. */
export function StudioMockPreview({ courseTitle }: { courseTitle: string }) {
  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-background">
      <div className="px-4 py-3 border-b bg-background/90 shrink-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Student preview</p>
        <p className="text-xs text-muted-foreground">This is how your published course will feel</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6">
            <p className="text-xs uppercase tracking-widest opacity-80 mb-1">Preview</p>
            <h2 className="text-xl font-bold">{courseTitle || "Your Course"}</h2>
            <p className="text-sm opacity-90 mt-2">Students will see a beautiful, guided lesson journey here.</p>
          </div>
        </Card>

        <Card className="p-4 border-dashed">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Overview</p>
              <p className="text-xs text-muted-foreground mt-1">A welcoming introduction to each lesson</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-dashed">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Theory & reading</p>
              <p className="text-xs text-muted-foreground mt-1">Clean, readable content — like Coursera or Khan Academy</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-dashed">
          <div className="flex items-start gap-3">
            <Play className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Interactive practice</p>
              <p className="text-xs text-muted-foreground mt-1">Try-it-yourself exercises with instant feedback</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-dashed">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Quizzes & projects</p>
              <p className="text-xs text-muted-foreground mt-1">Assessments and dedicated project workspaces</p>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground pt-2">
          Add content to a lesson — this panel updates live.
        </p>
      </div>
    </div>
  );
}
