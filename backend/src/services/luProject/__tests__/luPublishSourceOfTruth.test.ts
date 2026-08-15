import { describe, it, expect } from "@jest/globals";
import {
  applyCompiledPackageToParsed,
  compileAllLessonTexFiles,
} from "../luLessonCompiler.js";
import {
  assertPublishSourceOfTruth,
  listSavedPublishableSourcePaths,
  publishedDocumentSourceTex,
} from "../luPublishSourceOfTruth.js";
import { assertPublishCompiledIntegrity, isNonPublishableCompileArtifact } from "../luPublishIntegrity.js";
import { publishFromCompiledPackage } from "../luCompiledPublish.js";
import type { ProjectFileRecord } from "../luProjectFiles.js";
import type { LuProjectJson } from "../luProjectSchema.js";
import type { ParsedLearningUniverse } from "../../../controllers/learning-universe-parser.js";
import type { LuCompiledPackage } from "../luCompiledPackageSchema.js";

function tex(path: string, content: string): ProjectFileRecord {
  return {
    id: path,
    name: path.split("/").pop() ?? path,
    path,
    isFolder: false,
    content,
  };
}

function docTex(title: string, body: string): string {
  return `\\theory{title={${title}},body={${body}}}`;
}

function projectJson(): LuProjectJson {
  return {
    version: 2,
    projectType: "learning-universe",
    metadata: { title: "Course", createdAt: "", updatedAt: "" },
    universe: { title: "Course" },
    tracks: [
      {
        id: "track-01",
        folder: "track-01",
        file: "track.tex",
        title: "Track",
        modules: [
          {
            id: "module-01",
            folder: "module-01",
            file: "module.tex",
            title: "Module",
            lessons: [
              {
                id: "lesson-01",
                file: "lesson-01.tex",
                title: "Lesson 01",
                components: [
                  {
                    id: "overview",
                    kind: "overview",
                    title: "Overview",
                    file: "/track-01/module-01/lesson-01/overview.tex",
                    order: 1,
                  },
                ],
              },
              {
                id: "capstone",
                file: "capstone.tex",
                title: "Capstone",
                components: [
                  {
                    id: "overview",
                    kind: "overview",
                    title: "Overview",
                    file: "/track-01/module-01/capstone/overview.tex",
                    order: 1,
                  },
                  {
                    id: "theory",
                    kind: "topics",
                    title: "Theory",
                    file: "/track-01/module-01/capstone/theory.tex",
                    order: 2,
                  },
                  {
                    id: "project",
                    kind: "project",
                    title: "Project",
                    file: "/track-01/module-01/capstone/project.tex",
                    order: 3,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    assets: [],
    compile: { mainFile: "/main.tex", entryPoint: "/main.tex", generatedMain: true },
    publish: {},
    versionMeta: { schemaVersion: 2 },
  };
}

function savedProject(overrides: Record<string, string> = {}): ProjectFileRecord[] {
  const files: Record<string, string> = {
    "/main.tex": "\\input{track-01/track}",
    "/metadata.tex": "\\title{Course}",
    "/track-01/track.tex": "\\track{title={Track}}\n\\input{track-01/module-01/module}",
    "/track-01/module-01/module.tex":
      "\\module{title={Module}}\n\\input{track-01/module-01/lesson-01}\n\\input{track-01/module-01/capstone}",
    "/track-01/module-01/lesson-01.tex": "\\lesson{title={Lesson 01}}\n\\input{lesson-01/overview}",
    "/track-01/module-01/lesson-01/overview.tex": docTex("Overview", "Numeric overview"),
    "/track-01/module-01/capstone.tex":
      "\\lesson{title={Capstone}}\n\\input{capstone/overview}\n\\input{capstone/theory}\n\\input{capstone/project}",
    "/track-01/module-01/capstone/overview.tex": docTex("Overview", "Capstone overview"),
    "/track-01/module-01/capstone/theory.tex": docTex("Theory", "Capstone theory"),
    "/track-01/module-01/capstone/project.tex": docTex("Project", "Capstone project"),
    "/track-01/module-01/capstone/nested/extra.tex": docTex("Extra", "Nested extra"),
    "/bibliography.bib": "@article{x,title={Y}}",
    ...overrides,
  };
  return Object.entries(files).map(([path, content]) => tex(path, content));
}

function emptyParsed(): ParsedLearningUniverse {
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
                title: "Lesson 01",
                overviewMarkdown: "OLD NUMERIC",
                contentBlocks: [
                  {
                    type: "document",
                    content: { title: "Stale", sourceTex: "OLD NUMERIC", nodes: [] },
                  },
                ],
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

const EXPECTED_DOCS = [
  "/track-01/module-01/capstone/nested/extra.tex",
  "/track-01/module-01/capstone/overview.tex",
  "/track-01/module-01/capstone/project.tex",
  "/track-01/module-01/capstone/theory.tex",
  "/track-01/module-01/lesson-01/overview.tex",
];

describe("publish source of truth — LaTeX editor", () => {
  it("TEST 1: every saved instructor document appears in compiled and published packages", () => {
    const files = savedProject();
    const saved = listSavedPublishableSourcePaths(files);
    expect(saved).toEqual(EXPECTED_DOCS);

    const { package: compiled, issues } = compileAllLessonTexFiles("p1", files, projectJson());
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(Object.keys(compiled.files).sort()).toEqual(EXPECTED_DOCS);

    const parsed = emptyParsed();
    publishFromCompiledPackage(parsed, projectJson(), compiled, files);
    expect(() => assertPublishCompiledIntegrity(parsed, compiled)).not.toThrow();
    expect(() => assertPublishSourceOfTruth(files, compiled, parsed)).not.toThrow();
  });

  it("TEST 2: named lesson wrapper is handled exactly like numeric lesson wrapper", () => {
    const files = savedProject();
    const saved = listSavedPublishableSourcePaths(files);
    expect(saved).toContain("/track-01/module-01/lesson-01/overview.tex");
    expect(saved).toContain("/track-01/module-01/capstone/overview.tex");
    expect(saved).not.toContain("/track-01/module-01/lesson-01.tex");
    expect(saved).not.toContain("/track-01/module-01/capstone.tex");

    const { package: compiled } = compileAllLessonTexFiles("p1", files, projectJson());
    expect(compiled.files["/track-01/module-01/lesson-01.tex"]).toBeUndefined();
    expect(compiled.files["/track-01/module-01/capstone.tex"]).toBeUndefined();
    expect(compiled.files["/track-01/module-01/lesson-01/overview.tex"]).toBeDefined();
    expect(compiled.files["/track-01/module-01/capstone/overview.tex"]).toBeDefined();
  });

  it("TEST 3: nested lesson/component files are preserved", () => {
    const files = savedProject();
    expect(listSavedPublishableSourcePaths(files)).toContain(
      "/track-01/module-01/capstone/nested/extra.tex"
    );
    const { package: compiled } = compileAllLessonTexFiles("p1", files, projectJson());
    const parsed = emptyParsed();
    applyCompiledPackageToParsed(parsed, projectJson(), compiled);
    expect(publishedDocumentSourceTex(parsed, "/track-01/module-01/capstone/nested/extra.tex")).toContain(
      "Nested extra"
    );
  });

  it("TEST 4: a source referenced using \\input is preserved", () => {
    const files = [
      tex("/track-01/module-01/capstone.tex", "\\lesson{title={Capstone}}\\input{overview}"),
      tex("/track-01/module-01/capstone/overview.tex", docTex("Overview", "From input")),
      tex("/main.tex", "\\input{track-01/module-01/capstone}"),
    ];
    expect(listSavedPublishableSourcePaths(files)).toEqual([
      "/track-01/module-01/capstone/overview.tex",
    ]);
    const { package: compiled } = compileAllLessonTexFiles("p1", files, projectJson());
    expect(compiled.files["/track-01/module-01/capstone/overview.tex"]?.sourceTex).toContain("From input");
  });

  it("TEST 5: compiled document missing from publish fails with the exact path", () => {
    const compiled: LuCompiledPackage = {
      version: 1,
      compiledAt: new Date().toISOString(),
      projectId: "p1",
      files: {
        "/track-01/module-01/capstone/overview.tex": {
          path: "/track-01/module-01/capstone/overview.tex",
          title: "Overview",
          sourceTex: docTex("Overview", "Hello"),
          nodes: [{ type: "text", content: "Hello" }],
          assets: [],
        },
      },
    };
    const parsed = emptyParsed();
    const files = [tex("/track-01/module-01/capstone/overview.tex", docTex("Overview", "Hello"))];
    expect(() => assertPublishSourceOfTruth(files, compiled, parsed)).toThrow(
      /\/track-01\/module-01\/capstone\/overview\.tex/
    );
  });

  it("TEST 6: compilation artifacts are excluded", () => {
    const files = savedProject();
    files.push(tex("/main.pdf", "% pdf"));
    files.push(tex("/main.log", "log"));
    const saved = listSavedPublishableSourcePaths(files);
    expect(saved).not.toContain("/main.tex");
    expect(saved).not.toContain("/metadata.tex");
    expect(saved).not.toContain("/bibliography.bib");
    expect(isNonPublishableCompileArtifact("/main.aux")).toBe(true);
    expect(isNonPublishableCompileArtifact("/main.out")).toBe(true);
    expect(isNonPublishableCompileArtifact("/main.synctex.gz")).toBe(true);
  });

  it("TEST 7: editing LaTeX, recompiling, and publishing updates published content", () => {
    const files = savedProject({
      "/track-01/module-01/capstone/theory.tex": docTex("Theory", "FIRST"),
    });
    const first = compileAllLessonTexFiles("p1", files, projectJson()).package;
    const parsed = emptyParsed();
    publishFromCompiledPackage(parsed, projectJson(), first, files);
    expect(publishedDocumentSourceTex(parsed, "/track-01/module-01/capstone/theory.tex")).toContain("FIRST");

    const edited = savedProject({
      "/track-01/module-01/capstone/theory.tex": docTex("Theory", "SECOND"),
    });
    const second = compileAllLessonTexFiles("p1", edited, projectJson()).package;
    publishFromCompiledPackage(parsed, projectJson(), second, edited);
    expect(publishedDocumentSourceTex(parsed, "/track-01/module-01/capstone/theory.tex")).toContain("SECOND");
    expect(publishedDocumentSourceTex(parsed, "/track-01/module-01/capstone/theory.tex")).not.toContain("FIRST");
  });

  it("TEST 8: an old parsed contentBlock cannot overwrite newer compiled LaTeX", () => {
    const files = savedProject({
      "/track-01/module-01/lesson-01/overview.tex": docTex("Overview", "NEW LATEX FROM EDITOR"),
    });
    const compiled = compileAllLessonTexFiles("p1", files, projectJson()).package;
    const parsed = emptyParsed();
    expect(parsed.tracks[0].modules[0].lessons[0].contentBlocks[0].content).toEqual(
      expect.objectContaining({ sourceTex: "OLD NUMERIC" })
    );
    publishFromCompiledPackage(parsed, projectJson(), compiled, files);
    expect(publishedDocumentSourceTex(parsed, "/track-01/module-01/lesson-01/overview.tex")).toContain(
      "NEW LATEX FROM EDITOR"
    );
    expect(publishedDocumentSourceTex(parsed, "/track-01/module-01/lesson-01/overview.tex")).not.toContain(
      "OLD NUMERIC"
    );
  });
});
