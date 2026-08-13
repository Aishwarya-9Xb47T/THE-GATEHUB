import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { isLandingPath } from "@/lib/navigation";
import { isMobileViewport } from "./assistantPlacementRules";
import { useGateHubAssistant } from "./gateHubAssistantContext";
import { GateHubAssistantLauncher, GateHubAssistantPanel } from "./GateHubAssistantPanel";

/**
 * Landing page → floating FAB + floating chat.
 * All other routes → chat opens as slide-over only (launcher lives in page footers).
 */
export function GateHubAssistantRoot() {
  const { isOpen, close } = useGateHubAssistant();
  const location = useLocation();
  const isLanding = isLandingPath(location.pathname);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const update = () => setIsMobile(isMobileViewport());
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  if (!mounted) return null;

  if (!isLanding && !isOpen) return null;

  if (!isLanding && isOpen) {
    return createPortal(
      <div className="gatehub-assistant-overlay" role="presentation">
        <button
          type="button"
          className="gatehub-assistant-overlay__backdrop"
          onClick={close}
          aria-label="Close assistant"
        />
        <div
          className={cn(
            "gatehub-assistant-slideover",
            isMobile && "gatehub-assistant-slideover--sheet"
          )}
        >
          <GateHubAssistantPanel />
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      data-floating-host="assistant"
      className={cn(
        "gatehub-assistant-root gatehub-assistant-root--landing",
        isOpen && "gatehub-assistant-root--open",
        isMobile && isOpen && "gatehub-assistant-root--mobile-fullscreen"
      )}
    >
      {isOpen ? (
        <GateHubAssistantPanel />
      ) : (
        <GateHubAssistantLauncher variant="landing" compact={isMobile} />
      )}
    </div>,
    document.body
  );
}
