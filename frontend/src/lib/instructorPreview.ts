import type { Location } from "react-router-dom";

export interface InstructorPreviewReturnState {
  from: string;
}

const PREVIEW_PREFIX = "/instructor/preview";
const INSTRUCTOR_PREVIEW_QUERY = "instructorPreview";
const RETURN_QUERY = "returnTo";
const RETURN_STORAGE_KEY = "gatehub-instructor-preview-return";

export { INSTRUCTOR_PREVIEW_QUERY };

export function isInstructorPreviewPath(pathname: string, search = ""): boolean {
  if (pathname.startsWith(`${PREVIEW_PREFIX}/course/`)) return true;
  if (!pathname.includes("/course/") || !pathname.endsWith("/learn")) return false;
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(
    INSTRUCTOR_PREVIEW_QUERY
  ) === "1";
}

export function isInstructorLuPreviewPath(pathname: string): boolean {
  return pathname.startsWith(`${PREVIEW_PREFIX}/learning-universe/`);
}

export function instructorPreviewState(location: Location): InstructorPreviewReturnState {
  const from = location.pathname + location.search;
  persistInstructorPreviewReturn(from);
  return { from };
}

export function persistInstructorPreviewReturn(from: string) {
  if (!from || from.includes("/learn")) return;
  try {
    sessionStorage.setItem(RETURN_STORAGE_KEY, from);
  } catch {
    /* ignore */
  }
}

/** Same canonical learning universe preview route — preview mode is toggled via query param. */
export function buildInstructorCoursePreviewPath(courseId: string, returnTo?: string, luId?: string): string {
  const targetId = luId || courseId;
  const params = new URLSearchParams({ preview: "1", [INSTRUCTOR_PREVIEW_QUERY]: "1" });
  const resolvedReturn = returnTo || getStoredInstructorPreviewReturn();
  if (resolvedReturn) {
    params.set(RETURN_QUERY, resolvedReturn);
  }
  return `${PREVIEW_PREFIX}/learning-universe/${targetId}/learn?${params.toString()}`;
}

export function buildInstructorLuPreviewPath(universeId: string, lessonId?: string): string {
  let path = `${PREVIEW_PREFIX}/learning-universe/${universeId}/learn`;
  if (lessonId) path += `/${lessonId}`;
  return path;
}

function getStoredInstructorPreviewReturn(): string | null {
  try {
    return sessionStorage.getItem(RETURN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readReturnToFromSearch(search: string): string | null {
  const value = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(
    RETURN_QUERY
  );
  return value && value.startsWith("/") ? value : null;
}

export function readInstructorPreviewReturn(
  state: unknown,
  search = "",
  fallback = "/instructor"
): string {
  const fromState = (state as InstructorPreviewReturnState | null)?.from;
  if (typeof fromState === "string" && fromState.length > 0 && !fromState.includes("/learn")) {
    return fromState;
  }

  const fromQuery = readReturnToFromSearch(search);
  if (fromQuery) return fromQuery;

  const stored = getStoredInstructorPreviewReturn();
  if (stored && !stored.includes("/learn")) return stored;

  return fallback;
}

export function clearInstructorPreviewReturn() {
  try {
    sessionStorage.removeItem(RETURN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
