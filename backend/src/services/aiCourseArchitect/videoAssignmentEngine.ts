/**
 * Instructor video normalization + intelligent lesson placement for AI Architect.
 */
import path from "path";
import {
  extractYouTubeId,
  isValidYouTubeUrl,
} from "../../utils/videoSourceUtils.js";
import type { ArchitectBlueprint, ArchitectLessonBlueprint, VideoMapping } from "./types.js";

export type VideoPlacementStrategy =
  | "one-per-lesson"
  | "one-per-module"
  | "intro-only"
  | "demo-only"
  | "practical-only"
  | "ai-auto";

const UPLOAD_VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|m4v)$/i;

export function youTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function normalizeYouTubeWatchUrl(url: string): string {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url.trim();
}

export function normalizeVideoMapping(v: VideoMapping, index: number): VideoMapping | null {
  if (v.type === "youtube") {
    const rawUrl = (v.url || "").trim();
    if (!rawUrl || !isValidYouTubeUrl(rawUrl)) return null;
    const url = normalizeYouTubeWatchUrl(rawUrl);
    const youtubeId = extractYouTubeId(url)!;
    return {
      ...v,
      url,
      order: v.order ?? index,
      youtubeId,
      youtubeVideoId: youtubeId,
      youtubeVideoUrl: url,
      youtubeThumbnail: youTubeThumbnailUrl(youtubeId),
      youtubeTitle: v.title || v.youtubeTitle,
    };
  }

  const fileRef = (v.file || v.url || "").trim();
  if (!fileRef) return null;
  const basename = path.basename(fileRef.replace(/^.*\/uploads\//, "").replace(/\\/g, "/"));
  if (!UPLOAD_VIDEO_EXT.test(basename)) return null;

  return {
    ...v,
    file: basename,
    url: v.url || `/uploads/${basename}`,
    order: v.order ?? index,
    uploadedVideoPath: basename,
    uploadedVideoName: v.uploadedVideoName || v.title || basename,
  };
}

export function normalizeVideoMappings(mappings: VideoMapping[]): VideoMapping[] {
  return mappings
    .map((m, i) => normalizeVideoMapping(m, i))
    .filter((m): m is VideoMapping => m !== null);
}

export function videoMappingIdentity(v: VideoMapping): string {
  if (v.type === "youtube") {
    const id = v.youtubeId || extractYouTubeId(v.url || "") || v.url;
    return `youtube:${id}`;
  }
  const file = path.basename((v.file || v.url || "").replace(/^.*\/uploads\//, "").replace(/\\/g, "/"));
  return `upload:${file.toLowerCase()}`;
}

function parsedVideoIdentity(v: {
  type: string;
  url?: string;
  youtubeId?: string;
  file?: string;
}): string {
  if (v.type === "youtube" || (v.url && extractYouTubeId(v.url))) {
    const id = v.youtubeId || extractYouTubeId(v.url || "");
    return id ? `youtube:${id}` : `youtube:${v.url}`;
  }
  const file = path.basename((v.file || v.url || "").replace(/^.*\/uploads\//, "").replace(/\\/g, "/"));
  return `upload:${file.toLowerCase()}`;
}

function mergeVideoMappings(existing: VideoMapping[], incoming: VideoMapping[]): VideoMapping[] {
  const map = new Map<string, VideoMapping>();
  for (const v of [...existing, ...incoming]) {
    const norm = normalizeVideoMapping(v, v.order ?? map.size);
    if (norm) map.set(videoMappingIdentity(norm), norm);
  }
  return [...map.values()].sort((a, b) => {
    if (a.type === b.type) return (a.order ?? 0) - (b.order ?? 0);
    return a.type === "upload" ? -1 : 1;
  });
}

function attachToLesson(
  blueprint: ArchitectBlueprint,
  modId: string,
  lessonId: string,
  videos: VideoMapping[]
): void {
  const mod = blueprint.modules.find((m) => m.id === modId);
  const lesson = mod?.lessons.find((l) => l.id === lessonId);
  if (!lesson) return;
  const key = `${modId}:${lessonId}`;
  const merged = mergeVideoMappings(lesson.videos ?? [], videos);
  lesson.videos = merged.map((v, i) => ({
    ...v,
    moduleId: modId,
    lessonId,
    lessonKey: key,
    order: v.order ?? i,
  }));
}

function clearAllLessonVideos(blueprint: ArchitectBlueprint): void {
  for (const mod of blueprint.modules) {
    for (const lesson of mod.lessons) {
      lesson.videos = [];
    }
  }
}

function sortedPool(pool: VideoMapping[]): VideoMapping[] {
  return [...pool].sort((a, b) => {
    if (a.type === b.type) return (a.order ?? 0) - (b.order ?? 0);
    return a.type === "upload" ? -1 : 1;
  });
}

function lessonSlots(blueprint: ArchitectBlueprint, placement: VideoPlacementStrategy): Array<{ modId: string; lessonId: string }> {
  const slots: Array<{ modId: string; lessonId: string }> = [];

  if (placement === "one-per-module" || placement === "intro-only") {
    for (const mod of blueprint.modules) {
      const first = mod.lessons[0];
      if (first) slots.push({ modId: mod.id, lessonId: first.id });
    }
    return slots;
  }

  if (placement === "demo-only" || placement === "practical-only") {
    for (const mod of blueprint.modules) {
      for (const lesson of mod.lessons) {
        const t = lesson.title.toLowerCase();
        const isDemo = /demo|walkthrough|showcase|example|tutorial/i.test(t);
        const isPractical = /lab|practice|hands-on|exercise|coding|implement/i.test(t);
        if (placement === "demo-only" && isDemo) slots.push({ modId: mod.id, lessonId: lesson.id });
        if (placement === "practical-only" && isPractical) slots.push({ modId: mod.id, lessonId: lesson.id });
      }
    }
    if (slots.length) return slots;
  }

  for (const mod of blueprint.modules) {
    for (const lesson of mod.lessons) {
      slots.push({ modId: mod.id, lessonId: lesson.id });
    }
  }
  return slots;
}

function createVideoCentricLesson(index: number, video: VideoMapping): ArchitectLessonBlueprint {
  const title =
    video.title ||
    (video.type === "youtube" ? "YouTube Video Lesson" : "Instructor Video Lesson");
  const pad = String(index).padStart(2, "0");
  return {
    id: `instructor-video-${pad}`,
    title,
    durationMinutes: 15,
    introduction: `This lesson centers on the instructor-provided video: ${title}.`,
    objectives: [`Understand the concepts presented in "${title}"`],
    theory: "",
    examples: "",
    summary: `Review the key ideas from "${title}" and connect them to the module objectives.`,
    revision: "",
    videos: [],
  };
}

function ensureBlueprintCapacityForVideos(
  blueprint: ArchitectBlueprint,
  videoCount: number,
  placement: VideoPlacementStrategy
): void {
  const effectivePlacement = placement === "ai-auto" ? "one-per-lesson" : placement;
  if (effectivePlacement !== "one-per-lesson") return;

  const slots = lessonSlots(blueprint, effectivePlacement);
  if (videoCount <= slots.length) return;

  const extra = videoCount - slots.length;
  const mod = blueprint.modules[blueprint.modules.length - 1] ?? blueprint.modules[0];
  if (!mod) return;

  for (let i = 0; i < extra; i++) {
    mod.lessons.push(createVideoCentricLesson(slots.length + i + 1, { title: `Instructor Video ${slots.length + i + 1}` } as VideoMapping));
  }
}

function pairUploadAndYouTubeOnSlots(
  blueprint: ArchitectBlueprint,
  slots: Array<{ modId: string; lessonId: string }>,
  pool: VideoMapping[]
): void {
  const uploads = pool.filter((v) => v.type === "upload");
  const youtubes = pool.filter((v) => v.type === "youtube");
  let ui = 0;
  let yi = 0;
  for (let si = 0; si < slots.length && (ui < uploads.length || yi < youtubes.length); si++) {
    const batch: VideoMapping[] = [];
    if (ui < uploads.length) batch.push(uploads[ui++]);
    if (yi < youtubes.length) batch.push(youtubes[yi++]);
    if (batch.length) {
      attachToLesson(blueprint, slots[si].modId, slots[si].lessonId, batch);
    }
  }
  while (ui < uploads.length || yi < youtubes.length) {
    const si = slots[(ui + yi - 1) % slots.length] ?? slots[0];
    if (!si) break;
    const batch: VideoMapping[] = [];
    if (ui < uploads.length) batch.push(uploads[ui++]);
    if (yi < youtubes.length) batch.push(youtubes[yi++]);
    if (batch.length) {
      attachToLesson(blueprint, si.modId, si.lessonId, batch);
    }
  }
}

export function assignVideosToLessons(
  blueprint: ArchitectBlueprint,
  videoPool: VideoMapping[],
  placement: VideoPlacementStrategy = "ai-auto"
): ArchitectBlueprint {
  const pool = sortedPool(normalizeVideoMappings(videoPool));
  if (!pool.length) return blueprint;

  const updated = structuredClone(blueprint);
  clearAllLessonVideos(updated);

  const byLessonKey = new Map<string, VideoMapping[]>();
  for (const v of pool) {
    if (v.moduleId && v.lessonId) {
      const key = `${v.moduleId}:${v.lessonId}`;
      const list = byLessonKey.get(key) ?? [];
      list.push(v);
      byLessonKey.set(key, list);
    }
  }

  if (byLessonKey.size > 0) {
    for (const [key, mapped] of byLessonKey) {
      const [modId, lessonId] = key.split(":");
      attachToLesson(updated, modId, lessonId, mapped);
    }
    return updated;
  }

  const effectivePlacement = placement === "ai-auto" ? "one-per-lesson" : placement;
  ensureBlueprintCapacityForVideos(updated, pool.length, effectivePlacement);

  const slots = lessonSlots(updated, effectivePlacement);
  if (!slots.length) return updated;

  const hasMixed =
    pool.some((v) => v.type === "upload") && pool.some((v) => v.type === "youtube");

  if (hasMixed && effectivePlacement !== "one-per-lesson") {
    pairUploadAndYouTubeOnSlots(updated, slots, pool);
    return updated;
  }

  let vi = 0;
  for (const slot of slots) {
    if (vi >= pool.length) break;
    attachToLesson(updated, slot.modId, slot.lessonId, [pool[vi++]]);
  }

  return updated;
}

export function validateVideoMappingsForPublish(mappings: VideoMapping[]): string[] {
  const issues: string[] = [];
  const normalized = normalizeVideoMappings(mappings);
  if (mappings.length > 0 && normalized.length < mappings.length) {
    issues.push(
      `${mappings.length - normalized.length} video(s) failed validation (invalid YouTube URL or unsupported upload format)`
    );
  }
  for (const v of mappings) {
    if (v.type === "youtube") {
      if (!v.url || !isValidYouTubeUrl(v.url)) {
        issues.push(`Invalid YouTube URL: ${v.title || v.url || "unknown"}`);
      }
    } else if (v.type === "upload") {
      const ref = v.file || v.url || "";
      if (!ref.trim()) issues.push(`Missing upload file for: ${v.title || "uploaded video"}`);
      else if (!UPLOAD_VIDEO_EXT.test(path.basename(ref))) {
        issues.push(`Unsupported upload format: ${path.basename(ref)}`);
      }
    }
  }
  return issues;
}

/** Ensure parsed publish payload includes every instructor video from AI Architect metadata. */
export function injectVideosIntoParsedUniverse(
  parsed: {
    tracks: Array<{
      modules: Array<{
        lessons: Array<{
          title: string;
          videos: Array<{ type: string; url: string; title?: string; youtubeId?: string; file?: string }>;
          contentBlocks: Array<{ type: string; content: unknown }>;
        }>;
      }>;
    }>;
  },
  mappings: VideoMapping[],
  placement: VideoPlacementStrategy = "ai-auto"
): void {
  const pool = normalizeVideoMappings(mappings);
  if (!pool.length) return;

  type LessonRef = (typeof parsed.tracks)[0]["modules"][0]["lessons"][0];
  const allLessons: LessonRef[] = [];
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        allLessons.push(lesson);
      }
    }
  }
  if (!allLessons.length) return;

  const presentIds = new Set<string>();
  for (const lesson of allLessons) {
    for (const v of lesson.videos) {
      presentIds.add(parsedVideoIdentity(v));
    }
  }

  const missing = pool.filter((v) => !presentIds.has(videoMappingIdentity(v)));
  if (!missing.length) return;

  const assignToLesson = (lesson: LessonRef, v: VideoMapping) => {
    const url = v.url || v.file || "";
    if (!url) return;
    const youtubeId = v.type === "youtube" ? extractYouTubeId(url) : undefined;
    const video = {
      type: v.type === "youtube" ? "youtube" : "upload",
      url: v.type === "youtube" ? normalizeYouTubeWatchUrl(url) : url,
      title: v.title || (v.type === "youtube" ? "YouTube Video" : "Instructor Video"),
      ...(youtubeId ? { youtubeId } : {}),
      ...(v.type === "upload" && v.file ? { file: v.file } : {}),
    };
    lesson.videos.push(video);
    lesson.contentBlocks.push({ type: "video", content: video });
    presentIds.add(videoMappingIdentity(v));
  };

  const effectivePlacement = placement === "ai-auto" ? "one-per-lesson" : placement;

  const emptyLessons = () => allLessons.filter((l) => l.videos.length === 0);

  if (
    missing.some((v) => v.type === "upload") &&
    missing.some((v) => v.type === "youtube") &&
    effectivePlacement !== "one-per-lesson"
  ) {
    const uploads = missing.filter((v) => v.type === "upload");
    const youtubes = missing.filter((v) => v.type === "youtube");
    let ui = 0;
    let yi = 0;
    const slotLessons = emptyLessons().length ? emptyLessons() : allLessons;
    for (let si = 0; si < slotLessons.length && (ui < uploads.length || yi < youtubes.length); si++) {
      if (ui < uploads.length) assignToLesson(slotLessons[si], uploads[ui++]);
      if (yi < youtubes.length) assignToLesson(slotLessons[si], youtubes[yi++]);
    }
    for (const v of [...uploads.slice(ui), ...youtubes.slice(yi)]) {
      const target = emptyLessons()[0] ?? allLessons[allLessons.length - 1];
      if (target) assignToLesson(target, v);
    }
    return;
  }

  let slotLessons = allLessons;
  if (effectivePlacement === "one-per-module" || effectivePlacement === "intro-only") {
    const picked: LessonRef[] = [];
    const seen = new Set<string>();
    for (const track of parsed.tracks) {
      for (const mod of track.modules) {
        const first = mod.lessons[0];
        if (first && !seen.has(first.title)) {
          seen.add(first.title);
          picked.push(first);
        }
      }
    }
    if (picked.length) slotLessons = picked;
  }

  const preferEmpty = effectivePlacement === "one-per-lesson";
  let slotIdx = 0;
  for (const v of missing) {
    const empty = emptyLessons();
    const target =
      preferEmpty && empty.length > 0
        ? empty[0]
        : slotLessons[slotIdx % slotLessons.length];
    if (!target) break;
    assignToLesson(target, v);
    slotIdx++;
  }
}

export function readArchitectVideoMappings(structuredData: unknown): VideoMapping[] {
  if (!structuredData || typeof structuredData !== "object" || Array.isArray(structuredData)) return [];
  const sd = structuredData as Record<string, unknown>;
  const ai = sd.aiArchitect as Record<string, unknown> | undefined;
  const interview = (ai?.interview ?? sd.interview) as Record<string, unknown> | undefined;
  const videoStrategy = interview?.videoStrategy as { mappings?: VideoMapping[]; placement?: VideoPlacementStrategy } | undefined;
  return normalizeVideoMappings(videoStrategy?.mappings ?? []);
}

export function readArchitectVideoPlacement(structuredData: unknown): VideoPlacementStrategy {
  if (!structuredData || typeof structuredData !== "object" || Array.isArray(structuredData)) return "ai-auto";
  const sd = structuredData as Record<string, unknown>;
  const ai = sd.aiArchitect as Record<string, unknown> | undefined;
  const interview = (ai?.interview ?? sd.interview) as Record<string, unknown> | undefined;
  const placement = (interview?.videoStrategy as { placement?: VideoPlacementStrategy } | undefined)?.placement;
  return placement ?? "ai-auto";
}
