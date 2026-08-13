/**
 * Self-registering renderer registry with lazy loading support.
 */

import type { QuestionRendererPlugin, LazyRendererLoader } from "../types/renderer";

export interface RendererRegistration {
  typeSlug: string;
  plugin: QuestionRendererPlugin;
  loadedAt: number;
}

const registry = new Map<string, RendererRegistration>();
const lazyRegistry = new Map<string, LazyRendererLoader>();
const loadPromises = new Map<string, Promise<QuestionRendererPlugin>>();

export function registerRenderer(plugin: QuestionRendererPlugin): void {
  registry.set(plugin.typeSlug, {
    typeSlug: plugin.typeSlug,
    plugin,
    loadedAt: performance.now(),
  });
}

export function registerLazyRenderer(typeSlug: string, loader: LazyRendererLoader): void {
  lazyRegistry.set(typeSlug, loader);
}

export function getRenderer(typeSlug: string): QuestionRendererPlugin | undefined {
  return registry.get(typeSlug)?.plugin;
}

export async function loadRenderer(typeSlug: string): Promise<QuestionRendererPlugin | undefined> {
  const existing = registry.get(typeSlug);
  if (existing) return existing.plugin;

  const loader = lazyRegistry.get(typeSlug);
  if (!loader) return undefined;

  let promise = loadPromises.get(typeSlug);
  if (!promise) {
    promise = loader().then((mod) => {
      registerRenderer(mod.default);
      return mod.default;
    });
    loadPromises.set(typeSlug, promise);
  }
  return promise;
}

export function listRenderers(): RendererRegistration[] {
  return Array.from(registry.values());
}

export function hasRenderer(typeSlug: string): boolean {
  return registry.has(typeSlug) || lazyRegistry.has(typeSlug);
}

export function listRendererTypeSlugs(): string[] {
  return [...new Set([...registry.keys(), ...lazyRegistry.keys()])];
}
