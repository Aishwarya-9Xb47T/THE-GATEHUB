/**
 * ProviderRegistry (Frontend)
 * 
 * Manages the registration and retrieval of provider plugins.
 */

import { ProviderPlugin } from './types.js';

class ProviderRegistry {
  private plugins: Map<string, ProviderPlugin> = new Map();
  
  /**
   * Register a provider plugin
   */
  register(plugin: ProviderPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Provider ${plugin.id} is already registered. Overwriting.`);
    }
    this.plugins.set(plugin.id, plugin);
  }
  
  /**
   * Get a specific provider by ID
   */
  get(id: string): ProviderPlugin | undefined {
    return this.plugins.get(id);
  }
  
  /**
   * Get all registered providers
   */
  getAll(): ProviderPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Get only configured providers (those with valid credentials)
   */
  async getConfigured(): Promise<ProviderPlugin[]> {
    const all = this.getAll();
    const configured = await Promise.all(
      all.map(async (provider) => {
        const status = await provider.checkAuthStatus();
        return status.configured ? provider : null;
      })
    );
    return configured.filter((p): p is ProviderPlugin => p !== null);
  }
  
  /**
   * Check if a provider is registered
   */
  has(id: string): boolean {
    return this.plugins.has(id);
  }
  
  /**
   * Unregister a provider
   */
  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistry();
