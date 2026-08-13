/**
 * Modular integration provider registry — Google Colab, GitHub, Drive, etc.
 * Authoring and student workspaces resolve providers by id without hardcoding vendors.
 */

export type IntegrationCategory =
  | "oauth"
  | "storage"
  | "notebook"
  | "repository"
  | "plagiarism"
  | "video"
  | "grading";

export interface IntegrationProviderMeta {
  id: string;
  label: string;
  category: IntegrationCategory;
  /** Whether THE GATEHUB can embed the workspace in-platform */
  embedSupported: boolean;
  /** OAuth scopes required when applicable */
  scopes?: string[];
}

export interface IntegrationLaunchContext {
  userId: string;
  projectId?: string;
  componentId?: string;
  enrollmentId?: string;
  metadata?: Record<string, unknown>;
}

export interface IntegrationProvider {
  meta: IntegrationProviderMeta;
  isConfigured(): boolean;
  getAuthUrl?(ctx: IntegrationLaunchContext): Promise<string>;
  launchWorkspace?(ctx: IntegrationLaunchContext): Promise<{ url: string; embedUrl?: string }>;
  syncSubmission?(ctx: IntegrationLaunchContext): Promise<{ status: string; externalId?: string }>;
}

const providers = new Map<string, IntegrationProvider>();

export function registerIntegrationProvider(provider: IntegrationProvider): void {
  providers.set(provider.meta.id, provider);
}

export function getIntegrationProvider(id: string): IntegrationProvider | undefined {
  return providers.get(id);
}

export function listIntegrationProviders(category?: IntegrationCategory): IntegrationProviderMeta[] {
  return [...providers.values()]
    .filter((p) => !category || p.meta.category === category)
    .map((p) => p.meta);
}

/** Placeholder providers — wire real OAuth/API in dedicated modules. */
function registerStubs(): void {
  const stubs: IntegrationProviderMeta[] = [
    { id: "google-oauth", label: "Google OAuth", category: "oauth", embedSupported: false },
    { id: "google-drive", label: "Google Drive", category: "storage", embedSupported: false },
    { id: "google-colab", label: "Google Colab", category: "notebook", embedSupported: true },
    { id: "github", label: "GitHub", category: "repository", embedSupported: false },
    { id: "gitlab", label: "GitLab", category: "repository", embedSupported: false },
    { id: "bitbucket", label: "Bitbucket", category: "repository", embedSupported: false },
  ];
  for (const meta of stubs) {
    registerIntegrationProvider({
      meta,
      isConfigured: () => false,
    });
  }
}

registerStubs();
