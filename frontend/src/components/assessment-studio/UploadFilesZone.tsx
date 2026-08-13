import { useCallback, useState } from "react";
import { Upload, FileText, FileType, Presentation, Image as ImageIcon, FileCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UploadFilesZoneProps {
  onFileSelect: (file: File) => void;
  theme?: "light" | "dark";
}

export function UploadFilesZone({ onFileSelect, theme = "light" }: UploadFilesZoneProps) {
  const isDark = theme === "dark";
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      console.log('[UploadFilesZone] File dropped:', file.name, file.type, file.size);
      setSelectedFile(file);
      // Don't auto-trigger analysis - let user review first
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      console.log('[UploadFilesZone] File selected via input:', file.name, file.type, file.size);
      setSelectedFile(file);
      // Don't auto-trigger analysis - let user review first
    }
  }, []);

  const handleRemove = useCallback(() => {
    setSelectedFile(null);
  }, []);

  const getFileIcon = (file: File) => {
    const type = file.type;
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (type.includes('pdf') || ext === 'pdf') return FileText;
    if (type.includes('word') || ext === 'docx') return FileType;
    if (type.includes('presentation') || ext === 'pptx') return Presentation;
    if (type.startsWith('image/')) return ImageIcon;
    if (ext === 'md' || ext === 'markdown') return FileCode;
    return FileText;
  };

  const getFileTypeLabel = (file: File) => {
    const type = file.type;
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (type.includes('pdf') || ext === 'pdf') return 'PDF Document';
    if (type.includes('word') || ext === 'docx') return 'Word Document';
    if (type.includes('presentation') || ext === 'pptx') return 'PowerPoint';
    if (type.startsWith('image/')) return 'Image';
    if (ext === 'md' || ext === 'markdown') return 'Markdown';
    if (ext === 'txt') return 'Text File';
    return 'Document';
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center transition-all",
          dragActive
            ? "border-primary bg-primary/5"
            : isDark
            ? "border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10"
            : "border-border hover:border-primary/50 hover:bg-primary/5"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          className="hidden"
          accept=".pdf,.docx,.pptx,.txt,.md,.markdown,image/*"
          onChange={handleFileInput}
        />
        
        {!selectedFile ? (
          <div className="space-y-4">
            <div className={cn(
              "mx-auto flex h-16 w-16 items-center justify-center rounded-full",
              isDark ? "bg-white/10" : "bg-primary/10"
            )}>
              <Upload className={cn("h-8 w-8", isDark ? "text-white" : "text-primary")} />
            </div>
            <div>
              <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-foreground")}>
                Drag and drop your file here
              </p>
              <p className={cn("mt-1 text-xs", isDark ? "text-white/50" : "text-muted-foreground")}>
                PDF, DOCX, PPTX, TXT, Markdown, or Images
              </p>
            </div>
            <Button
              type="button"
              variant={isDark ? "outline" : "default"}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              Browse Files
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-background/50">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  isDark ? "bg-white/10" : "bg-primary/10"
                )}>
                  {(() => {
                    const Icon = getFileIcon(selectedFile);
                    return <Icon className={cn("h-5 w-5", isDark ? "text-white" : "text-primary")} />;
                  })()}
                </div>
                <div className="text-left">
                  <p className={cn("text-sm font-medium", isDark ? "text-white" : "text-foreground")}>
                    {selectedFile.name}
                  </p>
                  <p className={cn("text-xs", isDark ? "text-white/50" : "text-muted-foreground")}>
                    {getFileTypeLabel(selectedFile)} • {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleRemove}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Button
              type="button"
              onClick={() => onFileSelect(selectedFile)}
              className="w-full"
            >
              Analyze File
            </Button>
          </div>
        )}
      </div>
      
      <div className={cn("text-xs", isDark ? "text-white/40" : "text-muted-foreground")}>
        <p className="font-medium mb-1">Supported formats:</p>
        <div className="flex flex-wrap gap-2">
          {['PDF', 'DOCX', 'PPTX', 'TXT', 'Markdown', 'Images'].map((format) => (
            <span key={format} className="px-2 py-1 rounded bg-muted/50">
              {format}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
