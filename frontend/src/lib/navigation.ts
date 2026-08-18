/** Public landing page — home control always navigates here */
export const LANDING_PATH = "/";

export function isLandingPath(pathname: string): boolean {
  return pathname === LANDING_PATH;
}

export type LearnRouteContext = "student" | "public" | "instructor-preview";

/** Whether the user is inside the enrolled student dashboard learn shell */
export function getLearnRouteContext(pathname: string): LearnRouteContext {
  if (pathname.startsWith("/instructor/preview/learning-universe/")) return "instructor-preview";
  if (pathname.startsWith("/student/learning-universe/")) return "student";
  return "public";
}

export function getLearnBasePath(pathname: string): string {
  const ctx = getLearnRouteContext(pathname);
  if (ctx === "instructor-preview") return "/instructor/preview/learning-universe";
  if (ctx === "student") return "/student/learning-universe";
  return "/learning-universe";
}

export function getLearningUniverseCoursePath(universeId: string): string {
  return `/learning-universe/${universeId}/course`;
}

export type WorkspaceKind = "project" | "coding-lab" | "notebook" | "research";

export interface LearnPathOptions {
  universeId: string;
  lessonId?: string;
  workspace?: WorkspaceKind;
  stepId?: string;
  search?: URLSearchParams | Record<string, string | null | undefined> | string;
  pathname?: string;
}

function formatSearch(
  search?: URLSearchParams | Record<string, string | null | undefined> | string
): string {
  if (!search) return "";
  if (search instanceof URLSearchParams) return search.toString();
  if (typeof search === "string") return search.replace(/^\?/, "");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value != null && value !== "") params.set(key, value);
  }
  return params.toString();
}

/** Build a learn-player or workspace URL that preserves student vs public route context */
export function buildLearnPath(options: LearnPathOptions): string {
  const base = getLearnBasePath(
    options.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "")
  );
  const { universeId, lessonId, workspace, stepId } = options;

  let path = `${base}/${universeId}/learn`;
  if (lessonId) {
    path += `/${lessonId}`;
    if (workspace === "project") {
      path += "/project";
    } else if (workspace && stepId) {
      path += `/${workspace}/${stepId}`;
    }
  }

  const qs = formatSearch(options.search);
  if (qs) path += `?${qs}`;
  return path;
}

export function buildWorkspacePath(
  pathname: string,
  universeId: string,
  lessonId: string,
  workspace: WorkspaceKind,
  stepId?: string
): string {
  return buildLearnPath({ pathname, universeId, lessonId, workspace, stepId });
}

export function splitPathAndSearch(to: string): { pathname: string; search: string } {
  const [pathname, search = ""] = to.split("?");
  return { pathname, search: search ? `?${search}` : "" };
}

/** True when destination matches current location (no navigation needed) */
export function isSameLocation(
  current: { pathname: string; search?: string },
  to: string
): boolean {
  const { pathname, search } = splitPathAndSearch(to);
  const norm = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);
  return norm(current.pathname) === norm(pathname) && (current.search ?? "") === search;
}

export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

export type NavigateFn = (to: string, options?: NavigateOptions) => void;

/** Navigate only when the target differs — avoids duplicate history entries */
export function navigateIfDifferent(
  navigate: NavigateFn,
  current: { pathname: string; search?: string },
  to: string,
  options?: NavigateOptions
): void {
  if (isSameLocation(current, to)) return;
  navigate(to, options);
}

/** Brand home control — always lands on the public home page */
export function navigateToLanding(navigate: NavigateFn, current: { pathname: string; search?: string }): void {
  navigateIfDifferent(navigate, current, LANDING_PATH);
}

const SCROLL_PREFIX = "gatehub-scroll:";

export function scrollStorageKey(pathname: string, search: string): string {
  return `${SCROLL_PREFIX}${pathname}${search}`;
}

export function readStoredScroll(key: string): number {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

export function writeStoredScroll(key: string, y: number): void {
  try {
    sessionStorage.setItem(key, String(y));
  } catch {
    /* quota / private mode */
  }
}

/** Primary scroll container for the current layout */
export function getScrollContainer(): HTMLElement | Window {
  const help = document.querySelector<HTMLElement>(".help-center-scroll");
  if (help) return help;
  const main = document.querySelector<HTMLElement>("main.app-shell__main, main.overflow-y-auto");
  if (main && main.scrollHeight > main.clientHeight) return main;
  return window;
}

export function readScrollY(container: HTMLElement | Window): number {
  return container === window ? window.scrollY : (container as HTMLElement).scrollTop;
}

export function writeScrollY(container: HTMLElement | Window, y: number): void {
  if (container === window) window.scrollTo(0, y);
  else (container as HTMLElement).scrollTop = y;
}

const SECTIONS_PREFIX = "gatehub-sections:";

export function readOpenSections(storageKey: string): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function writeOpenSections(storageKey: string, sections: Record<string, boolean>): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(sections));
  } catch {
    /* ignore */
  }
}
