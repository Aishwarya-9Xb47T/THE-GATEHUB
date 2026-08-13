/**
 * Provider Initialization
 * 
 * Registers all available providers in the ProviderRegistry.
 * This file should be imported early in the application startup.
 */

import { providerRegistry } from './ProviderRegistry.js';
import { GoogleProviderPlugin } from './plugins/GoogleProviderPlugin.js';

// Register Google Workspace provider
providerRegistry.register(new GoogleProviderPlugin());

// Future providers will be registered here:
// providerRegistry.register(new OneDriveProviderPlugin());
// providerRegistry.register(new DropboxProviderPlugin());
// providerRegistry.register(new NotionProviderPlugin());

export { providerRegistry };
