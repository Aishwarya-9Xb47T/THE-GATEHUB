import { registerIntegrationProvider } from "./integrationProviderRegistry.js";
import { isGoogleOAuthConfigured } from "./googleOAuthService.js";

export function registerGoogleProviders(): void {
  registerIntegrationProvider({
    meta: {
      id: "google-oauth",
      label: "Google OAuth",
      category: "oauth",
      embedSupported: false,
      scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.file"],
    },
    isConfigured: isGoogleOAuthConfigured,
  });

  registerIntegrationProvider({
    meta: {
      id: "google-drive",
      label: "Google Drive",
      category: "storage",
      embedSupported: false,
    },
    isConfigured: isGoogleOAuthConfigured,
  });

  registerIntegrationProvider({
    meta: {
      id: "google-colab",
      label: "GateHub Notebook",
      category: "notebook",
      embedSupported: true,
    },
    isConfigured: () => true,
    launchWorkspace: async () => ({
      url: "",
      embedUrl: undefined,
    }),
  });
}
