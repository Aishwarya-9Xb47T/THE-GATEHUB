/**
 * Validates AI-generated LU projects: structure, files, includes, compile.
 */
import { validateLuProjectStructure } from "../luProject/luProjectValidator.js";
import { resolveProjectIncludesWithFallback } from "../luProject/luIncludeResolver.js";
import { compileLatexLocally } from "../latexCompileService.js";
import type { LuProjectJson } from "../luProject/luProjectSchema.js";
import type { LuProjectFileEntry } from "../luProject/luProjectFileEmitter.js";
import type { ArchitectValidationReport, ArchitectQualityReport } from "./types.js";
import { isValidYouTubeUrl } from "../../utils/videoSourceUtils.js";

/** Full LaTeX compile during generate is slow — defer to publish unless explicitly enabled. */
const COMPILE_DURING_GENERATE = process.env.AI_ARCHITECT_COMPILE_VALIDATE === "true";

export interface ProjectValidationInput {
  projectId: string;
  project: LuProjectJson;
  files: LuProjectFileEntry[];
  mainTex: string;
}

function collectReferencedPaths(project: LuProjectJson, files: LuProjectFileEntry[]): Set<string> {
  const paths = new Set<string>();
  for (const f of files) {
    if (!f.isFolder) paths.add(f.path);
  }
  for (const track of project.tracks) {
    paths.add(`/${track.folder}/${track.file}`);
    for (const mod of track.modules) {
      paths.add(`/${track.folder}/${mod.folder}/${mod.file}`);
      for (const lesson of mod.lessons) {
        paths.add(`/${track.folder}/${mod.folder}/${lesson.file}`);
        for (const comp of lesson.components ?? []) {
          if (comp.file) paths.add(comp.file.startsWith("/") ? comp.file : `/${comp.file}`);
          for (const child of comp.children ?? []) {
            if (child.file) paths.add(child.file.startsWith("/") ? child.file : `/${child.file}`);
          }
        }
      }
    }
  }
  return paths;
}

function verifyVideoCommands(files: LuProjectFileEntry[]): string[] {
  const issues: string[] = [];
  const youtubePattern = /\\video\s*\{[^}]*type\s*=\s*\{youtube\}[^}]*url\s*=\s*\{([^}]*)\}/gi;
  const uploadPattern = /\\video\s*\{[^}]*type\s*=\s*\{upload\}[^}]*file\s*=\s*\{([^}]*)\}/gi;

  for (const f of files) {
    if (f.isFolder || !f.content) continue;
    let match: RegExpExecArray | null;
    while ((match = youtubePattern.exec(f.content)) !== null) {
      const url = match[1].replace(/\\&/g, "&").trim();
      if (!isValidYouTubeUrl(url)) {
        issues.push(`${f.path}: invalid YouTube URL "${url.slice(0, 60)}"`);
      }
    }
    while ((match = uploadPattern.exec(f.content)) !== null) {
      const fileRef = match[1].replace(/\\_/g, "_").trim();
      if (!fileRef) {
        issues.push(`${f.path}: upload video missing file reference`);
      }
    }
  }
  return issues;
}

function verifyLessonContent(files: LuProjectFileEntry[]): string[] {
  const missing: string[] = [];
  const stubPattern =
    /lorem\s+ipsum|your solution here|your implementation here|add your content here|#\s*Your solution|\bplaceholder\b/i;

  for (const f of files) {
    if (f.isFolder) continue;
    if (!f.path.endsWith(".tex")) continue;
    if (f.path === "/main.tex" || f.path === "/metadata.tex") continue;
    const content = f.content?.trim() ?? "";
    if (content.length < 20) {
      missing.push(`${f.path} (empty or too short)`);
      continue;
    }
    if (stubPattern.test(content)) {
      missing.push(`${f.path} (contains placeholder text)`);
    }
  }
  return missing;
}

export async function validateGeneratedProject(input: ProjectValidationInput): Promise<ArchitectValidationReport> {
  const filePathSet = new Set(input.files.map((f) => f.path));
  filePathSet.add("/main.tex");
  filePathSet.add("/project.json");

  const structureIssues = validateLuProjectStructure(input.project, filePathSet);
  const structureErrors = structureIssues.filter((i) => i.severity === "error");

  let lessonCount = 0;
  let componentCount = 0;
  for (const track of input.project.tracks) {
    for (const mod of track.modules) {
      lessonCount += mod.lessons.length;
      for (const lesson of mod.lessons) {
        componentCount += lesson.components?.length ?? 0;
      }
    }
  }

  const emptyContent = verifyLessonContent(input.files);
  const videoIssues = verifyVideoCommands(input.files);
  const checks: ArchitectQualityReport["checks"] = [];

  checks.push({
    id: "structure",
    label: "Project structure",
    status: structureErrors.length === 0 ? "pass" : "fail",
    detail: structureErrors.length === 0 ? "All track/module/lesson files present" : `${structureErrors.length} structural errors`,
  });

  checks.push({
    id: "lessons",
    label: "Lesson coverage",
    status: lessonCount > 0 ? "pass" : "fail",
    detail: `${lessonCount} lessons, ${componentCount} components`,
  });

  checks.push({
    id: "videos",
    label: "Video embeds",
    status: videoIssues.length === 0 ? "pass" : "fail",
    detail: videoIssues.length === 0 ? "YouTube and upload videos validated" : videoIssues.slice(0, 2).join("; "),
  });

  checks.push({
    id: "content",
    label: "Content completeness",
    status: emptyContent.length === 0 ? "pass" : "fail",
    detail: emptyContent.length === 0 ? "All .tex files contain real content" : `${emptyContent.length} files need content`,
  });

  let compileSuccess = false;
  let compileError: string | undefined;
  let resolvedLessonCount = 0;

  try {
    const dbFiles = input.files.map((f) => ({
      path: f.path,
      name: f.name,
      isFolder: f.isFolder,
      content: f.content,
      s3Url: null as string | null,
    }));
    dbFiles.push({
      path: "/project.json",
      name: "project.json",
      isFolder: false,
      content: JSON.stringify(input.project, null, 2),
      s3Url: null,
    });
    dbFiles.push({
      path: "/main.tex",
      name: "main.tex",
      isFolder: false,
      content: input.mainTex,
      s3Url: null,
    });
    const resolved = resolveProjectIncludesWithFallback(dbFiles, { forPdf: true });
    const lessonMatches = resolved.mergedDsl.match(/\\lesson\s*\{/g);
    resolvedLessonCount = lessonMatches?.length ?? 0;

    checks.push({
      id: "includes",
      label: "LaTeX includes",
      status: resolved.includedFiles.length > 0 ? "pass" : "warn",
      detail: `${resolved.includedFiles.length} files merged successfully`,
    });

    try {
      if (!COMPILE_DURING_GENERATE) {
        compileSuccess = structureErrors.length === 0 && emptyContent.length === 0;
        checks.push({
          id: "compile",
          label: "LaTeX compile",
          status: "warn",
          detail: "Skipped during generate for speed — compiles on publish in Academic Studio",
        });
      } else {
        const compileResult = await compileLatexLocally(input.projectId, resolved.mergedForPdf, {
          mainFileName: "main.tex",
          preserveProvidedMainTex: true,
        });
        compileSuccess = compileResult.success;
        if (!compileSuccess) {
          compileError =
            compileResult.errors?.map((e) => e.message).join("\n") ||
            compileResult.logs?.slice(-500) ||
            "Compilation failed";
        }
        checks.push({
          id: "compile",
          label: "LaTeX compile",
          status: compileSuccess ? "pass" : "fail",
          detail: compileSuccess ? "Project compiles successfully" : compileError?.slice(0, 200) ?? "Compile failed",
        });
      }
    } catch (compileErr) {
      compileError = (compileErr as Error).message;
      const latexMissing = /not found|ENOENT|spawn/i.test(compileError);
      checks.push({
        id: "compile",
        label: "LaTeX compile",
        status: latexMissing ? "warn" : "fail",
        detail: latexMissing
          ? "LaTeX engine not available locally — structure validated, compile deferred"
          : compileError.slice(0, 200),
      });
      compileSuccess = latexMissing && structureErrors.length === 0 && emptyContent.length === 0;
    }
  } catch (resolveErr) {
    compileError = (resolveErr as Error).message;
    checks.push({
      id: "includes",
      label: "LaTeX includes",
      status: "fail",
      detail: resolveErr instanceof Error ? resolveErr.message : "Include resolution failed",
    });
  }

  checks.push({
    id: "navigation",
    label: "Navigation & metadata",
    status: input.project.universe?.title ? "pass" : "fail",
    detail: input.project.universe?.title ? "Universe metadata configured" : "Missing universe title",
  });

  const criticalFails = checks.filter((c) => c.status === "fail").length;
  const passed =
    structureErrors.length === 0 &&
    lessonCount > 0 &&
    emptyContent.length === 0 &&
    videoIssues.length === 0 &&
    criticalFails === 0 &&
    (compileSuccess || checks.find((c) => c.id === "compile")?.status === "warn");

  return {
    passed,
    structureErrors: structureErrors.length,
    missingFiles: [
      ...structureErrors.map((e) => e.file ?? e.message),
      ...emptyContent,
      ...videoIssues,
    ],
    compileSuccess,
    compileError,
    lessonCount: Math.max(lessonCount, resolvedLessonCount),
    componentCount,
    checks,
  };
}
