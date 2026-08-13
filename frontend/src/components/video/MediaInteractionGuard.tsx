import { useCallback, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

type MediaInteractionGuardProps = {
  children: ReactNode;
  className?: string;
  /**
   * `embed` — cross-origin iframe (YouTube/Vimeo). Parent listeners cannot see
   * right-clicks inside the iframe, so a click-through shield blocks contextmenu
   * while passing left-click / touch through to player controls.
   * `native` — same-document media (`<video>`); simple scoped preventDefault.
   */
  mode?: "embed" | "native";
  /** Accessible label for the protected region */
  label?: string;
};

/**
 * Scoped media right-click protection for course players.
 * Does NOT attach global document/window contextmenu blockers.
 */
export function MediaInteractionGuard({
  children,
  className,
  mode = "native",
  label = "Protected course video",
}: MediaInteractionGuardProps) {
  const shieldRef = useRef<HTMLDivElement>(null);

  const blockContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const passPointerThrough = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    // Keep shield active for right-click / macOS ctrl-click context menu gestures
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault();
      return;
    }

    const shield = e.currentTarget;
    try {
      if (shield.hasPointerCapture?.(e.pointerId)) {
        shield.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }

    // Temporarily let play / seek / volume / fullscreen reach the iframe
    shield.style.pointerEvents = "none";

    const restore = () => {
      shield.style.pointerEvents = "auto";
      window.removeEventListener("pointerup", restore, true);
      window.removeEventListener("pointercancel", restore, true);
      window.removeEventListener("blur", restore);
    };

    window.addEventListener("pointerup", restore, true);
    window.addEventListener("pointercancel", restore, true);
    window.addEventListener("blur", restore);
  }, []);

  if (mode === "native") {
    return (
      <div
        className={cn("relative w-full h-full", className)}
        onContextMenu={blockContextMenu}
        data-media-guard="native"
        aria-label={label}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn("relative w-full h-full overflow-hidden", className)}
      onContextMenu={blockContextMenu}
      data-media-guard="embed"
      aria-label={label}
    >
      {children}
      {/*
        Transparent shield above the cross-origin iframe.
        - contextmenu is always prevented on the shield
        - left-click / touch temporarily disables pointer-events so YouTube/Vimeo controls work
        - does not cover a separate fullscreen document created inside the iframe
      */}
      <div
        ref={shieldRef}
        className="absolute inset-0 z-[5]"
        style={{ pointerEvents: "auto" }}
        onContextMenu={blockContextMenu}
        onPointerDown={passPointerThrough}
        aria-hidden
        data-media-guard-shield
      />
    </div>
  );
}
