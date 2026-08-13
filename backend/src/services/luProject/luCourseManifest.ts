/**
 * Course manifest — single compile-time inventory of every asset in an LU v2 project.
 */
import type { LuProjectJson } from "./luProjectSchema.js";
import type { ProjectFileRecord } from "./luProjectFiles.js";
import { normalizeProjectPath } from "./luProjectFiles.js";

export const LU_COURSE_MANIFEST_PATH = "/course.manifest.json";

export interface ManifestComponentRef {
  id: string;
  kind: string;
  title: string;
  file: string;
  lessonId: string;
  moduleId: string;
  trackId: string;
}

export interface ManifestLessonRef {
  id: string;
  title: string;
  file: string;
  moduleId: string;
  trackId: string;
  components: ManifestComponentRef[];
}

export interface ManifestModuleRef {
  id: string;
  title: string;
  file: string;
  trackId: string;
  lessons: ManifestLessonRef[];
}

export interface ManifestTrackRef {
  id: string;
  title: string;
  file: string;
  modules: ManifestModuleRef[];
}

export interface LuCourseManifest {
  version: 1;
  projectId: string;
  title: string;
  generatedAt: string;
  tracks: ManifestTrackRef[];
  modules: ManifestModuleRef[];
  lessons: ManifestLessonRef[];
  components: ManifestComponentRef[];
  quizzes: ManifestComponentRef[];
  labs: ManifestComponentRef[];
  projects: ManifestComponentRef[];
  videos: ManifestComponentRef[];
  images: string[];
  diagrams: string[];
  references: ManifestComponentRef[];
  texFiles: string[];
  assets: string[];
}

export function buildCourseManifest(
  projectId: string,
  project: LuProjectJson,
  files: ProjectFileRecord[]
): LuCourseManifest {
  const tracks: ManifestTrackRef[] = [];
  const modules: ManifestModuleRef[] = [];
  const lessons: ManifestLessonRef[] = [];
  const components: ManifestComponentRef[] = [];
  const quizzes: ManifestComponentRef[] = [];
  const labs: ManifestComponentRef[] = [];
  const projects: ManifestComponentRef[] = [];
  const videos: ManifestComponentRef[] = [];
  const references: ManifestComponentRef[] = [];

  for (const track of project.tracks) {
    const trackModules: ManifestModuleRef[] = [];
    for (const mod of track.modules) {
      const modLessons: ManifestLessonRef[] = [];
      for (const lesson of mod.lessons) {
        const lessonComponents: ManifestComponentRef[] = [];
        for (const comp of lesson.components ?? []) {
          const ref: ManifestComponentRef = {
            id: comp.id,
            kind: comp.kind,
            title: comp.title,
            file: comp.file || "",
            lessonId: lesson.id,
            moduleId: mod.id,
            trackId: track.id,
          };
          lessonComponents.push(ref);
          components.push(ref);
          if (comp.kind === "quiz") quizzes.push(ref);
          if (comp.kind === "coding-lab") labs.push(ref);
          if (comp.kind === "project") projects.push(ref);
          if (comp.kind === "video" || comp.id === "videos") videos.push(ref);
          if (comp.kind === "references") references.push(ref);
          for (const child of comp.children ?? []) {
            const childRef: ManifestComponentRef = {
              id: child.id,
              kind: child.kind,
              title: child.title,
              file: child.file || "",
              lessonId: lesson.id,
              moduleId: mod.id,
              trackId: track.id,
            };
            lessonComponents.push(childRef);
            components.push(childRef);
          }
        }
        const lessonRef: ManifestLessonRef = {
          id: lesson.id,
          title: lesson.title,
          file: normalizeProjectPath(`/${track.folder}/${mod.folder}/${lesson.file}`),
          moduleId: mod.id,
          trackId: track.id,
          components: lessonComponents,
        };
        modLessons.push(lessonRef);
        lessons.push(lessonRef);
      }
      const modRef: ManifestModuleRef = {
        id: mod.id,
        title: mod.title,
        file: normalizeProjectPath(`/${track.folder}/${mod.folder}/${mod.file}`),
        trackId: track.id,
        lessons: modLessons,
      };
      trackModules.push(modRef);
      modules.push(modRef);
    }
    tracks.push({
      id: track.id,
      title: track.title,
      file: normalizeProjectPath(`/${track.folder}/${track.file}`),
      modules: trackModules,
    });
  }

  const texFiles = files
    .filter((f) => !f.isFolder && f.path.endsWith(".tex"))
    .map((f) => f.path);

  const images = files
    .filter(
      (f) =>
        !f.isFolder &&
        /\.(png|jpe?g|gif|webp|svg)$/i.test(f.path)
    )
    .map((f) => f.path);

  const assets = (project.assets ?? []).map((a) => a.path);

  return {
    version: 1,
    projectId,
    title: project.metadata.title,
    generatedAt: new Date().toISOString(),
    tracks,
    modules,
    lessons,
    components,
    quizzes,
    labs,
    projects,
    videos,
    images,
    diagrams: images.filter((p) => /diagram|figure|chart/i.test(p)),
    references,
    texFiles,
    assets,
  };
}
