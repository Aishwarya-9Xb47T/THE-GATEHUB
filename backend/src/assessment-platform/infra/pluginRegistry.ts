/**
 * Central plugin registry — no switch statements in core paths.
 */

import type { AssessmentPlugin, PluginCategory } from "../domain/plugins.js";
import { AppError } from "../../middlewares/errorHandler.js";

const store = new Map<PluginCategory, Map<string, AssessmentPlugin>>();

export function registerPlugin(plugin: AssessmentPlugin): void {
  const cat = plugin.category;
  if (!store.has(cat)) store.set(cat, new Map());
  store.get(cat)!.set(plugin.key, plugin);
}

export function getPlugin<T extends AssessmentPlugin>(
  category: PluginCategory,
  key: string
): T | undefined {
  return store.get(category)?.get(key) as T | undefined;
}

export function requirePlugin<T extends AssessmentPlugin>(
  category: PluginCategory,
  key: string
): T {
  const plugin = getPlugin<T>(category, key);
  if (!plugin) {
    throw new AppError(500, `Plugin not registered: ${category}/${key}`);
  }
  return plugin;
}

export function listPlugins(category: PluginCategory): string[] {
  return [...(store.get(category)?.keys() ?? [])];
}

export function hasPlugin(category: PluginCategory, key: string): boolean {
  return store.get(category)?.has(key) ?? false;
}
