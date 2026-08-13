/**
 * LaTeX orchestration emitters — used only on CREATE and structural mutations.
 * After creation, each .tex file is user-owned source; never regenerated on open.
 */
import type { LuProjectJson, LuProjectLessonRef, LuProjectModuleRef, LuProjectTrackRef } from "./luProjectSchema.js";
import type { LuLessonComponentRef } from "./luLessonComponents.js";
import { CHILD_CONTAINER_KINDS, type LuLessonComponentKind } from "./luComponentRegistry.js";
import {
  componentFilePath,
  componentInputRef,
  siblingInputRef,
} from "./luComponentFilePaths.js";
import { componentMarker } from "./luTexMarkers.js";
import {
  emitTexFromComponent,
  emitResourceItemTex,
} from "./luComponentEmitters.js";
import { emitQuizContainerTex, emitQuestionTex } from "./luQuizTexEmitter.js";
import { normalizeQuestionInputRefs } from "./luTexAst.js";
import { escLatex as esc } from "./luTexEscape.js";
import { texFileGuideHeader } from "./luTexAuthoringGuide.js";
import { renderLessonOrchestrationTex as renderLessonFromEngine } from "./luOrchestrationEngine.js";

function withGuideHeader(content: string, header: string): string {
  if (content.includes("THE GATEHUB")) return content;
  return header + content;
}

/** Lesson .tex orchestrates only: one \\lesson header + \\input lines per component. */
export function emitLessonOrchestrationTex(lesson: LuProjectLessonRef): string {
  return renderLessonFromEngine(lesson);
}

/** Quiz / resources container: one metadata block + \\input per child question/item. */
export function emitContainerOrchestrationTex(container: LuLessonComponentRef): string {
  const lines: string[] = [];
  if (container.kind === "quiz") {
    lines.push(emitQuizContainerTex(container).trim());
  } else if (container.kind === "resources") {
    const notes = String((container.config as { notes?: string })?.notes ?? "");
    lines.push(
      `\\resource{type={collection},title={${esc(container.title)}},url={${esc(notes || "https://example.com")}}}`
    );
  }
  for (const child of container.children ?? []) {
    const childKind =
      container.kind === "quiz"
        ? child.kind === "question" || child.id.startsWith("question-") || child.id.startsWith("quiz-q-")
          ? "question"
          : "question"
        : "resources";
    lines.push("");
    lines.push(componentMarker(child.id));
    lines.push(`\\input{${siblingInputRef(child.id, childKind, child.file)}}`);
  }
  return normalizeQuestionInputRefs(lines.join("\n").trim() + "\n");
}
export function emitTrackOrchestrationTex(track: LuProjectTrackRef): string {
  const meta = `\\track{
title={${esc(track.title)}},
description={${esc(track.description || "")}},
learningOutcomes={},
careerOutcomes={},
difficulty={Beginner}
}`;
  const inputs = track.modules.map((m) => `\\input{${track.folder}/${m.folder}/module}`).join("\n");
  const body = inputs ? `${meta}\n\n${inputs}\n` : `${meta}\n`;
  return withGuideHeader(body, texFileGuideHeader("track"));
}

/** Module .tex — exactly one \\module block + \\input per lesson. */
export function emitModuleOrchestrationTex(
  mod: LuProjectModuleRef & { description?: string },
  trackFolder: string
): string {
  const meta = `\\module{
title={${esc(mod.title)}},
description={${esc((mod as { description?: string }).description || "")}},
prerequisites={},
learningOutcomes={},
estimatedHours={2}
}`;
  const inputs = mod.lessons
    .map((l) => {
      const base = l.file.replace(/\.tex$/i, "");
      return `\\input{${trackFolder}/${mod.folder}/${base}}`;
    })
    .join("\n");
  const body = inputs ? `${meta}\n\n${inputs}\n` : `${meta}\n`;
  return withGuideHeader(body, texFileGuideHeader("module"));
}

export function emitLeafComponentTex(
  comp: LuLessonComponentRef,
  parent: LuLessonComponentRef | null
): string {
  let body: string;
  if (parent?.kind === "quiz" || comp.kind === "question") {
    body = emitQuestionTex(comp);
  } else if (parent?.kind === "resources") {
    body = emitResourceItemTex(comp.title, comp.config ?? {}).trim() + "\n";
  } else if (CHILD_CONTAINER_KINDS.has(comp.kind as LuLessonComponentKind)) {
    body = emitContainerOrchestrationTex(comp);
  } else {
    body = emitTexFromComponent(comp.kind as LuLessonComponentKind, comp.title, comp.config ?? {}).trim() + "\n";
  }
  const kind = comp.kind as LuLessonComponentKind;
  return withGuideHeader(body, texFileGuideHeader("component", { kind }));
}

export interface ProjectTexEntry {
  path: string;
  content: string;
}

/** Build every structural + lesson + component .tex path from project.json. */
export function buildProjectTexEntries(project: LuProjectJson): ProjectTexEntry[] {
  const entries: ProjectTexEntry[] = [];

  for (const track of project.tracks) {
    entries.push({
      path: `/${track.folder}/${track.file}`,
      content: emitTrackOrchestrationTex(track),
    });

    for (const mod of track.modules) {
      entries.push({
        path: `/${track.folder}/${mod.folder}/${mod.file}`,
        content: emitModuleOrchestrationTex(mod, track.folder),
      });

      for (const lesson of mod.lessons) {
        const lessonPath = `/${track.folder}/${mod.folder}/${lesson.file}`;
        entries.push({ path: lessonPath, content: emitLessonOrchestrationTex(lesson) });

        for (const comp of lesson.components ?? []) {
          const compPath =
            comp.file ||
            componentFilePath(track.folder, mod.folder, lesson.id, comp.id, comp.kind);
          comp.file = compPath;
          entries.push({ path: compPath, content: emitLeafComponentTex(comp, null) });

          for (const child of comp.children ?? []) {
            const childPath =
              child.file ||
              componentFilePath(track.folder, mod.folder, lesson.id, child.id, comp.kind);
            child.file = childPath;
            entries.push({ path: childPath, content: emitLeafComponentTex(child, comp) });
          }

          if (CHILD_CONTAINER_KINDS.has(comp.kind as LuLessonComponentKind)) {
            const idx = entries.findIndex((e) => e.path === compPath);
            if (idx >= 0) {
              entries[idx] = { path: compPath, content: emitContainerOrchestrationTex(comp) };
            }
          }
        }
      }
    }
  }

  return entries;
}

/** Full map for validation/tests only — never call at runtime on open/compile/publish. */
export function buildFullProjectTexMap(project: LuProjectJson): Map<string, string> {
  return buildProjectTexMap(project);
}

export function buildProjectTexMap(project: LuProjectJson): Map<string, string> {
  const map = new Map<string, string>();
  for (const { path, content } of buildProjectTexEntries(project)) {
    map.set(path, content);
  }
  return map;
}

const LESSON_CMD_RE = /^\\lesson\s*\{/m;
const QUIZ_CMD_RE = /^\\quiz\s*\{/m;
const TRACK_CMD_RE = /^\\track\s*\{/m;
const MODULE_CMD_RE = /^\\module\s*\{/m;

/** Track / module / lesson orchestration files — safe to regenerate from project.json. */
export function isOrchestrationTexPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return /\/track\.tex$/i.test(normalized) || /\/module\.tex$/i.test(normalized) || /\/lesson-\d+\.tex$/i.test(normalized);
}

/** Leaf component .tex files (summary.tex, overview.tex, …) — instructor-owned after creation. */
export function isUserOwnedComponentTexPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized.endsWith(".tex")) return false;
  if (normalized.includes("main.tex")) return false;
  return !isOrchestrationTexPath(normalized);
}

export function countTexBlocks(content: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  return [...content.matchAll(global)].length;
}

export interface TexInvariantIssue {
  path: string;
  code: string;
  message: string;
}

/** Verify generated tex obeys one-block-per-file rules. */
export function validateTexInvariants(project: LuProjectJson): TexInvariantIssue[] {
  const issues: TexInvariantIssue[] = [];
  const entries = buildProjectTexEntries(project);

  for (const { path, content } of entries) {
    const isTrackFile = /\/track\.tex$/i.test(path);
    const isModuleFile = /\/module\.tex$/i.test(path);
    const isLessonOrchestration = /\/lesson-\d+\.tex$/i.test(path);
    const isQuizContainer = /\/quiz-\d+\.tex$/i.test(path);
    const isOverview = /\/overview\.tex$/i.test(path);

    if (isTrackFile && countTexBlocks(content, TRACK_CMD_RE) !== 1) {
      issues.push({
        path,
        code: "DUPLICATE_TRACK_BLOCK",
        message: `Track file must contain exactly one \\track block (found ${countTexBlocks(content, TRACK_CMD_RE)})`,
      });
    }

    if (isModuleFile && countTexBlocks(content, MODULE_CMD_RE) !== 1) {
      issues.push({
        path,
        code: "DUPLICATE_MODULE_BLOCK",
        message: `Module file must contain exactly one \\module block (found ${countTexBlocks(content, MODULE_CMD_RE)})`,
      });
    }

    if (isLessonOrchestration) {
      if (countTexBlocks(content, LESSON_CMD_RE) !== 1) {
        issues.push({
          path,
          code: "DUPLICATE_LESSON_BLOCK",
          message: `Lesson file must contain exactly one \\lesson block (found ${countTexBlocks(content, LESSON_CMD_RE)})`,
        });
      }
      const executable = content
        .split("\n")
        .filter((line) => !line.trim().startsWith("%"))
        .join("\n");
      const inputs = executable.match(/\\input\{[^}]+\}/g) ?? [];
      const uniqueInputs = new Set(inputs);
      if (uniqueInputs.size !== inputs.length) {
        issues.push({
          path,
          code: "DUPLICATE_INPUT",
          message: "Lesson file contains duplicate \\input statements",
        });
      }
    }

    if (isQuizContainer) {
      const quizBlocks = countTexBlocks(content, QUIZ_CMD_RE);
      const childInputs = (content.match(/\\input\{[^}]+\}/g) ?? []).length;
      if (quizBlocks > 1 + childInputs) {
        issues.push({
          path,
          code: "DUPLICATE_QUIZ_BLOCK",
          message: `Quiz container must have one quiz metadata block (found ${quizBlocks} \\quiz blocks)`,
        });
      }
    }

    if (isOverview && countTexBlocks(content, /^\\overviewmarkdown\s*\{/m) > 1) {
      issues.push({
        path,
        code: "DUPLICATE_OVERVIEW_BLOCK",
        message: "Overview file must contain exactly one overview block",
      });
    }

    const markerIds = [...content.matchAll(/^%\s*LU:component:([a-zA-Z0-9_-]+)\s*$/gm)].map((m) => m[1]);
    const uniqueMarkers = new Set(markerIds);
    if (uniqueMarkers.size !== markerIds.length) {
      issues.push({
        path,
        code: "DUPLICATE_COMPONENT_MARKER",
        message: "Duplicate component markers in file",
      });
    }
  }

  return issues;
}
