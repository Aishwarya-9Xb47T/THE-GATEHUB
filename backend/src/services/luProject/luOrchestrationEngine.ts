/**
 * Deterministic course orchestration engine.
 * project.json is the ONLY source of truth — never read filesystem for orchestration.
 * Always overwrite lesson.tex / module.tex / track.tex (never append).
 */
import type { LuProjectJson, LuProjectLessonRef, LuProjectModuleRef, LuProjectTrackRef } from "./luProjectSchema.js";
import type { LuLessonComponentRef } from "./luLessonComponents.js";
import { componentInputRef } from "./luComponentFilePaths.js";
import { componentMarker } from "./luTexMarkers.js";
import { escLatex as esc } from "./luTexEscape.js";
import { texFileGuideHeader } from "./luTexAuthoringGuide.js";
import { listInputRefs } from "./luTexAst.js";
import type { LuValidationIssue } from "./luProjectValidator.js";
import { prisma } from "../../utils/prisma.js";
import { resetYjsForFileIds } from "./yjsDocumentService.js";
import { normalizeProjectPath } from "./luProjectFiles.js";

/** Canonical render order — every lesson uses this exact sequence. */
export const CANONICAL_COMPONENT_ORDER = [
  "overview",
  "objectives",
  "videos",
  "topics",
  "analogy",
  "concepts",
  "common-mistakes",
  "best-practices",
  "examples",
  "practice",
  "quiz",
  "coding-lab",
  "notebook",
  "assignment",
  "project",
  "research-paper",
  "resources",
  "discussion",
  "checkpoint",
  "summary",
  "revision",
  "references",
] as const;

export type CanonicalSlot = (typeof CANONICAL_COMPONENT_ORDER)[number];

const SINGLETON_SLOTS = new Set<string>(CANONICAL_COMPONENT_ORDER);

const SLOT_ALIASES: Record<string, CanonicalSlot> = {
  "objectives-01": "objectives",
  "learning-objectives": "objectives",
  "topics-01": "topics",
  "coding-lab-01": "coding-lab",
  "quiz-01": "quiz",
  "notebook-01": "notebook",
  "assignment-01": "assignment",
  "project-01": "project",
  "research-paper-01": "research-paper",
  "discussion-01": "discussion",
};

function withGuideHeader(content: string, header: string): string {
  if (content.includes("THE GATEHUB")) return content;
  return header + content;
}

function slotIndex(slot: string): number {
  const idx = (CANONICAL_COMPONENT_ORDER as readonly string[]).indexOf(slot);
  return idx >= 0 ? idx : CANONICAL_COMPONENT_ORDER.length + slot.charCodeAt(0);
}

/** Map component id/kind → canonical orchestration slot. */
export function resolveOrchestrationSlot(comp: LuLessonComponentRef): string {
  const id = comp.id.toLowerCase();
  if (SLOT_ALIASES[id]) return SLOT_ALIASES[id];
  if (SINGLETON_SLOTS.has(id)) return id;
  const base = id.replace(/-\d+$/, "");
  if (SLOT_ALIASES[base]) return SLOT_ALIASES[base];
  if (SINGLETON_SLOTS.has(base)) return base;
  if (comp.kind === "quiz" && (id.startsWith("quiz") || comp.kind === "quiz")) return "quiz";
  if (comp.kind === "coding-lab") return "coding-lab";
  if (comp.kind === "research-paper") return "research-paper";
  return id;
}

export interface NormalizeLessonResult {
  components: LuLessonComponentRef[];
  warnings: string[];
  dedupedProjectJson: boolean;
}

/**
 * Deduplicate and order lesson components from project.json.
 * Rejects duplicate slots and duplicate \\input targets.
 */
export function normalizeLessonComponents(
  lesson: LuProjectLessonRef,
  modFolder?: string,
  trackFolder?: string
): NormalizeLessonResult {
  void modFolder;
  void trackFolder;
  const warnings: string[] = [];
  const raw = lesson.components ?? [];
  const slotOwner = new Map<string, LuLessonComponentRef>();
  const seenIds = new Set<string>();
  const seenInputRefs = new Set<string>();
  const overflow: LuLessonComponentRef[] = [];

  for (const comp of raw) {
    const cref = comp as LuLessonComponentRef;
    if (cref.kind === "question") {
      warnings.push(`Question ${cref.id} must live under a quiz container, not lesson root`);
      continue;
    }
    if (seenIds.has(cref.id)) {
      warnings.push(`Duplicate component id rejected: ${cref.id}`);
      continue;
    }
    seenIds.add(cref.id);

    const inputRef = componentInputRef(lesson.id, cref.id, cref.kind, cref.file);
    if (seenInputRefs.has(inputRef)) {
      warnings.push(`Duplicate \\input target rejected: ${inputRef} (component ${cref.id})`);
      continue;
    }

    const slot = resolveOrchestrationSlot(cref);
    if (SINGLETON_SLOTS.has(slot)) {
      const existing = slotOwner.get(slot);
      if (existing) {
        warnings.push(
          `Duplicate lesson component detected. ${slot} appeared twice (${existing.id} and ${cref.id}).`
        );
        continue;
      }
      slotOwner.set(slot, cref);
      seenInputRefs.add(inputRef);
    } else {
      overflow.push(cref);
    }
  }

  const ordered: LuLessonComponentRef[] = [];
  for (const slot of CANONICAL_COMPONENT_ORDER) {
    const comp = slotOwner.get(slot);
    if (comp) ordered.push(comp);
  }

  overflow.sort((a, b) => a.id.localeCompare(b.id));
  for (const comp of overflow) {
    const inputRef = componentInputRef(lesson.id, comp.id, comp.kind, comp.file);
    if (seenInputRefs.has(inputRef)) {
      warnings.push(`Duplicate \\input target rejected: ${inputRef}`);
      continue;
    }
    seenInputRefs.add(inputRef);
    ordered.push(comp);
  }

  return {
    components: ordered,
    warnings,
    dedupedProjectJson: ordered.length !== raw.length || warnings.length > 0,
  };
}

/** Normalize all lessons in project.json (mutates project in place). */
export function normalizeProjectComponents(project: LuProjectJson): string[] {
  const allWarnings: string[] = [];
  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (let i = 0; i < mod.lessons.length; i++) {
        const lesson = mod.lessons[i];
        const { components, warnings, dedupedProjectJson } = normalizeLessonComponents(
          lesson,
          mod.folder,
          track.folder
        );
        if (dedupedProjectJson || warnings.length) {
          mod.lessons[i] = { ...lesson, components };
          allWarnings.push(...warnings.map((w) => `${lesson.id}: ${w}`));
        }
      }
    }
  }
  if (allWarnings.length) {
    project.metadata.updatedAt = new Date().toISOString();
  }
  return allWarnings;
}

function stripTexComments(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.trim().startsWith("%"))
    .join("\n");
}

/** Render lesson.tex from scratch — never append to existing content. */
export function renderLessonOrchestrationTex(
  lesson: LuProjectLessonRef,
  trackFolder?: string,
  modFolder?: string
): string {
  const { components } = normalizeLessonComponents(lesson, modFolder, trackFolder);
  const lines: string[] = [
    `\\lesson{title={${esc(lesson.title)}},duration={45},order={1}}`,
  ];

  const seenInputs = new Set<string>();
  for (const comp of components) {
    const inputRef = componentInputRef(lesson.id, comp.id, comp.kind, comp.file);
    const inputLine = `\\input{${inputRef}}`;
    if (seenInputs.has(inputLine)) {
      throw new Error(
        `Orchestration generation aborted: duplicate \\input{${inputRef}} for lesson ${lesson.id}`
      );
    }
    seenInputs.add(inputLine);
    lines.push("");
    lines.push(componentMarker(comp.id));
    lines.push(inputLine);
  }

  const body = lines.join("\n").trim() + "\n";
  const withHeader = withGuideHeader(body, texFileGuideHeader("lesson", { lessonId: lesson.id }));
  const executable = stripTexComments(withHeader);
  const inputs = executable.match(/\\input\{[^}]+\}/g) ?? [];
  if (new Set(inputs).size !== inputs.length) {
    throw new Error(`Post-render duplicate \\input detected in lesson ${lesson.id}`);
  }
  return withHeader;
}

export function renderModuleOrchestrationTex(
  mod: LuProjectModuleRef & { description?: string },
  trackFolder: string
): string {
  const meta = `\\module{
title={${esc(mod.title)}},
description={${esc(mod.description || "")}},
prerequisites={},
learningOutcomes={},
estimatedHours={2}
}`;
  const seen = new Set<string>();
  const inputLines: string[] = [];
  for (const lesson of mod.lessons) {
    const base = lesson.file.replace(/\.tex$/i, "");
    const line = `\\input{${trackFolder}/${mod.folder}/${base}}`;
    if (seen.has(line)) {
      throw new Error(`Duplicate module \\input: ${line}`);
    }
    seen.add(line);
    inputLines.push(line);
  }
  const body = inputLines.length ? `${meta}\n\n${inputLines.join("\n")}\n` : `${meta}\n`;
  return withGuideHeader(body, texFileGuideHeader("module"));
}

export function renderTrackOrchestrationTex(track: LuProjectTrackRef): string {
  const meta = `\\track{
title={${esc(track.title)}},
description={${esc(track.description || "")}},
learningOutcomes={},
careerOutcomes={},
difficulty={Beginner}
}`;
  const seen = new Set<string>();
  const inputLines: string[] = [];
  for (const mod of track.modules) {
    const line = `\\input{${track.folder}/${mod.folder}/module}`;
    if (seen.has(line)) {
      throw new Error(`Duplicate track \\input: ${line}`);
    }
    seen.add(line);
    inputLines.push(line);
  }
  const body = inputLines.length ? `${meta}\n\n${inputLines.join("\n")}\n` : `${meta}\n`;
  return withGuideHeader(body, texFileGuideHeader("track"));
}

export interface OrchestrationFileEntry {
  path: string;
  content: string;
}

/** Build ALL orchestration files from project.json (overwrite-only). */
export function buildOrchestrationFiles(project: LuProjectJson): OrchestrationFileEntry[] {
  const entries: OrchestrationFileEntry[] = [];

  for (const track of project.tracks) {
    entries.push({
      path: normalizeProjectPath(`/${track.folder}/${track.file}`),
      content: renderTrackOrchestrationTex(track),
    });

    for (const mod of track.modules) {
      entries.push({
        path: normalizeProjectPath(`/${track.folder}/${mod.folder}/${mod.file}`),
        content: renderModuleOrchestrationTex(mod, track.folder),
      });

      for (const lesson of mod.lessons) {
        entries.push({
          path: normalizeProjectPath(`/${track.folder}/${mod.folder}/${lesson.file}`),
          content: renderLessonOrchestrationTex(lesson, track.folder, mod.folder),
        });
      }
    }
  }

  return entries;
}

export interface OrchestrationValidationIssue {
  path: string;
  code: string;
  message: string;
  duplicateInput?: string;
}

/** Validate orchestration file content for duplicate \\input statements. */
export function validateOrchestrationContent(path: string, content: string): OrchestrationValidationIssue[] {
  const issues: OrchestrationValidationIssue[] = [];
  const executable = stripTexComments(content);
  const inputs = listInputRefs(executable);
  const normalized = inputs.map((r) => r.replace(/\\/g, "/").toLowerCase());
  const seen = new Map<string, number>();

  for (let i = 0; i < normalized.length; i++) {
    const ref = normalized[i];
    if (seen.has(ref)) {
      issues.push({
        path,
        code: "DUPLICATE_INPUT",
        message: `Duplicate \\input{${inputs[i]}} in orchestration file`,
        duplicateInput: inputs[i],
      });
    }
    seen.set(ref, i);
  }

  const rawInputs = executable.match(/\\input\{[^}]+\}/g) ?? [];
  const uniqueRaw = new Set(rawInputs);
  if (uniqueRaw.size !== rawInputs.length) {
    issues.push({
      path,
      code: "DUPLICATE_INPUT",
      message: "Lesson file contains duplicate \\input statements",
    });
  }

  if (/\/lesson-\d+\.tex$/i.test(path)) {
    const lessonBlocks = (executable.match(/^\\lesson\s*\{/gm) ?? []).length;
    if (lessonBlocks !== 1) {
      issues.push({
        path,
        code: "DUPLICATE_LESSON_BLOCK",
        message: `Expected exactly one \\lesson block, found ${lessonBlocks}`,
      });
    }
  }

  return issues;
}

export function validateProjectOrchestration(
  project: LuProjectJson,
  onDisk?: Map<string, string>
): OrchestrationValidationIssue[] {
  const issues: OrchestrationValidationIssue[] = [];
  const generated = buildOrchestrationFiles(project);

  for (const { path, content } of generated) {
    issues.push(...validateOrchestrationContent(path, content));
  }

  if (onDisk) {
    for (const { path } of generated) {
      const disk = onDisk.get(path);
      if (disk) {
        issues.push(...validateOrchestrationContent(path, disk));
      }
    }
  }

  return issues;
}

export function orchestrationIssuesToValidation(
  issues: OrchestrationValidationIssue[]
): LuValidationIssue[] {
  return issues.map((i) => ({
    severity: "error" as const,
    code: i.code,
    message: i.message,
    file: i.path,
    suggestedFix: "Regenerate orchestration from project.json",
  }));
}

/** Preserve instructor-added \\input lines when regenerating orchestration files. */
function mergeExtraOrchestrationInputs(generated: string, existing: string | null | undefined): string {
  if (!existing?.trim()) return generated;
  const generatedInputs = new Set(generated.match(/\\input\{[^}]+\}/g) ?? []);
  const extra: string[] = [];
  for (const line of existing.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.match(/^\\input\{([^}]+)\}$/);
    if (!match) continue;
    const inputLine = `\\input{${match[1]}}`;
    if (!generatedInputs.has(inputLine)) {
      extra.push(inputLine);
    }
  }
  if (!extra.length) return generated;
  return `${generated.trimEnd()}\n\n${extra.join("\n")}\n`;
}

/** Persist orchestration files — full overwrite, never append. */
export async function persistOrchestrationFiles(
  projectId: string,
  project: LuProjectJson
): Promise<{ written: string[]; warnings: string[] }> {
  normalizeProjectComponents(project);
  const entries = buildOrchestrationFiles(project);
  const written: string[] = [];
  const yjsResetIds: string[] = [];

  for (const { path, content } of entries) {
    const existing = await prisma.latexFile.findFirst({ where: { projectId, path } });
    const merged = mergeExtraOrchestrationInputs(content, existing?.content);
    const name = path.split("/").pop() || "file.tex";
    if (existing) {
      if (existing.content !== merged) {
        await prisma.latexFile.update({ where: { id: existing.id }, data: { content: merged } });
        yjsResetIds.push(existing.id);
        written.push(path);
      }
    } else {
      const created = await prisma.latexFile.create({
        data: { projectId, path, name, isFolder: false, content: merged },
      });
      yjsResetIds.push(created.id);
      written.push(path);
    }
  }

  if (yjsResetIds.length) {
    await resetYjsForFileIds(projectId, yjsResetIds);
  }

  return { written, warnings: [] };
}

/** Idempotent: regenerate every orchestration file from project.json. */
export async function regenerateOrchestrationFromProject(
  projectId: string,
  project: LuProjectJson
): Promise<string[]> {
  const warnings = normalizeProjectComponents(project);
  const { written } = await persistOrchestrationFiles(projectId, project);

  const pj = await prisma.latexFile.findFirst({ where: { projectId, path: "/project.json" } });
  if (pj) {
    await prisma.latexFile.update({
      where: { id: pj.id },
      data: { content: JSON.stringify(project, null, 2) },
    });
  }

  return [
    ...warnings.map((w) => `Deduped: ${w}`),
    ...written.map((p) => `Regenerated orchestration: ${p}`),
  ];
}
