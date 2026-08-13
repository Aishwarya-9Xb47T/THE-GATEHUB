import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import type { LuProjectJson } from "./luProjectSchema.js";
import type { LearningUniverseStructured } from "../learningUniverseSchema.js";

export interface LuValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  suggestedFix?: string;
}

export function validateLuProjectStructure(
  project: LuProjectJson,
  filePaths: Set<string>
): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];

  if (!project.metadata.title?.trim()) {
    issues.push({
      severity: "error",
      code: "MISSING_TITLE",
      message: "Project title is required in project.json",
      file: "/project.json",
      suggestedFix: "Set metadata.title in project.json",
    });
  }

  if (project.tracks.length === 0) {
    issues.push({
      severity: "error",
      code: "NO_TRACKS",
      message: "At least one track is required",
      file: "/project.json",
      suggestedFix: "Add a track entry to project.json",
    });
  }

  const lessonIdsPerModule = new Map<string, Set<string>>();

  for (const track of project.tracks) {
    const trackPath = `/${track.folder}/${track.file}`;
    if (!filePaths.has(normalize(trackPath))) {
      issues.push({
        severity: "error",
        code: "MISSING_TRACK_FILE",
        message: `Track file not found: ${trackPath}`,
        file: trackPath,
        suggestedFix: "Create the track .tex file or update project.json",
      });
    }

    for (const mod of track.modules) {
      const modKey = `${track.id}:${mod.id}`;
      const lessonIds = lessonIdsPerModule.get(modKey) ?? new Set<string>();
      lessonIdsPerModule.set(modKey, lessonIds);

      const modPath = `/${track.folder}/${mod.folder}/${mod.file}`;
      if (!filePaths.has(normalize(modPath))) {
        issues.push({
          severity: "error",
          code: "MISSING_MODULE_FILE",
          message: `Module file not found: ${modPath}`,
          file: modPath,
        });
      }

      for (const lesson of mod.lessons) {
        if (lessonIds.has(lesson.id)) {
          issues.push({
            severity: "error",
            code: "DUPLICATE_LESSON_ID",
            message: `Duplicate lesson id in module: ${lesson.id}`,
            file: "/project.json",
          });
        }
        lessonIds.add(lesson.id);

        const lessonPath = `/${track.folder}/${mod.folder}/${lesson.file}`;
        if (!filePaths.has(normalize(lessonPath))) {
          issues.push({
            severity: "error",
            code: "MISSING_LESSON_FILE",
            message: `Lesson file not found: ${lessonPath}`,
            file: lessonPath,
          });
        }

        const componentIds = new Set<string>();
        for (const comp of lesson.components ?? []) {
          if (componentIds.has(comp.id)) {
            issues.push({
              severity: "error",
              code: "DUPLICATE_COMPONENT_ID",
              message: `Duplicate component id in lesson ${lesson.id}: ${comp.id}`,
              file: lessonPath,
            });
          }
          componentIds.add(comp.id);
          for (const child of comp.children ?? []) {
            if (componentIds.has(child.id)) {
              issues.push({
                severity: "error",
                code: "DUPLICATE_COMPONENT_ID",
                message: `Duplicate child component id in lesson ${lesson.id}: ${child.id}`,
                file: lessonPath,
              });
            }
            componentIds.add(child.id);
          }
        }
      }
    }
  }

  const mainPath = `/${project.compile.mainFile || "main.tex"}`;
  if (!filePaths.has(normalize(mainPath))) {
    issues.push({
      severity: "error",
      code: "MISSING_MAIN",
      message: "main.tex is missing",
      file: mainPath,
      suggestedFix: "Regenerate main.tex from project.json",
    });
  }

  return issues;
}

export function validateParsedContentBlocks(parsed: ParsedLearningUniverse): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];

  if (!parsed.universe.title?.trim()) {
    issues.push({
      severity: "error",
      code: "MISSING_UNIVERSE_TITLE",
      message: "Learning Universe title is missing",
      suggestedFix: "Add \\learninguniverse{title={...}} in metadata.tex",
    });
  }

  if (parsed.tracks.length === 0) {
    issues.push({
      severity: "error",
      code: "NO_PARSED_TRACKS",
      message: "No tracks found in merged DSL",
    });
  }

  let lessonCount = 0;
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      lessonCount += mod.lessons.length;
    }
  }
  if (lessonCount === 0) {
    issues.push({
      severity: "error",
      code: "NO_PARSED_LESSONS",
      message: "No lessons found — check track/module/lesson .tex files and \\input paths",
      suggestedFix: "Ensure track.tex includes modules and module.tex includes lessons",
    });
  }

  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        if (!lesson.title?.trim()) {
          issues.push({
            severity: "error",
            code: "MISSING_LESSON_TITLE",
            message: `Lesson in module "${mod.title}" has no title`,
          });
        }
      }
    }
  }

  return issues;
}

export function validateStructuredData(data: LearningUniverseStructured): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];
  if (!data.universe?.title) {
    issues.push({ severity: "error", code: "INVALID_JSON", message: "structuredData.universe.title is required" });
  }
  if (!Array.isArray(data.tracks)) {
    issues.push({ severity: "error", code: "INVALID_JSON", message: "structuredData.tracks must be an array" });
  }
  return issues;
}

function normalize(p: string): string {
  return p.startsWith("/") ? p : `/${p}`;
}

export function hasBlockingIssues(issues: LuValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

import { sanitizeDslContent } from "../../../../shared/lesson-body/dist/sanitizeDslContent.js";

export function validateAndPurgeInternalDsl(parsed: ParsedLearningUniverse): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];
  const FORBIDDEN_RE = /\\theory|\\overviewmarkdown|title\s*=\s*\{|body\s*=\s*\{|\{\{.*\}\}/i;

  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks ?? []) {
          const content = String(block.content ?? block.sourceTex ?? "");
          if (FORBIDDEN_RE.test(content)) {
            issues.push({
              severity: "warning",
              code: "INTERNAL_DSL_PURGED",
              message: `Internal authoring syntax detected in lesson "${lesson.title}" (${block.type}). Purged automatically.`,
            });

            if (typeof block.content === "string") {
              block.content = sanitizeDslContent(block.content);
            }
            if (typeof block.sourceTex === "string") {
              block.sourceTex = sanitizeDslContent(block.sourceTex);
            }
          }
        }
      }
    }
  }

  return issues;
}
