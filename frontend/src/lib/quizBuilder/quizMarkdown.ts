/** @deprecated Use @/components/media */
export {
  buildImageMarkdown,
  buildVideoMarkdown,
  buildAudioMarkdown,
  buildAttachmentMarkdown,
  buildLinkMarkdown,
  insertAtCursor,
  resolveMediaUrl as resolveMarkdownMediaUrl,
  isRenderableMediaUrl,
  isInternalMetadataLabel,
} from "@/components/media/mediaMarkdown";
