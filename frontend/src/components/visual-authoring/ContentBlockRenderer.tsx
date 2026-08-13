/**
 * Canonical student-shaped preview for authoring surfaces.
 * Document/rich blocks → LessonDocumentView → DocumentRenderer (UCE AST).
 * Replaces the legacy ContentBlockRenderer parallel preview path.
 */
export {
  CanonicalContentPreview,
  CanonicalContentPreview as ContentBlockRenderer,
} from "./CanonicalContentPreview";
