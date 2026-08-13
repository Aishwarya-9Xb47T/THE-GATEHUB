import type { LiveSessionSettings } from "./types.js";

export type PaceMode = "self_paced" | "instructor_paced";

export function resolvePaceMode(settings: LiveSessionSettings, sessionType?: string): PaceMode {
  if (settings.paceMode === "instructor_paced" || settings.paceMode === "self_paced") {
    return settings.paceMode;
  }
  if (sessionType === "tournament") {
    return "instructor_paced";
  }
  return "self_paced";
}

export function isSelfPaced(settings: LiveSessionSettings, sessionType?: string): boolean {
  return resolvePaceMode(settings, sessionType) === "self_paced";
}
