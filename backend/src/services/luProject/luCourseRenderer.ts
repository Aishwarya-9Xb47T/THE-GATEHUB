/**
 * Deterministic course renderer — the ONLY component allowed to generate LMS DSL / LaTeX.
 * Input: validated LuCourseDocument JSON. Output: LuProjectJson + .tex files.
 */
import type { LuProjectJson, LuProjectLessonRef } from "./luProjectSchema.js";
import { createEmptyLuProject, LU_SCHEMA_VERSION } from "./luProjectSchema.js";
import type { LuProjectFileEntry } from "./luProjectFileEmitter.js";
import { buildMainTexFromProject } from "./luProjectMainTexBuilder.js";
import { escLatex as esc } from "./luTexEscape.js";
import { componentFilePath } from "./luComponentFilePaths.js";
import {
  buildProjectTexEntries,
} from "./luProjectTexSync.js";
import { emitTexFromComponent } from "./luComponentEmitters.js";
import { emitQuizContainerTex, emitQuestionTex } from "./luQuizTexEmitter.js";
import type { LuLessonComponentRef } from "./luLessonComponents.js";
import type { LuLessonComponentKind } from "./luComponentRegistry.js";
import { COMPONENT_TITLES } from "./luComponentRegistry.js";
import { normalizeYouTubeWatchUrl } from "../aiCourseArchitect/videoAssignmentEngine.js";
import type {
  LuCourseDocument,
  LuCourseLessonJson,
  LuCourseQuizQuestionJson,
  LuCourseVideoJson,
} from "./luCourseContentSchema.js";
import { assertValidCourseDocument } from "./luCourseContentSchema.js";
import { enforceDslOnFiles } from "./luDslEnforcer.js";
import { diffRenderOutputs, changedPathsFromDiff } from "./luRenderDiff.js";
import { scanAIContent } from "../../utils/aiContentSanitizer.js";

const ASSET_FOLDERS = [
  "/assets/images",
  "/assets/videos",
  "/assets/pdf",
  "/assets/downloads",
  "/assets/datasets",
  "/assets/thumbnails",
  "/legacy-backup",
  "/output",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function escUrlArg(url: string): string {
  return url.replace(/\\/g, "\\\\").replace(/}/g, "\\}");
}

/** Renderer-owned video emission — AI never writes \\video. */
export function emitVideosTex(videos: LuCourseVideoJson[]): string {
  const lines: string[] = [];
  for (const v of videos) {
    if (v.type === "placeholder") {
      lines.push(
        `\\video{type={placeholder},title={${esc(v.title || "No instructor media attached")}},url={},description={Upload a video or add a YouTube URL in the lesson editor.}}`
      );
      continue;
    }
    if (v.type === "youtube") {
      const url = normalizeYouTubeWatchUrl(v.url ?? "");
      const id = v.youtubeId || url.match(/v=([\w-]{11})/)?.[1] || "";
      const extras = [
        id ? `youtubeid={${esc(id)}},videoId={${esc(id)}}` : "",
        v.thumbnail ? `thumbnail={${escUrlArg(v.thumbnail)}}` : "",
        v.duration ? `duration={${esc(v.duration)}}` : "",
      ]
        .filter(Boolean)
        .join(",");
      const suffix = extras ? `,${extras}` : "";
      lines.push(`\\video{type={youtube},url={${escUrlArg(url)}},title={${esc(v.title)}}${suffix}}`);
    } else {
      // Preserve durable relative key (e.g. videos/<uuid>.mp4) — never strip to basename-only.
      const raw = (v.file || v.url || "").trim();
      const relative = raw
        .replace(/^https?:\/\/[^/]+/i, "")
        .replace(/^\/uploads\//, "")
        .replace(/^uploads\//, "")
        .replace(/^\/+/, "");
      const file = relative || raw;
      lines.push(`\\video{type={upload},file={${esc(file)}},title={${esc(v.title)}}}`);
    }
  }
  return lines.join("\n") + "\n";
}

function quizQuestionConfig(q: LuCourseQuizQuestionJson, qi: number): Record<string, unknown> {
  const letters = ["A", "B", "C", "D"];
  const correctIdx = q.options.findIndex((o) => o === q.correctAnswer);
  const correctLetter = letters[correctIdx >= 0 ? correctIdx : 0];
  return {
    questionType: "multiple-choice",
    question: q.text,
    optionA: q.options[0],
    optionB: q.options[1],
    optionC: q.options[2],
    optionD: q.options[3],
    correct: correctLetter,
    explanation: q.explanation,
    difficulty: q.difficulty ?? "medium",
    topic: q.topic,
    bloomLevel: q.bloomLevel,
    timeLimitSec: q.timeEstimateSeconds ?? 60,
    hints: q.hints ?? [],
    wrongOptionExplanations: q.wrongOptionExplanations,
    followUpReading: q.followUpReading,
    number: qi + 1,
  };
}

function buildQuizChildren(
  questions: LuCourseQuizQuestionJson[],
  trackFolder: string,
  modFolder: string,
  lessonId: string
): LuLessonComponentRef[] {
  return questions.map((q, qi) => {
    const id = `quiz-q-${pad2(qi + 1)}`;
    return {
      id,
      kind: "question",
      title: q.text.length > 80 ? `${q.text.slice(0, 77)}...` : q.text,
      file: componentFilePath(trackFolder, modFolder, lessonId, id, "quiz"),
      config: quizQuestionConfig(q, qi),
    };
  });
}

function lessonJsonToComponents(
  lesson: LuCourseLessonJson,
  trackFolder: string,
  modFolder: string
): LuLessonComponentRef[] {
  const components: LuLessonComponentRef[] = [];
  const lessonId = lesson.id;

  components.push({
    id: "overview",
    kind: "overview",
    title: COMPONENT_TITLES.overview,
    file: componentFilePath(trackFolder, modFolder, lessonId, "overview", "overview"),
    config: { body: lesson.overview },
  });

  components.push({
    id: "objectives",
    kind: "objectives",
    title: COMPONENT_TITLES.objectives,
    file: componentFilePath(trackFolder, modFolder, lessonId, "objectives", "objectives"),
    config: { items: lesson.objectives },
  });

  if (lesson.videos.length) {
    components.push({
      id: "videos",
      kind: "topics",
      title: "Video Lessons",
      file: `/${trackFolder}/${modFolder}/${lessonId}/videos.tex`,
      config: { videos: lesson.videos, _renderAs: "videos" },
    });
  }

  for (const topic of lesson.topics) {
    const kind: LuLessonComponentKind =
      topic.id === "examples" || topic.id === "code-example" ? "examples" : "topics";
    components.push({
      id: topic.id,
      kind,
      title: topic.title,
      file: componentFilePath(trackFolder, modFolder, lessonId, topic.id, kind),
      config: { title: topic.title, body: topic.body },
    });
  }

  if (lesson.practice) {
    components.push({
      id: "practice",
      kind: "practice",
      title: COMPONENT_TITLES.practice,
      file: componentFilePath(trackFolder, modFolder, lessonId, "practice", "practice"),
      config: {
        language: lesson.practice.language,
        starterCode: lesson.practice.starterCode,
        expectedOutput: lesson.practice.expectedOutput,
      },
    });
  }

  if (lesson.codingLab) {
    components.push({
      id: "coding-lab-01",
      kind: "coding-lab",
      title: lesson.codingLab.title,
      file: componentFilePath(trackFolder, modFolder, lessonId, "coding-lab-01", "coding-lab"),
      config: {
        language: lesson.codingLab.language,
        starterCode: lesson.codingLab.starterCode,
        expectedOutput: lesson.codingLab.expectedOutput,
        instructions: lesson.codingLab.problemStatement,
        timeLimitMs: lesson.codingLab.timeLimitMs ?? 15000,
        colabUrl: lesson.codingLab.colabUrl,
        enableColab: true,
      },
    });
  }

  if (lesson.notebook) {
    components.push({
      id: "notebook-01",
      kind: "notebook",
      title: lesson.notebook.title,
      file: componentFilePath(trackFolder, modFolder, lessonId, "notebook-01", "notebook"),
      config: lesson.notebook,
    });
  }

  if (lesson.assignment) {
    components.push({
      id: "assignment-01",
      kind: "assignment",
      title: lesson.assignment.title,
      file: componentFilePath(trackFolder, modFolder, lessonId, "assignment-01", "assignment"),
      config: lesson.assignment,
    });
  }

  if (lesson.project) {
    components.push({
      id: "project-01",
      kind: "project",
      title: lesson.project.title,
      file: componentFilePath(trackFolder, modFolder, lessonId, "project-01", "project"),
      config: {
        introduction: lesson.project.description,
        instructions: lesson.project.instructions,
        difficulty: lesson.project.difficulty ?? "intermediate",
      },
    });
  }

  if (lesson.researchPaper) {
    components.push({
      id: "research-paper-01",
      kind: "research-paper",
      title: lesson.researchPaper.title,
      file: componentFilePath(trackFolder, modFolder, lessonId, "research-paper-01", "research-paper"),
      config: {
        ...lesson.researchPaper,
        enableOverleaf: true,
        enableColab: true,
      },
    });
  }

  if (lesson.quiz?.questions.length) {
    const children = buildQuizChildren(lesson.quiz.questions, trackFolder, modFolder, lessonId);
    components.push({
      id: "quiz-01",
      kind: "quiz",
      title: lesson.quiz.title,
      file: componentFilePath(trackFolder, modFolder, lessonId, "quiz-01", "quiz"),
      config: { title: lesson.quiz.title },
      children,
    });
  }

  if (lesson.resources?.length) {
    components.push({
      id: "resources",
      kind: "resources",
      title: COMPONENT_TITLES.resources,
      file: componentFilePath(trackFolder, modFolder, lessonId, "resources", "resources"),
      config: { items: lesson.resources },
    });
  }

  if (lesson.references?.length) {
    components.push({
      id: "references",
      kind: "references",
      title: COMPONENT_TITLES.references,
      file: componentFilePath(trackFolder, modFolder, lessonId, "references", "references"),
      config: { items: lesson.references },
    });
  }

  if (lesson.discussionPrompt) {
    components.push({
      id: "discussion-01",
      kind: "discussion",
      title: COMPONENT_TITLES.discussion,
      file: componentFilePath(trackFolder, modFolder, lessonId, "discussion-01", "discussion"),
      config: { prompt: lesson.discussionPrompt },
    });
  }

  components.push({
    id: "checkpoint",
    kind: "checkpoint",
    title: COMPONENT_TITLES.checkpoint,
    file: componentFilePath(trackFolder, modFolder, lessonId, "checkpoint", "checkpoint"),
    config: {
      title: "Lesson Complete",
      message: lesson.checkpointMessage ?? "Great work!",
    },
  });

  return components;
}

function renderComponentTex(comp: LuLessonComponentRef, parent: LuLessonComponentRef | null): string {
  if (comp.config?._renderAs === "videos" && comp.config?.videos) {
    return emitVideosTex(comp.config.videos as LuCourseVideoJson[]);
  }
  if (parent?.kind === "quiz" || comp.kind === "question") {
    return emitQuestionTex(comp);
  }
  if (comp.kind === "quiz") {
    return emitQuizContainerTex(comp);
  }
  return emitTexFromComponent(comp.kind as LuLessonComponentKind, comp.title, comp.config ?? {});
}

function buildTexMapFromProject(project: LuProjectJson): Map<string, string> {
  const map = new Map<string, string>();

  for (const { path, content } of buildProjectTexEntries(project)) {
    map.set(path, content);
  }

  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const comp of lesson.components ?? []) {
          if (!comp.file) continue;
          const p = comp.file.startsWith("/") ? comp.file : `/${comp.file}`;

          if (comp.config?._renderAs === "videos") {
            map.set(p, renderComponentTex(comp as LuLessonComponentRef, null));
            continue;
          }

          if (comp.kind !== "quiz") {
            map.set(p, renderComponentTex(comp as LuLessonComponentRef, null));
          }

          for (const child of comp.children ?? []) {
            if (!child.file) continue;
            const cp = child.file.startsWith("/") ? child.file : `/${child.file}`;
            map.set(cp, renderComponentTex(child as LuLessonComponentRef, comp as LuLessonComponentRef));
          }
        }
      }
    }
  }

  return map;
}

interface TexFileContext {
  lesson: string;
  component: string;
}

function buildTexContextMap(project: LuProjectJson): Map<string, TexFileContext> {
  const ctx = new Map<string, TexFileContext>();
  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const comp of lesson.components ?? []) {
          if (comp.file) {
            const p = comp.file.startsWith("/") ? comp.file : `/${comp.file}`;
            ctx.set(p, { lesson: lesson.title, component: `${comp.kind}:${comp.id}` });
          }
          for (const child of comp.children ?? []) {
            if (child.file) {
              const cp = child.file.startsWith("/") ? child.file : `/${child.file}`;
              ctx.set(cp, { lesson: lesson.title, component: `${child.kind ?? "question"}:${child.id}` });
            }
          }
        }
      }
    }
  }
  return ctx;
}

function logTexDiagnostics(texMap: Map<string, string>, contextMap: Map<string, TexFileContext>): void {
  let issueCount = 0;
  for (const [filePath, content] of texMap.entries()) {
    // Skip orchestration headers (comments only, not AI content)
    if (/\/(track|module-\d+|lesson-\d+)\.tex$/i.test(filePath)) continue;

    const issues = scanAIContent(content);
    if (issues.length === 0) continue;
    issueCount += issues.length;
    const ctx = contextMap.get(filePath);
    console.warn(`[TEX-SANITIZE] ${filePath} (${ctx?.component ?? "unknown"}): ${issues.length} issue(s)`);
    for (const issue of issues.slice(0, 3)) {
      const start = Math.max(0, issue.index - 20);
      const end = Math.min(content.length, issue.index + 20);
      console.warn(`  ${issue.type} at ${issue.index}: "...${content.slice(start, end)}..."`);
    }
  }
  if (issueCount > 0) {
    console.warn(`[TEX-SANITIZE] Total unsanitized issues in component .tex files: ${issueCount}`);
  }
}

export interface RenderCourseResult {
  project: LuProjectJson;
  files: LuProjectFileEntry[];
  courseJson: LuCourseDocument;
  renderDiff?: { changed: number; total: number };
}

/** Render validated course JSON → complete LU project files. */
export function renderCourseDocument(
  doc: LuCourseDocument,
  options: { previousTex?: Map<string, string> } = {}
): RenderCourseResult {
  assertValidCourseDocument(doc);

  const project = createEmptyLuProject(doc.course.title);
  project.universe = {
    title: doc.course.title,
    description: doc.course.description,
    difficulty: doc.course.difficulty,
    estimatedHours: doc.course.estimatedHours,
    skills: doc.course.skills,
    category: doc.course.category,
  };

  const trackId = "track-01";
  const trackFolder = trackId;
  const modules: typeof project.tracks[0]["modules"] = [];

  doc.course.modules.forEach((mod, mi) => {
    const modId = mod.id || `module-${pad2(mi + 1)}`;
    const modFolder = modId;
    const lessons: LuProjectLessonRef[] = mod.lessons.map((lesson) => ({
      id: lesson.id,
      file: `${lesson.id}.tex`,
      title: lesson.title,
      components: lessonJsonToComponents(lesson, trackFolder, modFolder),
    }));

    modules.push({
      id: modId,
      folder: modFolder,
      file: "module.tex",
      title: mod.title,
      lessons,
    });
  });

  project.tracks = [
    {
      id: trackId,
      folder: trackFolder,
      file: "track.tex",
      title: doc.course.title,
      description: doc.course.description,
      modules,
    },
  ];

  const texMap = buildTexMapFromProject(project);
  logTexDiagnostics(texMap, buildTexContextMap(project));

  texMap.set(
    "/metadata.tex",
    `\\learninguniverse{
title={${esc(doc.course.title)}},
description={${esc(doc.course.description)}},
difficulty={${esc(doc.course.difficulty)}},
estimatedHours={${doc.course.estimatedHours}},
skills={${esc(doc.course.skills.join(", "))}}
}
`
  );

  const mainTex = buildMainTexFromProject(project);
  texMap.set("/main.tex", mainTex);

  const files: LuProjectFileEntry[] = [];
  for (const [path, content] of texMap.entries()) {
    files.push({
      path,
      name: path.split("/").pop() || "file.tex",
      isFolder: false,
      content,
    });
  }

  for (const folder of ASSET_FOLDERS) {
    files.push({ path: folder, name: folder.split("/").pop() || folder, isFolder: true, content: "" });
  }

  files.push({
    path: "/bibliography.bib",
    name: "bibliography.bib",
    isFolder: false,
    content: `@article{gatehub2026,
  title={${doc.course.title}},
  author={THE GATEHUB},
  year={2026}
}
`,
  });

  files.push({
    path: "/course.content.json",
    name: "course.content.json",
    isFolder: false,
    content: JSON.stringify(doc, null, 2),
  });

  const dslCheck = enforceDslOnFiles(files.filter((f) => !f.isFolder).map((f) => ({ path: f.path, content: f.content })));
  if (!dslCheck.valid) {
    const first = dslCheck.issues[0];
    throw new Error(`Renderer produced invalid DSL: ${first?.message ?? "unknown command"}`);
  }

  let renderDiff: { changed: number; total: number } | undefined;
  if (options.previousTex) {
    const nextMap = new Map(files.filter((f) => !f.isFolder).map((f) => [f.path, f.content]));
    const diff = diffRenderOutputs(options.previousTex, nextMap);
    renderDiff = {
      changed: changedPathsFromDiff(diff).length,
      total: diff.length,
    };
  }

  return { project, files, courseJson: doc, renderDiff };
}

/** Rebuild all .tex from project.json component configs — fixes corrupted AI LaTeX. */
export function rerenderTexMapFromProject(project: LuProjectJson): Map<string, string> {
  const map = buildTexMapFromProject(project);
  map.set(
    "/metadata.tex",
    `\\learninguniverse{
title={${esc(project.universe.title ?? project.metadata.title)}},
description={${esc(project.universe.description ?? "")}},
difficulty={${esc(project.universe.difficulty ?? "Beginner")}},
estimatedHours={${project.universe.estimatedHours ?? 0}},
skills={${esc((project.universe.skills ?? []).join(", "))}}
}
`
  );
  map.set("/main.tex", buildMainTexFromProject(project));

  const check = enforceDslOnFiles([...map.entries()].map(([path, content]) => ({ path, content })));
  if (!check.valid) {
    throw new Error(`Re-render produced invalid DSL: ${check.issues[0]?.message}`);
  }

  return map;
}
