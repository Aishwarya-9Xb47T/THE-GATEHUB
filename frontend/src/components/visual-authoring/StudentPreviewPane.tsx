import type { VisualLesson } from "@/lib/visualBuilder/converters";
import { CanonicalContentPreview } from "./CanonicalContentPreview";
import { Card } from "@/components/ui/card";
import { useVisualAssets } from "./VisualAssetContext";

interface StudentPreviewPaneProps {
  lesson: VisualLesson;
}

/**
 * Visual Builder student preview — DocumentRenderer via CanonicalContentPreview (UCE AST).
 */
export function StudentPreviewPane({ lesson }: StudentPreviewPaneProps) {
  const { resolvePreviewUrl } = useVisualAssets();

  return (
    <div className="space-y-4 p-4 overflow-auto h-full bg-muted/20">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
          Canonical student preview
        </p>
        <h2 className="text-lg font-semibold">{lesson.title}</h2>
        {lesson.description && <p className="text-sm text-muted-foreground mt-1">{lesson.description}</p>}
        {lesson.estimatedMinutes != null && lesson.estimatedMinutes > 0 && (
          <p className="text-xs text-muted-foreground mt-1">{lesson.estimatedMinutes} min estimated</p>
        )}
        {lesson.learningOutcomes && (
          <Card className="p-3 mt-2 text-sm">
            <strong>Outcomes:</strong> {lesson.learningOutcomes}
          </Card>
        )}
      </div>

      {lesson.contentBlocks.map((block, i) => (
        <CanonicalContentPreview
          key={i}
          block={block}
          index={i}
          previewMode
          resolveImageUrl={resolvePreviewUrl}
        />
      ))}

      {lesson.contentBlocks.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">
          Add content blocks to see the student preview.
        </p>
      )}
    </div>
  );
}
