import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type StateMap = Map<string, unknown>;

interface ComponentStateContextValue {
  getState: <T>(key: string) => T | undefined;
  setState: (key: string, value: unknown) => void;
}

const ComponentStateContext = createContext<ComponentStateContextValue | null>(null);

export function buildComponentScopeKey(
  universeId: string,
  publishVersionId: string,
  lessonId: string,
  stepId: string
): string {
  return `${universeId}:${publishVersionId}:${lessonId}:${stepId}`;
}

export function ComponentStateProvider({
  children,
  scopePrefix,
}: {
  children: ReactNode;
  scopePrefix: string;
}) {
  const storeRef = useRef<StateMap>(new Map());
  const prefixRef = useRef(scopePrefix);

  useEffect(() => {
    if (prefixRef.current !== scopePrefix) {
      storeRef.current = new Map();
      prefixRef.current = scopePrefix;
    }
  }, [scopePrefix]);

  const getState = useCallback(<T,>(key: string): T | undefined => {
    return storeRef.current.get(key) as T | undefined;
  }, []);

  const setState = useCallback((key: string, value: unknown) => {
    storeRef.current.set(key, value);
  }, []);

  const value = useMemo(() => ({ getState, setState }), [getState, setState]);

  return <ComponentStateContext.Provider value={value}>{children}</ComponentStateContext.Provider>;
}

export function useComponentStateStore() {
  const ctx = useContext(ComponentStateContext);
  if (!ctx) throw new Error("useComponentStateStore must be used within ComponentStateProvider");
  return ctx;
}

export function usePersistedStepState<T>(
  scopeKey: string,
  stateKey: string,
  initial: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const { getState, setState } = useComponentStateStore();
  const fullKey = `${scopeKey}:${stateKey}`;

  const [state, setLocalState] = useState<T>(() => {
    const saved = getState<T>(fullKey);
    return saved !== undefined ? saved : initial;
  });

  const setPersisted = useCallback(
    (value: T | ((prev: T) => T)) => {
      setLocalState((prev) => {
        const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
        setState(fullKey, next);
        return next;
      });
    },
    [fullKey, setState]
  );

  return [state, setPersisted];
}
