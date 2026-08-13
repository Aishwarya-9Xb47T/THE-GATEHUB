/**
 * Canonical student-shaped preview for authoring surfaces.
 * Document/rich blocks → LessonDocumentView → DocumentRenderer (UCE AST).
 * Interactive/media blocks use shared media/components (not a parallel document engine).
 */
import { LessonDocumentView } from "@/components/learning/LessonDocumentView";
import { LessonImageBlock } from "@/components/learning-universe/LessonImageBlock";
import { TryItPlayground } from "@/components/learning/TryItPlayground";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { Card } from "@/components/ui/card";
import { BLOCK_LABELS, type ContentBlockType, type LuContentBlock } from "@/lib/learningUniverseSchema";
import { isRichTextBlockType } from "@gatehub/lesson-body";
import { resolveVideoSource } from "@/lib/videoSourceUtils";
import { useOptionalVisualAssets } from "./VisualAssetContext";

function blockText(content: Record<string, unknown> | string | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return String(content.text || content.body || content.prompt || content.content || "");
}

interface CanonicalContentPreviewProps {
  block: LuContentBlock;
  index?: number;
  previewMode?: boolean;
  universeId?: string;
  resolveImageUrl?: (ref: string) => string;
}

export function CanonicalContentPreview({
  block,
  universeId = "preview",
  resolveImageUrl,
}: CanonicalContentPreviewProps) {
  const visualAssets = useOptionalVisualAssets();
  const resolve =
    resolveImageUrl ||
    ((ref: string) => visualAssets?.resolvePreviewUrl(ref) || ref);

  if (isRichTextBlockType(block.type) || block.type === "document") {
    return (
      <LessonDocumentView
        block={block}
        universeId={universeId}
        resolveImageUrl={resolve}
      />
    );
  }

  const c =
    typeof block.content === "object" && block.content
      ? (block.content as Record<string, unknown>)
      : {};
  const label = BLOCK_LABELS[block.type as ContentBlockType] || block.type;

  switch (block.type) {
    case "image": {
      const fileRef = String(c.file || c.path || c.url || "");
      const src = fileRef ? resolve(fileRef) : "";
      return (
        <LessonImageBlock
          src={src}
          alt={String(c.alt || c.caption || "")}
          caption={String(c.caption || "")}
          showDiagnostics={false}
        />
      );
    }
    case "video": {
      const content = c;
      const resolved = resolveVideoSource(
        {
          url: String(content.url || ""),
          file: String(content.file || content.path || ""),
          type: String(content.type || ""),
          title: String(content.title || "Video"),
          youtubeId: content.youtubeId ? String(content.youtubeId) : undefined,
        },
        resolve
      );
      if (!resolved) {
        return (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Video unavailable — check the URL or upload a file.
          </div>
        );
      }
      return (
        <div className="rounded-xl overflow-hidden border bg-card">
          <VideoPlayer
            videoUrl={resolved.url}
            videoType={resolved.type}
            title={String(content.title || resolved.title || "Video")}
            embedUrl={resolved.embedUrl}
            youtubeId={resolved.youtubeId}
            vimeoId={resolved.vimeoId}
            className="aspect-video w-full"
          />
        </div>
      );
    }
    case "practice":
    case "codeexample":
      return (
        <TryItPlayground
          title={String(c.title || label)}
          language={String(c.language || "python")}
          initialCode={String(c.initialCode || c.startercode || c.code || "")}
          expectedOutput={String(c.expectedOutput || c.expectedoutput || c.output || "")}
        />
      );
    case "project":
      return (
        <Card className="p-4 space-y-2">
          <p className="text-sm font-semibold">{String(c.title || "Project")}</p>
          {c.description ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{String(c.description)}</p>
          ) : null}
          {c.instructions ? (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(c.instructions)}</p>
          ) : null}
          <p className="text-[10px] text-muted-foreground">Full workspace opens in the published student experience</p>
        </Card>
      );
    case "quiz": {
      const quiz = block.content as { title?: string; questions?: { text: string }[] };
      return (
        <Card className="p-4 space-y-2">
          <p className="text-sm font-semibold">{quiz?.title || "Quiz"}</p>
          <p className="text-xs text-muted-foreground">
            {(quiz?.questions?.length || 0)} question(s) — opens in published experience
          </p>
        </Card>
      );
    }
    case "download":
    case "resource":
      return (
        <Card className="p-4 text-sm">
          <p className="font-medium">{String(c.title || label)}</p>
          <p className="text-xs text-muted-foreground truncate mt-1">
            {String(c.url || c.file || c.fileUrl || "Resource")}
          </p>
        </Card>
      );
    default:
      return (
        <Card className="p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{label}</p>
          <p className="mt-1 whitespace-pre-wrap">{blockText(c)}</p>
        </Card>
      );
  }
}

/** @deprecated Alias — use CanonicalContentPreview. */
export const ContentBlockRenderer = CanonicalContentPreview;
