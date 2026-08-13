/**
 * Overlay plugin registry — Learning Overlay Layer.
 */

import type { AssessmentMode } from "../types";
import type { OverlayPlugin } from "../types/overlay";

const registry = new Map<string, OverlayPlugin>();

export function registerOverlay(plugin: OverlayPlugin): void {
  registry.set(plugin.id, plugin);
}

export function getOverlay(id: string): OverlayPlugin | undefined {
  return registry.get(id);
}

export function listOverlays(): OverlayPlugin[] {
  return Array.from(registry.values()).sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
  );
}

export function listOverlaysForMode(mode: AssessmentMode): OverlayPlugin[] {
  return listOverlays().filter(
    (o) => !o.enabledModes || o.enabledModes.includes(mode)
  );
}

export function getDefaultOverlaysForMode(mode: AssessmentMode): string[] {
  return listOverlaysForMode(mode)
    .filter((o) => o.defaultEnabledModes?.includes(mode))
    .map((o) => o.id);
}

export function hasOverlay(id: string): boolean {
  return registry.has(id);
}
