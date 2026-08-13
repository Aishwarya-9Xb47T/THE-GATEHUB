import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject, type LegacyRef } from "react";

export type FloatingAnchor =
  | "bottom-right"
  | "bottom-left"
  | "right-center"
  | "left-center"
  | "top-right"
  | "top-left";

const ANCHOR_PRIORITY: FloatingAnchor[] = [
  "bottom-right",
  "bottom-left",
  "right-center",
  "left-center",
  "top-right",
  "top-left",
];

/** @deprecated use FloatingAnchor */
export type FloatingCorner = FloatingAnchor;

const OBSTACLE_PADDING = 16;
const GRID_STEP = 24;

function intersectViewport(rect: DOMRect): DOMRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(vw, rect.right);
  const bottom = Math.min(vh, rect.bottom);
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

export interface FloatingViewportInsets {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface FloatingViewportPosition {
  left: number;
  top: number;
  width: number;
  height: number;
  corner: FloatingAnchor;
}

function readInsetPx(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function getFloatingViewportInsets(): FloatingViewportInsets {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const topInset = readInsetPx("--floating-inset-top", 24);
  const leftInset = readInsetPx("--floating-inset-left", 24);
  const rightInset = readInsetPx("--floating-inset-right", 24);
  const bottomInset = readInsetPx("--floating-inset-bottom", 24);

  const offsetTop = vv?.offsetTop ?? 0;
  const offsetLeft = vv?.offsetLeft ?? 0;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;

  return {
    top: offsetTop + topInset,
    left: offsetLeft + leftInset,
    width: Math.max(0, vw - leftInset - rightInset),
    height: Math.max(0, vh - topInset - bottomInset),
  };
}

function isAssistantNode(node: HTMLElement, excludeEl: HTMLElement | null): boolean {
  return (
    node === excludeEl ||
    Boolean(excludeEl?.contains(node)) ||
    Boolean(node.contains(excludeEl)) ||
    Boolean(node.closest('[data-floating-host="assistant"]'))
  );
}

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) < 0.05) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Fixed, sticky, and explicitly marked layout chrome. */
function getLayoutObstacleRects(excludeEl: HTMLElement | null): DOMRect[] {
  if (typeof document === "undefined") return [];

  const rects: DOMRect[] = [];
  const seen = new Set<string>();

  const addRect = (rect: DOMRect, key: string) => {
    const clipped = intersectViewport(rect);
    if (clipped.width < 4 || clipped.height < 4) return;
    if (seen.has(key)) return;
    seen.add(key);
    rects.push(clipped);
  };

  const marked = document.querySelectorAll("[data-floating-obstacle]");
  for (const node of marked) {
    if (!(node instanceof HTMLElement) || isAssistantNode(node, excludeEl)) continue;
    if (!isVisible(node)) continue;
    addRect(node.getBoundingClientRect(), `m-${node.dataset.floatingObstacle}-${rects.length}`);
  }

  const sidebars = document.querySelectorAll("aside");
  for (const node of sidebars) {
    if (!(node instanceof HTMLElement) || isAssistantNode(node, excludeEl)) continue;
    if (!isVisible(node)) continue;
    const style = window.getComputedStyle(node);
    if (style.position !== "fixed" && style.position !== "sticky") continue;
    addRect(node.getBoundingClientRect(), `aside-${rects.length}`);
  }

  const chrome = document.querySelectorAll(
    "header, footer, nav[aria-label], [role='banner'], [role='navigation'], [role='contentinfo'], [role='dialog'][data-state='open'], [data-radix-dialog-content]"
  );

  for (const node of chrome) {
    if (!(node instanceof HTMLElement) || isAssistantNode(node, excludeEl)) continue;
    if (!isVisible(node)) continue;

    const style = window.getComputedStyle(node);
    const isFixedSticky = style.position === "fixed" || style.position === "sticky";
    const isDialog = node.getAttribute("role") === "dialog" || node.hasAttribute("data-radix-dialog-content");
    if (!isFixedSticky && !isDialog && !node.hasAttribute("data-floating-obstacle")) {
      if (node.tagName === "HEADER" || node.tagName === "FOOTER" || node.tagName === "NAV") {
        const rect = node.getBoundingClientRect();
        const nearTop = rect.top < 120;
        const nearBottom = rect.bottom > window.innerHeight - 120;
        if (!nearTop && !nearBottom) continue;
      } else {
        continue;
      }
    }

    addRect(node.getBoundingClientRect(), `c-${node.tagName}-${node.className.slice(0, 24)}`);
  }

  const positioned = document.querySelectorAll("[class*='fixed'], [class*='sticky']");
  for (const node of positioned) {
    if (!(node instanceof HTMLElement) || isAssistantNode(node, excludeEl)) continue;
    if (!isVisible(node)) continue;
    const style = window.getComputedStyle(node);
    if (style.position !== "fixed" && style.position !== "sticky") continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 28) continue;
    addRect(rect, `p-${rect.top}-${rect.left}-${rect.width}`);
  }

  return rects;
}

/** Detects horizontal chrome rows along viewport edges (dashboard top bars, sticky footers). */
function probeViewportEdgeRects(
  edge: "top" | "bottom",
  excludeEl: HTMLElement | null
): DOMRect[] {
  if (typeof document === "undefined") return [];

  const rects: DOMRect[] = [];
  const seen = new Set<string>();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const y = edge === "top" ? 44 : vh - 12;
  const xs = [vw * 0.2, vw * 0.5, vw * 0.8];

  for (const x of xs) {
    if (!document.elementsFromPoint) continue;
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue;
      if (isAssistantNode(node, excludeEl)) continue;
      if (node.tagName === "HTML" || node.tagName === "BODY") continue;

      let row: HTMLElement | null = node;
      for (let depth = 0; depth < 8 && row; depth += 1) {
        const r = row.getBoundingClientRect();
        const inTopBand = edge === "top" && r.top < 110 && r.height >= 36 && r.height <= 120;
        const inBottomBand = edge === "bottom" && r.bottom > vh - 110 && r.height >= 36;
        if ((inTopBand || inBottomBand) && r.width > vw * 0.2) {
          const key = `${Math.round(r.top)}-${Math.round(r.left)}-${Math.round(r.width)}`;
          if (!seen.has(key)) {
            seen.add(key);
            rects.push(r);
          }
          break;
        }
        row = row.parentElement;
      }
    }
  }

  return rects;
}

function getAllObstacleRects(excludeEl: HTMLElement | null): DOMRect[] {
  const layout = getLayoutObstacleRects(excludeEl);
  const topEdge = probeViewportEdgeRects("top", excludeEl);
  const bottomEdge = probeViewportEdgeRects("bottom", excludeEl);
  return [...layout, ...topEdge, ...bottomEdge];
}

/** Shrinks the usable viewport so anchors never start inside sidebars, headers, or footers. */
function shrinkInsetsForDockedChrome(
  insets: FloatingViewportInsets,
  obstacles: DOMRect[]
): FloatingViewportInsets {
  const vw = typeof window !== "undefined" ? window.innerWidth : insets.left + insets.width;
  const vh = typeof window !== "undefined" ? window.innerHeight : insets.top + insets.height;

  let top = insets.top;
  let left = insets.left;
  let right = insets.left + insets.width;
  let bottom = insets.top + insets.height;

  for (const raw of obstacles) {
    const o = raw;
    if (o.width < 4 || o.height < 4) continue;

    const isLeftDock = o.left <= 12 && o.width >= 160 && o.height >= vh * 0.3;
    const isRightDock = o.right >= vw - 12 && o.width >= 100 && o.height >= vh * 0.25;
    const isTopChrome = o.top <= 12 && o.height <= 180 && o.width >= vw * 0.2;
    const isBottomChrome = o.bottom >= vh - 12 && o.height <= 280 && o.width >= vw * 0.2;

    if (isLeftDock) left = Math.max(left, o.right + OBSTACLE_PADDING);
    if (isRightDock) right = Math.min(right, o.left - OBSTACLE_PADDING);
    if (isTopChrome) top = Math.max(top, o.bottom + OBSTACLE_PADDING);
    if (isBottomChrome) bottom = Math.min(bottom, o.top - OBSTACLE_PADDING);
  }

  const width = Math.max(48, right - left);
  const height = Math.max(48, bottom - top);

  return { top, left, width, height };
}

function isSignificantHit(el: HTMLElement, excludeEl: HTMLElement | null): boolean {
  if (isAssistantNode(el, excludeEl)) return false;
  if (el.dataset.floatingIgnore !== undefined) return false;

  const tag = el.tagName;
  if (["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "LABEL"].includes(tag)) return true;

  const role = el.getAttribute("role");
  if (role && ["button", "link", "menuitem", "tab", "checkbox", "radio", "switch"].includes(role)) {
    return true;
  }

  if (el.closest("[data-floating-obstacle], aside, header, footer, nav, [role='dialog'], form")) return true;

  return false;
}

function overlapsInteractiveAtRect(rect: DOMRect, excludeEl: HTMLElement | null): boolean {
  if (typeof document === "undefined" || !document.elementsFromPoint) return false;

  const samples: [number, number][] = [
    [rect.left + 6, rect.top + 6],
    [rect.right - 6, rect.top + 6],
    [rect.left + 6, rect.bottom - 6],
    [rect.right - 6, rect.bottom - 6],
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
  ];

  for (const [x, y] of samples) {
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.tagName === "HTML" || node.tagName === "BODY") continue;
      const style = window.getComputedStyle(node);
      if (style.pointerEvents === "none") continue;
      if (isSignificantHit(node, excludeEl)) return true;
      break;
    }
  }
  return false;
}

function rectFromPosition(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

function fitsInsets(rect: DOMRect, insets: FloatingViewportInsets): boolean {
  return (
    rect.left >= insets.left - 0.5 &&
    rect.top >= insets.top - 0.5 &&
    rect.right <= insets.left + insets.width + 0.5 &&
    rect.bottom <= insets.top + insets.height + 0.5
  );
}

function overlapsRects(a: DOMRect, obstacles: DOMRect[]): boolean {
  return obstacles.some((o) => !(
    a.right + OBSTACLE_PADDING <= o.left ||
    a.left - OBSTACLE_PADDING >= o.right ||
    a.bottom + OBSTACLE_PADDING <= o.top ||
    a.top - OBSTACLE_PADDING >= o.bottom
  ));
}

function isPositionSafe(
  rect: DOMRect,
  insets: FloatingViewportInsets,
  obstacles: DOMRect[],
  excludeEl: HTMLElement | null
): boolean {
  return (
    fitsInsets(rect, insets) &&
    !overlapsRects(rect, obstacles) &&
    !overlapsInteractiveAtRect(rect, excludeEl)
  );
}

function anchorToPosition(
  anchor: FloatingAnchor,
  width: number,
  height: number,
  insets: FloatingViewportInsets
): { left: number; top: number } {
  const maxLeft = insets.left + insets.width - width;
  const maxTop = insets.top + insets.height - height;
  const midTop = insets.top + Math.max(0, (insets.height - height) / 2);

  switch (anchor) {
    case "bottom-right":
      return { left: maxLeft, top: maxTop };
    case "bottom-left":
      return { left: insets.left, top: maxTop };
    case "top-right":
      return { left: maxLeft, top: insets.top };
    case "top-left":
      return { left: insets.left, top: insets.top };
    case "right-center":
      return { left: maxLeft, top: midTop };
    case "left-center":
      return { left: insets.left, top: midTop };
  }
}

function edgeGridCandidates(
  width: number,
  height: number,
  insets: FloatingViewportInsets
): Array<{ left: number; top: number; score: number }> {
  const maxLeft = insets.left + insets.width - width;
  const maxTop = insets.top + insets.height - height;
  const out: Array<{ left: number; top: number; score: number }> = [];

  if (maxLeft < insets.left || maxTop < insets.top) return out;

  for (let top = insets.top; top <= maxTop; top += GRID_STEP) {
    for (let left = insets.left; left <= maxLeft; left += GRID_STEP) {
      const distFromBottom = maxTop - top;
      const distFromRight = maxLeft - left;
      const score = distFromBottom * 2 + distFromRight;
      out.push({ left, top, score });
    }
  }

  return out.sort((a, b) => a.score - b.score);
}

function overlapArea(a: DOMRect, obstacles: DOMRect[]): number {
  let area = 0;
  for (const o of obstacles) {
    const xOverlap = Math.max(0, Math.min(a.right, o.right) - Math.max(a.left, o.left));
    const yOverlap = Math.max(0, Math.min(a.bottom, o.bottom) - Math.max(a.top, o.top));
    area += xOverlap * yOverlap;
  }
  return area;
}

function bestEffortPosition(
  width: number,
  height: number,
  insets: FloatingViewportInsets,
  obstacles: DOMRect[],
  excludeEl: HTMLElement | null
): FloatingViewportPosition {
  const maxLeft = insets.left + insets.width - width;
  const maxTop = insets.top + insets.height - height;
  let best = { left: maxLeft, top: maxTop, penalty: Number.POSITIVE_INFINITY };

  for (let top = insets.top; top <= maxTop; top += GRID_STEP) {
    for (let left = insets.left; left <= maxLeft; left += GRID_STEP) {
      const rect = rectFromPosition(left, top, width, height);
      if (!fitsInsets(rect, insets)) continue;
      const penalty =
        overlapArea(rect, obstacles) +
        (overlapsInteractiveAtRect(rect, excludeEl) ? 10_000 : 0);
      const distFromBottomRight = (maxTop - top) * 2 + (maxLeft - left);
      const total = penalty * 1000 + distFromBottomRight;
      if (total < best.penalty) {
        best = { left, top, penalty: total };
      }
    }
  }

  return {
    left: best.left,
    top: best.top,
    width,
    height,
    corner: "bottom-right",
  };
}

export function computeFloatingPosition(options: {
  width: number;
  height: number;
  insets?: FloatingViewportInsets;
  obstacles?: DOMRect[];
  preferredCorner?: FloatingAnchor;
  excludeEl?: HTMLElement | null;
}): FloatingViewportPosition {
  const baseInsets = options.insets ?? getFloatingViewportInsets();
  const obstacles = options.obstacles ?? getAllObstacleRects(options.excludeEl ?? null);
  const insets = shrinkInsetsForDockedChrome(baseInsets, obstacles);

  const width = Math.min(Math.max(options.width, 48), insets.width);
  const height = Math.min(Math.max(options.height, 48), insets.height);

  const order: FloatingAnchor[] = options.preferredCorner
    ? [options.preferredCorner, ...ANCHOR_PRIORITY.filter((a) => a !== options.preferredCorner)]
    : ANCHOR_PRIORITY;

  for (const anchor of order) {
    const { left, top } = anchorToPosition(anchor, width, height, insets);
    const rect = rectFromPosition(left, top, width, height);
    if (isPositionSafe(rect, insets, obstacles, options.excludeEl ?? null)) {
      return { left, top, width, height, corner: anchor };
    }
  }

  const grid = edgeGridCandidates(width, height, insets);
  for (const candidate of grid) {
    const rect = rectFromPosition(candidate.left, candidate.top, width, height);
    if (isPositionSafe(rect, insets, obstacles, options.excludeEl ?? null)) {
      return { left: candidate.left, top: candidate.top, width, height, corner: "bottom-right" };
    }
  }

  return bestEffortPosition(width, height, insets, obstacles, options.excludeEl ?? null);
}

export interface UseFloatingViewportPositionOptions {
  enabled?: boolean;
  isExpanded: boolean;
  expandedWidth?: number;
  expandedHeight?: number;
  collapsedWidth?: number;
  collapsedHeight?: number;
  preferredCorner?: FloatingAnchor;
  elementRef: RefObject<HTMLElement | null>;
  /** Bumps remeasure when route or layout shell changes */
  layoutKey?: string;
}

export function useFloatingViewportPosition({
  enabled = true,
  isExpanded,
  expandedWidth = 560,
  expandedHeight = 720,
  collapsedWidth = 180,
  collapsedHeight = 52,
  preferredCorner = "bottom-right",
  elementRef,
  layoutKey,
}: UseFloatingViewportPositionOptions) {
  const [position, setPosition] = useState<FloatingViewportPosition | null>(() => {
    if (typeof window === "undefined") return null;
    return computeFloatingPosition({
      width: isExpanded ? expandedWidth : collapsedWidth,
      height: isExpanded ? expandedHeight : collapsedHeight,
      preferredCorner,
    });
  });
  const rafRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    if (!enabled) return;

    const el = elementRef.current;
    const measuredW = el?.offsetWidth ?? (isExpanded ? expandedWidth : collapsedWidth);
    const measuredH = el?.offsetHeight ?? (isExpanded ? expandedHeight : collapsedHeight);

    const insets = getFloatingViewportInsets();
    const targetW = isExpanded
      ? Math.min(expandedWidth, insets.width)
      : Math.min(measuredW, insets.width);
    const targetH = isExpanded
      ? Math.min(expandedHeight, insets.height)
      : Math.min(measuredH, insets.height);

    const next = computeFloatingPosition({
      width: targetW,
      height: targetH,
      insets,
      preferredCorner,
      excludeEl: el,
    });

    setPosition((prev) => {
      if (
        prev &&
        Math.abs(prev.left - next.left) < 1 &&
        Math.abs(prev.top - next.top) < 1 &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        return prev;
      }
      return next;
    });
  }, [
    enabled,
    isExpanded,
    expandedWidth,
    expandedHeight,
    collapsedWidth,
    collapsedHeight,
    preferredCorner,
    elementRef,
  ]);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rafRef.current = null;
        measure();
      });
    });
  }, [measure]);

  useEffect(() => {
    scheduleMeasure();
  }, [scheduleMeasure, isExpanded, layoutKey]);

  useEffect(() => {
    if (!enabled) return;

    const vv = window.visualViewport;
    const onChange = () => scheduleMeasure();
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    window.addEventListener("scroll", onChange, { passive: true });
    document.addEventListener("scroll", onChange, { passive: true, capture: true });
    vv?.addEventListener("resize", onChange);
    vv?.addEventListener("scroll", onChange);

    const el = elementRef.current;
    let resizeObserver: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(onChange);
      resizeObserver.observe(el);
    }

    const mutationObserver = new MutationObserver(onChange);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-floating-obstacle", "data-state", "hidden", "open"],
    });

    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      window.removeEventListener("scroll", onChange);
      document.removeEventListener("scroll", onChange, true);
      vv?.removeEventListener("resize", onChange);
      vv?.removeEventListener("scroll", onChange);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, elementRef, scheduleMeasure]);

  const style: CSSProperties | undefined = position
    ? {
        position: "fixed",
        left: position.left,
        top: position.top,
        width: isExpanded ? position.width : undefined,
        height: isExpanded ? position.height : undefined,
        zIndex: "var(--z-floating-assistant)",
        transition: "var(--floating-transition)",
        pointerEvents: "auto",
      }
    : undefined;

  return { position, style, remeasure: scheduleMeasure };
}
