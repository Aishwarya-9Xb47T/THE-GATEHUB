import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StudentLessonRenderer } from "./StudentLessonRenderer";
import type { LessonContentBlock } from "@/lib/lessonBlocks";

interface CourseLectureViewProps {
  lectureId: string;
  lectureTitle: string;
  lectureType?: string;
  isPreviewMode?: boolean;
  hasFullAccess?: boolean;
  isLocked?: boolean;
  lockedPrompt?: React.ReactNode;
  className?: string;
  onQuizComplete?: () => void;
}

export function CourseLectureView({
  lectureId,
  lectureTitle,
  lectureType,
  isPreviewMode = false,
  hasFullAccess = true,
  isLocked = false,
  lockedPrompt,
  className,
  onQuizComplete,
}: CourseLectureViewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lecture-structured-content", lectureId],
    queryFn: async () => {
      const res = await api<{ blocks: LessonContentBlock[] }>(`/lectures/${lectureId}/structured-content`);
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    enabled: !!lectureId && hasFullAccess && !isLocked,
    staleTime: 5 * 60 * 1000,
  });

  if (isLocked && lockedPrompt) {
    return <div className="flex-1 flex items-center justify-center p-8">{lockedPrompt}</div>;
  }

  if (!hasFullAccess && lockedPrompt) {
    return <div className="flex-1 flex items-center justify-center p-8">{lockedPrompt}</div>;
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4 p-8">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p>{error instanceof Error ? error.message : "Failed to load lesson"}</p>
      </div>
    );
  }

  const blocks = data?.blocks ?? [];
  const isPdfOnly = blocks.length === 1 && blocks[0].type === "pdf";
  const isVideoPrimary = lectureType === "video" && blocks.some((b) => b.type === "video");

  return (
    <StudentLessonRenderer
      blocks={blocks}
      lectureId={lectureId}
      lectureTitle={lectureTitle}
      isPreviewMode={isPreviewMode}
      onQuizComplete={onQuizComplete}
      className={
        isPdfOnly
          ? className
          : isVideoPrimary
            ? cn("bg-black", className)
            : className
      }
    />
  );
}