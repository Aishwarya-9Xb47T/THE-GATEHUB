import type { LearningUniverseStructured } from "../learningUniverseSchema.js";

export interface LuSearchIndexEntry {
  type: "universe" | "track" | "module" | "lesson";
  id: string;
  title: string;
  path: string;
  parentId?: string;
  keywords: string[];
}

export interface LuSearchIndex {
  generatedAt: string;
  entries: LuSearchIndexEntry[];
}

export function generateLuSearchIndex(structured: LearningUniverseStructured): LuSearchIndex {
  const entries: LuSearchIndexEntry[] = [];
  const u = structured.universe;

  entries.push({
    type: "universe",
    id: "universe",
    title: u.title,
    path: "/",
    keywords: [u.title, u.description || "", ...(u.skills || [])].filter(Boolean),
  });

  structured.tracks.forEach((track, ti) => {
    const trackId = `track-${ti}`;
    entries.push({
      type: "track",
      id: trackId,
      title: track.title,
      path: `/tracks/${trackId}`,
      keywords: [track.title, track.description || ""],
    });

    track.modules.forEach((mod, mi) => {
      const modId = `${trackId}-module-${mi}`;
      entries.push({
        type: "module",
        id: modId,
        title: mod.title,
        path: `/tracks/${trackId}/modules/${modId}`,
        parentId: trackId,
        keywords: [mod.title, mod.description || ""],
      });

      mod.lessons.forEach((lesson, li) => {
        const lessonId = `${modId}-lesson-${li}`;
        entries.push({
          type: "lesson",
          id: lessonId,
          title: lesson.title,
          path: `/tracks/${trackId}/modules/${modId}/lessons/${lessonId}`,
          parentId: modId,
          keywords: [lesson.title].filter(Boolean),
        });
      });
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    entries,
  };
}

export interface LuStudentPackage {
  generatedAt: string;
  universeTitle: string;
  trackCount: number;
  moduleCount: number;
  lessonCount: number;
}

export function generateStudentPackage(structured: LearningUniverseStructured): LuStudentPackage {
  let moduleCount = 0;
  let lessonCount = 0;
  for (const track of structured.tracks) {
    moduleCount += track.modules.length;
    for (const mod of track.modules) {
      lessonCount += mod.lessons.length;
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    universeTitle: structured.universe.title,
    trackCount: structured.tracks.length,
    moduleCount,
    lessonCount,
  };
}

export interface LuAnalyticsMetadata {
  generatedAt: string;
  contentStats: {
    tracks: number;
    modules: number;
    lessons: number;
    quizzes: number;
    projects: number;
    videos: number;
  };
}

export function generateAnalyticsMetadata(structured: LearningUniverseStructured): LuAnalyticsMetadata {
  let modules = 0;
  let lessons = 0;
  let quizzes = 0;
  let projects = 0;
  let videos = 0;

  for (const track of structured.tracks) {
    modules += track.modules.length;
    for (const mod of track.modules) {
      lessons += mod.lessons.length;
      for (const lesson of mod.lessons) {
        if (lesson.quiz?.questions?.length) quizzes++;
        if (lesson.project) projects++;
        videos += lesson.videos?.length || 0;
        for (const block of lesson.contentBlocks) {
          if (block.type === "quiz") quizzes++;
          if (block.type === "project") projects++;
          if (block.type === "video") videos++;
        }
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    contentStats: {
      tracks: structured.tracks.length,
      modules,
      lessons,
      quizzes,
      projects,
      videos,
    },
  };
}
