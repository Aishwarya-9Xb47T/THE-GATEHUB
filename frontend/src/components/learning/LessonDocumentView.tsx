import type { LuContentBlock } from "@/lib/learningUniverseSchema";
import { LessonContainer } from "@/components/learning/LessonContainer";
import { isRichTextBlockType, nodesFromContentBlock, titleFromContentBlock } from "@gatehub/lesson-body";

interface LessonDocumentViewProps {
  block: LuContentBlock;
  universeId?: string;
  resolveImageUrl: (ref: string) => string;
}

/**
 * Type-agnostic lesson document view — compiled AST only (migration adapter for legacy blocks).
 */
export function LessonDocumentView({ block, universeId, resolveImageUrl }: LessonDocumentViewProps) {
  if (!isRichTextBlockType(block.type)) return null;

  // Convert LuContentBlock to ContentBlockLike format expected by lesson-body
  const blockLike = {
    type: block.type,
    content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
  };

  const nodes = nodesFromContentBlock(blockLike);
  const titleRaw = titleFromContentBlock(blockLike);
  const title = typeof titleRaw === 'string' ? titleRaw : undefined;

  if (!nodes?.length) {
    return (
      <div className="rounded-xl border border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        Compile this lesson to preview document content.
      </div>
    );
  }

  return (
    <LessonContainer
      title={title}
      document={{ title, nodes }}
      resolveImageUrl={resolveImageUrl}
      universeId={universeId}
      variant="studio"
    />
  );
}
