/**
 * ContentSourceAdapterFactory
 * 
 * Factory for creating the appropriate content source adapter based on the source type.
 */

import { ContentSourceAdapter, SourceData, AssessmentDocument } from './ContentSourceAdapter.js';

class ContentSourceAdapterFactory {
  private adapters: Map<string, ContentSourceAdapter> = new Map();
  
  /**
   * Register a content source adapter
   */
  register(adapter: ContentSourceAdapter): void {
    if (this.adapters.has(adapter.adapterId)) {
      console.warn(`Adapter ${adapter.adapterId} is already registered. Overwriting.`);
    }
    this.adapters.set(adapter.adapterId, adapter);
  }
  
  /**
   * Get an adapter by ID
   */
  get(adapterId: string): ContentSourceAdapter | undefined {
    return this.adapters.get(adapterId);
  }
  
  /**
   * Get all registered adapters
   */
  getAll(): ContentSourceAdapter[] {
    return Array.from(this.adapters.values());
  }
  
  /**
   * Automatically select the appropriate adapter for the given source data
   */
  selectAdapter(sourceData: SourceData): ContentSourceAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(sourceData)) {
        return adapter;
      }
    }
    return undefined;
  }
  
  /**
   * Process content using the appropriate adapter
   */
  async process(sourceData: SourceData, userId?: string): Promise<AssessmentDocument> {
    const adapter = this.selectAdapter(sourceData);
    
    if (!adapter) {
      throw new Error(`No adapter found for source data type: ${sourceData.type}`);
    }
    
    return await adapter.process(sourceData, userId);
  }
}

// Export singleton instance
export const contentSourceAdapterFactory = new ContentSourceAdapterFactory();
