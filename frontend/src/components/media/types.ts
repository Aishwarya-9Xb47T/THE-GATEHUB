export type MediaKind = "image" | "video" | "audio" | "attachment" | "link";

export type MediaInsertKind = MediaKind;

export interface MediaUploadResult {
  url: string;
  kind: MediaKind;
}

export interface MediaUploadOptions {
  onProgress?: (percent: number) => void;
}
