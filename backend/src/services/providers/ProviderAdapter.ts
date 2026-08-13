/**
 * ProviderAdapter Interface
 * 
 * Defines the contract that all cloud provider adapters must implement.
 * This enables a plugin architecture where new providers (OneDrive, Dropbox, etc.)
 * can be added without changing the core system.
 */

export interface ProviderTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

export interface FileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  owners?: { displayName: string }[];
  [key: string]: any; // Provider-specific metadata
}

export interface FileContent {
  content: string;
  mimeType: string;
  metadata: FileMetadata;
}

export interface ExtractedContent {
  text: string;
  metadata: FileMetadata;
  images?: Array<{ id: string; url: string; caption?: string }>;
  tables?: Array<{ id: string; headers: string[]; rows: string[][] }>;
}

export interface ProviderFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  owners?: { displayName: string }[];
  [key: string]: any; // Provider-specific fields
}

export interface ListFilesResult {
  files: ProviderFile[];
  nextPageToken?: string;
}

/**
 * ProviderAdapter Interface
 * 
 * All cloud providers must implement this interface to integrate with GateHub.
 */
export interface ProviderAdapter {
  // Provider identity
  readonly providerId: string;
  readonly providerName: string;
  
  // Configuration check
  isConfigured(): boolean;
  
  // Authentication
  initiateAuth(userId: string, redirectUrl?: string): Promise<{ authUrl: string } | { error: string }>;
  handleCallback(code: string, state: string): Promise<{ userId: string; redirectUrl?: string }>;
  getValidTokens(userId: string): Promise<ProviderTokens>;
  refreshTokens(refreshToken: string): Promise<ProviderTokens>;
  
  // File operations
  listFiles(userId: string, filter: string, pageToken?: string, pageSize?: number): Promise<ListFilesResult>;
  searchFiles(userId: string, query: string, pageToken?: string, pageSize?: number): Promise<ListFilesResult>;
  getFileMetadata(userId: string, fileId: string): Promise<FileMetadata>;
  downloadFile(userId: string, fileId: string): Promise<FileContent>;
  
  // Content extraction (optional - some providers may not support this)
  extractContent?(userId: string, fileId: string): Promise<ExtractedContent>;
}
