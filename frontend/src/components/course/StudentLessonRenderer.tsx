import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InteractiveQuiz } from "@/components/learning/InteractiveQuiz";
import { TryItPlayground } from "@/components/learning/TryItPlayground";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { CoursePdfViewer } from "@/components/course/CoursePdfViewer";
import { resolveCourseMediaUrl } from "@/lib/courseMediaUrls";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import type { LessonContentBlock } from "@/lib/lessonBlocks";
import { CourseLectureQuizBlock } from "./CourseLectureQuizBlock";

function resolveBlockAsset(src?: string): string {
  if (!src?.trim()) return "";
  const trimmed = src.trim();
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return resolveCourseMediaUrl(trimmed) || trimmed;
  return (
    resolveCourseMediaUrl(`/uploads/${trimmed}`) ||
    resolveCourseMediaUrl(`/uploads/resources/${trimmed}`) ||
    trimmed
  );
}

function inferVideoType(url: string, explicit?: string): string {
  if (explicit) return explicit;
  const u = url.toLowerCase();
  if (u.includes("youtu")) return "youtube";
  if (u.includes("vimeo")) return "vimeo";
  return "upload";
}

function LessonText({ content }: { content: string }) {
  return (
    <div
      className="prose-content mb-8 text-base lg:text-lg leading-relaxed text-foreground"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
    />
  );
}

function LessonImage({ block }: { block: LessonContentBlock }) {
  const url = resolveBlockAsset(block.src);
  if (!url) return null;
  return (
    <figure className="my-8 w-full">
      <img
        src={url}
        alt={block.alt || block.title || ""}
        className="w-full rounded-xl object-contain max-h-[70vh] shadow-lg"
        loading="lazy"
      />
    </figure>
  );
}

interface StudentLessonRendererProps {
  blocks: LessonContentBlock[];
  lectureTitle: string;
  lectureId: string;
  isPreviewMode?: boolean;
  className?: string;
  onQuizComplete?: () => void;
}

/**
 * Single lesson rendering engine — used by enrolled students and instructor preview alike.
 */
export function StudentLessonRenderer({
  blocks,
  lectureTitle,
  lectureId,
  isPreviewMode = false,
  className,
  onQuizComplete,
}: StudentLessonRendererProps) {
  if (!blocks.length) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-8 text-muted-foreground", className)}>
        <p>No lesson content available.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full min-w-0 flex-1 overflow-y-auto",
        className
      )}
    >
      <div className="w-full max-w-none px-4 py-6 lg:px-8 lg:py-10 space-y-2">
        {blocks.map((block, index) => {
          switch (block.type) {
            case "text":
            case "html":
              return <LessonText key={index} content={block.content || ""} />;

            case "subsection":
              return (
                <h2
                  key={index}
                  id={block.id}
                  className="text-2xl font-bold mt-10 mb-4 text-foreground border-b border-primary/30 pb-2"
                >
                  {block.title}
                </h2>
              );

            case "subsubsection":
              return (
                <h3 key={index} id={block.id} className="text-xl font-semibold mt-8 mb-3 text-foreground">
                  {block.title}
                </h3>
              );

            case "video": {
              const rawUrl = block.videoUrl || block.src || "";
              const videoType = inferVideoType(rawUrl, block.videoType);
              const isExternal = /^https?:/i.test(rawUrl);
              const isAbsolutePath = rawUrl.startsWith("/");
              const isFilenameOnly = Boolean(rawUrl) && !isExternal && !isAbsolutePath;
              const fileUrl = isFilenameOnly
                ? resolveCourseMediaUrl(`/uploads/${rawUrl}`) ||
                  resolveCourseMediaUrl(`/uploads/resources/${rawUrl}`) ||
                  rawUrl
                : rawUrl;
              const useLectureStream =
                videoType === "upload" && !isFilenameOnly && !isExternal && Boolean(block.lectureId || lectureId);

              return (
                <div key={index} className="my-8 w-full">
                  {block.title && block.title !== lectureTitle && (
                    <p className="text-sm font-medium text-muted-foreground mb-2">{block.title}</p>
                  )}
                  <div className="w-full aspect-video rounded-xl overflow-hidden bg-black shadow-xl">
                    <VideoPlayer
                      videoUrl={useLectureStream ? undefined : fileUrl}
                      videoType={videoType}
                      lectureId={useLectureStream ? block.lectureId || lectureId : undefined}
                      title={block.title || "Video"}
                      className="w-full h-full"
                    />
                  </div>
                </div>
              );
            }

            case "image":
              return <LessonImage key={index} block={block} />;

            case "pdf":
              return (
                <div key={index} className="my-6 w-full min-h-[60vh] flex flex-col">
                  {block.title && (
                    <p className="text-sm font-medium text-muted-foreground mb-3">{block.title}</p>
                  )}
                  <CoursePdfViewer
                    url={`/api/lectures/${block.lectureId || lectureId}/notes-pdf`}
                    title={block.title || lectureTitle}
                    className="flex-1 min-h-[50vh]"
                  />
                </div>
              );

            case "editor":
              return (
                <div key={index} className="my-8 w-full">
                  <TryItPlayground
                    initialCode={block.code || ""}
                    language={block.language || "javascript"}
                    title={block.title || "Try It Yourself"}
                    expectedOutput={block.expectedOutput}
                    showHintsToggle={false}
                    showSolutionToggle={false}
                  />
                </div>
              );

            case "output":
              return (
                <div key={index} className="my-6 rounded-lg overflow-hidden border border-border bg-slate-950">
                  <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase">
                    Output
                  </div>
                  <pre className="p-4 font-mono text-sm text-emerald-400 whitespace-pre-wrap">{block.content}</pre>
                </div>
              );

            case "example":
              return (
                <div key={index} className="my-8 rounded-lg border border-border overflow-hidden">
                  <div className="px-4 py-3 bg-muted/50 border-b border-border font-semibold">
                    {block.title || "Example"}
                  </div>
                  <div className="p-4">
                    <LessonText content={block.content || ""} />
                  </div>
                </div>
              );

            case "quiz":
              return (
                <div key={index} className="my-8">
                  <InteractiveQuiz
                    question={block.question || ""}
                    options={block.options || []}
                    correct={block.correct || ""}
                    explanation={block.explanation || ""}
                  />
                </div>
              );

            case "quiz-full":
              return (
                <CourseLectureQuizBlock
                  key={index}
                  quiz={block.quiz!}
                  lectureId={block.lectureId || lectureId}
                  isPreviewMode={isPreviewMode}
                  onComplete={onQuizComplete}
                />
              );

            case "file": {
              const href = resolveBlockAsset(block.src);
              return (
                <div key={index} className="my-8 flex flex-col items-center gap-4 p-8 border border-dashed rounded-xl">
                  <Download className="w-10 h-10 text-primary" />
                  <p className="font-semibold">{block.title || "Download"}</p>
                  {href ? (
                    <Button asChild>
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        Download File
                      </a>
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">File not available</p>
                  )}
                </div>
              );
            }

            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
