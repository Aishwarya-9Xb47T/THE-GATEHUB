import { useState, useRef } from "react";
import { UploadCloud, X, File, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFormData } from "@/lib/api";

interface FileUploadProps {
  onUploadSuccess: (url: string) => void;
  value?: string;
  accept?: string;
  maxSize?: number; // bytes
}

export function FileUpload({ onUploadSuccess, value, accept, maxSize }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (maxSize && file.size > maxSize) {
      setError(`File must be smaller than ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }
    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiFormData<{ url: string }>("/upload", formData);

      if (res.error) throw new Error(res.error);
      if (res.data?.url) {
        onUploadSuccess(res.data.url);
      }
    } catch (err: any) {
      setError(err.message || "Upload failed. Please check your connection.");
    } finally {
      setIsUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  if (value) {
    // Ensure the value is a full URL if it's just a path
    const displayUrl = value.startsWith("http") ? value : `${window.location.origin}${value}`;
    
    return (
      <div className="relative border border-amber-500/20 rounded-xl overflow-hidden group h-48 bg-slate-800/30 hover:border-amber-500/40 transition-all">
        {value.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
          <div className="w-full h-full flex items-center justify-center">
            <img src={displayUrl} alt="Upload preview" className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105" />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <File className="w-10 h-10 text-amber-500" />
            <span className="text-xs text-muted-foreground font-medium truncate max-w-[200px]">{value.split('/').pop()}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button type="button" variant="destructive" size="sm" className="font-semibold rounded-lg" onClick={() => onUploadSuccess("")}>
            <X className="w-4 h-4 mr-2" /> Remove File
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="border-2 border-dashed border-amber-500/30 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-800/20 hover:bg-slate-800/40 hover:border-amber-500/50 transition-all cursor-pointer group"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept={accept}
        onChange={(e) => e.target.files && handleUpload(e.target.files[0])}
      />
      <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-amber-500/20">
        {isUploading ? <Loader2 className="w-7 h-7 text-amber-500 animate-spin" /> : <UploadCloud className="w-7 h-7 text-amber-500" />}
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-bold text-foreground">
          {isUploading ? "Uploading file..." : "Click or drag file to upload"}
        </p>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, GIF up to {maxSize ? Math.round(maxSize / 1024 / 1024) : 5}MB
        </p>
      </div>
      {error && (
        <div className="mt-4 p-2 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
          <X className="w-4 h-4" />
          <p className="text-xs font-bold">{error}</p>
        </div>
      )}
    </div>
  );
}

