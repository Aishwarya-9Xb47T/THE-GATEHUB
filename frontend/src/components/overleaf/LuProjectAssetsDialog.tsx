import { useMemo, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, Copy, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { withUploadAuth } from "@/lib/courseMediaUrls";
import type { FileNode } from "@/components/overleaf/FileTree";
import {
  defaultImageUploadFolder,
  latexImageRefFromPath,
  useLatexProjectUpload,
} from "@/lib/latexEditor/useLatexProjectUpload";

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|pdf)$/i;

interface LuProjectAssetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  isLuProject: boolean;
  files: FileNode[];
  onRefresh: () => void | Promise<void>;
  onInsert: (latexSnippet: string) => void;
}

export function LuProjectAssetsDialog({
  open,
  onOpenChange,
  projectId,
  isLuProject,
  files,
  onRefresh,
  onInsert,
}: LuProjectAssetsDialogProps) {
  const uploadFolder = defaultImageUploadFolder(isLuProject);
  const { isUploading, fileInputRef, uploadFiles, openFilePicker } = useLatexProjectUpload(
    projectId,
    uploadFolder
  );
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const imageFiles = useMemo(
    () =>
      files
        .filter((f) => !f.isFolder && IMAGE_EXT.test(f.path))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [files]
  );
  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return imageFiles;
    return imageFiles.filter((f) => {
      const ref = latexImageRefFromPath(f.path).toLowerCase();
      return f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q) || ref.includes(q);
    });
  }, [imageFiles, query]);

  const buildSnippet = (filePath: string) =>
    `\\includegraphics[width=0.7\\linewidth]{${latexImageRefFromPath(filePath)}}`;

  const handleUpload = async (fileList: FileList | File[]) => {
    const result = await uploadFiles(fileList);
    if (result) {
      await onRefresh();
    }
  };
  const toggleSelected = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const insertPath = (path: string) => {
    onInsert(buildSnippet(path));
  };
  const insertSelected = () => {
    if (!selectedPaths.size) return;
    for (const path of selectedPaths) {
      insertPath(path);
    }
    setSelectedPaths(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#252526] border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <ImageIcon className="w-5 h-5 text-emerald-400" />
            Project images
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Upload images, then insert them into your LaTeX with one click. Files are saved to{" "}
            <code className="text-emerald-300">{uploadFolder}/</code> and included when you compile.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleUpload(e.target.files);
            e.target.value = "";
          }}
        />

        <div
          className={cn(
            "rounded-lg border border-dashed border-slate-600 p-6 text-center transition-colors",
            isDragging && "border-emerald-500 bg-emerald-500/10"
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) {
              dragDepth.current = 0;
              setIsDragging(false);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setIsDragging(false);
            if (e.dataTransfer.files?.length) void handleUpload(e.dataTransfer.files);
          }}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <p className="text-sm">Uploading…</p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto text-slate-500 mb-2" />
              <p className="text-sm text-slate-300">Drag images here or</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-2 border border-slate-600 bg-[#252526] text-slate-200 hover:bg-slate-700"
                onClick={openFilePicker}
              >
                Choose files
              </Button>
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search assets by name or path"
              className="w-full h-9 rounded-md border border-slate-700 bg-[#1f1f1f] pl-8 pr-3 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              {filteredFiles.length} shown / {imageFiles.length} total
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-slate-600 bg-[#252526] text-slate-200 hover:bg-slate-700"
                disabled={filteredFiles.length === 0}
                onClick={() => setSelectedPaths(new Set(filteredFiles.map((f) => f.path)))}
              >
                Select visible
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-slate-600 bg-[#252526] text-slate-200 hover:bg-slate-700"
                disabled={selectedPaths.size === 0}
                onClick={() => setSelectedPaths(new Set())}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={selectedPaths.size === 0}
                onClick={insertSelected}
              >
                Insert selected ({selectedPaths.size})
              </Button>
            </div>
          </div>
        </div>

        <div className="max-h-56 overflow-y-auto rounded-md border border-slate-700 divide-y divide-slate-800">
          {filteredFiles.length === 0 ? (
            <p className="text-sm text-slate-500 p-4 text-center">No images uploaded yet.</p>
          ) : (
            filteredFiles.map((file) => {
              const ref = latexImageRefFromPath(file.path);
              const checked = selectedPaths.has(file.path);
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-2 hover:bg-slate-800/60"
                >
                  {file.s3Url ? (
                    <img
                      src={withUploadAuth(file.s3Url)}
                      alt=""
                      className="w-10 h-10 rounded object-cover bg-slate-900 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate text-slate-200">{file.name}</p>
                    <p className="text-[10px] text-slate-500 truncate font-mono">{ref}</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
                    checked={checked}
                    onChange={() => toggleSelected(file.path)}
                    title="Select for batch insert"
                    aria-label={`Select ${file.name} for batch insert`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-emerald-400 hover:text-emerald-300"
                    title="Insert into editor"
                    onClick={() => {
                      insertPath(file.path);
                    }}
                  >
                    Insert
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0 border border-slate-600 bg-[#252526] text-slate-200 hover:bg-slate-700"
                    title="Insert and close"
                    onClick={() => {
                      insertPath(file.path);
                      onOpenChange(false);
                    }}
                  >
                    Insert & close
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0 h-8 w-8 text-slate-400"
                    title="Copy LaTeX reference"
                    onClick={() => {
                      void navigator.clipboard.writeText(buildSnippet(file.path));
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
