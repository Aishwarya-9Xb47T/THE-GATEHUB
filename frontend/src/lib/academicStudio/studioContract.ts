/**
 * SINGLE SOURCE OF TRUTH — Academic Studio entry points and capabilities.
 * All routes that open the LaTeX editor must use these helpers.
 * Do not add parallel editor routes without extending this contract.
 */
import type { EditorMode } from "@/components/overleaf/types";
import { PRODUCT_TYPES, parseProductType, type ProductType } from "@/lib/productTypes";

/** Canonical fullscreen Academic Studio route (Learning Universe + premium/free products). */
export const ACADEMIC_STUDIO_ROUTE = "/instructor/learning-universe/new/academic";

export const LATEX_EDITOR_ROUTES = {
  academicStudio: ACADEMIC_STUDIO_ROUTE,
  resourcesEditor: "/instructor/latex-editor",
  courseNotes: "/instructor/course/:courseId/lectures/:lectureId/notes",
} as const;

/** Every routed editor page renders GateHubEditor → components/overleaf/EditorLayout. */
export const CANONICAL_EDITOR_STACK = "GateHubEditor" as const;

export type StudioLoadPhase =
  | "idle"
  | "metadata"
  | "project"
  | "explorer"
  | "assets"
  | "diagnostics"
  | "ready"
  | "error";

export interface StudioEntryContext {
  mode: EditorMode;
  productType?: ProductType;
  universeId?: string;
  courseId?: string;
  lectureId?: string;
  projectId?: string;
  readOnly?: boolean;
}

export function editorModeForProductType(_productType: ProductType): EditorMode {
  // All branded products (premium, free, LU) use the canonical LU v2 pipeline in Academic Studio.
  return "learning-universe";
}

/** New draft after branding — universe id in query. */
export function getAcademicStudioUniverseUrl(universeId: string, productType?: ProductType): string {
  const params = new URLSearchParams();
  params.set("universe", universeId);
  const pt = productType ?? PRODUCT_TYPES.LEARNING_UNIVERSE;
  if (pt !== PRODUCT_TYPES.LEARNING_UNIVERSE) {
    params.set("productType", pt);
  }
  return `${ACADEMIC_STUDIO_ROUTE}?${params.toString()}`;
}

/** Edit existing published/draft universe. */
export function getAcademicStudioEditUrl(universeId: string, productType?: ProductType): string {
  const params = new URLSearchParams();
  params.set("edit", universeId);
  const pt = productType ?? PRODUCT_TYPES.LEARNING_UNIVERSE;
  if (pt !== PRODUCT_TYPES.LEARNING_UNIVERSE) {
    params.set("productType", pt);
  }
  return `${ACADEMIC_STUDIO_ROUTE}?${params.toString()}`;
}

/** Open an existing LaTeX project directly (premium course fallback, resources). */
export function getAcademicStudioProjectUrl(projectId: string, productType?: ProductType): string {
  const params = new URLSearchParams();
  params.set("project", projectId);
  const pt = productType ?? PRODUCT_TYPES.LEARNING_UNIVERSE;
  if (pt !== PRODUCT_TYPES.LEARNING_UNIVERSE) {
    params.set("productType", pt);
  }
  return `${ACADEMIC_STUDIO_ROUTE}?${params.toString()}`;
}

/** Parse Academic Studio URL search params into entry context. */
export function parseAcademicStudioSearch(search: string): StudioEntryContext {
  const params = new URLSearchParams(search);
  const productType = parseProductType(params.get("productType"));
  const universeId = params.get("edit") || params.get("universe") || undefined;
  const projectId = params.get("project") || undefined;

  return {
    mode: editorModeForProductType(productType),
    productType,
    universeId,
    projectId,
  };
}

/** Resources / standalone project editor (non-LU products). */
export function getResourcesEditorUrl(projectId: string): string {
  return `${LATEX_EDITOR_ROUTES.resourcesEditor}/${projectId}`;
}

/** Course lecture notes editor. */
export function getCourseNotesEditorUrl(courseId: string, lectureId: string): string {
  return `/instructor/course/${courseId}/lectures/${lectureId}/notes`;
}
