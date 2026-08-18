import { type ReactNode, useState } from "react";
import {
  ChevronLeft,
  Circle,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FooterAssistantAction } from "@/assistant/FooterAssistantAction";
import { cn } from "@/lib/utils";

export interface WorkspaceShellProps {
  title: string;
  subtitle?: string;
  kindLabel: string;
  onExit: () => void;
  explorer?: ReactNode;
  editor: ReactNode;
  sidePanel?: ReactNode;
  toolbar?: ReactNode;
  statusLeft?: ReactNode;
  statusRight?: ReactNode;
  className?: string;
}

export function WorkspaceShell({
  title,
  subtitle,
  kindLabel,
  onExit,
  explorer,
  editor,
  sidePanel,
  toolbar,
  statusLeft,
  statusRight,
  className,
}: WorkspaceShellProps) {
  const [showExplorer, setShowExplorer] = useState(true);
  const [showSide, setShowSide] = useState(true);
  const [immersive, setImmersive] = useState(false);

  return (
    <div
      className={cn(
        "workspace-dark-surface flex flex-col bg-[#0d1117] text-[#e6edf3] border border-border/40 overflow-hidden shadow-2xl w-full h-full min-h-0",
        immersive ? "fixed inset-0 z-50 rounded-none" : "rounded-lg",
        className
      )}
    >
      <header className="h-11 shrink-0 border-b border-[#30363d] bg-[#161b22] flex items-center gap-2 px-3">
        <Button type="button" size="sm" variant="ghost" className="h-8 text-[#8b949e] hover:text-white" onClick={onExit}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Lesson
        </Button>
        <div className="h-4 w-px bg-[#30363d]" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-[#8b949e]">{kindLabel}</p>
          <p className="text-sm font-medium truncate">{title}</p>
        </div>
        {toolbar}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-[#8b949e]"
          onClick={() => setShowExplorer((v) => !v)}
          title="Toggle explorer"
        >
          <PanelLeft className="w-4 h-4" />
        </Button>
        {sidePanel && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-[#8b949e]"
            onClick={() => setShowSide((v) => !v)}
            title="Toggle panel"
          >
            <PanelRight className="w-4 h-4" />
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-[#8b949e]"
          onClick={() => setImmersive((v) => !v)}
          title={immersive ? "Exit fullscreen" : "Fullscreen workspace"}
        >
          {immersive ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </header>

      {subtitle && (
        <div className="px-4 py-2 text-xs text-[#8b949e] border-b border-[#30363d] bg-[#0d1117]">{subtitle}</div>
      )}

      <div className="flex flex-1 min-h-0">
        {explorer && showExplorer && (
          <aside className="w-56 shrink-0 border-r border-[#30363d] bg-[#161b22] overflow-y-auto">{explorer}</aside>
        )}
        <main className="flex-1 min-w-0 flex flex-col bg-[#0d1117]">{editor}</main>
        {sidePanel && showSide && (
          <aside className="w-[min(420px,40%)] shrink-0 border-l border-[#30363d] bg-[#161b22] overflow-hidden flex flex-col">
            {sidePanel}
          </aside>
        )}
      </div>

      <footer className="h-7 shrink-0 border-t border-[#30363d] bg-[#161b22] px-3 flex items-center justify-between text-[11px] text-[#8b949e]">
        <div className="flex items-center gap-2 min-w-0">
          {statusLeft ?? <span>THE GATEHUB Workspace</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {statusRight}
          <FooterAssistantAction compact />
          <span className="flex items-center gap-1">
            <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" />
            Connected
          </span>
        </div>
      </footer>
    </div>
  );
}
