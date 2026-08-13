import { useState, useEffect } from "react";
import { Image as ImageIcon, Trash2, Maximize2, Crop, Upload, Link as LinkIcon } from "lucide-react";
import { QuizSection } from "@/components/quiz-builder/studio/QuizSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { uploadMedia } from "@/components/media";
import { useToastStore } from "@/store/toastStore";
import { resolveCourseMediaUrl } from "@/lib/courseMediaUrls";

interface EditableImageComponentProps {
  question?: Record<string, any>;
  meta: Record<string, any>;
  updateMeta: (patch: Record<string, any>) => void;
}

export function EditableImageComponent({ question, meta, updateMeta }: EditableImageComponentProps) {
  const safeQ = question || {};
  const resolvedUrl = String(
    meta.mediaUrl ||
    (meta.media as any)?.url ||
    (meta.diagram as any)?.dataUrl ||
    (meta.diagram as any)?.url ||
    (Array.isArray(meta.images) ? meta.images[0]?.dataUrl || meta.images[0]?.url : undefined) ||
    (Array.isArray(meta.children)
      ? meta.children.find((c: any) => c?.type === "image")?.imageUrl
      : undefined) ||
    safeQ?.media?.url ||
    safeQ?.diagram?.dataUrl ||
    safeQ?.diagram?.url ||
    ""
  );

  const initialCaption = String(
    meta.caption ||
    (meta.diagram as any)?.caption ||
    (Array.isArray(meta.images) ? meta.images[0]?.caption : undefined) ||
    ""
  );

  const initialWidth = Number(meta.imageWidth || 100);

  const [imageUrl, setImageUrl] = useState<string>(resolvedUrl);
  const displayUrl = resolveCourseMediaUrl(imageUrl) || imageUrl;
  const [caption, setCaption] = useState<string>(initialCaption);
  const [widthPct, setWidthPct] = useState<number>(initialWidth);
  const [altText, setAltText] = useState<string>(meta.altText || "Question Image");

  useEffect(() => {
    setImageUrl(resolvedUrl);
    setCaption(initialCaption);
    setWidthPct(initialWidth);
    if (meta.altText) setAltText(meta.altText);
  }, [resolvedUrl, initialCaption, initialWidth, meta.altText]);

  const saveImage = (url: string, cap: string, width: number, alt: string) => {
    setImageUrl(url);
    setCaption(cap);
    setWidthPct(width);
    setAltText(alt);
    updateMeta({
      mediaUrl: url,
      imageWidth: width,
      caption: cap,
      altText: alt,
      media: url ? { url, kind: "image", caption: cap, width } : undefined,
      images: url ? [{ id: `img-${Date.now()}`, dataUrl: url, url, caption: cap, width }] : [],
    });
  };

  const toast = useToastStore((s) => s.add);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploadedUrl = await uploadMedia(file);
      saveImage(uploadedUrl, caption, widthPct, altText);
      toast({ title: "Image uploaded", variant: "success" });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload image",
        variant: "destructive",
      });
    }
  };

  const deleteImage = () => {
    setImageUrl("");
    updateMeta({ mediaUrl: null, media: null, images: null, diagram: null });
  };

  return (
    <QuizSection
      title="Native Editable Image Component"
      description="Replace, resize, crop, delete, and edit captions for images attached to this question."
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={deleteImage}
          className="h-8 text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete Image
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Image Display & Controls */}
        {imageUrl ? (
          <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center justify-center rounded-lg bg-muted/20 p-2 overflow-hidden border border-border/40 min-h-[160px]">
              <img
                src={displayUrl}
                alt={altText || "Attached component"}
                style={{ width: `${widthPct}%`, maxHeight: "400px", objectFit: "contain" }}
                className="rounded transition-all duration-200"
              />
            </div>

            {/* Sizing presets */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Maximize2 className="h-3.5 w-3.5" /> Display Width:
                </span>
                {[25, 50, 75, 100].map((pct) => (
                  <Button
                    key={pct}
                    type="button"
                    variant={widthPct === pct ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2.5 text-xs rounded-lg"
                    onClick={() => saveImage(imageUrl, caption, pct, altText)}
                  >
                    {pct}%
                  </Button>
                ))}
              </div>
            </div>

            {/* Caption & Alt Text fields */}
            <div className="grid gap-3 sm:grid-cols-2 pt-1">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Image Caption</Label>
                <Input
                  value={caption}
                  onChange={(e) => saveImage(imageUrl, e.target.value, widthPct, altText)}
                  placeholder="e.g. Figure 1: Circuit Diagram"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Alt Text (Accessibility)</Label>
                <Input
                  value={altText}
                  onChange={(e) => saveImage(imageUrl, caption, widthPct, e.target.value)}
                  placeholder="Describe image for screen readers"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Replace / Upload URL Controls */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <LinkIcon className="h-3 w-3" /> Image URL
            </Label>
            <Input
              value={imageUrl}
              onChange={(e) => saveImage(e.target.value, caption, widthPct, altText)}
              placeholder="Paste https:// or data:image URL…"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Upload className="h-3 w-3" /> Replace / Upload File
            </Label>
            <Input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="h-9 text-xs cursor-pointer file:mr-2 file:h-6 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:text-xs file:font-semibold file:text-primary"
            />
          </div>
        </div>
      </div>
    </QuizSection>
  );
}
