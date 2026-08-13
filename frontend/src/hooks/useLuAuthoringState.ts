import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LuAuthoringState, StructureAction } from "@/lib/luAuthoring/types";

export interface MutateResult {
  state: LuAuthoringState;
  createdFilePath?: string;
  createdComponentId?: string;
  transactionId?: string;
  canUndo?: boolean;
  canRedo?: boolean;
}

/**
 * Learning Mode authoring state — read path never mutates.
 * Only commit / undo / redo endpoints change project data.
 */
export function useLuAuthoringState(projectId: string, enabled: boolean) {
  const [state, setState] = useState<LuAuthoringState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ success: boolean; data: LuAuthoringState; error?: string }>(
        `/latex-projects/${projectId}/lu/state`
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      const data = res.data?.data;
      if (data) {
        setState(data);
        if (!data.isV2) {
          setError("Learning Universe is not ready. Use Developer Mode or create a v2 project.");
        }
      } else {
        setError("Authoring state response was empty");
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to load authoring state");
    } finally {
      setLoading(false);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(
    async (action: StructureAction): Promise<MutateResult> => {
      const res = await api<{
        success: boolean;
        data: MutateResult;
        error?: string;
      }>(`/latex-projects/${projectId}/lu/structure`, { method: "POST", body: action });
      if (res.error) throw new Error(res.error);
      if (res.data?.data?.state) setState(res.data.data.state);
      return res.data!.data;
    },
    [projectId]
  );

  const undo = useCallback(async () => {
    const res = await api<{ success: boolean; data: { state: LuAuthoringState }; error?: string }>(
      `/latex-projects/${projectId}/lu/undo`,
      { method: "POST" }
    );
    if (res.error) throw new Error(res.error);
    if (res.data?.data?.state) setState(res.data.data.state);
    return res.data?.data?.state;
  }, [projectId]);

  const redo = useCallback(async () => {
    const res = await api<{ success: boolean; data: { state: LuAuthoringState }; error?: string }>(
      `/latex-projects/${projectId}/lu/redo`,
      { method: "POST" }
    );
    if (res.error) throw new Error(res.error);
    if (res.data?.data?.state) setState(res.data.data.state);
    return res.data?.data?.state;
  }, [projectId]);

  return {
    state,
    loading,
    error,
    refresh,
    mutate,
    undo,
    redo,
    canUndo: state?.canUndo ?? false,
    canRedo: state?.canRedo ?? false,
  };
}
