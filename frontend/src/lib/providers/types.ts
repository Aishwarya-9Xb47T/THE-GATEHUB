/**
 * Provider Types (Frontend)
 * 
 * Defines the types for the provider plugin system on the frontend.
 */

export interface ProviderFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  owners?: Array<{ displayName: string }>;
  [key: string]: any; // Provider-specific metadata
}

export interface ListFilesResult {
  files: ProviderFile[];
  nextPageToken?: string;
}

export interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
  emptyText: string;
  filter: string;
}

export interface ProviderStatus {
  configured: boolean;
  authenticated: boolean;
}

/**
 * ProviderPlugin Interface (Frontend)
 * 
 * All cloud providers must implement this interface to integrate with GateHub.
 */
export interface ProviderPlugin {
  // Provider identity
  readonly id: string;
  readonly name: string;
  readonly icon: React.ElementType;
  readonly color: string;
  
  // Authentication
  checkAuthStatus(): Promise<ProviderStatus>;
  initiateAuth(redirectUrl?: string): Promise<{ authUrl: string } | { error: string }>;
  
  // File browsing
  listFiles(filter: string, pageToken?: string, pageSize?: number): Promise<ListFilesResult>;
  searchFiles(query: string, pageToken?: string, pageSize?: number): Promise<ListFilesResult>;
  
  // Sidebar configuration (provider-specific)
  readonly sidebarItems: SidebarItem[];
  
  // Picker integration (optional)
  launchPicker?(): Promise<{ fileId: string }>;
}
