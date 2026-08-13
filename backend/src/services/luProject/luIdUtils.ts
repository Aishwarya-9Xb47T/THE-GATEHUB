import type { LuProjectLessonRef, LuProjectModuleRef, LuProjectTrackRef } from "./luProjectSchema.js";
import type { LuLessonComponentRef } from "./luLessonComponents.js";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function maxNumericSuffix(ids: string[], prefix: string): number {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of ids) {
    const m = id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

export function nextTrackId(tracks: LuProjectTrackRef[]): string {
  return `track-${pad2(maxNumericSuffix(tracks.map((t) => t.id), "track") + 1)}`;
}

export function nextModuleId(modules: LuProjectModuleRef[]): string {
  return `module-${pad2(maxNumericSuffix(modules.map((m) => m.id), "module") + 1)}`;
}

export function nextLessonId(lessons: LuProjectLessonRef[]): string {
  return `lesson-${pad2(maxNumericSuffix(lessons.map((l) => l.id), "lesson") + 1)}`;
}

export function nextComponentId(components: LuLessonComponentRef[], kind: string): string {
  const ids = components.map((c) => c.id);
  let max = maxNumericSuffix(ids, kind);
  for (const c of components) {
    if (c.id === kind) max = Math.max(max, 1);
  }
  return `${kind}-${pad2(max + 1)}`;
}

export function nextChildId(children: LuLessonComponentRef[], prefix: string): string {
  return `${prefix}-${pad2(maxNumericSuffix(children.map((c) => c.id), prefix) + 1)}`;
}
