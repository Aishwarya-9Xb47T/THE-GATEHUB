export type { MediaKind, MediaInsertKind, MediaUploadOptions, MediaUploadResult } from "./types";

export {
  buildImageMarkdown,
  buildVideoMarkdown,
  buildAudioMarkdown,
  buildAttachmentMarkdown,
  buildLinkMarkdown,
  insertAtCursor,
  resolveMediaUrl,
  isRenderableMediaUrl,
  isInternalMetadataLabel,
  sanitizeDisplayLabel,
  mediaKindFromUrl,
  MEDIA_LABELS,
} from "./mediaMarkdown";

export { uploadMedia, detectMediaKind, isImageFile, buildMarkdownForFile } from "./mediaUpload";

export { MediaRenderer } from "./MediaRenderer";
export { CodeBlockRenderer } from "./CodeBlockRenderer";
export { CodeDialog } from "./CodeDialog";
export { TableRenderer } from "./TableRenderer";
export { TableDialog } from "./TableDialog";
export { CODE_LANGUAGES } from "./codeBlockLanguages";
export {
  AssessmentContentRenderer,
  AssessmentQuestionStem,
} from "@/components/assessment/AssessmentContentRenderer";
export type { AssessmentContentVariant } from "@/components/assessment/AssessmentContentRenderer";
export { MediaPreview } from "./MediaPreview";
export { MediaAttachment } from "./MediaAttachment";
export { MediaToolbar, TEXT_FORMAT_ACTIONS, MEDIA_TOOLBAR_ACTIONS } from "./MediaToolbar";
export type { FormatAction, MediaToolbarAction } from "./MediaToolbar";
export {
  MediaUploader,
  handleEditorMediaPaste,
  handleEditorMediaDrop,
} from "./MediaUploader";
export { RichContentEditor } from "./RichContentEditor";
export type { RichContentEditorProps } from "./RichContentEditor";
export { buildQuestionDisplayMarkdown, buildMetadataMediaMarkdown } from "./questionDisplay";
export { QuestionMediaField } from "./QuestionMediaField";
export { hasQuestionAnswer, initialAnswerForType } from "./questionAnswer";
export {
  QuestionPlayerBody,
  toPlayerQuestion,
} from "./questionPlayer";
export type { PlayerQuestion, PlayerOption, QuestionPlayerBodyProps } from "./questionPlayer";
export { FormulaDialog } from "./FormulaDialog";
export { VisualBlockEditor } from "./VisualBlockEditor";
export { parseContentBlocks, serializeContentBlocks, reparseStructuredBlocks, promoteStructuredInBlocks, mergeAdjacentTextBlocks } from "./contentBlocks";
export { questionContentPreview } from "./contentPreview";
