import { useCallback, useRef, useState } from "react";
import type { QuizEditorData } from "@/lib/quizBuilder/types";

const MAX_HISTORY = 50;

export function useQuizStudioHistory(initial: QuizEditorData | null) {
  const pastRef = useRef<QuizEditorData[]>([]);
  const futureRef = useRef<QuizEditorData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const pushSnapshot = useCallback(
    (snapshot: QuizEditorData) => {
      pastRef.current = [...pastRef.current.slice(-MAX_HISTORY + 1), snapshot];
      futureRef.current = [];
      syncFlags();
    },
    [syncFlags]
  );

  const undo = useCallback(
    (current: QuizEditorData): QuizEditorData | null => {
      if (!pastRef.current.length) return null;
      const prev = pastRef.current.pop()!;
      futureRef.current = [current, ...futureRef.current];
      syncFlags();
      return prev;
    },
    [syncFlags]
  );

  const redo = useCallback(
    (current: QuizEditorData): QuizEditorData | null => {
      if (!futureRef.current.length) return null;
      const next = futureRef.current.shift()!;
      pastRef.current = [...pastRef.current, current];
      syncFlags();
      return next;
    },
    [syncFlags]
  );

  const reset = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    syncFlags();
  }, [syncFlags]);

  return { pushSnapshot, undo, redo, reset, canUndo, canRedo, initial };
}
