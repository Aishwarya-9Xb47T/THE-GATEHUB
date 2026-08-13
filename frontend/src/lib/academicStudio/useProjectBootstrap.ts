import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { EditorMode } from "@/components/overleaf/types";
import type { StudioLoadPhase } from "./studioContract";

export interface ProjectAssetMeta {
  name: string;
  path: string;
  s3Url?: string | null;
  isFolder: boolean;
}

export interface BuildDiagnostics {
  ready: boolean;
  healthScore?: number;
  issueCount?: number;
  isV2?: boolean;
}

export interface ProjectBootstrapResult {
  phase: StudioLoadPhase;
  error: string | null;
  projectTitle: string | null;
  assets: ProjectAssetMeta[];
  diagnostics: BuildDiagnostics | null;
  retry: () => void;
}

interface UseProjectBootstrapOptions {
  projectId: string;
  mode: EditorMode;
  universeId?: string;
}

/**
 * Unified project load pipeline used by every GateHubEditor instance.
 * Metadata → project → explorer (LU) → assets → diagnostics → ready
 */
export function useProjectBootstrap({
  projectId,
  mode,
  universeId,
}: UseProjectBootstrapOptions): ProjectBootstrapResult {
  const [phase, setPhase] = useState<StudioLoadPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [assets, setAssets] = useState<ProjectAssetMeta[]>([]);
  const [diagnostics, setDiagnostics] = useState<BuildDiagnostics | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setPhase("metadata");
      setError(null);

      try {
        if (universeId) {
          await api(`/learning-universes/${universeId}`).catch(() => null);
        }

        if (cancelled) return;
        setPhase("project");

        const projectRes = await api<{
          success: boolean;
          project: { title?: string; files: ProjectAssetMeta[] };
        }>(`/latex-projects/${projectId}`);

        if (projectRes.error || !projectRes.data?.project) {
          throw new Error(projectRes.error || "Could not load project");
        }

        const project = projectRes.data.project;
        setProjectTitle(project.title ?? null);

        const imageAssets = (project.files ?? []).filter(
          (f) => !f.isFolder && /\.(png|jpe?g|gif|svg|webp|pdf|mp4|webm|mov)$/i.test(f.name)
        );
        setAssets(imageAssets);

        if (cancelled) return;
        setPhase("assets");

        const isLuMode = mode === "learning-universe" || mode === "academic-course";

        if (isLuMode) {
          setPhase("explorer");
          const stateRes = await api<{
            success: boolean;
            data?: { isV2?: boolean; healthScore?: number };
          }>(`/latex-projects/${projectId}/lu/state`);

          setPhase("diagnostics");
          const buildRes = await api<{
            success: boolean;
            data?: { ready?: boolean; issues?: unknown[] };
          }>(`/latex-projects/${projectId}/lu/validate-build`);

          if (!cancelled) {
            setDiagnostics({
              isV2: stateRes.data?.data?.isV2,
              healthScore: stateRes.data?.data?.healthScore,
              ready: buildRes.data?.data?.ready ?? false,
              issueCount: Array.isArray(buildRes.data?.data?.issues)
                ? buildRes.data!.data!.issues!.length
                : 0,
            });
          }
        }

        if (!cancelled) setPhase("ready");
      } catch (err: any) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Project bootstrap failed";
        setError(message);
        setPhase("error");
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId, mode, universeId, retryKey]);

  return { phase, error, projectTitle, assets, diagnostics, retry };
}
