import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarToggleButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "icon";
}

export function SidebarToggleButton({
  isOpen,
  onToggle,
  className,
  showLabel = true,
  size = "sm",
}: SidebarToggleButtonProps) {
  const Icon = isOpen ? PanelLeftClose : PanelLeftOpen;

  if (size === "icon") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className={cn("shrink-0", className)}
        aria-label={isOpen ? "Hide sidebar" : "Show sidebar"}
      >
        <Icon className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onToggle}
      className={cn("gap-2 shrink-0", className)}
      aria-label={isOpen ? "Hide sidebar" : "Show sidebar"}
    >
      <Icon className="h-4 w-4" />
      {showLabel && (isOpen ? "Hide Sidebar" : "Show Sidebar")}
    </Button>
  );
}

/** Compact menu icon for mobile drawer */
export function SidebarMobileMenuButton({
  isOpen,
  onToggle,
  className,
}: {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className={cn("shrink-0", className)}
      aria-label={isOpen ? "Close menu" : "Open menu"}
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}
