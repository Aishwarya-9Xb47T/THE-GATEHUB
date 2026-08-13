import { Sparkles } from "lucide-react";
import { BrandAvatar } from "@/components/common/Logo";
import { cn } from "@/lib/utils";
import { useGateHubAssistant } from "./gateHubAssistantContext";

export interface FooterAssistantActionProps {
  compact?: boolean;
  className?: string;
}

/** In-layout footer AI trigger — never fixed or absolute */
export function FooterAssistantAction({ compact, className }: FooterAssistantActionProps) {
  const { open } = useGateHubAssistant();

  return (
    <button
      type="button"
      onClick={() => open()}
      className={cn(
        "footer-assistant-action",
        compact && "footer-assistant-action--compact",
        className
      )}
      aria-label="Open THE GATEHUB AI Assistant"
    >
      <BrandAvatar size={compact ? 26 : 30} />
      <span className="footer-assistant-action__label">
        <Sparkles className="footer-assistant-action__icon" aria-hidden />
        AI Assistant
      </span>
    </button>
  );
}
