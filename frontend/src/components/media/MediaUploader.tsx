import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Link2, Loader2, Upload, Video, Music, Paperclip, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToastStore } from "@/store/toastStore";
import {
  buildAttachmentMarkdown,
  buildAudioMarkdown,
  buildImageMarkdown,
  buildLinkMarkdown,
  buildVideoMarkdown,
  MEDIA_LABELS,
} from "./mediaMarkdown";
import { buildMarkdownForFile, uploadMedia } from "./mediaUpload";
import type { MediaInsertKind } from "./types";
import { MediaRenderer } from "./MediaRenderer";
import { extractYouTubeId } from "@/lib/videoSourceUtils";

interface MediaUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: MediaInsertKind;
  onInsert: (markdown: string) => void;
}

export function MediaUploader({
  open,
  onOpenChange,
  defaultKind = "image",
  onInsert,
}: MediaUploaderProps) {
  const toast = useToastStore((s) => s.add);
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<MediaInsertKind>(defaultKind);
  const [url, setUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [previewMarkdown, setPreviewMarkdown] = useState<string | null>(null);
  const [lastFailedFile, setLastFailedFile] = useState<File | null>(null);

  // Derived: extract YouTube ID when on video tab
  const youtubeId = kind === "video" ? extractYouTubeId(url.trim()) : null;

  // Sync kind when dialog opens with a new defaultKind
  useEffect(() => {
    if (open) {
      setKind(defaultKind);
      setPreviewMarkdown(null);
      setUrl("");
      setLastFailedFile(null);
    }
  }, [open, defaultKind]);

  const reset = useCallback(() => {
    setUrl("");
    setLinkLabel("");
    setUploading(false);
    setProgress(0);
    setDragOver(false);
    setPreviewMarkdown(null);
    setLastFailedFile(null);
  }, []);

  const confirmInsert = useCallback(
    (markdown: string) => {
      onInsert(markdown);
      onOpenChange(false);
      reset();
      toast({ title: "Media added", description: `${MEDIA_LABELS[kind as keyof typeof MEDIA_LABELS] ?? "Content"} inserted.`, variant: "success" });
    },
    [kind, onInsert, onOpenChange, reset, toast]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setProgress(0);
      setLastFailedFile(null);
      try {
        const uploadedUrl = await uploadMedia(file, { onProgress: setProgress });
        const markdown = buildMarkdownForFile(uploadedUrl, file);
        confirmInsert(markdown);
      } catch (err: any) {
        setLastFailedFile(file);
        toast({
          title: "Upload failed",
          description: err instanceof Error ? err.message : "Could not upload file",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    },
    [confirmInsert, toast]
  );

  const handleUrlPreview = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast({ title: "Enter a URL", variant: "destructive" });
      return;
    }
    let markdown: string;
    switch (kind) {
      case "video":
        markdown = buildVideoMarkdown(trimmed);
        break;
      case "audio":
        markdown = buildAudioMarkdown(trimmed);
        break;
      case "attachment":
        markdown = buildAttachmentMarkdown(trimmed);
        break;
      case "link":
        markdown = buildLinkMarkdown(trimmed, linkLabel.trim() || undefined);
        break;
      default:
        markdown = buildImageMarkdown(trimmed);
    }
    setPreviewMarkdown(markdown);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleUpload(file);
  };

  const kindLabel = MEDIA_LABELS[kind as keyof typeof MEDIA_LABELS] ?? "Media";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert {kindLabel.toLowerCase()}</DialogTitle>
          <DialogDescription>Upload, paste, or enter a URL. Preview before inserting.</DialogDescription>
        </DialogHeader>

        <Tabs value={kind} onValueChange={(v) => { setKind(v as MediaInsertKind); setPreviewMarkdown(null); }}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="image" className="gap-1 text-xs"><Image className="h-3.5 w-3.5" />Image</TabsTrigger>
            <TabsTrigger value="video" className="gap-1 text-xs"><Video className="h-3.5 w-3.5" />Video</TabsTrigger>
            <TabsTrigger value="audio" className="gap-1 text-xs"><Music className="h-3.5 w-3.5" />Audio</TabsTrigger>
            <TabsTrigger value="attachment" className="gap-1 text-xs"><Paperclip className="h-3.5 w-3.5" />File</TabsTrigger>
            <TabsTrigger value="link" className="gap-1 text-xs"><Link2 className="h-3.5 w-3.5" />Link</TabsTrigger>
          </TabsList>

          <TabsContent value={kind} className="space-y-4 pt-2">
            <div
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border/60"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              {uploading ? (
                <div className="flex w-full flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <Progress value={progress} className="h-1.5 w-full" />
                  <span className="text-xs text-muted-foreground">{progress}%</span>
                </div>
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="text-center">
                <p className="text-sm font-medium">Drag & drop or browse</p>
                <p className="text-xs text-muted-foreground">Ctrl+V paste also works in the editor</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  Choose file
                </Button>
                {lastFailedFile && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => void handleUpload(lastFailedFile)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Retry
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept={kind === "image" ? "image/*" : kind === "video" ? "video/*" : kind === "audio" ? "audio/*" : "*/*"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = "";
                }}
              />
            </div>

            {kind === "link" && (
              <div className="space-y-2">
                <Label htmlFor="media-link-label">Link text (optional)</Label>
                <Input
                  id="media-link-label"
                  placeholder="Display text"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                />
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or URL</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="media-url">
                {kind === "video" ? "Video URL (YouTube, MP4, or WebM)" : "URL"}
              </Label>
              <Input
                id="media-url"
                placeholder={kind === "video" ? "https://youtube.com/watch?v=… or https://…/video.mp4" : "https://…"}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlPreview()}
              />
              {youtubeId && (
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  YouTube video detected — ID: <code className="font-mono">{youtubeId}</code>
                </p>
              )}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={handleUrlPreview}>
              Preview from URL
            </Button>

            {previewMarkdown && (
              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Preview</p>
                <MediaRenderer content={previewMarkdown} />
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={() => confirmInsert(previewMarkdown)}>
                    Insert
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setPreviewMarkdown(null)}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Paste / drop handler for rich content editors. */
export async function handleEditorMediaPaste(
  e: React.ClipboardEvent,
  insertMarkdown: (md: string) => void,
  onError: (msg: string) => void
): Promise<boolean> {
  const items = e.clipboardData?.items;
  if (items) {
    for (const item of items) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (!file) continue;
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !file.type.startsWith("audio/")) continue;
      e.preventDefault();
      try {
        const uploadedUrl = await uploadMedia(file);
        insertMarkdown(buildMarkdownForFile(uploadedUrl, file));
        return true;
      } catch (err: any) {
        onError(err instanceof Error ? err.message : "Paste upload failed");
        return true;
      }
    }
  }

  const text = e.clipboardData?.getData("text/plain")?.trim();
  if (text && /^https?:\/\//i.test(text)) {
    e.preventDefault();
    if (/\.(mp4|webm|mov)(\?|$)/i.test(text) || /youtube\.com|youtu\.be/i.test(text)) {
      insertMarkdown(buildVideoMarkdown(text));
    } else if (/\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(text)) {
      insertMarkdown(buildAudioMarkdown(text));
    } else if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(text)) {
      insertMarkdown(buildImageMarkdown(text));
    } else {
      insertMarkdown(buildAttachmentMarkdown(text));
    }
    return true;
  }

  return false;
}

export async function handleEditorMediaDrop(
  e: React.DragEvent,
  insertMarkdown: (md: string) => void,
  onError: (msg: string) => void
): Promise<boolean> {
  e.preventDefault();
  const file = e.dataTransfer.files?.[0];
  if (!file) return false;
  try {
    const uploadedUrl = await uploadMedia(file);
    insertMarkdown(buildMarkdownForFile(uploadedUrl, file));
    return true;
  } catch (err: any) {
    onError(err instanceof Error ? err.message : "Drop upload failed");
    return false;
  }
}
