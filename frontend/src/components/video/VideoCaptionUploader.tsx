import { useRef, useState } from "react";
import { Loader2, Subtitles, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CAPTION_LANGUAGES,
  uploadCaptionFile,
  type VideoCaptionTrack,
} from "@/lib/videoCaptions";

interface VideoCaptionUploaderProps {
  captions: VideoCaptionTrack[];
  onChange: (captions: VideoCaptionTrack[]) => void;
}

export function VideoCaptionUploader({ captions, onChange }: VideoCaptionUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState("en");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["vtt", "srt"].includes(ext)) {
      setError("Please upload a .vtt or .srt subtitle file");
      return;
    }

    const langMeta = CAPTION_LANGUAGES.find((l) => l.code === language);
    if (captions.some((c) => c.language === language)) {
      setError(`${langMeta?.label || language} captions already added`);
      return;
    }

    setError(null);
    setIsUploading(true);
    try {
      const url = await uploadCaptionFile(file);
      onChange([
        ...captions,
        {
          language,
          label: langMeta?.label || language.toUpperCase(),
          url,
          default: captions.length === 0,
        },
      ]);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeCaption = (lang: string) => {
    const next = captions.filter((c) => c.language !== lang);
    if (next.length && !next.some((c) => c.default)) {
      next[0] = { ...next[0], default: true };
    }
    onChange(next);
  };

  return (
    <div className="space-y-3 pt-2 border-t border-primary/10">
      <div className="flex items-center gap-2">
        <Subtitles className="h-4 w-4 text-primary" />
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          Captions / Subtitles (optional)
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            {CAPTION_LANGUAGES.map((lang) => (
              <SelectItem key={lang.code} value={lang.code} className="text-xs">
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 text-xs font-semibold"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
          ) : (
            <UploadCloud className="h-3.5 w-3.5 mr-2" />
          )}
          Upload .vtt / .srt
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".vtt,.srt,text/vtt,application/x-subrip"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {captions.length > 0 && (
        <ul className="space-y-1.5">
          {captions.map((cap) => (
            <li
              key={cap.language}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs"
            >
              <span className="font-medium">
                {cap.label} <span className="text-muted-foreground">({cap.language})</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeCaption(cap.language)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Students can choose caption language in the video player settings. WebVTT (.vtt) recommended; SRT is auto-converted.
      </p>
    </div>
  );
}
