import { useCallback, useEffect, useState } from "react";

export function useUndoRedo<T>(initial: T, limit = 50) {
  const [present, setPresent] = useState(initial);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const set = useCallback(
    (next: T, { record = true }: { record?: boolean } = {}) => {
      setPresent((prev) => {
        if (record) {
          setPast((p) => [...p.slice(-limit + 1), prev]);
          setFuture([]);
        }
        return next;
      });
    },
    [limit]
  );

  const reset = useCallback((next: T) => {
    setPast([]);
    setFuture([]);
    setPresent(next);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setPresent((current) => {
        setFuture((f) => [current, ...f]);
        return previous;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPresent((current) => {
        setPast((p) => [...p, current]);
        return next;
      });
      return f.slice(1);
    });
  }, []);

  return {
    present,
    set,
    reset,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}

/** Debounced autosave for component config drafts. */
export function useAutosave<T>(
  value: T,
  onSave: (value: T) => Promise<void>,
  delayMs = 800,
  enabled = true
) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      setError(null);
      void onSave(value)
        .then(() => setLastSaved(new Date()))
        .catch((err) => setError(err instanceof Error ? err.message : "Save failed"))
        .finally(() => setSaving(false));
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [value, onSave, delayMs, enabled]);

  return { saving, lastSaved, error };
}
