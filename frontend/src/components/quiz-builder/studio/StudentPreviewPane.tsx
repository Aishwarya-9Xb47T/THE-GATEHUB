import { useState, useEffect } from "react";
import { Monitor, Tablet, Smartphone, Moon, Sun, Clock, Radio } from "lucide-react";
import type { QuizEditorData } from "@/lib/quizBuilder/types";
import { MediaRenderer, QuestionPlayerBody, toPlayerQuestion } from "@/components/media";
import { QuizCoverBanner } from "@/components/quiz-branding/QuizCoverBanner";
import { metadataToIdentity } from "@/lib/quizBranding/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Device = "desktop" | "tablet" | "mobile";
type Theme = "light" | "dark";

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "max-w-2xl",
  tablet: "max-w-md",
  mobile: "max-w-sm",
};

interface StudentPreviewPaneProps {
  quiz: QuizEditorData;
  focusedQuestionId?: string | null;
  className?: string;
}

/** Live student preview — updates as you edit, no toggle required */
export function StudentPreviewPane({ quiz, focusedQuestionId, className }: StudentPreviewPaneProps) {
  const focusedIndex = focusedQuestionId
    ? Math.max(0, quiz.questions.findIndex((q) => q.id === focusedQuestionId))
    : 0;
  const [index, setIndex] = useState(focusedIndex);
  const [device, setDevice] = useState<Device>("desktop");
  const [theme, setTheme] = useState<Theme>("light");
  const [timerOn, setTimerOn] = useState(true);
  const [previewAnswer, setPreviewAnswer] = useState<unknown>(undefined);

  const displayIndex = focusedQuestionId ? focusedIndex : index;
  const q = quiz.questions[displayIndex];
  const timeLeft = quiz.settings.timePerQuestion;
  const identity = metadataToIdentity(quiz.metadata, quiz);

  useEffect(() => {
    setPreviewAnswer(undefined);
  }, [q?.id]);

  return (
    <div className={cn("flex h-full flex-col bg-gradient-to-b from-muted/30 to-muted/10", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-card/90 px-3 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Live preview</span>
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Radio className="h-2.5 w-2.5 animate-pulse text-emerald-500" />
            {displayIndex + 1} / {quiz.questions.length}
          </Badge>
        </div>
        <div className="ml-auto flex flex-wrap gap-1">
          {(["desktop", "tablet", "mobile"] as Device[]).map((d) => {
            const Icon = d === "desktop" ? Monitor : d === "tablet" ? Tablet : Smartphone;
            return (
              <Button
                key={d}
                size="sm"
                variant={device === d ? "default" : "ghost"}
                className="h-7 rounded-full px-2"
                onClick={() => setDevice(d)}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            );
          })}
          <Button size="sm" variant={theme === "light" ? "default" : "ghost"} className="h-7 rounded-full px-2" onClick={() => setTheme("light")}>
            <Sun className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant={theme === "dark" ? "default" : "ghost"} className="h-7 rounded-full px-2" onClick={() => setTheme("dark")}>
            <Moon className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant={timerOn ? "default" : "ghost"} className="h-7 rounded-full px-2" onClick={() => setTimerOn((v) => !v)}>
            <Clock className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 justify-center overflow-y-auto p-4">
        <div
          className={cn(
            "w-full rounded-2xl border shadow-xl transition-all duration-300",
            DEVICE_WIDTH[device],
            theme === "dark" ? "border-white/10 bg-zinc-900 text-white" : "border-border/60 bg-white text-foreground"
          )}
        >
          <QuizCoverBanner
            id={quiz.id}
            bannerUrl={identity.bannerUrl}
            thumbnailUrl={identity.thumbnailUrl}
            coverGradient={String(quiz.metadata?.coverGradient || "")}
            theme={identity.theme}
            alt={quiz.title}
            icon={identity}
            className="h-20 w-full rounded-t-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-2 left-4 right-4">
              <p className="truncate text-sm font-semibold text-white">{quiz.title || "Untitled Quiz"}</p>
            </div>
          </QuizCoverBanner>
          {timerOn && (
            <div className="flex items-center gap-2 border-b px-4 py-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-2/3 rounded-full bg-primary transition-all" />
                </div>
                <span className="text-[10px] tabular-nums font-medium">{timeLeft}s</span>
              </div>
          )}

          {q ? (
            <div className="space-y-4 p-4">
              <QuestionPlayerBody
                question={toPlayerQuestion({
                  id: q.id,
                  text: q.text || "Question text…",
                  type: q.type,
                  options: q.options,
                  metadata: q.metadata as Record<string, unknown>,
                })}
                value={previewAnswer}
                onChange={setPreviewAnswer}
              />
              {q.explanation?.trim() && (
                <div
                  className={cn(
                    "rounded-xl border p-3 text-sm",
                    theme === "dark" ? "border-emerald-500/30 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50"
                  )}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Explanation</p>
                  <MediaRenderer content={q.explanation} />
                </div>
              )}
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">Add a question to see the live preview</p>
          )}

          {!focusedQuestionId && quiz.questions.length > 1 && (
            <div className="flex justify-between border-t px-4 py-2.5">
              <Button variant="outline" size="sm" className="rounded-full" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
                Previous
              </Button>
              <Button size="sm" className="rounded-full" disabled={index >= quiz.questions.length - 1} onClick={() => setIndex((i) => i + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
