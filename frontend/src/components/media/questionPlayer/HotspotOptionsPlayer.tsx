import { useState } from "react";
import { cn } from "@/lib/utils";
import { resolveCourseMediaUrl } from "@/lib/courseMediaUrls";
import type { PlayerQuestion } from "./types";

interface HotspotOptionsPlayerProps {
  question: PlayerQuestion;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

type HotspotRegion = { label: string; x: number; y: number; radius?: number };

export function HotspotOptionsPlayer({ question, value, onChange, disabled }: HotspotOptionsPlayerProps) {
  const mediaUrl = (question.metadata?.mediaUrl as string) || "";
  const hotspots = (question.metadata?.hotspots as HotspotRegion[]) || [];
  const [hovered, setHovered] = useState<string | null>(null);
  const src = mediaUrl ? resolveCourseMediaUrl(mediaUrl) : null;

  if (!src) {
    return <p className="text-sm text-muted-foreground">No hotspot image configured.</p>;
  }

  return (
    <div className="relative mx-auto max-w-2xl overflow-hidden rounded-xl border border-border">
      <img src={src} alt="Hotspot question" className="block w-full select-none" draggable={false} />
      {hotspots.map((h) => {
        const active = value === h.label;
        const hover = hovered === h.label;
        const r = h.radius ?? 8;
        return (
          <button
            key={h.label}
            type="button"
            disabled={disabled}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all",
              active ? "border-primary bg-primary/40 ring-2 ring-primary" : "border-white/90 bg-primary/25 hover:bg-primary/45",
              disabled && "cursor-not-allowed"
            )}
            style={{
              left: `${h.x}%`,
              top: `${h.y}%`,
              width: `${r * 2}%`,
              height: `${r * 2}%`,
              minWidth: 28,
              minHeight: 28,
            }}
            aria-label={`Hotspot ${h.label}`}
            aria-pressed={active}
            onMouseEnter={() => setHovered(h.label)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => !disabled && onChange(h.label)}
          >
            {(active || hover) && (
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-0.5 text-xs text-background">
                {h.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
