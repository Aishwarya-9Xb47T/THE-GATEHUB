/**
 * Importer Plugin System
 * Standardized interface for registering source format parsers 
 * (DOCX, PDF, PPTX, HTML, Markdown, Scanned Images, Moodle, Canvas).
 */

import { RawContent, SourceType } from '../unifiedTypes.js';

export interface ImporterPlugin {
  name: string;
  supportedExtensions: string[];
  supportedMimeTypes: string[];
  extract(buffer: Buffer, fileName: string, mimeType: string): Promise<RawContent>;
}

export class ImporterPluginRegistry {
  private static plugins: Map<string, ImporterPlugin> = new Map();

  /**
   * Register an importer plugin
   */
  static registerPlugin(plugin: ImporterPlugin): void {
    this.plugins.set(plugin.name, plugin);
    console.log(`[ImporterPluginRegistry] Registered plugin: ${plugin.name} (${plugin.supportedExtensions.join(', ')})`);
  }

  /**
   * Find plugin by file extension or MIME type
   */
  static findPlugin(fileName: string, mimeType: string): ImporterPlugin | null {
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    for (const plugin of this.plugins.values()) {
      if (plugin.supportedExtensions.includes(ext) || plugin.supportedMimeTypes.includes(mimeType)) {
        return plugin;
      }
    }
    return null;
  }

  /**
   * List all registered plugins
   */
  static getRegisteredPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }
}
