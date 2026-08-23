import { useRef, useState } from "react";
import { UploadCloud, Loader2, Check, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BannerCropEditor } from "./BannerCropEditor";
import {
  BANNER_LIMITS,
  defaultCropRegion,
  getImageDimensions,
  renderCroppedBanner,
  validateBannerFile,
  validateDimensions,
  type CropRegion,
} from "@/lib/courseBranding/imageUtils";
import { uploadBannerFiles, resolveBannerSrc } from "@/lib/courseBranding/bannerApi";

interface BannerUploadTabProps {
  value?: string;
  onSelect: (bannerUrl: string, thumbnailUrl: string, meta?: { bannerId?: string }) => void;
}

export function BannerUploadTab({ value, onSelect }: BannerUploadTabProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimInfo, setDimInfo] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropRegion, setCropRegion] = useState<CropRegion | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const fileErr = validateBannerFile(file);
    if (fileErr) {
      setError(fileErr);
      return;
    }

    try {
      const dim = await getImageDimensions(file);
      const dimErr = validateDimensions(dim);
      if (dimErr) {
        setError(dimErr);
        return;
      }

      const recommended =
        dim.width >= BANNER_LIMITS.recommendedWidth && dim.height >= BANNER_LIMITS.recommendedHeight;
      setDimInfo(
        recommended
          ? `${dim.width}×${dim.height}px — recommended resolution`
          : `${dim.width}×${dim.height}px — meets minimum (${BANNER_LIMITS.minWidth}×${BANNER_LIMITS.minHeight})`
      );

      setError(null);
      setPendingFile(file);
      setPendingPreview(URL.createObjectURL(file));
      setImageSize(dim);
      setCropRegion(defaultCropRegion(dim.width, dim.height));
    } catch {
      setError("Could not read image file");
    }
  };

  const saveCropped = async () => {
    if (!pendingFile || !cropRegion) return;
    setIsUploading(true);
    setError(null);
    try {
      const { banner, thumbnail } = await renderCroppedBanner(pendingFile, cropRegion);
      const res = await uploadBannerFiles(banner, thumbnail);
      if (res.error) throw new Error(res.error);
      const data = res.data?.data;
      if (!data?.bannerUrl) throw new Error("Upload failed");
      onSelect(data.bannerUrl, data.thumbnailUrl || data.bannerUrl, { bannerId: data.bannerId });
      clearPending();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const clearPending = () => {
    if (pendingPreview?.startsWith("blob:")) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setCropRegion(null);
  };

  const displayUrl = value || pendingPreview;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-[11px]">
        <SpecBadge label="Min" value={`${BANNER_LIMITS.minWidth}×${BANNER_LIMITS.minHeight}`} />
        <SpecBadge label="Recommended" value={`${BANNER_LIMITS.recommendedWidth}×${BANNER_LIMITS.recommendedHeight}`} highlight />
        <SpecBadge label="Max" value="5 MB" />
        <SpecBadge label="Formats" value="JPG · PNG · WEBP" />
      </div>

      {pendingFile && pendingPreview && cropRegion ? (
        <div className="space-y-4">
          <BannerCropEditor
            src={pendingPreview}
            imageWidth={imageSize.width}
            imageHeight={imageSize.height}
            region={cropRegion}
            onRegionChange={setCropRegion}
          />
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={clearPending} disabled={isUploading}>
              Cancel
            </Button>
            <Button type="button" onClick={saveCropped} disabled={isUploading}>
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Save optimized banner
            </Button>
          </div>
        </div>
      ) : displayUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-border aspect-[16/9] bg-muted group">
          <img
            src={displayUrl.startsWith("blob:") ? displayUrl : resolveBannerSrc(displayUrl)}
            alt="Banner preview"
            className="w-full h-full object-cover"
          />
          {value && (
            <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full flex items-center gap-1">
              <Check className="w-3 h-3" /> Saved
            </div>
          )}
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-primary/30 rounded-xl p-10 flex flex-col items-center justify-center bg-muted/30 hover:bg-muted/50 hover:border-primary/50 cursor-pointer transition-all aspect-[16/9]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloud className="w-12 h-12 text-primary/70 mb-3" />
          <p className="font-medium">Drag & drop your banner</p>
          <p className="text-sm text-muted-foreground mt-1">or click to browse files</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {value && !pendingFile && (
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <ImageIcon className="w-4 h-4 mr-2" />
          Replace banner
        </Button>
      )}

      {dimInfo && <p className="text-xs text-muted-foreground">{dimInfo}</p>}
      {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
    </div>
  );
}

function SpecBadge({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span
      className={`px-2 py-1 rounded-md border ${
        highlight ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/50 text-muted-foreground"
      }`}
    >
      <span className="font-semibold">{label}:</span> {value}
    </span>
  );
}
