import { type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { useFloatingViewportPosition, type FloatingCorner } from "@/hooks/useFloatingViewportPosition";

interface FloatingViewportHostProps {
  children: ReactNode;
  hostRef: RefObject<HTMLDivElement | null>;
  isExpanded: boolean;
  className?: string;
  expandedClassName?: string;
  collapsedClassName?: string;
  expandedWidth?: number;
  expandedHeight?: number;
  preferredCorner?: FloatingCorner;
  ariaLabel?: string;
  layoutKey?: string;
}

/**
 * Viewport-aware fixed host for floating widgets (AI assistant, chat, FABs).
 * Position recalculates on resize, zoom, keyboard, and obstacle changes.
 */
export function FloatingViewportHost({
  children,
  hostRef,
  isExpanded,
  className,
  expandedClassName,
  collapsedClassName,
  expandedWidth = 560,
  expandedHeight = 720,
  preferredCorner = "bottom-right",
  ariaLabel,
  layoutKey,
}: FloatingViewportHostProps) {
  const { style } = useFloatingViewportPosition({
    isExpanded,
    expandedWidth,
    expandedHeight,
    elementRef: hostRef,
    preferredCorner,
    layoutKey,
  });

  return (
    <div
      ref={hostRef as any}
      role={isExpanded ? "dialog" : undefined}
      aria-label={ariaLabel}
      aria-modal={isExpanded ? true : undefined}
      data-floating-host="assistant"
      className={cn(
        "floating-viewport-host",
        isExpanded && "floating-viewport-host--expanded",
        isExpanded ? expandedClassName : collapsedClassName,
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}
