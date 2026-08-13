import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EditorLayout } from "./EditorLayout";
import type { EditorMode, ProjectTemplateId } from "./types";
import { VisualAssetProvider, useVisualAssets } from "@/components/visual-authoring/VisualAssetContext";
import { useProjectBootstrap } from "@/lib/academicStudio/useProjectBootstrap";
import type { StudioLoadPhase } from "@/lib/academicStudio/studioContract";

export interface GateHubEditorProps {
  mode: EditorMode;
  projectId?: string;
  lectureId?: string;
  universeId?: string;
  courseId?: string;
  productType?: import("@/lib/productTypes").ProductType;
  title?: string;
  template?: ProjectTemplateId;
  extraLeftPanel?: React.ReactNode;
  forceDeveloperMode?: boolean;
  onBackToExperienceStudio?: () => void;
}

const BOOTSTRAP_LABELS: Partial<Record<StudioLoadPhase, string>> = {
  metadata: "Loading metadata…",
  project: "Loading project…",
  explorer: "Loading course structure…",
  assets: "Loading assets…",
  diagnostics: "Running diagnostics…",
};

function GateHubEditorInner({
  mode,
  projectId,
  lectureId,
  universeId,
  courseId,
  productType,
  extraLeftPanel,
  forceDeveloperMode,
  onBackToExperienceStudio,
}: GateHubEditorProps & { projectId: string }) {
  const { setUniverseContext, setProjectAssets } = useVisualAssets();
  const bootstrap = useProjectBootstrap({ projectId, mode, universeId });

  const syncProjectAssets = useCallback(
    (projectFiles: Array<{ name: string; path: string; s3Url?: string | null; isFolder?: boolean }>) => {
      const media = projectFiles.filter(
        (f) =>
          !f.isFolder &&
          (Boolean(f.s3Url) ||
            f.path.includes("/assets/") ||
            /\.(png|jpe?g|gif|svg|webp|pdf|mp4|webm|mov)$/i.test(f.name))
      );
      setProjectAssets(
        media.map((f) => ({
          name: f.name,
          path: f.path,
          s3Url: f.s3Url,
        }))
      );
      if (import.meta.env.DEV) {
        console.info("[StudentPreview:assets]", {
          count: media.length,
          sample: media.filter((f) => /img/i.test(f.name)).slice(0, 3),
        });
      }
    },
    [setProjectAssets]
  );

  useEffect(() => {
    if (bootstrap.assets.length) {
      syncProjectAssets(bootstrap.assets);
    }
  }, [bootstrap.assets, syncProjectAssets]);

  useEffect(() => {
    if (!universeId) return;
    let cancelled = false;
    void api<{ data?: { assets?: { filename: string; storedFilename: string }[] } }>(
      `/learning-universes/${universeId}`
    ).then((res) => {
      if (cancelled) return;
      setUniverseContext(universeId, res.data?.data?.assets ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [universeId, setUniverseContext]);

  if (bootstrap.phase !== "ready" && bootstrap.phase !== "error") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-[#1e1e1e] text-gray-300">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm">{BOOTSTRAP_LABELS[bootstrap.phase] ?? "Preparing Academic Studio…"}</p>
      </div>
    );
  }

  if (bootstrap.error) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-[#1e1e1e] text-gray-300 p-8">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-center max-w-md">{bootstrap.error}</p>
        <Button variant="outline" size="sm" onClick={bootstrap.retry}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <EditorLayout
      projectId={projectId}
      mode={mode}
      universeId={universeId}
      courseId={courseId}
      lectureId={lectureId}
      productType={productType}
      extraLeftPanel={extraLeftPanel}
      forceDeveloperMode={forceDeveloperMode}
      onBackToExperienceStudio={onBackToExperienceStudio}
      onProjectFilesSynced={syncProjectAssets}
    />
  );
}

/**
 * Unified GATEHUB Overleaf editor entry point.
 * Used by course notes, free resources, and learning universe authoring.
 */
export function GateHubEditor({
  mode,
  projectId: initialProjectId,
  lectureId,
  universeId,
  courseId,
  productType,
  title,
  template,
  extraLeftPanel,
  forceDeveloperMode,
  onBackToExperienceStudio,
}: GateHubEditorProps) {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string | null>(initialProjectId || null);
  const [isLoading, setIsLoading] = useState(!initialProjectId);

  const bootstrap = useCallback(async () => {
    setIsLoading(true);
    try {
      if (initialProjectId) {
        setProjectId(initialProjectId);
        return;
      }

      if (mode === "course" && lectureId) {
        const res = await api<{ success: boolean; project: { id: string } }>(
          `/latex-projects/lecture/${lectureId}/ensure`,
          { method: "POST" }
        );
        if (res.data?.project?.id) {
          setProjectId(res.data.project.id);
          return;
        }
        throw new Error(res.error || "Could not open lecture project");
      }

      const res = await api<{ success: boolean; project: { id: string } }>("/latex-projects", {
        method: "POST",
        body: {
          title: title || "New Project",
          template:
            template ||
            (mode === "learning-universe"
              ? "learning-universe-v2"
              : mode === "academic-course"
                ? "academic-course"
                : "blank"),
        },
      });

      if (res.data?.project?.id) {
        setProjectId(res.data.project.id);
      } else {
        throw new Error(res.error || "Failed to create project");
      }
    } catch (err: any) {
      console.error("[GateHubEditor] bootstrap failed:", err);
      navigate(-1);
    } finally {
      setIsLoading(false);
    }
  }, [initialProjectId, lectureId, mode, navigate, template, title]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (isLoading || !projectId) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#1e1e1e]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <VisualAssetProvider projectId={projectId}>
      <GateHubEditorInner
        mode={mode}
        projectId={projectId}
        lectureId={lectureId}
        universeId={universeId}
        courseId={courseId}
        productType={productType}
        extraLeftPanel={extraLeftPanel}
        forceDeveloperMode={forceDeveloperMode}
        onBackToExperienceStudio={onBackToExperienceStudio}
      />
    </VisualAssetProvider>
  );
}
