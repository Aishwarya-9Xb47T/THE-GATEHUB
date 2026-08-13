/**
 * Learning Universe 2.0 — project.json schema (single source of truth).
 */

export const LU_PROJECT_JSON_PATH = "/project.json";
export const LU_LEGACY_BACKUP_PATH = "/legacy-backup/original-main.tex";
export const LU_SCHEMA_VERSION = 2;
export const LU_PIPELINE_VERSION = "1.0.0";

export interface LuProjectLessonRef {
  id: string;
  file: string;
  title: string;
  /** Explicit lesson content — explorer reads this, not .tex inference */
  components?: Array<{
    id: string;
    kind: string;
    title: string;
    /** Owned .tex file path (e.g. /track-01/module-01/lesson-01/quiz-01.tex) */
    file?: string;
    config?: Record<string, unknown>;
    order?: number;
    children?: Array<{
      id: string;
      kind: string;
      title: string;
      file?: string;
      config?: Record<string, unknown>;
    }>;
  }>;
}

export interface LuProjectModuleRef {
  id: string;
  folder: string;
  file: string;
  title: string;
  lessons: LuProjectLessonRef[];
}

export interface LuProjectTrackRef {
  id: string;
  folder: string;
  file: string;
  title: string;
  description?: string;
  modules: LuProjectModuleRef[];
}

export interface LuProjectAssetRef {
  id: string;
  path: string;
  filename: string;
  mimeType?: string;
  category?: "images" | "videos" | "pdf" | "downloads" | "datasets" | "thumbnails" | "other";
}

export interface LuProjectJson {
  version: number;
  projectType: "learning-universe";
  metadata: {
    title: string;
    createdAt: string;
    updatedAt: string;
    migratedFrom?: "single-file";
    migrationBackupPath?: string;
    /** Transaction engine migration — bumped once on first load after upgrade. */
    txEngineVersion?: number;
    txEngineMigratedAt?: string;
  };
  universe: {
    title?: string;
    description?: string;
    difficulty?: string;
    estimatedHours?: number;
    skills?: string[];
    category?: string;
  };
  tracks: LuProjectTrackRef[];
  assets: LuProjectAssetRef[];
  compile: {
    mainFile: string;
    entryPoint: string;
    generatedMain: boolean;
  };
  publish: {
    lastPublishedAt?: string;
    lastPipelineVersion?: string;
  };
  versionMeta: {
    schemaVersion: number;
    lastMainTexHash?: string;
  };
}

export function createEmptyLuProject(title: string): LuProjectJson {
  const now = new Date().toISOString();
  return {
    version: LU_SCHEMA_VERSION,
    projectType: "learning-universe",
    metadata: {
      title,
      createdAt: now,
      updatedAt: now,
    },
    universe: {
      title,
      description: "",
      difficulty: "Beginner",
      estimatedHours: 0,
      skills: [],
    },
    tracks: [],
    assets: [],
    compile: {
      mainFile: "main.tex",
      entryPoint: "main.tex",
      generatedMain: true,
    },
    publish: {},
    versionMeta: {
      schemaVersion: LU_SCHEMA_VERSION,
    },
  };
}

export function parseLuProjectJson(raw: string): LuProjectJson {
  const data = JSON.parse(raw) as LuProjectJson;
  if (!data || data.projectType !== "learning-universe") {
    throw new Error("Invalid project.json: projectType must be learning-universe");
  }
  if (!Array.isArray(data.tracks)) {
    throw new Error("Invalid project.json: tracks must be an array");
  }
  return data;
}
