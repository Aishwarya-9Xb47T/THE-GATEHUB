import type { OverlayProps } from "../types/overlay";

export function BookmarkOverlay({ question, isOpen, onClose, onAction }: OverlayProps) {
  if (!isOpen || !question) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Bookmark</h3>
        <button type="button" className="text-xs underline" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Save this question to review later.
      </p>
      <button
        type="button"
        className="text-sm text-primary underline"
        onClick={() => onAction?.("bookmark", { questionVersionId: question.questionVersionId })}
      >
        Bookmark question
      </button>
    </div>
  );
}
