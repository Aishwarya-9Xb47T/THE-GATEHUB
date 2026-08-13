import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { QuizEditorData, QuizQuestion } from "@/lib/quizBuilder/types";
import type { QuestionForClient } from "@/lib/liveSession/types";
import { LiveQuestionDisplay } from "@/components/live-session/LiveQuestionDisplay";
import { LivePlayerHeader } from "@/components/live-session/LivePlayerHeader";
import { QuizCoverBanner } from "@/components/quiz-branding/QuizCoverBanner";
import { metadataToIdentity } from "@/lib/quizBranding/types";
import { Button } from "@/components/ui/button";

function toQuestionForClient(q: QuizQuestion): QuestionForClient {
  const meta = (q.metadata || {}) as Record<string, unknown>;
  const resolvedMediaUrl =
    (q as any).mediaUrl ||
    (meta.mediaUrl as string) ||
    (meta.media as any)?.url ||
    (meta.diagram as any)?.dataUrl ||
    (meta.diagram as any)?.url ||
    (Array.isArray(meta.images) ? meta.images[0]?.dataUrl || meta.images[0]?.url : undefined);

  return {
    id: q.id,
    text: q.text,
    type: q.type,
    marks: q.marks,
    order: q.order,
    media: (q.media && (q.media as any).url) ? (q.media as any) : ((meta.media && (meta.media as any).url) ? (meta.media as any) : (resolvedMediaUrl ? { url: resolvedMediaUrl, kind: "image" } : null)),
    metadata: q.metadata,
    options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order })),
  };
}

interface StudentPreviewStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quiz: QuizEditorData;
  initialIndex?: number;
}

/**
 * Full-screen student-exact preview — same question player as live sessions.
 */
export function StudentPreviewStudio({
  open,
  onOpenChange,
  quiz,
  initialIndex = 0,
}: StudentPreviewStudioProps) {
  const [index, setIndex] = useState(initialIndex);
  const identity = useMemo(() => metadataToIdentity(quiz.metadata, quiz), [quiz]);
  const q = quiz.questions[index];
  const question = q ? toQuestionForClient(q) : null;

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleSubmit = () => {
    if (index < quiz.questions.length - 1) {
      setIndex((i) => i + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-background">
      <div className="flex items-center justify-between border-b bg-card/95 px-4 py-2 backdrop-blur-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Student preview</p>
          <p className="text-sm font-semibold">Exactly how learners see this quiz in a live session</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          <X className="mr-2 h-4 w-4" />
          Close preview
        </Button>
      </div>

      <QuizCoverBanner
        id={quiz.id}
        bannerUrl={identity.bannerUrl}
        thumbnailUrl={identity.thumbnailUrl}
        coverGradient={String(quiz.metadata?.coverGradient || "")}
        theme={identity.theme}
        alt={quiz.title}
        icon={identity}
        className="h-28 w-full shrink-0 sm:h-32"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4">
          <h1 className="truncate text-lg font-bold text-white drop-shadow sm:text-xl">{quiz.title}</h1>
        </div>
      </QuizCoverBanner>

      <LivePlayerHeader
        title={quiz.title}
        questionIndex={index}
        questionCount={quiz.questions.length}
        connectionPhase="connected"
      />

      <main className="flex-1 overflow-y-auto bg-gradient-to-b from-muted/20 to-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {question ? (
            <LiveQuestionDisplay
              key={question.id}
              question={question}
              questionIndex={index}
              questionCount={quiz.questions.length}
              timerSeconds={quiz.settings.timePerQuestion || 30}
              questionStartedAt={new Date().toISOString()}
              connected
              onSubmit={handleSubmit}
            />
          ) : (
            <p className="py-16 text-center text-muted-foreground">Add questions to preview the student experience.</p>
          )}
        </div>
      </main>

      <div className="border-t bg-card/90 px-4 py-2 text-center text-xs text-muted-foreground">
        Uses the same question renderer as the live student player — not a simplified preview.
      </div>
    </div>
  );
}
