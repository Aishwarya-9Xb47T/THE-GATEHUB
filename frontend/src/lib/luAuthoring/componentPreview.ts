import type { LuContentBlock } from "@/lib/learningUniverseSchema";
import type { LuExplorerNode } from "./types";
import type { ProjectAssetFile } from "@/lib/latexEditor/projectAssetResolver";
import {
  parseLessonDocument,
  lessonBodyContainsImages,
} from "@gatehub/lesson-body";
import { extractVideoCommandsFromTex } from "@/lib/latexEditor/texVideoUtils";
import { normalizeLuPath } from "./paths";

function videoBlocksFromTex(texContent?: string | null) {
  if (!texContent?.trim()) return [];
  return extractVideoCommandsFromTex(texContent);
}

const INTERACTIVE_KINDS = new Set(["quiz", "question", "practice", "coding-lab", "video"]);

/** Universal document block — same shape for every text-based lesson. */
function emitDocumentBlock(
  node: LuExplorerNode,
  config: Record<string, unknown>,
  texContent?: string | null
): LuContentBlock {
  const source = texContent?.trim() ?? "";
  const doc = parseLessonDocument(
    source || String(config.body ?? config.markdown ?? config.content ?? config.text ?? "")
  );
  const videos = videoBlocksFromTex(texContent);
  return {
    type: "document",
    content: {
      title: doc.title ?? String(config.title ?? node.title ?? "Lesson"),
      nodes: doc.nodes,
      ...(videos.length ? { embeddedMediaAfter: videos } : {}),
    },
  };
}

/** Map LU component nodes to student-preview content blocks. */
export function componentNodeToContentBlock(
  node: LuExplorerNode,
  options?: { texContent?: string; projectFiles?: ProjectAssetFile[] }
): LuContentBlock | LuContentBlock[] | null {
  const config = node.config ?? {};
  const kind = node.kind;
  const texContent =
    options?.texContent !== undefined
      ? options.texContent
      : node.filePath
        ? options?.projectFiles?.find(
            (f) =>
              f.path === node.filePath ||
              normalizeLuPath(f.path) === normalizeLuPath(node.filePath ?? "")
          )?.content
        : undefined;

  if (kind === "video" || config._renderAs === "videos") {
    const texVideos = videoBlocksFromTex(texContent);
    const v = texVideos[0] ?? {
      url: String(config.url ?? config.file ?? ""),
      file: String(config.file ?? ""),
      type: String(config.type ?? "upload"),
      title: String(config.title ?? node.title ?? "Video"),
      youtubeId: config.youtubeId ? String(config.youtubeId) : undefined,
    };
    return {
      type: "video",
      content: {
        type: v.type ?? (v as { sourceType?: string }).sourceType ?? "upload",
        file: v.file,
        url: v.url ?? v.file,
        title: String(config.title ?? node.title ?? v.title ?? "Video"),
        youtubeId: v.youtubeId,
        sourceComponentId: node.id,
      },
    };
  }

  if (!INTERACTIVE_KINDS.has(kind)) {
    const source = texContent?.trim() ?? "";
    const hasTex = Boolean(source && (parseLessonDocument(source).nodes.length || lessonBodyContainsImages(source)));
    const hasConfigBody = Boolean(
      config.body || config.markdown || config.content || config.text || config.items
    );
    if (hasTex || hasConfigBody) {
      if (kind === "objectives" && Array.isArray(config.items) && !source.includes("\\theory")) {
        return {
          type: "document",
          content: {
            title: String(config.title ?? node.title ?? "Learning Objectives"),
            nodes: [
              {
                type: "list",
                ordered: false,
                items: (config.items as string[]).map((i) => String(i)),
              },
            ],
            ...(videoBlocksFromTex(texContent).length
              ? { embeddedMediaAfter: videoBlocksFromTex(texContent) }
              : {}),
          },
        };
      }
      return emitDocumentBlock(node, config, texContent);
    }
  }

  switch (kind) {
    case "practice":
    case "coding-lab":
      return {
        type: "practice",
        content: {
          title: String(config.title ?? node.title ?? "Try It Yourself"),
          language: String(config.language ?? "python"),
          initialCode: String(
            config.initialCode ?? config.starterCode ?? config.startercode ?? config.code ?? ""
          ),
          expectedOutput: String(config.expectedOutput ?? config.expectedoutput ?? ""),
          solution: String(config.solution ?? ""),
        },
      };
    case "research-paper":
      return emitDocumentBlock(node, {
        ...config,
        body: [
          config.abstract ? `## Abstract\n${String(config.abstract)}` : "",
          config.introduction ? `\n\n## Introduction\n${String(config.introduction)}` : "",
          config.body ? `\n\n${String(config.body)}` : "",
        ]
          .filter(Boolean)
          .join(""),
      });
    case "project":
      return {
        type: "project",
        content: {
          title: String(config.title ?? node.title ?? "Project"),
          description: String(config.description ?? config.introduction ?? ""),
          instructions: String(config.instructions ?? ""),
          colabUrl: String(config.colabUrl ?? ""),
          githubUrl: String(config.githubUrl ?? ""),
        },
      };
    case "quiz":
      return {
        type: "quiz",
        content: {
          title: String(config.title ?? node.title ?? "Quiz"),
          questions: buildQuizQuestions(node),
        },
      };
    case "assignment":
      return emitDocumentBlock(node, {
        ...config,
        body: String(config.instructions ?? config.description ?? config.prompt ?? ""),
        title: String(config.title ?? node.title ?? "Assignment"),
      });
    case "discussion":
      return emitDocumentBlock(node, {
        ...config,
        body: String(config.prompt ?? config.topic ?? ""),
        title: String(config.title ?? node.title ?? "Discussion"),
      });
    case "checkpoint":
      return emitDocumentBlock(node, {
        ...config,
        body: String(config.message ?? config.title ?? "Checkpoint complete"),
        title: String(config.title ?? "Checkpoint"),
      });
    case "reflection":
      return emitDocumentBlock(node, {
        ...config,
        body: String(config.prompt ?? config.instructions ?? "Reflection"),
        title: String(config.title ?? node.title ?? "Reflection"),
      });
    case "references":
      return emitDocumentBlock(node, {
        ...config,
        body: String(config.url ?? config.content ?? ""),
        title: String(config.title ?? "References"),
      });
    case "resources":
      return {
        type: "download",
        content: {
          title: String(config.title ?? node.title ?? "Resources"),
          url: "",
        },
      };
    case "resource-item":
      return {
        type: "resource",
        content: {
          type: String(config.type ?? "website"),
          title: String(config.title ?? node.title ?? "Resource"),
          url: String(config.url ?? config.fileUrl ?? ""),
        },
      };
    case "question":
      return {
        type: "quiz",
        content: {
          title: "Question",
          questions: [
            {
              text: String(config.question ?? config.text ?? ""),
              type: "single",
              options: buildQuestionOptions(config),
              explanation: String(config.explanation ?? ""),
            },
          ],
        },
      };
    default:
      if (texContent && (lessonBodyContainsImages(texContent) || parseLessonDocument(texContent).nodes.length)) {
        return emitDocumentBlock(node, config, texContent);
      }
      return null;
  }
}

function buildQuestionOptions(config: Record<string, unknown>) {
  const options = config.options as { text?: string; label?: string; isCorrect?: boolean }[] | undefined;
  if (Array.isArray(options) && options.length > 0) {
    return options.map((o) => ({
      text: String(o.text ?? o.label ?? ""),
      isCorrect: Boolean(o.isCorrect),
    }));
  }
  const correct = String(config.correct ?? config.answer ?? "");
  const incorrect = (config.incorrect as string[] | undefined) ?? [];
  const built = [{ text: correct, isCorrect: true }];
  for (const item of incorrect) {
    built.push({ text: String(item), isCorrect: false });
  }
  if (built.length === 1 && correct) return built;
  if (built.length === 1) {
    return [
      { text: "Option A", isCorrect: true },
      { text: "Option B", isCorrect: false },
    ];
  }
  return built;
}

function buildQuizQuestions(node: LuExplorerNode) {
  const children = node.children ?? [];
  if (children.length > 0) {
    return children.map((child) => {
      const c = child.config ?? {};
      return {
        text: String(c.question ?? c.text ?? child.title),
        type: "single",
        options: buildQuestionOptions(c),
        explanation: String(c.explanation ?? ""),
      };
    });
  }
  const config = node.config ?? {};
  if (config.question || config.text) {
    return [
      {
        text: String(config.question ?? config.text),
        type: "single",
        options: buildQuestionOptions(config),
        explanation: String(config.explanation ?? ""),
      },
    ];
  }
  return [];
}

export function lessonComponentsToPreviewBlocks(
  lessonNode: LuExplorerNode,
  options?: {
    focusNode?: LuExplorerNode | null;
    texContent?: string;
    projectFiles?: ProjectAssetFile[];
  }
): LuContentBlock[] {
  const blocks: LuContentBlock[] = [];
  for (const child of lessonNode.children ?? []) {
    if (child.kind === "lesson") continue;
    const isFocus = options?.focusNode?.componentId === child.componentId;
    const block = componentNodeToContentBlock(child, {
      texContent: isFocus ? options?.texContent : undefined,
      projectFiles: options?.projectFiles,
    });
    if (!block) continue;
    if (Array.isArray(block)) blocks.push(...block);
    else blocks.push(block);
  }
  return blocks;
}
