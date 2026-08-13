import { useCallback, useEffect, useRef, useState } from "react";
import { saveQuizEditor } from "@/lib/quizBuilder/api";
import type { QuizEditorData } from "@/lib/quizBuilder/types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useQuizAutoSave(quizId: string, data: QuizEditorData | null, enabled = true) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const timerRef = useRef<number | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const saveNow = useCallback(async () => {
    const d = dataRef.current;
    if (!d) return;
    setStatus("saving");
    const res = await saveQuizEditor(quizId, {
      title: d.title,
      description: d.description,
      subject: d.subject,
      visibility: d.visibility,
      pinned: d.pinned,
      favorited: d.favorited,
      settings: d.settings,
      sections: d.sections,
      questions: d.questions.map((q, i) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        marks: q.marks,
        order: i,
        explanation: q.explanation,
        hints: q.hints,
        tags: q.tags,
        bloomLevel: q.bloomLevel,
        estimatedSeconds: q.estimatedSeconds,
        sectionId: q.sectionId,
        media: q.media,
        metadata: q.metadata,
        options: q.options.map((o, oi) => ({ ...o, order: oi })),
      })),
    });
    if (res.error) {
      setStatus("error");
      return;
    }
    setStatus("saved");
    setLastSynced(new Date());
  }, [quizId]);

  useEffect(() => {
    if (!enabled || !data) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void saveNow();
    }, 2000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [data, enabled, saveNow]);

  return { status, lastSynced, saveNow };
}
