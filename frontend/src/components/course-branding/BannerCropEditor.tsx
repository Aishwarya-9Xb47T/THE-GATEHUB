import { useCallback, useEffect, useRef, useState } from "react";
import { Move } from "lucide-react";
import {
  BANNER_LIMITS,
  defaultCropRegion,
  type CropRegion,
} from "@/lib/courseBranding/imageUtils";
import { cn } from "@/lib/utils";

interface BannerCropEditorProps {
  src: string;
  imageWidth: number;
  imageHeight: number;
  region: CropRegion;
  onRegionChange: (region: CropRegion) => void;
  className?: string;
}

export function BannerCropEditor({
  src,
  imageWidth,
  imageHeight,
  region,
  onRegionChange,
  className,
}: BannerCropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [preview, setPreview] = useState<string | null>(null);

  const clampRegion = useCallback(
    (r: CropRegion): CropRegion => {
      const w = Math.min(1, Math.max(0.05, r.width));
      const h = Math.min(1, Math.max(0.05, r.height));
      const x = Math.min(1 - w, Math.max(0, r.x));
      const y = Math.min(1 - h, Math.max(0, r.y));
      return { x, y, width: w, height: h };
    },
    []
  );

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - lastPos.current.x) / rect.width;
    const dy = (e.clientY - lastPos.current.y) / rect.height;
    lastPos.current = { x: e.clientX, y: e.clientY };

    onRegionChange(
      clampRegion({
        ...region,
        x: region.x - dx * region.width,
        y: region.y - dy * region.height,
      })
    );
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  useEffect(() => {
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const outW = 320;
      const outH = Math.round(outW / BANNER_LIMITS.aspect);
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const sx = region.x * img.width;
      const sy = region.y * img.height;
      const sw = region.width * img.width;
      const sh = region.height * img.height;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      setPreview(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, region]);

  const resetCrop = () => {
    onRegionChange(defaultCropRegion(imageWidth, imageHeight));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Move className="w-3.5 h-3.5" />
          Drag to reposition · 16:9 crop
        </span>
        <button type="button" className="text-primary hover:underline" onClick={resetCrop}>
          Reset position
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-[16/9] rounded-xl overflow-hidden border border-border bg-black/90 cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <img
          src={src}
          alt="Crop source"
          className="absolute max-w-none pointer-events-none"
          style={{
            width: `${(1 / region.width) * 100}%`,
            height: `${(1 / region.height) * 100}%`,
            left: `${(-region.x / region.width) * 100}%`,
            top: `${(-region.y / region.height) * 100}%`,
          }}
          draggable={false}
        />
        <div className="absolute inset-0 ring-2 ring-inset ring-primary/80 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30 pointer-events-none" />
      </div>

      {preview && (
        <div className="flex items-center gap-3">
          <div className="w-28 aspect-[16/9] rounded-md overflow-hidden border border-border shrink-0">
            <img src={preview} alt="Crop preview" className="w-full h-full object-cover" />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Output optimized to {BANNER_LIMITS.recommendedWidth}×{BANNER_LIMITS.recommendedHeight}px
          </p>
        </div>
      )}
    </div>
  );
}
