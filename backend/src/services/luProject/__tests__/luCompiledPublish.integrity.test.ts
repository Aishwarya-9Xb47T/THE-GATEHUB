import { describe, it, expect } from "@jest/globals";
import {
  assertPublishCompiledIntegrity,
  countCompiledDocuments,
  dropNonPublishableDocumentBlocks,
  isLessonCompiledDocumentPath,
  isLessonLeafDocumentPath,
  isLessonOrchestrationWrapperPath,
  isNonPublishableCompileArtifact,
  listPublishableCompiledPaths,
} from "../luPublishIntegrity.js";
import type { LuCompiledPackage } from "../luCompiledPackageSchema.js";
import type { ParsedLearningUniverse } from "../../../controllers/learning-universe-parser.js";

function compiledPackage(paths: string[], extras?: Record<string, { nodes?: Array<{ type?: string; kind?: string }> }>): LuCompiledPackage {
  const files: LuCompiledPackage["files"] = {};
  for (const path of paths) {
    files[path] = {
      path,
      title: path.split("/").pop()?.replace(/\.tex$/i, "") ?? path,
      sourceTex: "\\theory{title={Doc},body={Hello}}",
      nodes: extras?.[path]?.nodes ?? [{ type: "text", content: "Hello" }],
      assets: [],
    };
  }
  return {
    version: 1,
    compiledAt: new Date().toISOString(),
    projectId: "test",
    files,
  };
}

function parsedWithDocs(
  blocks: Array<{ title: string; compiledSourcePath?: string }>
): ParsedLearningUniverse {
  return {
    universe: { title: "Course", description: "" },
    tracks: [
      {
        title: "Track",
        description: "",
        modules: [
          {
            title: "Module",
            description: "",
            lessons: [
              {
                title: "Lesson",
                overviewMarkdown: "",
                contentBlocks: blocks.map((b) => ({
                  type: "document",
                  title: b.title,
                  compiledSourcePath: b.compiledSourcePath,
                  content: { title: b.title, compiledSourcePath: b.compiledSourcePath, nodes: [] },
                })),
                videos: [],
                resources: [],
              },
            ],
          },
        ],
      },
    ],
    warnings: [],
  };
}

function twentyFiveLeafPaths(): string[] {
  const paths: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const n = String(i).padStart(2, "0");
    paths.push(`/track-01/module-01/lesson-${n}/overview.tex`);
    paths.push(`/track-01/module-01/lesson-${n}/checkpoint.tex`);
  }
  paths.push(`/track-01/module-01/lesson-01/objectives.tex`);
  return paths;
}

describe("publish compiled integrity", () => {
  it("ignores main.tex/metadata and other artifacts on both sides", () => {
    expect(isNonPublishableCompileArtifact("/main.tex")).toBe(true);
    expect(isNonPublishableCompileArtifact("/main.pdf")).toBe(true);
    expect(isNonPublishableCompileArtifact("/main.log")).toBe(true);
    expect(isNonPublishableCompileArtifact("/metadata.tex")).toBe(true);
    expect(isNonPublishableCompileArtifact("/track-01/module-01/capstone.tex")).toBe(true);
    expect(isLessonOrchestrationWrapperPath("/track-01/module-01/capstone.tex")).toBe(true);
    expect(isLessonOrchestrationWrapperPath("/track-01/module-01/capstone/overview.tex")).toBe(false);
    expect(isLessonLeafDocumentPath("/track-01/module-01/capstone.tex")).toBe(false);
    expect(isLessonLeafDocumentPath("/track-01/module-01/capstone/overview.tex")).toBe(true);
    expect(isLessonCompiledDocumentPath("/metadata.tex")).toBe(false);
    expect(isLessonCompiledDocumentPath("/main.tex")).toBe(false);
    expect(isLessonCompiledDocumentPath("/track-01/module-01/capstone.tex")).toBe(false);
    expect(isLessonCompiledDocumentPath("/track-01/module-01/capstone/overview.tex")).toBe(true);
  });

  it("passes when 25 compiled leaf docs match 25 parsed identities", () => {
    const paths = twentyFiveLeafPaths();
    const compiled = compiledPackage(paths);
    const parsed = parsedWithDocs(paths.map((path) => ({ title: path, compiledSourcePath: path })));
    expect(countCompiledDocuments(compiled)).toBe(25);
    expect(() => assertPublishCompiledIntegrity(parsed, compiled)).not.toThrow();
  });

  it("does not count lesson wrappers like capstone.tex — the 26 vs 25 case", () => {
    const leaves = twentyFiveLeafPaths();
    const compiled = compiledPackage([...leaves, "/track-01/module-01/capstone.tex", "/metadata.tex", "/main.tex"]);
    const parsed = parsedWithDocs(leaves.map((path) => ({ title: path, compiledSourcePath: path })));
    expect(listPublishableCompiledPaths(compiled)).toHaveLength(25);
    expect(listPublishableCompiledPaths(compiled)).not.toContain("/track-01/module-01/capstone.tex");
    expect(() => assertPublishCompiledIntegrity(parsed, compiled)).not.toThrow();
  });

  it("matches nested track-01 paths canonically", () => {
    const compiled = compiledPackage(["track-01/module-01/lesson-01/overview.tex"]);
    const parsed = parsedWithDocs([
      { title: "Overview", compiledSourcePath: "/track-01/module-01/lesson-01/overview.tex" },
    ]);
    expect(listPublishableCompiledPaths(compiled)).toEqual(["/track-01/module-01/lesson-01/overview.tex"]);
    expect(() => assertPublishCompiledIntegrity(parsed, compiled)).not.toThrow();
  });

  it("drops untagged DSL document blocks as non-publishable orphans", () => {
    const compiled = compiledPackage(["/track-01/module-01/lesson-01/overview.tex"]);
    const parsed = parsedWithDocs([
      { title: "Overview", compiledSourcePath: "/track-01/module-01/lesson-01/overview.tex" },
      { title: "Certificate Criteria" },
      { title: "Final Exam" },
    ]);
    const dropped = dropNonPublishableDocumentBlocks(parsed, compiled);
    expect(dropped.map((d) => d.title).sort()).toEqual(["Certificate Criteria", "Final Exam"]);
    expect(() => assertPublishCompiledIntegrity(parsed, compiled)).not.toThrow();
  });

  it("fails when a real compiled document is missing from parsed, with exact path", () => {
    const compiled = compiledPackage([
      "/track-01/module-01/lesson-01/overview.tex",
      "/track-01/module-01/capstone/overview.tex",
    ]);
    const parsed = parsedWithDocs([
      { title: "Overview", compiledSourcePath: "/track-01/module-01/lesson-01/overview.tex" },
    ]);
    expect(() => assertPublishCompiledIntegrity(parsed, compiled)).toThrow(
      /Missing: \/track-01\/module-01\/capstone\/overview\.tex/
    );
  });

  it("fails clearly on duplicate canonical identities", () => {
    const compiled = compiledPackage(["/track-01/module-01/lesson-01/overview.tex"]);
    const parsed = parsedWithDocs([
      { title: "Overview A", compiledSourcePath: "/track-01/module-01/lesson-01/overview.tex" },
      { title: "Overview B", compiledSourcePath: "/track-01/module-01/lesson-01/overview.tex" },
    ]);
    expect(() => assertPublishCompiledIntegrity(parsed, compiled)).toThrow(/duplicate parsed identities/);

    const dupCompiled = compiledPackage([
      "track-01/module-01/lesson-01/overview.tex",
      "/track-01/module-01/lesson-01/overview.tex",
    ]);
    const dupParsed = parsedWithDocs([
      { title: "Overview", compiledSourcePath: "/track-01/module-01/lesson-01/overview.tex" },
    ]);
    expect(() => assertPublishCompiledIntegrity(dupParsed, dupCompiled)).toThrow(/duplicate compiled identities/);
  });

  it("excludes video-only compiled files from document comparison", () => {
    const compiled = compiledPackage(
      ["/track-01/module-01/lesson-01/overview.tex", "/track-01/module-01/lesson-01/clip.tex"],
      { "/track-01/module-01/lesson-01/clip.tex": { nodes: [{ type: "video", kind: "video" }] } }
    );
    const parsed = parsedWithDocs([
      { title: "Overview", compiledSourcePath: "/track-01/module-01/lesson-01/overview.tex" },
    ]);
    expect(listPublishableCompiledPaths(compiled)).toEqual(["/track-01/module-01/lesson-01/overview.tex"]);
    expect(() => assertPublishCompiledIntegrity(parsed, compiled)).not.toThrow();
  });
});
