import { describe, it, expect } from "@jest/globals";
import {
  assertPublishCompiledIntegrity,
  countCompiledDocuments,
  dropNonPublishableDocumentBlocks,
  isLessonCompiledDocumentPath,
  listPublishableCompiledPaths,
} from "../luPublishIntegrity.js";
import type { LuCompiledPackage } from "../luCompiledPackageSchema.js";
import type { ParsedLearningUniverse } from "../../../controllers/learning-universe-parser.js";

function compiledPackage(paths: string[]): LuCompiledPackage {
  const files: LuCompiledPackage["files"] = {};
  for (const path of paths) {
    files[path] = {
      path,
      title: path.split("/").pop()?.replace(/\.tex$/i, "") ?? path,
      sourceTex: "\\theory{title={Doc},body={Hello}}",
      nodes: [{ type: "text", content: "Hello" }],
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

describe("publish compiled integrity", () => {
  it("counts compiled docs outside /lesson-N/ folders", () => {
    expect(isLessonCompiledDocumentPath("/track-01/module-01/capstone/overview.tex")).toBe(true);
    expect(isLessonCompiledDocumentPath("/track-01/module-01/lesson-01/overview.tex")).toBe(true);
    expect(isLessonCompiledDocumentPath("/metadata.tex")).toBe(false);

    const compiled = compiledPackage([
      "/track-01/module-01/lesson-01/overview.tex",
      "/track-01/module-01/capstone/overview.tex",
      "/track-01/module-01/intro/objectives.tex",
      "/track-01/module-02/exam/checkpoint.tex",
      "/metadata.tex",
    ]);
    expect(listPublishableCompiledPaths(compiled)).toEqual([
      "/track-01/module-01/capstone/overview.tex",
      "/track-01/module-01/intro/objectives.tex",
      "/track-01/module-01/lesson-01/overview.tex",
      "/track-01/module-02/exam/checkpoint.tex",
    ]);
    expect(countCompiledDocuments(compiled)).toBe(4);
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
    expect(parsed.tracks[0].modules[0].lessons[0].contentBlocks).toHaveLength(1);
    expect(() => assertPublishCompiledIntegrity(parsed, compiled)).not.toThrow();
  });

  it("fails when a compiled file has no matching persisted document", () => {
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
});
