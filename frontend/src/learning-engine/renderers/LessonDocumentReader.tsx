import { useEffect, useMemo } from "react";
import { LessonContainer } from "@/components/learning/LessonContainer";
import { readEmbeddedMedia } from "@/components/learning/EmbeddedLessonMedia";
import { resolveLearningUniverseAsset } from "@/lib/resolveLearningUniverseAsset";
import { hasDocumentNodes, nodesFromContentBlock, titleFromContentBlock } from "@gatehub/lesson-body";
import type { ExperienceRendererProps } from "./ExperienceRenderer";

/**
 * Universal document reader — consumes compiled payload.nodes only.
 */
export function LessonDocumentReader({ step, universeId, assets, onProgress }: ExperienceRendererProps) {
  useEffect(() => {
    onProgress(step.id, "view");
  }, [step.id, onProgress]);

  const { before, after } = readEmbeddedMedia(step.payload);
  const title = String(step.payload.title ?? step.title);

  const document = useMemo(() => {
    if (hasDocumentNodes(step.payload)) {
      return {
        title,
        nodes: step.payload.nodes as import("@gatehub/lesson-body").DocumentNode[],
      };
    }
    const nodes = nodesFromContentBlock({
      type: String(step.payload.blockType ?? "document"),
      content: step.payload as any,
    });
    return { title: titleFromContentBlock({ type: "document", content: step.payload as any }) ?? title, nodes: nodes ?? [] };
  }, [step.payload, title]);

  const resolveImageUrl = (ref: string) => {
    const hit = resolveLearningUniverseAsset(ref, universeId, assets);
    return hit.resolvedUrl;
  };

  if (!document.nodes.length) {
    return (
      <div className="rounded-xl border border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        No compiled document content for this step.
      </div>
    );
  }

  return (
    <article className="lesson-reading-shell w-full max-w-none mx-auto">
      <LessonContainer
        title={title}
        document={document}
        embeddedBefore={before}
        embeddedAfter={after}
        resolveImageUrl={resolveImageUrl}
        universeId={universeId}
        assets={assets}
        variant="published"
        cardClassName="min-h-[calc(100vh-16rem)] p-6 md:p-10 lg:p-14"
        titleClassName="type-h2 text-foreground"
      />
    </article>
  );
}
