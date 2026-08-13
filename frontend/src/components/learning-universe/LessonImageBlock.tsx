import { useState } from "react";
import { X, ZoomIn, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MediaDiagnostics } from "./MediaDiagnostics";
import type { ResolvedAsset } from "@/lib/resolveLearningUniverseAsset";

interface LessonImageBlockProps {
  src: string;
  alt?: string;
  caption?: string;
  asset?: ResolvedAsset;
  showDiagnostics?: boolean;
}

export function LessonImageBlock({ src, alt = "Lesson image", caption, asset, showDiagnostics = true }: LessonImageBlockProps) {
  const [zoomed, setZoomed] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const missing = asset?.status === "missing" || !src || loadError;

  if (!src && asset?.status === "missing") {
    return (
      <Card className="p-4 border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <AlertTriangle className="w-5 h-5" />
          <p className="font-medium">Uploaded asset not found</p>
        </div>
        {showDiagnostics && asset && (
          <MediaDiagnostics
            fileRef={asset.originalRef}
            resolvedUrl={asset.resolvedUrl}
            status={asset.status}
            blockType="Image"
          />
        )}
      </Card>
    );
  }

  if (!src) return null;

  return (
    <>
      <Card className="p-4 overflow-hidden">
        {missing ? (
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-3">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-medium">Uploaded asset not found</p>
          </div>
        ) : (
          <div className="relative group">
            <img
              src={src}
              alt={alt}
              className="w-full max-h-[480px] object-contain rounded-lg mx-auto cursor-zoom-in"
              loading="lazy"
              onClick={() => setZoomed(true)}
              onError={() => setLoadError(true)}
            />
            <button
              type="button"
              onClick={() => setZoomed(true)}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Zoom image"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        )}
        {caption && (
          <p className="text-sm text-muted-foreground mt-3 text-center italic">{caption}</p>
        )}
        {showDiagnostics && asset && (
          <MediaDiagnostics
            fileRef={asset.originalRef}
            resolvedUrl={asset.resolvedUrl}
            status={loadError ? "missing" : asset.status}
            blockType="Image"
          />
        )}
      </Card>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setZoomed(false)}
            aria-label="Close zoom"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {caption && (
            <p className="absolute bottom-6 left-0 right-0 text-center text-white/80 text-sm px-4">
              {caption}
            </p>
          )}
        </div>
      )}
    </>
  );
}
