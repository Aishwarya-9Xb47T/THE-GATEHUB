import { useRef, useState } from "react";
import { UploadCloud, X, File, Loader2, Film, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFormData } from "@/lib/api";
import { useVisualAssets } from "./VisualAssetContext";

type AssetKind = "image" | "video" | "pdf" | "any";

const UPLOAD_FOLDER: Record<AssetKind, string> = {
  image: "/assets/images",
  video: "/assets/videos",
  pdf: "/assets/downloads",
  any: "/assets",
};

const ACCEPT: Record<AssetKind, string> = {
  image: "image/jpeg,image/png,image/gif,image/webp",
  video: "video/mp4,video/webm,video/quicktime,.mov",
  pdf: "application/pdf",
  any: "image/*,video/*,application/pdf",
};

const MAX_MB: Record<AssetKind, number> = {
  image: 10,
  video: 500,
  pdf: 50,
  any: 500,
};

interface AssetUploadFieldProps {
  kind: AssetKind;
  filename: string;
  onFilenameChange: (filename: string) => void;
  previewUrl?: string;
  label?: string;
  onUploaded?: () => void;
}

export function AssetUploadField({
  kind,
  filename,
  onFilenameChange,
  previewUrl,
  label,
  onUploaded,
}: AssetUploadFieldProps) {
  const { registerAsset, removeAsset, resolvePreviewUrl, projectId } = useVisualAssets();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayUrl = previewUrl || (filename ? resolvePreviewUrl(filename) : "");

  const handleFile = async (file: File) => {
    const maxBytes = MAX_MB[kind] * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File must be under ${MAX_MB[kind]}MB`);
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      registerAsset(file.name, file);
      if (projectId) {
        const formData = new FormData();
        formData.append("file", file);
        const folder = UPLOAD_FOLDER[kind];
        formData.append("path", `${folder}/${file.name}`);
        const { error: uploadError } = await apiFormData<{ success: boolean }>(
          `/latex-projects/${projectId}/files/upload`,
          formData
        );
        if (uploadError) {
          setError(uploadError);
          return;
        }
        onUploaded?.();
      }
      onFilenameChange(file.name);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    if (filename) removeAsset(filename);
    onFilenameChange("");
  };

  if (filename && displayUrl) {
    return (
      <div className="space-y-2">
        {label && <p className="text-xs text-muted-foreground">{label}</p>}
        <div className="relative border rounded-lg overflow-hidden group bg-muted/30">
          {kind === "image" && (
            <img src={displayUrl} alt="Preview" className="w-full max-h-64 object-contain" />
          )}
          {kind === "video" && (
            <video src={displayUrl} controls className="w-full max-h-64 bg-black" />
          )}
          {kind === "pdf" && (
            <iframe src={displayUrl} title="PDF preview" className="w-full h-64 border-0" />
          )}
          {kind === "any" && (
            <div className="p-6 flex items-center gap-3">
              <File className="w-8 h-8 text-primary" />
              <span className="text-sm font-medium truncate">{filename}</span>
            </div>
          )}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button type="button" variant="destructive" size="sm" onClick={handleRemove}>
              <X className="w-4 h-4 mr-1" /> Remove
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-mono">{filename}</p>
      </div>
    );
  }

  const Icon = kind === "video" ? Film : kind === "pdf" ? FileText : UploadCloud;

  return (
    <div className="space-y-2">
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <div
        className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/40 transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={label || `Upload ${kind} file`}
        aria-busy={isUploading}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPT[kind]}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {isUploading ? (
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
        ) : (
          <Icon className="w-8 h-8 text-muted-foreground mb-2" />
        )}
        <p className="text-sm font-medium">Click or drag to upload</p>
        <p className="text-xs text-muted-foreground mt-1">
          {kind === "image" && "PNG, JPG, GIF, WEBP"}
          {kind === "video" && "MP4, WEBM, MOV"}
          {kind === "pdf" && "PDF files"}
          {kind === "any" && "Images, videos, or PDFs"}
          {" · "}max {MAX_MB[kind]}MB
        </p>
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      </div>
    </div>
  );
}
