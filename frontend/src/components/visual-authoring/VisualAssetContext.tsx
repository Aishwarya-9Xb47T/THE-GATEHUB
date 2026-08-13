import { createContext, useContext, useMemo, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  registerVisualAsset,
  removeVisualAsset,
  getVisualAssetPreviewUrl,
  getPendingVisualAssets,
  clearVisualAssets,
} from "@/lib/visualBuilder/visualAssetStore";
import { resolveLearningUniverseAsset } from "@/lib/resolveLearningUniverseAsset";
import {
  mediaApiBase,
  resolveProjectAssetPublicUrl,
} from "@/lib/latexEditor/projectAssetResolver";
import { withUploadAuth } from "@/lib/courseMediaUrls";
import { logStudentPreviewImage } from "@/lib/latexEditor/studentPreviewImageDebug";

export interface ServerAsset {
  filename: string;
  storedFilename: string;
}

export interface ProjectAsset {
  name: string;
  path: string;
  s3Url?: string | null;
}

interface VisualAssetContextValue {
  universeId?: string;
  projectId?: string;
  serverAssets: ServerAsset[];
  projectAssets: ProjectAsset[];
  setUniverseContext: (universeId: string | undefined, assets: ServerAsset[]) => void;
  setProjectAssets: (assets: ProjectAsset[]) => void;
  registerAsset: (filename: string, file: File) => void;
  removeAsset: (filename: string) => void;
  resolvePreviewUrl: (fileRef: string) => string;
  getPendingFiles: () => File[];
  clearAssets: () => void;
}

const VisualAssetContext = createContext<VisualAssetContextValue | null>(null);

export function VisualAssetProvider({
  children,
  projectId: initialProjectId,
}: {
  children: ReactNode;
  projectId?: string;
}) {
  const [universeId, setUniverseId] = useState<string | undefined>();
  const [projectId, setProjectId] = useState<string | undefined>(initialProjectId);
  const [serverAssets, setServerAssets] = useState<ServerAsset[]>([]);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);

  useEffect(() => {
    setProjectId(initialProjectId);
  }, [initialProjectId]);

  const setUniverseContext = useCallback((id: string | undefined, assets: ServerAsset[]) => {
    setUniverseId(id);
    setServerAssets(assets);
  }, []);

  const registerAsset = useCallback((filename: string, file: File) => {
    registerVisualAsset(filename, file);
  }, []);

  const removeAsset = useCallback((filename: string) => {
    removeVisualAsset(filename);
  }, []);

  const resolvePreviewUrl = useCallback((fileRef: string) => {
    if (!fileRef) return "";
    const blob = getVisualAssetPreviewUrl(fileRef);
    if (blob) {
      logStudentPreviewImage("blob", { fileRef, url: blob });
      return blob;
    }
    if (fileRef.startsWith("http://") || fileRef.startsWith("https://")) {
      logStudentPreviewImage("remote", { fileRef, url: fileRef });
      return fileRef;
    }
    if (fileRef.startsWith("/uploads/")) {
      const url = withUploadAuth(`${mediaApiBase()}${fileRef}`);
      logStudentPreviewImage("uploads-path", { fileRef, url });
      return url;
    }

    const projectUrl = resolveProjectAssetPublicUrl(fileRef, projectAssets, projectId);
    if (projectUrl) return projectUrl;

    if (fileRef.startsWith("/")) return fileRef;
    const universeHit = resolveLearningUniverseAsset(fileRef, universeId, serverAssets);
    logStudentPreviewImage("universe-fallback", {
      fileRef,
      url: universeHit.resolvedUrl,
      status: universeHit.status,
    });
    return universeHit.resolvedUrl;
  }, [universeId, projectId, serverAssets, projectAssets]);

  const value = useMemo(() => ({
    universeId,
    projectId,
    serverAssets,
    projectAssets,
    setUniverseContext,
    setProjectAssets,
    registerAsset,
    removeAsset,
    resolvePreviewUrl,
    getPendingFiles: getPendingVisualAssets,
    clearAssets: clearVisualAssets,
  }), [universeId, projectId, serverAssets, projectAssets, setUniverseContext, registerAsset, removeAsset, resolvePreviewUrl]);

  return (
    <VisualAssetContext.Provider value={value}>
      {children}
    </VisualAssetContext.Provider>
  );
}

export function useVisualAssets() {
  const ctx = useContext(VisualAssetContext);
  if (!ctx) throw new Error("useVisualAssets must be used within VisualAssetProvider");
  return ctx;
}

export function useOptionalVisualAssets() {
  return useContext(VisualAssetContext);
}
