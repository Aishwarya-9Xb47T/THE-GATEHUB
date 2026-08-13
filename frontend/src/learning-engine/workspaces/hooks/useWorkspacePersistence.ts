import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";

interface UseWorkspacePersistenceOptions {
  universeId: string;
  lessonId: string;
  stepId: string;
  workspaceKind: string;
  initialPayload: Record<string, unknown>;
  onLoaded?: (payload: Record<string, unknown>) => void;
  onReady?: () => void;
  autosaveMs?: number;
}

export function useWorkspacePersistence({
  universeId,
  lessonId,
  stepId,
  workspaceKind,
  initialPayload,
  onLoaded,
  onReady,
  autosaveMs = 4000,
}: UseWorkspacePersistenceOptions) {
  const payloadRef = useRef<Record<string, unknown>>(initialPayload);
  const timerRef = useRef<number | null>(null);
  const loadedRef = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  const onReadyRef = useRef(onReady);

  onLoadedRef.current = onLoaded;
  onReadyRef.current = onReady;

  useEffect(() => {
    if (loadedRef.current) return;
    let cancelled = false;
    void (async () => {
      const res = await api<{ success: boolean; snapshot?: { payload: Record<string, unknown> } }>(
        `/integrations/learning-universes/${universeId}/lessons/${lessonId}/workspaces/${stepId}?kind=${workspaceKind}`
      );
      if (cancelled) return;
      if (!res.error && res.data?.snapshot?.payload) {
        payloadRef.current = res.data.snapshot.payload;
        onLoadedRef.current?.(res.data.snapshot.payload);
      }
      loadedRef.current = true;
      onReadyRef.current?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [universeId, lessonId, stepId, workspaceKind]);

  const save = useCallback(
    async (payload: Record<string, unknown>, options?: { syncDrive?: boolean; label?: string }) => {
      payloadRef.current = payload;
      await api(`/integrations/learning-universes/${universeId}/lessons/${lessonId}/workspaces/${stepId}`, {
        method: "PUT",
        body: {
          payload,
          workspaceKind,
          syncDrive: options?.syncDrive ?? false,
          label: options?.label,
        },
      });
    },
    [universeId, lessonId, stepId, workspaceKind]
  );

  const scheduleSave = useCallback(
    (payload: Record<string, unknown>, syncDrive = false) => {
      payloadRef.current = payload;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void save(payload, { syncDrive, label: "Autosave" });
      }, autosaveMs);
    },
    [autosaveMs, save]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { save, scheduleSave, getPayload: () => payloadRef.current };
}
