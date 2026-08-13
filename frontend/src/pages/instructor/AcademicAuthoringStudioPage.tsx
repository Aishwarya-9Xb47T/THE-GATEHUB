import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GateHubEditor } from "@/components/overleaf/GateHubEditor";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import {
  useAcademicStudioProject,
  type InitPhase,
} from "@/components/academic-studio/useAcademicStudioProject";
import { loadBrandingSession, saveBrandingSession } from "@/lib/courseBranding/types";
import { parseProductType, PRODUCT_TYPES, type ProductType } from "@/lib/productTypes";

const PHASE_LABELS: Record<InitPhase, string> = {
  idle: "Starting…",
  "loading-project": "Loading project…",
  "loading-explorer": "Loading explorer…",
  connecting: "Connecting collaboration…",
  "preparing-editor": "Preparing editor…",
  done: "Ready",
  error: "Failed",
};

export function AcademicAuthoringStudioPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const editId = searchParams.get("edit");
  const draftUniverseId = searchParams.get("universe");
  const projectParam = searchParams.get("project");
  const branding = loadBrandingSession();
  const sourceId = editId || draftUniverseId || branding?.universeId || undefined;
  const universeId = sourceId;
  const directProjectId = !sourceId && projectParam ? projectParam : null;
  const productType: ProductType =
    branding?.productType ||
    parseProductType(searchParams.get("productType")) ||
    PRODUCT_TYPES.LEARNING_UNIVERSE;

  const brandingRedirect = useMemo(() => {
    switch (productType) {
      case PRODUCT_TYPES.PREMIUM_COURSE:
        return `/instructor/courses/new/branding?studio=academic&productType=${PRODUCT_TYPES.PREMIUM_COURSE}`;
      case PRODUCT_TYPES.FREE_COURSE:
        return `/manage-courses/new/branding?studio=academic&productType=${PRODUCT_TYPES.FREE_COURSE}`;
      case PRODUCT_TYPES.FREE_RESOURCE:
        return `/manage-courses/new/branding?studio=academic&productType=${PRODUCT_TYPES.FREE_RESOURCE}`;
      default:
        return `/instructor/learning-universe/new/branding?studio=academic&productType=${PRODUCT_TYPES.LEARNING_UNIVERSE}`;
    }
  }, [productType]);

  const [slowInit, setSlowInit] = useState(false);

  useEffect(() => {
    if (directProjectId) return;
    if (!sourceId) {
      navigate(brandingRedirect, { replace: true });
      return;
    }
    if (!editId && !draftUniverseId) {
      const params = new URLSearchParams(location.search);
      params.set("universe", sourceId);
      if (productType !== PRODUCT_TYPES.LEARNING_UNIVERSE) {
        params.set("productType", productType);
      }
      navigate(`${location.pathname}?${params.toString()}`, { replace: true });
    }
  }, [sourceId, editId, draftUniverseId, directProjectId, navigate, brandingRedirect, location.pathname, location.search, productType]);

  const fetchExisting = useCallback(async (id: string) => {
    const universeRes = await api<{
      data: {
        title: string;
        dslSource?: string;
        sourceProjectId?: string;
        structuredData?: { sourceProjectId?: string; productType?: string };
      };
    }>(`/learning-universes/${id}`);
    if (universeRes.error || !universeRes.data?.data) return null;

    const universe = universeRes.data.data;
    const structured = universe.structuredData;
    if (structured?.productType && !branding?.productType) {
      saveBrandingSession({
        ...(loadBrandingSession() || {
          title: universe.title,
          subtitle: "",
          description: "",
          categoryId: "",
          difficulty: "Beginner",
          bannerUrl: "",
          thumbnailUrl: "",
          bannerType: "template",
        }),
        universeId: id,
        productType: parseProductType(structured.productType),
      });
    }
    return {
      title: universe.title,
      dslSource: universe.dslSource || "",
      sourceProjectId: universe.sourceProjectId || structured?.sourceProjectId,
    };
  }, [branding?.productType]);

  const rehydratePath = useCallback(
    (id: string) => `/learning-universes/${id}/rehydrate-project`,
    []
  );

  const { projectId, isLoading, initError, initPhase, retry } = useAcademicStudioProject({
    template: "learning-universe-v2",
    sampleMainTex: "",
    sourceId,
    directProjectId,
    branding: branding ? { title: branding.title, universeId: branding.universeId } : undefined,
    fetchExisting,
    rehydratePath,
  });

  useEffect(() => {
    if (!isLoading) {
      setSlowInit(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowInit(true), 5000);
    return () => window.clearTimeout(timer);
  }, [isLoading, retry]);

  const phaseLabel = useMemo(() => PHASE_LABELS[initPhase] || "Initializing…", [initPhase]);

  if (!sourceId && !directProjectId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-3 bg-[#1e1e1e]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-slate-400 text-sm">[Academic Studio] Initializing editor…</p>
        {slowInit && (
          <p className="text-slate-500 text-xs animate-pulse">{phaseLabel}</p>
        )}
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-[#1e1e1e] px-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <div>
          <p className="text-slate-200 font-medium">Failed to initialize Academic Studio</p>
          <p className="text-slate-400 text-sm mt-2 max-w-md">{initError || "Unknown error"}</p>
        </div>
        <Button type="button" variant="outline" onClick={retry} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
        <p className="text-xs text-slate-500 max-w-sm">
          Check that the backend is running on port 5000 and you are logged in as the project owner.
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden">
      <GateHubEditor
        mode="learning-universe"
        projectId={projectId}
        universeId={universeId}
        productType={productType}
      />
    </div>
  );
}
