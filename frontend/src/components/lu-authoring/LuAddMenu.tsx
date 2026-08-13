import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LuExplorerNode } from "@/lib/luAuthoring/types";
import {
  executeMenuItem,
  getAddMenuItems,
  type LuMenuHandlers,
} from "@/lib/luAuthoring/luExplorerMenu";

interface LuAddMenuProps {
  selectedNode: LuExplorerNode | null;
  handlers: LuMenuHandlers;
  experienceStudioMode?: boolean;
}

export function LuAddMenu({ selectedNode, handlers, experienceStudioMode }: LuAddMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = getAddMenuItems(selectedNode);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (items.length === 0) return null;

  const contextNode = selectedNode || ({ id: "universe", kind: "universe", title: "Learning Universe", status: "draft", issues: [] } as LuExplorerNode);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant={experienceStudioMode ? "outline" : "ghost"}
        size="icon"
        className={cn(
          "h-8 w-8",
          experienceStudioMode ? "border-primary/30 text-primary hover:bg-primary/10" : "text-slate-400 hover:text-primary"
        )}
        title="Add content"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="w-4 h-4" />
      </Button>
      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-lg shadow-xl py-1 text-sm border",
            experienceStudioMode ? "bg-popover border-border" : "border-slate-700 bg-[#252526]"
          )}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "w-full text-left px-3 py-2 text-sm",
                experienceStudioMode ? "hover:bg-muted text-foreground" : "hover:bg-slate-700 text-slate-200"
              )}
              onClick={() => {
                executeMenuItem(item.id, contextNode, handlers);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
