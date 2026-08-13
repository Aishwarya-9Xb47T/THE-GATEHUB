import type { LuContentBlock } from "../learningUniverseSchema.js";
import {
  LEARNING_EXPERIENCE_ENGINE_VERSION,
  type CompletionRules,
  type DownloadCenterItem,
  type LearnerCourseOutline,
  type LearnerExperienceKind,
  type LearnerExperiencePackage,
  type LearnerExperienceStep,
  type LearnerLessonExperience,
  type ProgressRule,
  type WorkspaceRoute,
} from "./learningExperienceSchema.js";
import { normalizeVideoPayload } from "../../utils/videoSourceUtils.js";
import { repairStarterCode } from "../labCodeRepair.js";
import {
  shouldOmitLearnerTheorySection,
  type LessonRepairContext,
} from "../lessonContentRepair.js";
import {
  type DocumentBlockContent,
} from "../../../../shared/lesson-body/dist/documentPipeline.js";
import { sanitizeDslContent } from "../../../../shared/lesson-body/dist/index.js";

export interface EngineLessonInput {
  id: string;
  title: string;
  contentBlocks?: LuContentBlock[] | null;
  videos?: Array<{ id: string; type: string; url: string; title?: string | null }>;
  practice?: {
    id: string;
    title: string;
    language: string;
    initialCode: string;
    expectedOutput?: string | null;
    solution?: string | null;
    hints?: string | null;
  } | null;
  quiz?: {
    id: string;
    title?: string | null;
    questions: Array<{
      id: string;
      text: string;
      type: string;
      explanation?: string | null;
      points?: number | null;
      options: Array<{ id: string; text: string; isCorrect: boolean }>;
    }>;
  } | null;
  project?: {
    id: string;
    title: string;
    description: string;
    difficulty?: string | null;
    instructions: string;
    expectedOutput?: string | null;
    colabUrl?: string | null;
    githubUrl?: string | null;
    datasetUrls?: unknown;
  } | null;
  resources?: Array<{
    id: string;
    type: string;
    title: string;
    url?: string | null;
    fileUrl?: string | null;
  }>;
}

export interface EngineTrackInput {
  id: string;
  title: string;
  modules: Array<{
    id: string;
    title: string;
    lessons: EngineLessonInput[];
  }>;
}

export interface BuildLearnerExperienceInput {
  universeId: string;
  universe: {
    title: string;
    description: string;
    thumbnail?: string | null;
    difficulty?: string | null;
    estimatedHours?: number | null;
  };
  tracks: EngineTrackInput[];
  /** Optional — when omitted, certificates default OFF (opt-in). */
  completionRules?: Partial<CompletionRules>;
}

function progressRule(
  event: ProgressRule["event"],
  required = false,
  weight = 1
): ProgressRule {
  return { event, weight, requiredForCompletion: required };
}

function workspacePath(
  universeId: string,
  lessonId: string,
  type: WorkspaceRoute["type"],
  stepId: string
): WorkspaceRoute {
  const segment =
    type === "project"
      ? "project"
      : type === "coding-lab"
        ? "coding-lab"
        : type === "notebook"
          ? "notebook"
          : "research";
  const path =
    type === "project"
      ? `/learning-universe/${universeId}/learn/${lessonId}?workspace=${stepId}`
      : `/learning-universe/${universeId}/learn/${lessonId}?workspace=${stepId}`;
  return { type, stepId, path };
}

function blockContent(block: LuContentBlock): Record<string, unknown> {
  if (typeof block.content === "string") return { text: block.content };
  return (block.content as Record<string, unknown>) || {};
}

type EmbeddedMediaItem = {
  type: "image" | "video";
  file?: string;
  path?: string;
  url?: string;
  caption?: string;
  title?: string;
  youtubeId?: string;
  sourceType?: string;
};

function mediaItemFromBlock(block: LuContentBlock): EmbeddedMediaItem | null {
  if (block.type === "image") {
    const c = blockContent(block);
    return {
      type: "image",
      file: c.file ? String(c.file) : undefined,
      path: c.path ? String(c.path) : undefined,
      url: c.url ? String(c.url) : undefined,
      caption: c.caption ? String(c.caption) : undefined,
    };
  }
  if (block.type === "video") {
    return rawToEmbeddedVideo(blockContent(block));
  }
  return null;
}

function rawToEmbeddedVideo(raw: Record<string, unknown>): EmbeddedMediaItem | null {
  const norm = normalizeVideoPayload(raw);
  if (norm.type === "youtube" && !norm.youtubeId && !norm.url) return null;
  if (norm.type !== "youtube" && !norm.url && !norm.file) return null;
  return {
    type: "video",
    file: norm.file,
    url: norm.url || (norm.youtubeId ? `https://www.youtube.com/watch?v=${norm.youtubeId}` : undefined),
    title: norm.title,
    youtubeId: norm.youtubeId,
    sourceType: norm.type,
  };
}

function mediaItemKey(item: EmbeddedMediaItem): string {
  const ref = item.youtubeId || item.file || item.url || item.path || "";
  const base = ref.replace(/\\/g, "/").split("/").pop() || ref;
  return `${item.type}:${base}`.toLowerCase();
}

function findReadingStepHost(
  steps: LearnerExperienceStep[],
  options?: { preferOverview?: boolean }
): LearnerExperienceStep | undefined {
  if (options?.preferOverview) {
    const overview = steps.find((s) => s.kind === "overview");
    if (overview) return overview;
  }
  return [...steps]
    .reverse()
    .find((s) => s.kind === "overview" || s.kind === "objectives" || s.kind === "theory");
}

function attachVideoToReadingStep(
  steps: LearnerExperienceStep[],
  item: EmbeddedMediaItem,
  options?: { preferOverview?: boolean }
): boolean {
  const host = findReadingStepHost(steps, options);
  if (!host) return false;

  const payload = host.payload;
  const existing = [
    ...((payload.embeddedMediaBefore as EmbeddedMediaItem[] | undefined) ?? []),
    ...((payload.embeddedMediaAfter as EmbeddedMediaItem[] | undefined) ?? []),
  ];
  if (existing.some((e) => mediaItemKey(e) === mediaItemKey(item))) return true;

  const after = (payload.embeddedMediaAfter as EmbeddedMediaItem[] | undefined) ?? [];
  host.payload = { ...payload, embeddedMediaAfter: [...after, item] };
  return true;
}

function isInlineMediaBlock(block: LuContentBlock): boolean {
  return block.type === "image" || block.type === "video";
}

function isOverviewSourcedImage(block: LuContentBlock): boolean {
  if (block.type !== "image") return false;
  const c = blockContent(block);
  const sourceId = String(c.sourceComponentId ?? "").toLowerCase();
  const sourceFile = String(c.sourceFile ?? "").replace(/\\/g, "/").toLowerCase();
  if (sourceFile.endsWith("/overview.tex") || sourceFile.endsWith("overview.tex")) return true;
  if (sourceId === "overview" || sourceId.includes("overview")) return true;
  // Images injected from overview.tex without metadata still belong on the overview step.
  return !sourceId && !sourceFile;
}

function gatherTrailingInlineMedia(
  blocks: LuContentBlock[],
  anchorIdx: number,
  skip: Set<number>
): { videos: EmbeddedMediaItem[] } {
  const videos: EmbeddedMediaItem[] = [];
  for (let j = anchorIdx + 1; j < blocks.length; j++) {
    const block = blocks[j];
    if (block.type === "video") {
      const item = mediaItemFromBlock(block);
      if (item) {
        videos.push(item);
        skip.add(j);
      }
    } else if (block.type === "image") {
      // Do not skip image blocks here — they must remain available as image steps.
      // Videos may still be inlined into the preceding reading step.
      break;
    } else {
      break;
    }
  }
  return { videos };
}

function normalizeTitleToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function blockTitleFromContent(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  return String((content as Record<string, unknown>).title ?? "").trim();
}

function findStepForBlockIndex(
  steps: LearnerExperienceStep[],
  blocks: LuContentBlock[],
  blockIndex: number
): LearnerExperienceStep | undefined {
  const block = blocks[blockIndex];
  if (block.type === "overview") {
    return steps.find((s) => s.kind === "overview");
  }
  if (block.type === "keypoints") {
    return steps.find((s) => s.kind === "objectives") ?? steps.find((s) => {
      if (s.kind !== "theory") return false;
      const stepTitle = normalizeTitleToken(String(s.title ?? ""));
      return stepTitle.includes("key takeaway") || stepTitle.includes("objective");
    });
  }
  if (block.type === "theory" || block.type === "summary") {
    const title = normalizeTitleToken(blockTitleFromContent(block.content));
    const match = steps.find((s) => {
      if (s.kind !== "theory" && s.kind !== "summary" && s.kind !== "objectives") return false;
      const stepTitle = normalizeTitleToken(String(s.title ?? ""));
      return !title || stepTitle === title || stepTitle.includes(title) || title.includes(stepTitle);
    });
    if (match) return match;
  }
  return undefined;
}

/** Images/videos from overview content belong on the overview step, not as separate nav steps. */
function collectOverviewEmbeddedMedia(
  blocks: LuContentBlock[],
  skip: Set<number>
): { before: EmbeddedMediaItem[]; after: EmbeddedMediaItem[] } {
  const before: EmbeddedMediaItem[] = [];
  const after: EmbeddedMediaItem[] = [];
  const overviewIdx = blocks.findIndex((b) => b.type === "overview");

  const absorb = (idx: number, target: "before" | "after") => {
    const block = blocks[idx];
    if (block.type === "image") return;
    if (!isInlineMediaBlock(block)) return;
    const item = mediaItemFromBlock(blocks[idx]);
    if (!item || item.type !== "video") return;
    if (target === "before") before.unshift(item);
    else after.push(item);
    skip.add(idx);
  };

  if (overviewIdx >= 0) {
    for (let j = overviewIdx + 1; j < blocks.length; j++) {
      if (!isInlineMediaBlock(blocks[j])) break;
      absorb(j, "after");
    }
    for (let j = overviewIdx - 1; j >= 0; j--) {
      if (!isInlineMediaBlock(blocks[j])) break;
      absorb(j, "before");
    }
  } else {
    const firstStructural = blocks.findIndex((b) => !isInlineMediaBlock(b));
    if (firstStructural === -1) {
      blocks.forEach((_, i) => absorb(i, "after"));
    } else {
      for (let j = 0; j < firstStructural; j++) absorb(j, "before");
    }
  }

  // Overview-sourced images merge into overview markdown (inline), not embedded galleries.
  for (let i = 0; i < blocks.length; i++) {
    if (skip.has(i) || !isOverviewSourcedImage(blocks[i])) continue;
    const item = mediaItemFromBlock(blocks[i]);
    if (item?.type === "image") {
      skip.add(i);
    }
  }

  return { before, after };
}

function attachEmbeddedMedia(
  payload: Record<string, unknown>,
  before: EmbeddedMediaItem[],
  after: EmbeddedMediaItem[]
): void {
  if (before.length) payload.embeddedMediaBefore = before;
  if (after.length) payload.embeddedMediaAfter = after;
}

function mapBlockType(type: string): LearnerExperienceKind | null {
  const map: Record<string, LearnerExperienceKind> = {
    document: "theory",
    overview: "overview",
    theory: "theory",
    note: "theory",
    tip: "theory",
    warning: "theory",
    summary: "theory",
    keypoints: "theory",
    references: "theory",
    image: "image",
    video: "video",
    codeexample: "code-example",
    practice: "practice",
    quiz: "quiz",
    project: "project",
    assignment: "assignment",
    resource: "downloads",
    download: "downloads",
    checkpoint: "theory",
    discussion: "discussion",
    reflection: "reflection",
    codinglab: "coding-lab",
    "coding-lab": "coding-lab",
    notebook: "notebook",
    researchpaper: "research",
    "research-paper": "research",
  };
  return map[type] ?? null;
}

function documentPayloadFromBlock(
  block: LuContentBlock
): {
  title?: string;
  nodes: DocumentBlockContent["nodes"];
  sourceTex?: string;
  embeddedMediaBefore?: EmbeddedMediaItem[];
  embeddedMediaAfter?: EmbeddedMediaItem[];
} | null {
  if (block.type !== "document") return null;

  // toDocumentBlock stores nodes at top level (block.nodes) and content as a rendered LaTeX string.
  // Support both shapes: top-level nodes (compiled pipeline) and nested content.nodes (legacy).
  const topLevelNodes = Array.isArray((block as Record<string, unknown>).nodes)
    ? ((block as Record<string, unknown>).nodes as DocumentBlockContent["nodes"])
    : undefined;

  if (topLevelNodes && topLevelNodes.length > 0) {
    const b = block as Record<string, unknown>;
    const embedded = (block as Record<string, unknown>);
    return {
      title: typeof b.title === "string" ? b.title : undefined,
      nodes: topLevelNodes,
      sourceTex: typeof b.sourceTex === "string" ? b.sourceTex : undefined,
      ...(Array.isArray(embedded.embeddedMediaBefore) && (embedded.embeddedMediaBefore as unknown[]).length
        ? { embeddedMediaBefore: embedded.embeddedMediaBefore as EmbeddedMediaItem[] }
        : {}),
      ...(Array.isArray(embedded.embeddedMediaAfter) && (embedded.embeddedMediaAfter as unknown[]).length
        ? { embeddedMediaAfter: embedded.embeddedMediaAfter as EmbeddedMediaItem[] }
        : {}),
    };
  }

  // Legacy: content is an object with nodes inside
  const content = block.content as DocumentBlockContent & {
    embeddedMediaBefore?: EmbeddedMediaItem[];
    embeddedMediaAfter?: EmbeddedMediaItem[];
  };
  if (!content?.nodes?.length) return null;
  return {
    title: content.title,
    nodes: content.nodes,
    sourceTex: content.sourceTex,
    ...(content.embeddedMediaBefore?.length ? { embeddedMediaBefore: content.embeddedMediaBefore } : {}),
    ...(content.embeddedMediaAfter?.length ? { embeddedMediaAfter: content.embeddedMediaAfter } : {}),
  };
}

function stepKindForDocumentTitle(title: string): LearnerExperienceKind {
  if (/^overview$/i.test(title.trim())) return "overview";
  if (/^learning objectives$/i.test(title.trim())) return "objectives";
  return "theory";
}

function stepFromContentBlock(
  block: LuContentBlock,
  index: number,
  lessonId: string,
  universeId: string,
  lessonTitle: string
): LearnerExperienceStep | null {
  const docPayload = documentPayloadFromBlock(block);
  if (docPayload) {
    const title = String(docPayload.title ?? lessonTitle);
    const kind = stepKindForDocumentTitle(title);
    const sanitizedNodes = (docPayload.nodes || []).map((n) => {
      if (n.type === "markdown" && typeof n.content === "string") {
        return { ...n, content: sanitizeDslContent(n.content) };
      }
      if (n.type === "callout") {
        return {
          ...n,
          title: n.title ? sanitizeDslContent(n.title) : undefined,
          content: typeof n.content === "string" ? sanitizeDslContent(n.content) : n.content,
        };
      }
      if (n.type === "list" && Array.isArray(n.items)) {
        return { ...n, items: n.items.map((item) => sanitizeDslContent(item)) };
      }
      if (n.type === "quote" && typeof n.content === "string") {
        return { ...n, content: sanitizeDslContent(n.content) };
      }
      if (n.type === "codinglab") {
        return {
          ...n,
          title: n.title ? sanitizeDslContent(n.title) : n.title,
          instructions: n.instructions ? sanitizeDslContent(n.instructions) : n.instructions,
        };
      }
      return n;
    });
    return {
      id: `step-${lessonId}-block-${index}`,
      kind,
      title,
      payload: { title, ...docPayload, nodes: sanitizedNodes, blockType: "document" },
      progressRule: defaultProgressForKind(kind),
    };
  }

  if (block.type === "references") {
    const c = blockContent(block);
    const items = (c.items as Array<{ citation?: string }>) ?? [];
    const body = sanitizeDslContent(
      items
        .map((item) => String(item.citation ?? "").trim())
        .filter(Boolean)
        .map((citation) => `- ${citation}`)
        .join("\n")
    );
    if (!body.trim()) return null;
    return {
      id: `step-${lessonId}-block-${index}`,
      kind: "theory",
      title: "References",
      payload: { title: "References", body, text: body, markdown: body, blockType: block.type },
      progressRule: defaultProgressForKind("theory"),
    };
  }

  const kind = mapBlockType(block.type);
  if (!kind) return null;
  const c = blockContent(block);
  const id = `step-${lessonId}-block-${index}`;
  let title =
    String(c.title ?? c.question ?? BLOCK_TITLES[kind] ?? kind) || lessonTitle;

  const rawBody = String(c.body ?? c.text ?? c.markdown ?? c.overviewMarkdown ?? "");
  const cleanBody = sanitizeDslContent(rawBody);

  const base: LearnerExperienceStep = {
    id,
    kind,
    title,
    payload: {
      ...c,
      blockType: block.type,
      ...(rawBody ? { body: cleanBody, text: cleanBody, markdown: cleanBody } : {}),
    },
    progressRule: defaultProgressForKind(kind),
  };

  if (block.type === "checkpoint") {
    const message = sanitizeDslContent(String(c.message ?? c.body ?? c.text ?? ""));
    if (!message.trim()) return null;
    base.title = String(c.title ?? "Checkpoint");
    base.payload = {
      ...base.payload,
      title: base.title,
      body: message,
      text: message,
      markdown: message,
    };
  }

  if (kind === "theory") {
    const body = String(
      base.payload.body ?? base.payload.text ?? base.payload.markdown ?? ""
    );
    title = String(base.payload.title ?? base.title);
    if (shouldOmitLearnerTheorySection(title, body)) return null;
  }

  if (kind === "project") {
    base.workspace = workspacePath(universeId, lessonId, "project", id);
    base.payload = {
      ...base.payload,
      projectId: c.projectId ?? id,
      instructions: c.instructions ?? c.description ?? "",
      description: c.description ?? "",
    };
  }
  if (kind === "coding-lab") {
    base.workspace = workspacePath(universeId, lessonId, "coding-lab", id);
    const lang = String(c.language ?? "python");
    const rawStarter = String(c.starterCode ?? c.startercode ?? c.initialCode ?? "");
    const starterCode = repairStarterCode(rawStarter, lang);
    base.payload = {
      ...base.payload,
      language: lang,
      initialCode: starterCode,
      starterCode,
      expectedOutput: String(c.expectedOutput ?? c.expectedoutput ?? ""),
      instructions: String(c.instructions ?? c.problemStatement ?? c.description ?? ""),
      problemStatement: String(c.problemStatement ?? c.instructions ?? c.description ?? ""),
      enableColab: c.enableColab !== false && c.enablecolab !== "false",
      colabUrl: String(c.colabUrl ?? c.colaburl ?? ""),
    };
  }
  if (kind === "notebook") {
    base.workspace = workspacePath(universeId, lessonId, "notebook", id);
  }
  if (kind === "research") {
    base.workspace = workspacePath(universeId, lessonId, "research", id);
    const sections = (c.sections as Array<{ title?: string; body?: string; content?: string }>) ?? [];
    const sectionBody = (s: { body?: string; content?: string }) => String(s.body ?? s.content ?? "");
    base.payload = {
      ...base.payload,
      abstract: String(c.abstract ?? ""),
      sections,
      introduction:
        sections.find((s) => /intro/i.test(s.title ?? ""))?.body ??
        sections.find((s) => /intro/i.test(s.title ?? ""))?.content ??
        sectionBody(sections[0] ?? {}) ??
        "",
      instructions: String(c.abstract ?? sections.map(sectionBody).join("\n\n")),
      enableOverleaf: c.enableOverleaf !== false && c.enableoverleaf !== "false",
      enableColab: c.enableColab !== false && c.enablecolab !== "false",
      overleafUrl: String(c.overleafUrl ?? c.overleafurl ?? ""),
      colabUrl: String(c.colabUrl ?? c.colaburl ?? ""),
    };
  }
  if (kind === "video") {
    const norm = normalizeVideoPayload(c);
    if (!norm.url && !norm.file && !norm.youtubeId) return null;
    base.payload = { ...norm, blockType: block.type };
    base.title = norm.title || (c.title ? String(c.title) : undefined) || (title && title !== "Video" ? title : "") || "Video";
  }

  if (kind === "theory" && /^learning objectives$/i.test(title)) {
    base.kind = "objectives";
    base.progressRule = defaultProgressForKind("objectives");
    base.payload = {
      items: String(c.body ?? c.text ?? c.markdown ?? "")
        .split(/\n/)
        .map((line) => line.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean),
      body: String(c.body ?? c.text ?? c.markdown ?? ""),
    };
  }

  if (kind === "quiz") {
    const rawQuestions = (c.questions as Array<Record<string, unknown>>) ?? [];
    const seen = new Set<string>();
    const questions = rawQuestions
      .map((q) => ({
        id: q.id ? String(q.id) : undefined,
        text: String(q.text ?? q.question ?? ""),
        type: q.type ?? "single",
        options: Array.isArray(q.options)
          ? (q.options as Array<{ text?: string; isCorrect?: boolean }>).map((o) => ({
              text: String(o.text ?? ""),
              isCorrect: Boolean(o.isCorrect),
            }))
          : [],
        explanation: q.explanation ? String(q.explanation) : undefined,
      }))
      .filter((q) => {
        const key = q.id ?? `${q.text}::${q.options.map((o) => o.text).join("|")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return q.text.length > 0 || q.options.length > 0;
      });
    base.payload = {
      title: String(c.title ?? "Quiz"),
      questions,
      passingScore: Number(c.passingScore ?? 70),
      attempts: Number(c.attempts ?? 3),
    };
  }

  return base;
}

const STEP_ORDER: LearnerExperienceKind[] = [
  "hero",
  "overview",
  "objectives",
  "video",
  "theory",
  "code-example",
  "interactive-demo",
  "image",
  "practice",
  "quiz",
  "project",
  "coding-lab",
  "notebook",
  "research",
  "assignment",
  "discussion",
  "downloads",
  "reflection",
  "summary",
  "next-lesson",
];

function stepSortIndex(kind: LearnerExperienceKind): number {
  const i = STEP_ORDER.indexOf(kind);
  return i >= 0 ? i : 50;
}

function finalizeLessonSteps(
  steps: LearnerExperienceStep[],
  _lessonId: string,
  _ctx: LessonRepairContext
): LearnerExperienceStep[] {
  const heroSteps = steps.filter((s) => s.kind === "hero");
  const endSteps = steps.filter((s) => s.kind === "summary" || s.kind === "next-lesson");
  const middleSteps = steps.filter(
    (s) => s.kind !== "hero" && s.kind !== "summary" && s.kind !== "next-lesson"
  );
  return [...heroSteps, ...middleSteps, ...endSteps];
}

const BLOCK_TITLES: Partial<Record<LearnerExperienceKind, string>> = {
  hero: "Welcome",
  overview: "Overview",
  objectives: "Learning Objectives",
  theory: "Theory",
  practice: "Try It Yourself",
  "coding-lab": "Coding Lab",
  notebook: "Notebook",
  project: "Project",
  research: "Research Assignment",
  quiz: "Quiz",
  assignment: "Assignment",
  discussion: "Discussion",
  downloads: "Downloads",
  reflection: "Reflection",
  summary: "Summary",
};

function defaultProgressForKind(kind: LearnerExperienceKind): ProgressRule {
  switch (kind) {
    case "hero":
    case "overview":
    case "theory":
    case "image":
    case "video":
    case "code-example":
    case "interactive-demo":
      return progressRule("view", false, 1);
    case "practice":
      return progressRule("complete", true, 2);
    case "quiz":
      return progressRule("score", true, 3);
    case "project":
    case "coding-lab":
    case "notebook":
    case "research":
    case "assignment":
      return progressRule("submit", true, 3);
    case "discussion":
      return progressRule("participate", false, 1);
    case "reflection":
      return progressRule("complete", false, 1);
    case "summary":
    case "next-lesson":
    case "downloads":
    case "objectives":
      return progressRule("view", false, 0);
    default:
      return progressRule("view", false, 1);
  }
}

function heroSubtitleFromBlocks(blocks: LuContentBlock[]): string {
  const overviewDoc = blocks.find(
    (b) =>
      b.type === "document" &&
      /^overview$/i.test(String(blockContent(b).title ?? ""))
  );
  const doc = overviewDoc ? documentPayloadFromBlock(overviewDoc) : null;
  if (!doc?.nodes?.length) return "";
  return doc.nodes
    .filter((n): n is Extract<typeof n, { type: "markdown" }> => n.type === "markdown")
    .map((n) => n.content)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function buildLessonSteps(
  lesson: EngineLessonInput,
  universeId: string,
  trackTitle: string,
  moduleTitle: string,
  courseTitle: string,
  nav: LearnerLessonExperience["navigation"]
): LearnerExperienceStep[] {
  const steps: LearnerExperienceStep[] = [];
  const seenKinds = new Set<string>();
  const blocks = Array.isArray(lesson.contentBlocks) ? lesson.contentBlocks : [];

  steps.push({
    id: `hero-${lesson.id}`,
    kind: "hero",
    title: lesson.title,
    payload: {
      title: lesson.title,
      moduleTitle,
      trackTitle,
      subtitle: heroSubtitleFromBlocks(blocks),
    },
    progressRule: progressRule("view", false, 0),
  });

  const inlineMediaSkip = new Set<number>();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (inlineMediaSkip.has(i)) continue;
    // Image blocks are first-class media steps (instructor create → student must see them).
    // Previously skipped entirely, which dropped authored images from the learner package.

    const step = stepFromContentBlock(block, i, lesson.id, universeId, lesson.title);
    if (step) {
      if (step.kind === "overview" && seenKinds.has("overview")) continue;
      if (step.kind === "objectives" && seenKinds.has("objectives")) continue;
      if (
        block.type === "document" &&
        /^overview$/i.test(String(blockContent(block).title ?? "")) &&
        seenKinds.has("overview")
      ) {
        continue;
      }

      steps.push(step);
      seenKinds.add(step.kind);
    }
  }

  const hasVideoBlocks = blocks.some((b) => b.type === "video");
  if (!hasVideoBlocks && lesson.videos?.length) {
    for (let vi = 0; vi < lesson.videos.length; vi++) {
      const v = lesson.videos[vi];
      const norm = normalizeVideoPayload(v as Record<string, unknown>);
      if (!norm.url && !norm.file && !norm.youtubeId) continue;
      const vId = (v as { id?: string }).id ?? `v-${vi}`;
      const vTitle = norm.title || (lesson.videos.length > 1 ? `Video ${vi + 1}` : "Video");
      steps.push({
        id: `video-${lesson.id}-${vId}`,
        kind: "video",
        title: vTitle,
        payload: {
          ...norm,
          id: vId,
          blockType: "video",
        },
        progressRule: progressRule("view", false, 1),
      });
      seenKinds.add("video");
    }
  }

  // Disambiguate video step titles if multiple videos exist with duplicate/generic titles
  const videoSteps = steps.filter((s) => s.kind === "video");
  if (videoSteps.length > 1) {
    videoSteps.forEach((vStep, idx) => {
      if (!vStep.title || /^video$/i.test(vStep.title) || /^lesson video$/i.test(vStep.title)) {
        vStep.title = `Video ${idx + 1}`;
      }
    });
  }

  if (lesson.practice && !seenKinds.has("practice")) {
    steps.push({
      id: `practice-${lesson.id}`,
      kind: "practice",
      title: lesson.practice.title || "Try It Yourself",
      payload: {
        practiceId: lesson.practice.id,
        language: lesson.practice.language,
        initialCode: lesson.practice.initialCode,
        expectedOutput: lesson.practice.expectedOutput,
        hints: lesson.practice.hints,
      },
      progressRule: progressRule("complete", true, 2),
    });
  }

  if (lesson.quiz && !seenKinds.has("quiz")) {
    const seenQ = new Set<string>();
    const questions = lesson.quiz.questions.filter((q) => {
      const key = q.id ?? `${q.text}::${q.options.map((o) => o.text).join("|")}`;
      if (seenQ.has(key)) return false;
      seenQ.add(key);
      return true;
    });
    steps.push({
      id: `quiz-${lesson.id}`,
      kind: "quiz",
      title: lesson.quiz.title || "Quiz",
      payload: {
        quizId: lesson.quiz.id,
        questions,
        passingScore: 70,
      },
      progressRule: progressRule("score", true, 3),
    });
  }

  if (lesson.project && !seenKinds.has("project")) {
    const stepId = `project-${lesson.id}`;
    steps.push({
      id: stepId,
      kind: "project",
      title: lesson.project.title,
      payload: {
        projectId: lesson.project.id,
        title: lesson.project.title,
        description: lesson.project.description,
        instructions: lesson.project.instructions,
        difficulty: lesson.project.difficulty,
        colabUrl: lesson.project.colabUrl,
        githubUrl: lesson.project.githubUrl,
        datasetUrls: lesson.project.datasetUrls,
      },
      progressRule: progressRule("submit", true, 3),
      workspace: workspacePath(universeId, lesson.id, "project", stepId),
    });
  }

  const downloadable = (lesson.resources ?? []).filter((r) => r.url || r.fileUrl);
  if (downloadable.length > 0 && !seenKinds.has("downloads")) {
    steps.push({
      id: `downloads-${lesson.id}`,
      kind: "downloads",
      title: "Downloads & Resources",
      payload: {
        items: downloadable.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          url: r.url || r.fileUrl,
          downloadable: true,
        })),
      },
      progressRule: progressRule("view", false, 0),
    });
  }

  steps.push({
    id: `summary-${lesson.id}`,
    kind: "summary",
    title: "Lesson Complete",
    payload: {
      message: `You have reached the end of "${lesson.title}".`,
      completedSteps: steps.filter((s) => s.progressRule.requiredForCompletion).length,
    },
    progressRule: progressRule("view", false, 0),
  });

  if (nav.nextLessonId) {
    steps.push({
      id: `next-${lesson.id}`,
      kind: "next-lesson",
      title: nav.nextLessonTitle || "Next Lesson",
      payload: {
        nextLessonId: nav.nextLessonId,
        nextLessonTitle: nav.nextLessonTitle,
      },
      progressRule: progressRule("view", false, 0),
    });
  }

  return finalizeLessonSteps(steps, lesson.id, {
    lessonTitle: lesson.title,
    moduleTitle,
    courseTitle,
  });
}

function collectDownloadCenter(
  lessons: Array<{ lesson: EngineLessonInput; trackTitle: string }>
): DownloadCenterItem[] {
  const items: DownloadCenterItem[] = [];
  for (const { lesson } of lessons) {
    for (const r of lesson.resources ?? []) {
      const url = r.url || r.fileUrl;
      if (!url) continue;
      items.push({
        id: r.id,
        title: r.title,
        type: r.type,
        url,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        downloadable: true,
      });
    }
    const blocks = lesson.contentBlocks ?? [];
    blocks.forEach((b, i) => {
      if (b.type !== "download" && b.type !== "resource") return;
      const c = blockContent(b);
      const url = String(c.url ?? c.fileUrl ?? c.file ?? "");
      if (!url) return;
      items.push({
        id: `dl-${lesson.id}-${i}`,
        title: String(c.title ?? "Download"),
        type: String(c.type ?? b.type),
        url,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        downloadable: c.downloadable !== false,
      });
    });
  }
  return items;
}

export function buildLearnerExperiencePackage(input: BuildLearnerExperienceInput): LearnerExperiencePackage {
  const flatLessons: Array<{
    lesson: EngineLessonInput;
    trackId: string;
    trackTitle: string;
    moduleId: string;
    moduleTitle: string;
  }> = [];

  for (const track of input.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        flatLessons.push({
          lesson,
          trackId: track.id,
          trackTitle: track.title,
          moduleId: mod.id,
          moduleTitle: mod.title,
        });
      }
    }
  }

  const lessons: Record<string, LearnerLessonExperience> = {};
  const outline: LearnerCourseOutline = { tracks: [] };

  for (const track of input.tracks) {
    const outlineTrack = {
      id: track.id,
      title: track.title,
      modules: [] as LearnerCourseOutline["tracks"][0]["modules"],
    };
    for (const mod of track.modules) {
      const outlineMod = {
        id: mod.id,
        title: mod.title,
        lessons: [] as LearnerCourseOutline["tracks"][0]["modules"][0]["lessons"],
      };
      for (let li = 0; li < mod.lessons.length; li++) {
        const lesson = mod.lessons[li];
        const globalIdx = flatLessons.findIndex((f) => f.lesson.id === lesson.id);
        const prev = globalIdx > 0 ? flatLessons[globalIdx - 1].lesson : undefined;
        const next =
          globalIdx >= 0 && globalIdx < flatLessons.length - 1
            ? flatLessons[globalIdx + 1].lesson
            : undefined;

        const meta = flatLessons[globalIdx];
        const nav = {
          prevLessonId: prev?.id,
          nextLessonId: next?.id,
          prevLessonTitle: prev?.title,
          nextLessonTitle: next?.title,
        };

        const steps = buildLessonSteps(
          lesson,
          input.universeId,
          meta.trackTitle,
          meta.moduleTitle,
          input.universe.title,
          nav
        );

        lessons[lesson.id] = {
          id: lesson.id,
          title: lesson.title,
          description: heroSubtitleFromBlocks(lesson.contentBlocks ?? []) || undefined,
          moduleTitle: meta.moduleTitle,
          trackTitle: meta.trackTitle,
          steps,
          navigation: nav,
        };

        outlineMod.lessons.push({
          id: lesson.id,
          title: lesson.title,
          stepCount: steps.length,
        });
      }
      outlineTrack.modules.push(outlineMod);
    }
    outline.tracks.push(outlineTrack);
  }

  const completionRules: CompletionRules = {
    minimumProgressPercent: input.completionRules?.minimumProgressPercent ?? 100,
    requireAllRequiredSteps: input.completionRules?.requireAllRequiredSteps ?? true,
    // Opt-in only — never silently enable certificates. Callers overlay resolved rules.
    certificateEligible: input.completionRules?.certificateEligible ?? false,
  };

  return {
    version: LEARNING_EXPERIENCE_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    universeId: input.universeId,
    universe: {
      title: input.universe.title,
      description: input.universe.description,
      thumbnail: input.universe.thumbnail ?? undefined,
      difficulty: input.universe.difficulty ?? undefined,
      estimatedHours: input.universe.estimatedHours ?? undefined,
    },
    outline,
    lessons,
    downloadCenter: collectDownloadCenter(flatLessons),
    completionRules,
  };
}

/** No-op — compiled document steps must never be repaired or consolidated. */
export function repairLearnerExperienceReading(pkg: LearnerExperiencePackage): LearnerExperiencePackage {
  return pkg;
}

/** Repair coding-lab starter code in cached or freshly built experience packages. */
export function repairLearnerExperienceLabs(pkg: LearnerExperiencePackage): LearnerExperiencePackage {
  const lessons: LearnerExperiencePackage["lessons"] = {};
  for (const [lessonId, lesson] of Object.entries(pkg.lessons)) {
    lessons[lessonId] = {
      ...lesson,
      steps: lesson.steps.map((step) => {
        if (step.kind !== "coding-lab" && step.kind !== "notebook") return step;
        const lang = String(step.payload.language ?? "python");
        const raw = String(step.payload.starterCode ?? step.payload.initialCode ?? "");
        const starterCode = repairStarterCode(raw, lang);
        return {
          ...step,
          payload: {
            ...step.payload,
            language: lang,
            starterCode,
            initialCode: starterCode,
          },
        };
      }),
    };
  }
  return { ...pkg, lessons };
}

/** Build from a published Prisma universe row (tracks → modules → lessons). */
export function buildLearnerExperienceFromPublishedUniverse(
  universe: {
    id: string;
    title: string;
    description: string;
    thumbnail?: string | null;
    difficulty?: string | null;
    tracks: Array<{
      id: string;
      title: string;
      modules: Array<{
        id: string;
        title: string;
        lessons: EngineLessonInput[];
      }>;
    }>;
  },
  completionRules?: Partial<CompletionRules>
): LearnerExperiencePackage {
  return repairLearnerExperienceReading(
    repairLearnerExperienceLabs(
      buildLearnerExperiencePackage({
        universeId: universe.id,
        universe: {
          title: universe.title,
          description: universe.description,
          thumbnail: universe.thumbnail,
          difficulty: universe.difficulty,
        },
        tracks: universe.tracks,
        completionRules,
      })
    )
  );
}
