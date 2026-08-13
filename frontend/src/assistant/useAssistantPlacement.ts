import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import {
  getPlacementRule,
  isMobileViewport,
  MOBILE_BREAKPOINT,
} from "./assistantPlacementRules";

export type AssistantAnchor =
  | "bottom-right"
  | "bottom-left"
  | "right-center"
  | "left-center"
  | "top-right"
  | "top-left";

const MARKER_SELECTOR = "[data-floating-obstacle]";
const WORKSPACE_SELECTOR = "[data-floating-workspace]";
const MARGIN = 16;
const DEBOUNCE_MS = 80;

export interface AssistantWorkspace {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface AssistantPlacement {
  left: number;
  top: number;
  anchor: AssistantAnchor;
  workspace: AssistantWorkspace;
}

function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function readViewport(): { vw: number; vh: number; offsetTop: number; offsetLeft: number } {
  const vv = window.visualViewport;
  return {
    vw: vv?.width ?? window.innerWidth,
    vh: vv?.height ?? window.innerHeight,
    offsetTop: vv?.offsetTop ?? 0,
    offsetLeft: vv?.offsetLeft ?? 0,
  };
}

function isVisible(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) < 0.05) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 2 && rect.height > 2;
}

function clipToViewport(rect: DOMRect): DOMRect {
  const { vw, vh } = readViewport();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(vw, rect.right);
  const bottom = Math.min(vh, rect.bottom);
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

function insetWorkspace(rect: DOMRect, margin: number, bottomExtra = 0): AssistantWorkspace {
  return {
    top: rect.top + margin,
    left: rect.left + margin,
    width: Math.max(80, rect.width - margin * 2),
    height: Math.max(60, rect.height - margin * 2 - bottomExtra),
  };
}

/** Collect obstacle rects — every marked element is a hard collision zone. */
export function collectLayoutObstacles(excludeEl?: HTMLElement | null): DOMRect[] {
  const rects: DOMRect[] = [];
  const nodes = document.querySelectorAll(MARKER_SELECTOR);

  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (excludeEl && (excludeEl === node || excludeEl.contains(node) || node.contains(excludeEl))) continue;
    if (!isVisible(node)) continue;
    const clipped = clipToViewport(node.getBoundingClientRect());
    if (clipped.width <= 4 || clipped.height <= 4) continue;

    const kind = node.getAttribute("data-floating-obstacle");
    const pad =
      kind === "bottom-nav" ? 20 :
      kind === "learn-sidebar" || kind === "sidebar" ? 12 :
      kind === "sidebar-account" ? 14 :
      kind === "toast" ? 10 :
      MARGIN;

    rects.push(
      new DOMRect(
        clipped.left - pad,
        clipped.top - pad,
        clipped.width + pad * 2,
        clipped.height + pad * 2,
      ),
    );
  }

  return rects;
}

function findDeclaredWorkspace(selector: string | null, bottomInset = 0): AssistantWorkspace | null {
  if (selector) {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement && isVisible(el)) {
      return insetWorkspace(clipToViewport(el.getBoundingClientRect()), MARGIN, bottomInset);
    }
  }

  const fallback = document.querySelector(WORKSPACE_SELECTOR);
  if (fallback instanceof HTMLElement && isVisible(fallback)) {
    return insetWorkspace(clipToViewport(fallback.getBoundingClientRect()), MARGIN, bottomInset);
  }

  return null;
}

/** Viewport minus docked chrome when no declared workspace exists. */
export function computeAssistantWorkspace(obstacles: DOMRect[]): AssistantWorkspace {
  const { vw, vh, offsetTop, offsetLeft } = readViewport();

  let top = offsetTop + MARGIN;
  let left = offsetLeft + MARGIN;
  let right = offsetLeft + vw - MARGIN;
  let bottom = offsetTop + vh - MARGIN;

  for (const o of obstacles) {
    const isLeftDock = o.left <= 20 && o.width >= 120 && o.height >= vh * 0.2;
    const isRightDock = o.right >= vw - 20 && o.width >= 72 && o.height >= vh * 0.15;
    const isTopChrome = o.top <= 20 && o.height <= 200 && o.width >= vw * 0.15;
    const isBottomChrome = o.bottom >= vh - 20 && o.height <= 320 && o.width >= vw * 0.15;

    if (isLeftDock) left = Math.max(left, o.right + MARGIN);
    if (isRightDock) right = Math.min(right, o.left - MARGIN);
    if (isTopChrome) top = Math.max(top, o.bottom + MARGIN);
    if (isBottomChrome) bottom = Math.min(bottom, o.top - MARGIN);
  }

  return {
    top,
    left,
    width: Math.max(120, right - left),
    height: Math.max(80, bottom - top),
  };
}

export function resolveAssistantWorkspace(
  pathname: string,
  obstacles: DOMRect[],
): AssistantWorkspace {
  const rule = getPlacementRule(pathname);
  return (
    findDeclaredWorkspace(rule.workspaceSelector, rule.bottomInset ?? 0) ??
    computeAssistantWorkspace(obstacles)
  );
}

function anchorCoords(
  anchor: AssistantAnchor,
  workspace: AssistantWorkspace,
  width: number,
  height: number,
): { left: number; top: number } {
  const maxLeft = workspace.left + workspace.width - width;
  const maxTop = workspace.top + workspace.height - height;
  const midTop = workspace.top + Math.max(0, (workspace.height - height) / 2);

  switch (anchor) {
    case "bottom-right":
      return { left: maxLeft, top: maxTop };
    case "bottom-left":
      return { left: workspace.left, top: maxTop };
    case "top-right":
      return { left: maxLeft, top: workspace.top };
    case "top-left":
      return { left: workspace.left, top: workspace.top };
    case "right-center":
      return { left: maxLeft, top: midTop };
    case "left-center":
      return { left: workspace.left, top: midTop };
  }
}

function overlaps(rect: DOMRect, obstacles: DOMRect[], padding = 8): boolean {
  return obstacles.some(
    (o) =>
      !(
        rect.right + padding <= o.left ||
        rect.left - padding >= o.right ||
        rect.bottom + padding <= o.top ||
        rect.top - padding >= o.bottom
      ),
  );
}

function fitsWorkspace(rect: DOMRect, workspace: AssistantWorkspace): boolean {
  return (
    rect.left >= workspace.left - 0.5 &&
    rect.top >= workspace.top - 0.5 &&
    rect.right <= workspace.left + workspace.width + 0.5 &&
    rect.bottom <= workspace.top + workspace.height + 0.5
  );
}

function isPlacementSafe(
  left: number,
  top: number,
  width: number,
  height: number,
  workspace: AssistantWorkspace,
  obstacles: DOMRect[],
): boolean {
  const rect = new DOMRect(left, top, width, height);
  return fitsWorkspace(rect, workspace) && !overlaps(rect, obstacles);
}

export function findAssistantPlacement(
  workspace: AssistantWorkspace,
  width: number,
  height: number,
  obstacles: DOMRect[],
  anchorOrder: AssistantAnchor[],
): AssistantPlacement {
  const w = Math.min(width, workspace.width);
  const h = Math.min(height, workspace.height);

  for (const anchor of anchorOrder) {
    const { left, top } = anchorCoords(anchor, workspace, w, h);
    if (isPlacementSafe(left, top, w, h, workspace, obstacles)) {
      return { left, top, anchor, workspace };
    }
  }

  const step = 24;
  const maxLeft = workspace.left + workspace.width - w;
  const maxTop = workspace.top + workspace.height - h;
  let best = { left: maxLeft, top: maxTop, score: Number.POSITIVE_INFINITY };

  for (let top = workspace.top; top <= maxTop; top += step) {
    for (let left = workspace.left; left <= maxLeft; left += step) {
      if (!isPlacementSafe(left, top, w, h, workspace, obstacles)) continue;
      const score = (maxTop - top) * 3 + (maxLeft - left);
      if (score < best.score) best = { left, top, score };
    }
  }

  if (Number.isFinite(best.score)) {
    return { left: best.left, top: best.top, anchor: "bottom-right", workspace };
  }

  const { left, top } = anchorCoords("bottom-right", workspace, w, h);
  return {
    left: Math.min(Math.max(left, workspace.left), maxLeft),
    top: Math.min(Math.max(top, workspace.top), maxTop),
    anchor: "bottom-right",
    workspace,
  };
}

export interface FooterDockInsets {
  bottom: number;
  right: number;
}

/** Bottom-right footer dock — same position as landing, clears fixed footers/nav. */
export function computeFooterDockInsets(obstacles: DOMRect[]): FooterDockInsets {
  const { vw, vh } = readViewport();
  let bottom = MARGIN;
  let right = MARGIN;

  for (const o of obstacles) {
    const isBottomBar = o.bottom >= vh - 12 && o.height <= 400 && o.width >= vw * 0.1;
    const isRightBar = o.right >= vw - 12 && o.width >= 56 && o.height >= vh * 0.08;

    if (isBottomBar) {
      bottom = Math.max(bottom, vh - o.top + MARGIN);
    }
    if (isRightBar) {
      right = Math.max(right, vw - o.left + MARGIN);
    }
  }

  return { bottom, right };
}

export interface UseAssistantPlacementOptions {
  hostRef: RefObject<HTMLElement | null>;
  isOpen: boolean;
  panelWidth: number;
  panelHeight: number;
}

export function useAssistantPlacement({
  hostRef,
  isOpen,
  panelWidth,
  panelHeight,
}: UseAssistantPlacementOptions) {
  const { pathname } = useLocation();
  const [placement, setPlacement] = useState<AssistantPlacement | null>(null);
  const [footerDock, setFooterDock] = useState<FooterDockInsets>({ bottom: MARGIN, right: MARGIN });
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const anchorRef = useRef<AssistantAnchor>("bottom-right");
  const lastKeyRef = useRef("");

  const measure = useCallback(() => {
    const mobile = isMobileViewport();
    setIsMobile(mobile);

    if (mobile && isOpen) {
      setPlacement(null);
      return;
    }

    const host = hostRef.current;
    const obstacles = collectLayoutObstacles(host);
    const dock = computeFooterDockInsets(obstacles);
    setFooterDock(dock);

    if (!isOpen) {
      lastKeyRef.current = `dock|${dock.bottom}|${dock.right}|${pathname}`;
      setPlacement(null);
      return;
    }

    const workspace = resolveAssistantWorkspace(pathname, obstacles);
    const rule = getPlacementRule(pathname);

    const anchorOrder: AssistantAnchor[] = [
      anchorRef.current,
      ...rule.anchors.filter((a) => a !== anchorRef.current),
    ];

    const key = `${pathname}|open|${panelWidth}|${panelHeight}|${workspace.left}|${workspace.top}|${workspace.width}|${workspace.height}`;
    if (key === lastKeyRef.current) return;

    const next = findAssistantPlacement(workspace, panelWidth, panelHeight, obstacles, anchorOrder);
    anchorRef.current = next.anchor;
    lastKeyRef.current = key;

    setPlacement((prev) => {
      if (
        prev &&
        Math.abs(prev.left - next.left) < 1 &&
        Math.abs(prev.top - next.top) < 1
      ) {
        return prev;
      }
      return next;
    });
  }, [hostRef, isOpen, panelWidth, panelHeight, pathname]);

  const scheduleMeasure = useCallback(() => {
    requestAnimationFrame(() => measure());
  }, [measure]);

  useEffect(() => {
    lastKeyRef.current = "";
    scheduleMeasure();
  }, [scheduleMeasure, isOpen, panelWidth, panelHeight, pathname]);

  useEffect(() => {
    const debounced = debounce(scheduleMeasure, DEBOUNCE_MS);

    const onResize = () => debounced();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    window.addEventListener("scroll", onResize, true);

    let obstacleObserver: ResizeObserver | undefined;
    let workspaceObserver: ResizeObserver | undefined;
    let hostObserver: ResizeObserver | undefined;

    const observeTargets = () => {
      obstacleObserver?.disconnect();
      workspaceObserver?.disconnect();
      if (typeof ResizeObserver === "undefined") return;

      obstacleObserver = new ResizeObserver(debounced);
      workspaceObserver = new ResizeObserver(debounced);
      document.querySelectorAll(MARKER_SELECTOR).forEach((el) => obstacleObserver!.observe(el));
      document.querySelectorAll(WORKSPACE_SELECTOR).forEach((el) => workspaceObserver!.observe(el));
    };

    observeTargets();

    const mutationObserver = new MutationObserver(() => {
      observeTargets();
      debounced();
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-state", "hidden", "data-floating-obstacle", "data-floating-workspace"],
    });

    const host = hostRef.current;
    if (host && typeof ResizeObserver !== "undefined") {
      hostObserver = new ResizeObserver(debounced);
      hostObserver.observe(host);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
      window.removeEventListener("scroll", onResize, true);
      obstacleObserver?.disconnect();
      workspaceObserver?.disconnect();
      hostObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [hostRef, scheduleMeasure]);

  const style: CSSProperties | undefined =
    isMobile && isOpen
      ? {
          position: "fixed",
          inset: 0,
          zIndex: "var(--z-gatehub-assistant)",
          padding: "max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))",
          pointerEvents: "auto",
        }
      : !isOpen
        ? {
            position: "fixed",
            bottom: footerDock.bottom,
            right: footerDock.right,
            left: "auto",
            top: "auto",
            zIndex: "var(--z-gatehub-assistant)",
            transition: "bottom 280ms cubic-bezier(0.4, 0, 0.2, 1), right 280ms cubic-bezier(0.4, 0, 0.2, 1)",
            pointerEvents: "auto",
          }
        : placement
          ? {
              position: "fixed",
              left: placement.left,
              top: placement.top,
              width: Math.min(panelWidth, placement.workspace.width),
              height: Math.min(panelHeight, placement.workspace.height),
              zIndex: "var(--z-gatehub-assistant)",
              transition: "left 280ms cubic-bezier(0.4, 0, 0.2, 1), top 280ms cubic-bezier(0.4, 0, 0.2, 1), width 220ms ease, height 220ms ease",
              pointerEvents: "auto",
            }
          : {
              position: "fixed",
              bottom: footerDock.bottom,
              right: footerDock.right,
              zIndex: "var(--z-gatehub-assistant)",
              pointerEvents: "auto",
            };

  return { placement, style, remeasure: scheduleMeasure, isMobile, footerDock };
}

export function computePanelSize(mobile = isMobileViewport()): { width: number; height: number } {
  const vv = window.visualViewport;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;

  if (mobile) {
    return {
      width: vw,
      height: vh,
    };
  }

  return {
    width: Math.min(420, Math.max(300, vw - MARGIN * 4)),
    height: Math.min(Math.round(vh * 0.82), 720, Math.max(360, vh - MARGIN * 4)),
  };
}

export { MOBILE_BREAKPOINT };
