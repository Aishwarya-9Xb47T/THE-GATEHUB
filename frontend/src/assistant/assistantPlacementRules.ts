import type { AssistantAnchor } from "./useAssistantPlacement";
import { isLandingPath } from "@/lib/navigation";

export type PlacementZone = "landing" | "learn" | "help" | "dashboard" | "default";

export interface PlacementContextRule {
  zone: PlacementZone;
  workspaceSelector: string | null;
  anchors: AssistantAnchor[];
  /** Extra inset (px) inside workspace bottom — keeps launcher above step footers */
  bottomInset?: number;
}

function matchLearn(path: string): boolean {
  return (
    path.includes("/learn") ||
    (path.includes("/learning-universe/") &&
      (path.includes("/coding-lab/") ||
        path.includes("/research/") ||
        path.includes("/notebook/") ||
        path.includes("/project")))
  );
}

export function resolvePlacementZone(pathname: string): PlacementZone {
  if (isLandingPath(pathname)) return "landing";
  if (pathname.startsWith("/help")) return "help";
  if (matchLearn(pathname)) return "learn";
  if (/^\/(student|instructor|admin)/.test(pathname)) return "dashboard";
  return "default";
}

export function getPlacementRule(pathname: string): PlacementContextRule {
  const zone = resolvePlacementZone(pathname);

  switch (zone) {
    case "landing":
      return {
        zone,
        workspaceSelector: null,
        anchors: ["bottom-right"],
        bottomInset: 24,
      };
    case "learn":
      return {
        zone,
        workspaceSelector: '[data-floating-workspace="learn-main"]',
        anchors: ["bottom-right", "right-center", "top-right", "top-left"],
        bottomInset: 8,
      };
    case "help":
      return {
        zone,
        workspaceSelector: '[data-floating-workspace="help-main"]',
        anchors: ["bottom-right", "top-right", "right-center"],
      };
    case "dashboard":
      return {
        zone,
        workspaceSelector: '[data-floating-workspace="dashboard-main"]',
        anchors: ["bottom-right", "bottom-left", "right-center"],
      };
    default:
      return {
        zone,
        workspaceSelector: null,
        anchors: ["bottom-right", "bottom-left", "right-center", "left-center", "top-right", "top-left"],
      };
  }
}

export const MOBILE_BREAKPOINT = 640;

export function isMobileViewport(): boolean {
  const vv = window.visualViewport;
  return (vv?.width ?? window.innerWidth) < MOBILE_BREAKPOINT;
}
