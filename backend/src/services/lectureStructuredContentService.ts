import {
  type ContentBlock,
  flattenStructuredSections,
  generateStructuredContent,
} from "./contentBlockParser.js";

type LectureInput = {
  id: string;
  title: string;
  type: string;
  content?: string | null;
  videoUrl?: string | null;
  videoType?: string | null;
  compiledPdfUrl?: string | null;
  quiz?: {
    id: string;
    title: string;
    questions: Array<{
      id: string;
      text: string;
      type: string;
      marks: number;
      explanation?: string | null;
      options: Array<{ id: string; text: string; isCorrect: boolean }>;
    }>;
  } | null;
  mediaAssets?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    mimeType: string;
  }>;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
  }>;
};

function detectVideoTypeFromUrl(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("youtu")) return "youtube";
  if (u.includes("vimeo")) return "vimeo";
  return "upload";
}

function parseStoredJsonBlocks(content: string): ContentBlock[] | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed as ContentBlock[];
    if (Array.isArray(parsed.blocks)) return parsed.blocks as ContentBlock[];
    if (Array.isArray(parsed.contentBlocks)) return parsed.contentBlocks as ContentBlock[];
    if (parsed.sections) return flattenStructuredSections(parsed);
  } catch {
    return null;
  }
  return null;
}

export function buildLectureContentBlocks(lecture: LectureInput): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (lecture.type === "video" && lecture.videoUrl) {
    blocks.push({
      type: "video",
      videoUrl: lecture.videoUrl,
      videoType: lecture.videoType || detectVideoTypeFromUrl(lecture.videoUrl),
      title: lecture.title,
      lectureId: lecture.id,
    });
  }

  const content = lecture.content?.trim() || "";
  if (content) {
    if (content.startsWith("<")) {
      blocks.push({ type: "html", content });
    } else if (content.startsWith("/uploads/") || content.startsWith("http")) {
      if (!lecture.compiledPdfUrl) {
        blocks.push({ type: "file", title: lecture.title, src: content });
      }
    } else {
      const jsonBlocks = parseStoredJsonBlocks(content);
      if (jsonBlocks?.length) {
        blocks.push(...jsonBlocks);
      } else {
        const structured = generateStructuredContent(content);
        blocks.push(...flattenStructuredSections(structured));
      }
    }
  }

  for (const media of lecture.mediaAssets || []) {
    if (media.type === "video" || media.mimeType?.startsWith("video/")) {
      blocks.push({
        type: "video",
        videoUrl: media.url,
        videoType: detectVideoTypeFromUrl(media.url),
        title: media.name,
        lectureId: lecture.id,
      });
    } else if (media.type === "image" || media.mimeType?.startsWith("image/")) {
      blocks.push({ type: "image", src: media.url, alt: media.name });
    } else if (media.type === "pdf" || media.mimeType === "application/pdf") {
      blocks.push({ type: "file", title: media.name, src: media.url });
    }
  }

  for (const attachment of lecture.attachments || []) {
    blocks.push({
      type: "file",
      title: attachment.name,
      src: attachment.url,
    });
  }

  if (lecture.type === "file" && content && !blocks.some((b) => b.type === "file")) {
    blocks.push({ type: "file", title: lecture.title, src: content });
  }

  if (lecture.type === "quiz" && lecture.quiz) {
    blocks.push({
      type: "quiz-full",
      title: lecture.quiz.title,
      quiz: lecture.quiz,
      lectureId: lecture.id,
    });
  }

  if (lecture.type === "notes" && lecture.compiledPdfUrl) {
    const isTextOnly = (b: ContentBlock) =>
      b.type === "text" || b.type === "subsection" || b.type === "subsubsection";
    const hasInteractive = blocks.some((b) => !isTextOnly(b));

    if (!hasInteractive) {
      return [{ type: "pdf", title: lecture.title, lectureId: lecture.id }];
    }

    if (!blocks.some((b) => b.type === "pdf")) {
      blocks.push({
        type: "pdf",
        title: `${lecture.title} — Compiled Notes`,
        lectureId: lecture.id,
      });
    }
  }

  return blocks;
}
