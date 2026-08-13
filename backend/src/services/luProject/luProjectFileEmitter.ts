import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import type { LuProjectJson, LuProjectLessonRef, LuProjectModuleRef, LuProjectTrackRef } from "./luProjectSchema.js";
import { createEmptyLuProject } from "./luProjectSchema.js";
import { emitLessonBodyBlocks } from "../learningUniverseDslEmitter.js";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function emitLessonFile(lessonTitle: string, body = ""): string {
  let out = `\\lesson{title={${lessonTitle}}}\n\n`;
  if (body.trim()) out += body.trim() + "\n";
  return out.trim() + "\n";
}

function emitModuleFile(
  mod: { title: string; description?: string; prerequisites?: string; learningOutcomes?: string; estimatedHours?: number },
  lessonInputs: string[]
): string {
  const inputs = lessonInputs.map((p) => `\\input{${p}}`).join("\n");
  return `\\module{
title={${mod.title}},
description={${mod.description || ""}},
prerequisites={${mod.prerequisites || ""}},
learningOutcomes={${mod.learningOutcomes || ""}},
estimatedHours={${mod.estimatedHours ?? 0}},

${inputs}
}
`;
}

function emitTrackFile(
  track: { title: string; description?: string; learningOutcomes?: string; careerOutcomes?: string; difficulty?: string },
  moduleInputs: string[]
): string {
  const inputs = moduleInputs.map((p) => `\\input{${p}}`).join("\n");
  return `\\track{
title={${track.title}},
description={${track.description || ""}},
learningOutcomes={${track.learningOutcomes || ""}},
careerOutcomes={${track.careerOutcomes || ""}},
difficulty={${track.difficulty || ""}},

${inputs}
}
`;
}

function emitMetadataFile(parsed: ParsedLearningUniverse): string {
  const u = parsed.universe;
  const skills = u.skills?.join(",") || "";
  return `\\learninguniverse{
title={${u.title}},
description={${u.description || ""}},
difficulty={${u.difficulty || "Beginner"}},
estimatedHours={${u.estimatedHours ?? 0}},
skills={${skills}}
}
`;
}

export interface LuProjectFileEntry {
  path: string;
  name: string;
  isFolder: boolean;
  content: string;
}

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

export function buildLuProjectFilesFromParsed(
  parsed: ParsedLearningUniverse,
  title: string
): { project: LuProjectJson; files: LuProjectFileEntry[] } {
  const project = createEmptyLuProject(title);
  project.universe = {
    title: parsed.universe.title,
    description: parsed.universe.description,
    difficulty: parsed.universe.difficulty,
    estimatedHours: parsed.universe.estimatedHours,
    skills: parsed.universe.skills,
  };

  const files: LuProjectFileEntry[] = [];
  const tracks: LuProjectTrackRef[] = [];

  for (let ti = 0; ti < parsed.tracks.length; ti++) {
    const track = parsed.tracks[ti];
    const trackId = `track-${pad2(ti + 1)}`;
    const trackFolder = trackId;
    const modules: LuProjectModuleRef[] = [];
    const moduleInputs: string[] = [];

    for (let mi = 0; mi < track.modules.length; mi++) {
      const mod = track.modules[mi];
      const modId = `module-${pad2(mi + 1)}`;
      const modFolder = modId;
      const lessons: LuProjectLessonRef[] = [];
      const lessonInputs: string[] = [];

      for (let li = 0; li < mod.lessons.length; li++) {
        const lesson = mod.lessons[li];
        const lessonId = `lesson-${pad2(li + 1)}`;
        const lessonFile = `${lessonId}.tex`;
        const lessonPath = `/${trackFolder}/${modFolder}/${lessonFile}`;
        const inputRef = `${trackFolder}/${modFolder}/${lessonId}`;

        lessons.push({ id: lessonId, file: lessonFile, title: lesson.title });

        const body = emitLessonBodyBlocks({
          title: lesson.title,
          overviewMarkdown: lesson.overviewMarkdown,
          contentBlocks: lesson.contentBlocks as Array<{ type: string; content: unknown }>,
        });

        files.push({
          path: lessonPath,
          name: lessonFile,
          isFolder: false,
          content: emitLessonFile(lesson.title, body),
        });
        lessonInputs.push(inputRef);
      }

      const modPath = `/${trackFolder}/${modFolder}/module.tex`;
      modules.push({
        id: modId,
        folder: modFolder,
        file: "module.tex",
        title: mod.title,
        lessons,
      });

      files.push({
        path: modPath,
        name: "module.tex",
        isFolder: false,
        content: emitModuleFile(mod, lessonInputs),
      });
      moduleInputs.push(`${trackFolder}/${modFolder}/module`);
    }

    const trackPath = `/${trackFolder}/track.tex`;
    tracks.push({
      id: trackId,
      folder: trackFolder,
      file: "track.tex",
      title: track.title,
      description: track.description,
      modules,
    });

    files.push({
      path: trackPath,
      name: "track.tex",
      isFolder: false,
      content: emitTrackFile(track, moduleInputs),
    });
  }

  project.tracks = tracks.length > 0 ? tracks : project.tracks;

  files.push({
    path: "/metadata.tex",
    name: "metadata.tex",
    isFolder: false,
    content: emitMetadataFile(parsed),
  });

  for (const folder of ASSET_FOLDERS) {
    files.push({
      path: folder,
      name: folder.split("/").pop() || folder,
      isFolder: true,
      content: "",
    });
  }

  files.push({
    path: "/bibliography.bib",
    name: "bibliography.bib",
    isFolder: false,
    content: "",
  });

  return { project, files };
}

export function buildScaffoldV2Files(title: string): { project: LuProjectJson; files: LuProjectFileEntry[] } {
  const project = createEmptyLuProject(title);
  project.universe = {
    title,
    description: "",
    difficulty: "Beginner",
    estimatedHours: 0,
    skills: [],
  };

  const files: LuProjectFileEntry[] = [
    {
      path: "/metadata.tex",
      name: "metadata.tex",
      isFolder: false,
      content: `\\learninguniverse{
title={${title}},
description={},
difficulty={Beginner},
estimatedHours={0},
skills={}
}
`,
    },
    {
      path: "/bibliography.bib",
      name: "bibliography.bib",
      isFolder: false,
      content: "",
    },
  ];

  for (const folder of ASSET_FOLDERS) {
    files.push({
      path: folder,
      name: folder.split("/").pop() || folder,
      isFolder: true,
      content: "",
    });
  }

  return { project, files };
}
