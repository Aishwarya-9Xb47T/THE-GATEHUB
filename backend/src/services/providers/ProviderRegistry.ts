/**
 * ProviderRegistry
 * 
 * Manages the registration and retrieval of provider adapters.
 * This enables a plugin architecture where new providers can be added dynamically.
 */

import { ProviderAdapter } from './ProviderAdapter.js';

class ProviderRegistry {
  private providers: Map<string, ProviderAdapter> = new Map();
  
  /**
   * Register a provider adapter
   */
  register(provider: ProviderAdapter): void {
    if (this.providers.has(provider.providerId)) {
      console.warn(`Provider ${provider.providerId} is already registered. Overwriting.`);
    }
    this.providers.set(provider.providerId, provider);
  }
  
  /**
   * Get a specific provider by ID
   */
  get(providerId: string): ProviderAdapter | undefined {
    return this.providers.get(providerId);
  }
  
  /**
   * Get all registered providers
   */
  getAll(): ProviderAdapter[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Get only configured providers (those with valid credentials)
   */
  getConfigured(): ProviderAdapter[] {
    return this.getAll().filter(provider => provider.isConfigured());
  }
  
  /**
   * Check if a provider is registered
   */
  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }
  
  /**
   * Unregister a provider
   */
  unregister(providerId: string): boolean {
    return this.providers.delete(providerId);
  }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistry();
