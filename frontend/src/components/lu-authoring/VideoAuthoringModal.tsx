import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Youtube,
  Upload,
  Video,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Film,
} from "lucide-react";
import { api, apiFormData } from "@/lib/api";
import { extractYouTubeId } from "@/lib/videoSourceUtils";
import { VideoPlayer } from "@/components/video/VideoPlayer";

export interface VideoAuthoringData {
  type: "youtube" | "upload";
  url?: string;
  file?: string;
  title: string;
  youtubeId?: string;
}

interface VideoAuthoringModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: VideoAuthoringData) => void;
  initialData?: Partial<VideoAuthoringData> | null;
  projectId?: string;
  lessonTitle?: string;
}

export function VideoAuthoringModal({
  open,
  onClose,
  onSave,
  initialData,
  projectId,
  lessonTitle = "Lesson Video",
}: VideoAuthoringModalProps) {
  const [sourceType, setSourceType] = useState<"youtube" | "upload">("youtube");
  const [title, setTitle] = useState("");

  // YouTube State
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  // Local Upload State
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedAssetPath, setUploadedAssetPath] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const type = initialData?.type === "upload" ? "upload" : "youtube";
      setSourceType(type);
      setTitle(initialData?.title || lessonTitle || "Video Content");

      if (type === "youtube") {
        const url = initialData?.url || (initialData?.youtubeId ? `https://www.youtube.com/watch?v=${initialData.youtubeId}` : "");
        setYoutubeUrl(url);
        const id = extractYouTubeId(url);
        setYoutubeId(id);
      } else if (initialData?.file || initialData?.url) {
        const fileRef = initialData.file || initialData.url || "";
        setUploadedUrl(fileRef);
        setUploadedAssetPath(initialData.file || fileRef);
        setUploadedFileName(fileRef.split("/").pop() || fileRef);
      }
    } else {
      // Reset on close
      setYoutubeUrl("");
      setYoutubeId(null);
      setYoutubeError(null);
      setLocalFile(null);
      setUploading(false);
      setUploadProgress(0);
      setUploadedUrl(null);
      setUploadedAssetPath(null);
      setUploadedFileName(null);
      setUploadError(null);
    }
  }, [open, initialData, lessonTitle]);

  const handleYoutubeUrlChange = (val: string) => {
    setYoutubeUrl(val);
    setYoutubeError(null);
    if (!val.trim()) {
      setYoutubeId(null);
      return;
    }
    const extracted = extractYouTubeId(val);
    if (extracted) {
      setYoutubeId(extracted);
    } else {
      setYoutubeId(null);
      setYoutubeError("Please enter a valid YouTube video URL");
    }
  };

  const processSelectedFile = async (file: File) => {
    console.log("[VIDEO_UPLOAD] SELECTED FILE", {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
    });

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const validExts = ["mp4", "webm", "mov", "m4v", "avi", "mkv"];
    const isValidType =
      file.type.startsWith("video/") ||
      validExts.includes(ext) ||
      file.type === "application/octet-stream" ||
      file.type === "";

    if (!isValidType) {
      const err = `Invalid file type (${file.type || ext}). Please select a valid video file (MP4, WebM, MOV, M4V).`;
      console.warn("[VIDEO_UPLOAD] REJECTED:", err);
      setUploadError(err);
      return;
    }

    const MAX_SIZE = 500 * 1024 * 1024; // 500MB
    if (file.size > MAX_SIZE) {
      const err = `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum size is 500MB.`;
      console.warn("[VIDEO_UPLOAD] REJECTED:", err);
      setUploadError(err);
      return;
    }

    // Preserve the actual File object
    setLocalFile(file);
    setUploadedFileName(file.name);
    setUploadError(null);
    setUploading(true);
    setUploadProgress(20);

    console.log("[VIDEO_UPLOAD] STARTING UPLOAD", {
      name: file.name,
      size: file.size,
    });

    try {
      const formData = new FormData();
      if (projectId) {
        const targetPath = `/assets/videos/${file.name.replace(/\s+/g, "_")}`;
        formData.append("path", targetPath);
        formData.append("file", file, file.name);

        console.log("[VIDEO_UPLOAD] UPLOAD START -> /latex-projects/" + projectId + "/files/upload");
        setUploadProgress(50);
        const res = await apiFormData<{
          success: boolean;
          file?: { id: string; url: string; path: string; name: string };
          error?: string;
        }>(`/latex-projects/${projectId}/files/upload`, formData);

        console.log("[VIDEO_UPLOAD] RESPONSE:", res);
        setUploadProgress(90);

        if (res.data?.success && res.data.file) {
          const finalUrl = res.data.file.url || res.data.file.path;
          const finalPath = res.data.file.path || res.data.file.name;
          console.log("[VIDEO_UPLOAD] SUCCESS -> asset reference:", finalPath, "url:", finalUrl);
          setUploadedUrl(finalUrl);
          setUploadedAssetPath(finalPath);
          setUploadedFileName(file.name);
          setUploadProgress(100);
        } else {
          throw new Error(res.error || res.data?.error || "Upload failed");
        }
      } else {
        formData.append("file", file, file.name);
        console.log("[VIDEO_UPLOAD] UPLOAD START -> /upload");
        setUploadProgress(50);
        const res = await apiFormData<{ success: boolean; url?: string; error?: string }>(
          `/upload`,
          formData
        );

        console.log("[VIDEO_UPLOAD] RESPONSE:", res);
        setUploadProgress(90);

        if (res.data?.success && res.data.url) {
          console.log("[VIDEO_UPLOAD] SUCCESS -> url:", res.data.url);
          setUploadedUrl(res.data.url);
          setUploadedAssetPath(file.name);
          setUploadedFileName(file.name);
          setUploadProgress(100);
        } else {
          throw new Error(res.error || res.data?.error || "Upload failed");
        }
      }
    } catch (err: any) {
      console.error("[VIDEO_UPLOAD] ERROR:", err);
      setUploadError(err.message || "Failed to upload video");
      setUploadedUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("[VIDEO_UPLOAD] FILE INPUT CHANGE");
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleRemoveLocalVideo = () => {
    setLocalFile(null);
    setUploadedUrl(null);
    setUploadedAssetPath(null);
    setUploadedFileName(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = () => {
    if (sourceType === "youtube") {
      if (!youtubeId) {
        setYoutubeError("Valid YouTube video is required");
        return;
      }
      onSave({
        type: "youtube",
        url: youtubeUrl.trim(),
        youtubeId,
        title: title.trim() || "YouTube Video",
      });
    } else {
      if (!uploadedUrl) {
        setUploadError("Please select and upload a video file");
        return;
      }
      onSave({
        type: "upload",
        file: uploadedAssetPath || uploadedFileName || localFile?.name || uploadedUrl,
        url: uploadedUrl,
        title: title.trim() || uploadedFileName || localFile?.name || "Local Video",
      });
    }
    onClose();
  };

  const canSave = sourceType === "youtube" ? Boolean(youtubeId) : Boolean(uploadedUrl && !uploading && !uploadError);

  const displayFileName = uploadedFileName || localFile?.name;
  const displayFileSize = localFile ? `${(localFile.size / (1024 * 1024)).toFixed(1)} MB` : null;
  const displayExt = (displayFileName?.split(".").pop() || "MP4").toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-2xl bg-[#1e1e1e] text-slate-100 border-slate-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <Film className="w-5 h-5 text-primary" />
            Add Video Content
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Attach a video to this lesson via YouTube or direct local file upload.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title Input */}
          <div className="space-y-1.5">
            <Label htmlFor="video-title" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Video Title
            </Label>
            <Input
              id="video-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Introduction & Deep Dive"
              className="bg-[#2a2a2a] border-slate-700 text-slate-100 focus:border-primary"
            />
          </div>

          {/* Source Selector Tabs */}
          <Tabs
            value={sourceType}
            onValueChange={(val) => setSourceType(val as "youtube" | "upload")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 bg-[#2a2a2a] p-1 border border-slate-700">
              <TabsTrigger
                value="youtube"
                className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Youtube className="w-4 h-4 text-red-500" />
                YouTube Video
              </TabsTrigger>
              <TabsTrigger
                value="upload"
                className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                Upload Local Video
              </TabsTrigger>
            </TabsList>

            {/* TAB: YOUTUBE */}
            <TabsContent value="youtube" className="space-y-4 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="youtube-url" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  YouTube Video URL
                </Label>
                <Input
                  id="youtube-url"
                  value={youtubeUrl}
                  onChange={(e) => handleYoutubeUrlChange(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="bg-[#2a2a2a] border-slate-700 text-slate-100 focus:border-primary"
                />
                {youtubeError && (
                  <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {youtubeError}
                  </p>
                )}
              </div>

              {/* YouTube Preview */}
              {youtubeId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready to attach (ID: {youtubeId})
                    </span>
                    <span>Preview</span>
                  </div>
                  <div className="w-full aspect-video rounded-lg overflow-hidden bg-black border border-slate-800">
                    <VideoPlayer videoUrl={youtubeUrl} videoType="youtube" title={title || "YouTube Preview"} />
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB: LOCAL UPLOAD */}
            <TabsContent value="upload" className="space-y-4 pt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,.mp4,.webm,.mov,.m4v,.avi,.mkv"
                onChange={handleFileSelect}
                className="hidden"
              />

              {!localFile && !uploadedUrl && !uploading && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-slate-700 hover:border-primary rounded-xl p-8 text-center cursor-pointer bg-[#252526] hover:bg-[#2c2c2e] transition-colors group"
                >
                  <Video className="w-10 h-10 mx-auto mb-3 text-slate-400 group-hover:text-primary transition-colors" />
                  <p className="font-medium text-slate-200">Click or drag video file to upload</p>
                  <p className="text-xs text-slate-400 mt-1">Supports MP4, WebM, MOV, M4V (Max 500MB)</p>
                </div>
              )}

              {/* Selected File Card & Status */}
              {(localFile || uploadedUrl) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-[#252526] p-3 rounded-lg border border-slate-700">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Film className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-mono font-semibold text-slate-100 truncate">
                          {displayFileName}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                          {displayFileSize && <span>{displayFileSize}</span>}
                          {displayFileSize && <span>•</span>}
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 rounded">
                            {displayExt}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!uploading && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-7 text-xs gap-1 text-slate-300 hover:text-white"
                          >
                            <RefreshCw className="w-3 h-3" /> Replace
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveLocalVideo}
                            className="h-7 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                          >
                            <Trash2 className="w-3 h-3" /> Remove
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {uploading && (
                    <div className="bg-[#252526] border border-slate-700 rounded-xl p-5 text-center space-y-3">
                      <Loader2 className="w-7 h-7 animate-spin text-primary mx-auto" />
                      <p className="text-xs font-medium text-slate-200">
                        {uploadProgress < 90 ? "Uploading video file…" : "Processing & Preparing video…"}
                      </p>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden max-w-xs mx-auto">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {uploadedUrl && !uploading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Upload complete
                        </span>
                        <span>Instructor Video Preview</span>
                      </div>
                      <div className="w-full aspect-video rounded-lg overflow-hidden bg-black border border-slate-800">
                        <VideoPlayer videoUrl={uploadedUrl} videoType="upload" title={title || "Local Video Preview"} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {uploadError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5 bg-red-950/40 p-3 rounded-lg border border-red-900/50">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {uploadError}
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-800">
          <Button type="button" variant="outline" onClick={onClose} className="border-slate-700 text-slate-300">
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="bg-primary text-primary-foreground font-semibold"
          >
            Save & Attach Video
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
