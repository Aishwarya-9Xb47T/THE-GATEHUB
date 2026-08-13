import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SanitizedQuestionSnapshot } from "../types";
import type { RendererContext } from "../types/renderer";
import { listOverlaysForMode } from "../registry/overlayRegistry";

export interface OverlayManagerProps {
  mode: import("../types").AssessmentMode;
  question: SanitizedQuestionSnapshot | null;
  ctx: RendererContext;
  defaultOverlayIds?: string[];
}

export const OverlayManager = memo(function OverlayManager({
  mode,
  question,
  ctx,
  defaultOverlayIds = [],
}: OverlayManagerProps) {
  const overlays = listOverlaysForMode(mode);
  const [openId, setOpenId] = useState<string | null>(null);
  const [enabled] = useState(() => new Set(defaultOverlayIds));

  const toolbar = overlays.filter((o) => o.position === "toolbar" && enabled.has(o.id));
  const active = overlays.find((o) => o.id === openId);

  return (
    <div className="overlay-manager">
      {toolbar.length > 0 && (
        <div
          className="flex flex-wrap gap-2 py-2 border-t"
          role="toolbar"
          aria-label="Learning tools"
        >
          {toolbar.map((overlay) => (
            <Button
              key={overlay.id}
              type="button"
              variant={openId === overlay.id ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const next = openId === overlay.id ? null : overlay.id;
                setOpenId(next);
                ctx.eventBus.emit(next ? "overlay_opened" : "overlay_closed", { id: overlay.id });
              }}
              aria-pressed={openId === overlay.id}
            >
              {overlay.label}
            </Button>
          ))}
        </div>
      )}

      {active && question && (
        <div
          className={cn(
            "overlay-panel mt-2 rounded-xl border bg-card p-4",
            active.position === "sidebar" && "max-w-sm",
            active.position === "floating" && "shadow-lg"
          )}
          role="complementary"
          aria-label={active.label}
        >
          <active.Component
            question={question}
            ctx={ctx}
            isOpen={openId === active.id}
            onClose={() => {
              setOpenId(null);
              ctx.eventBus.emit("overlay_closed", { id: active.id });
            }}
          />
        </div>
      )}
    </div>
  );
});
