export interface DocumentHistory<T> {
  past: T[];
  present: T;
  future: T[];
}

export function createHistory<T>(initial: T): DocumentHistory<T> {
  return { past: [], present: structuredClone(initial), future: [] };
}

export function commitHistory<T>(history: DocumentHistory<T>, next: T, maxDepth = 80): DocumentHistory<T> {
  return {
    past: [...history.past, structuredClone(history.present)].slice(-maxDepth),
    present: structuredClone(next),
    future: [],
  };
}

export function undoHistory<T>(history: DocumentHistory<T>): DocumentHistory<T> | null {
  if (history.past.length === 0) return null;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: structuredClone(previous),
    future: [structuredClone(history.present), ...history.future],
  };
}

export function redoHistory<T>(history: DocumentHistory<T>): DocumentHistory<T> | null {
  if (history.future.length === 0) return null;
  const next = history.future[0];
  return {
    past: [...history.past, structuredClone(history.present)],
    present: structuredClone(next),
    future: history.future.slice(1),
  };
}

export function canUndo<T>(history: DocumentHistory<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: DocumentHistory<T>): boolean {
  return history.future.length > 0;
}
